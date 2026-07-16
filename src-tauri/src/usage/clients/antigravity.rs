use chrono::{DateTime, Utc};
use reqwest::Client;
use serde_json::{json, Value};

use crate::usage::auth::gemini::{self, GeminiAuthSource};
use crate::usage::clients::{read_opt_f64, read_string_prop, shared_client};
use crate::usage::types::{AntigravityGroupSnapshot, AntigravitySnapshot, ProviderBillingSettings};

const CLOUD_CODE_BASE: &str = "https://cloudcode-pa.googleapis.com";

pub struct AntigravityUsageClient {
    http: Client,
}

impl AntigravityUsageClient {
    pub fn new() -> Self {
        Self {
            http: shared_client(),
        }
    }

    pub async fn fetch(&self, settings: &mut ProviderBillingSettings) -> AntigravitySnapshot {
        match self.fetch_inner().await {
            Ok(snap) => {
                settings.pro_last_connection_status = Some(if snap.is_available {
                    format!(
                        "Connected ({})",
                        snap.plan_label.as_deref().unwrap_or("Gemini")
                    )
                } else {
                    snap.status_message
                        .clone()
                        .unwrap_or_else(|| "No Gemini quota".into())
                });
                snap
            }
            Err(msg) => {
                settings.pro_last_connection_status = Some(msg.clone());
                AntigravitySnapshot::unavailable(Some(&msg))
            }
        }
    }

    pub async fn test_connection(&self) -> String {
        match self.fetch_inner().await {
            Ok(snap) => {
                if snap.is_available {
                    format!(
                        "Connected ({})",
                        snap.plan_label.as_deref().unwrap_or("Gemini")
                    )
                } else {
                    snap.status_message
                        .unwrap_or_else(|| "No Gemini quota".into())
                }
            }
            Err(e) => e,
        }
    }

    async fn fetch_inner(&self) -> Result<AntigravitySnapshot, String> {
        let auth = gemini::resolve();
        if !auth.has_auth() {
            return Err(auth.failure_message.unwrap_or_else(|| {
                "Sign in to Antigravity IDE or Gemini CLI on this machine".into()
            }));
        }
        let access = self.resolve_access_token(&auth).await?;
        let (project_id, plan_label) = self.load_project_info(&access, auth.source).await?;
        self.fetch_quota(&access, project_id.as_deref(), plan_label.as_deref())
            .await
    }

    async fn resolve_access_token(
        &self,
        auth: &gemini::GeminiAuthResult,
    ) -> Result<String, String> {
        if let Some(token) = auth.tokens.access_token.clone() {
            if !gemini::token_needs_refresh(&auth.tokens) {
                return Ok(token);
            }
        }
        let refresh = auth
            .tokens
            .refresh_token
            .as_deref()
            .ok_or_else(|| "Gemini session expired — sign in again".to_string())?;
        let client_id = auth
            .client_id
            .as_deref()
            .ok_or_else(|| "Missing OAuth client id".to_string())?;
        let client_secret = auth
            .client_secret
            .as_deref()
            .ok_or_else(|| "Missing OAuth client secret".to_string())?;
        gemini::refresh_access_token(&self.http, refresh, client_id, client_secret).await
    }

    async fn load_project_info(
        &self,
        access_token: &str,
        source: GeminiAuthSource,
    ) -> Result<(Option<String>, Option<String>), String> {
        let body = match source {
            GeminiAuthSource::Antigravity => json!({"metadata":{"ideType":"ANTIGRAVITY"}}),
            GeminiAuthSource::GeminiCli => {
                json!({"metadata":{"ideType":"GEMINI_CLI","pluginType":"GEMINI"}})
            }
            GeminiAuthSource::None => json!({}),
        };
        let ua = match source {
            GeminiAuthSource::Antigravity => "Antigravity/1.0",
            _ => "GeminiCLI/1.0",
        };
        let resp = self
            .post_json(
                &format!("{CLOUD_CODE_BASE}/v1internal:loadCodeAssist"),
                access_token,
                ua,
                &body,
            )
            .await?;
        if !resp.status().is_success() {
            return Ok((None, None));
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        let project = root
            .get("cloudaicompanionProject")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let plan = root
            .get("paidTier")
            .and_then(|t| t.get("id"))
            .or_else(|| root.get("currentTier").and_then(|t| t.get("id")))
            .and_then(|v| v.as_str())
            .map(map_plan_label);
        Ok((project, plan))
    }

    async fn fetch_quota(
        &self,
        access_token: &str,
        project_id: Option<&str>,
        plan_label: Option<&str>,
    ) -> Result<AntigravitySnapshot, String> {
        let body = if let Some(id) = project_id {
            json!({"project": id})
        } else {
            json!({})
        };
        let resp = self
            .post_json(
                &format!("{CLOUD_CODE_BASE}/v1internal:retrieveUserQuotaSummary"),
                access_token,
                "Antigravity/1.0",
                &body,
            )
            .await?;
        if resp.status().is_success() {
            let root: Value = resp.json().await.map_err(|e| e.to_string())?;
            let snap = parse_quota_summary(&root, plan_label);
            if snap.is_available {
                return Ok(snap);
            }
        }
        let resp = self
            .post_json(
                &format!("{CLOUD_CODE_BASE}/v1internal:retrieveUserQuota"),
                access_token,
                "Antigravity/1.0",
                &body,
            )
            .await?;
        if !resp.status().is_success() {
            return Ok(AntigravitySnapshot::unavailable(Some("No Gemini quota")));
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(parse_user_quota(&root, plan_label))
    }

    async fn post_json(
        &self,
        url: &str,
        access_token: &str,
        user_agent: &str,
        body: &Value,
    ) -> Result<reqwest::Response, String> {
        self.http
            .post(url)
            .header("Authorization", format!("Bearer {access_token}"))
            .header("User-Agent", user_agent)
            .json(body)
            .send()
            .await
            .map_err(|e| e.to_string())
    }
}

impl Default for AntigravityUsageClient {
    fn default() -> Self {
        Self::new()
    }
}

fn map_plan_label(id: &str) -> String {
    match id {
        "free-tier" => "Free".into(),
        "standard-tier" => "Pro".into(),
        "ultra-tier" => "Ultra".into(),
        other => other.to_string(),
    }
}

pub fn parse_quota_summary(root: &Value, plan_label: Option<&str>) -> AntigravitySnapshot {
    let Some(groups) = root
        .get("quota_groups")
        .or_else(|| root.get("quotaGroups"))
        .and_then(|v| v.as_array())
    else {
        return AntigravitySnapshot::unavailable(Some("No Gemini quota"));
    };
    let mut gemini = None;
    let mut third_party = None;
    for group in groups {
        let display = read_string_prop(group, &["display_name", "displayName"]).unwrap_or("");
        let parsed = parse_quota_group(group);
        if display.to_ascii_lowercase().contains("gemini") {
            gemini = Some(parsed);
        } else if display.to_ascii_lowercase().contains("claude")
            || display.to_ascii_lowercase().contains("gpt")
        {
            third_party = Some(parsed);
        }
    }
    if gemini.is_none() && third_party.is_none() {
        return AntigravitySnapshot::unavailable(Some("No Gemini quota"));
    }
    AntigravitySnapshot::from_groups(
        plan_label.map(str::to_string),
        gemini.unwrap_or_else(|| AntigravityGroupSnapshot::unavailable(None)),
        third_party.unwrap_or_else(|| AntigravityGroupSnapshot::unavailable(None)),
    )
}

pub fn parse_user_quota(root: &Value, plan_label: Option<&str>) -> AntigravitySnapshot {
    let Some(buckets) = root.get("buckets").and_then(|v| v.as_array()) else {
        return AntigravitySnapshot::unavailable(Some("No Gemini quota"));
    };
    let group = parse_per_model_buckets(buckets);
    if !group.is_available {
        return AntigravitySnapshot::unavailable(Some("No Gemini quota"));
    }
    AntigravitySnapshot::from_groups(
        plan_label.map(str::to_string),
        group,
        AntigravityGroupSnapshot::unavailable(None),
    )
}

fn parse_quota_group(group: &Value) -> AntigravityGroupSnapshot {
    let Some(buckets) = group.get("buckets").and_then(|v| v.as_array()) else {
        return AntigravityGroupSnapshot::unavailable(Some("No quota buckets"));
    };
    let mut session_remaining = None;
    let mut weekly_remaining = None;
    let mut session_reset = None;
    let mut weekly_reset = None;
    for bucket in buckets {
        let window = read_string_prop(bucket, &["window"]).unwrap_or("");
        let remaining = parse_remaining_fraction(bucket);
        let reset = parse_reset_time(bucket);
        if window.eq_ignore_ascii_case("5h") {
            session_remaining = Some(remaining);
            session_reset = reset;
        } else if window.eq_ignore_ascii_case("weekly") {
            weekly_remaining = Some(remaining);
            weekly_reset = reset;
        }
    }
    if session_remaining.is_none() && weekly_remaining.is_none() {
        return AntigravityGroupSnapshot::unavailable(Some("No Gemini quota"));
    }
    AntigravityGroupSnapshot::from_usage(
        session_remaining.unwrap_or_else(|| weekly_remaining.unwrap_or(0.0)),
        weekly_remaining.unwrap_or_else(|| session_remaining.unwrap_or(0.0)),
        session_reset,
        weekly_reset,
    )
}

fn parse_per_model_buckets(buckets: &[Value]) -> AntigravityGroupSnapshot {
    let now = Utc::now();
    let mut session_remaining = None;
    let mut weekly_remaining = None;
    let mut session_reset = None;
    let mut weekly_reset = None;
    for bucket in buckets {
        let model_id = read_string_prop(bucket, &["model_id", "modelId"]).unwrap_or("");
        if !model_id.to_ascii_lowercase().contains("gemini") {
            continue;
        }
        let remaining = parse_remaining_fraction(bucket);
        let reset = parse_reset_time(bucket);
        let is_weekly = reset
            .as_ref()
            .and_then(|r| DateTime::parse_from_rfc3339(r).ok())
            .map(|dt| dt.with_timezone(&Utc) - now > chrono::Duration::hours(24))
            .unwrap_or(true);
        if is_weekly {
            if weekly_remaining.is_none() || remaining < weekly_remaining.unwrap() {
                weekly_remaining = Some(remaining);
                weekly_reset = reset;
            }
        } else if session_remaining.is_none() || remaining < session_remaining.unwrap() {
            session_remaining = Some(remaining);
            session_reset = reset;
        }
    }
    if session_remaining.is_none() && weekly_remaining.is_none() {
        return AntigravityGroupSnapshot::unavailable(Some("No Gemini quota"));
    }
    AntigravityGroupSnapshot::from_usage(
        session_remaining.unwrap_or_else(|| weekly_remaining.unwrap_or(0.0)),
        weekly_remaining.unwrap_or_else(|| session_remaining.unwrap_or(0.0)),
        session_reset,
        weekly_reset,
    )
}

fn parse_remaining_fraction(bucket: &Value) -> f64 {
    if let Some(f) = read_opt_f64(bucket.get("remaining_fraction").unwrap_or(&Value::Null))
        .or_else(|| read_opt_f64(bucket.get("remainingFraction").unwrap_or(&Value::Null)))
    {
        return (f * 100.0).clamp(0.0, 100.0);
    }
    if bucket.get("reset_time").is_some() || bucket.get("resetTime").is_some() {
        0.0
    } else {
        0.0
    }
}

fn parse_reset_time(bucket: &Value) -> Option<String> {
    read_string_prop(bucket, &["reset_time", "resetTime"]).map(str::to_string)
}
