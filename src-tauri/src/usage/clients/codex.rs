use chrono::{DateTime, Utc};
use reqwest::Client;
use serde_json::Value;

use crate::usage::auth::codex::{self, CodexAuth};
use crate::usage::clients::shared_client;
use crate::usage::types::{CodexSnapshot, ProviderBillingSettings};

pub struct CodexUsageClient {
    http: Client,
}

impl CodexUsageClient {
    pub fn new() -> Self {
        Self {
            http: shared_client(),
        }
    }

    pub async fn fetch(&self, settings: &mut ProviderBillingSettings) -> CodexSnapshot {
        match self.resolve_auth(settings).await {
            Ok(auth) => {
                let usage = self.fetch_usage(&auth).await;
                settings.pro_last_connection_status = Some(if usage.is_available {
                    format!(
                        "Connected ({})",
                        usage.plan_label.as_deref().unwrap_or("Codex")
                    )
                } else {
                    usage
                        .status_message
                        .clone()
                        .unwrap_or_else(|| "Unavailable".into())
                });
                usage
            }
            Err(msg) => {
                settings.pro_last_connection_status = Some(msg.clone());
                CodexSnapshot::unavailable(Some(&msg))
            }
        }
    }

    pub async fn test_connection(&self, settings: &mut ProviderBillingSettings) -> String {
        self.refresh_and_connect(settings).await
    }

    pub async fn refresh_and_connect(&self, settings: &mut ProviderBillingSettings) -> String {
        if let Some(auth) = codex::read_auth_file() {
            let usage = self.fetch_usage(&auth).await;
            let status = if usage.is_available {
                format!(
                    "Connected ({})",
                    usage.plan_label.as_deref().unwrap_or("Codex")
                )
            } else {
                usage
                    .status_message
                    .clone()
                    .unwrap_or_else(|| "No Codex quota".into())
            };
            settings.pro_last_connection_status = Some(status.clone());
            return status;
        }
        if let Some(cookie) =
            codex::resolve_session_cookie(settings.pro_session_credential_id.as_deref())
        {
            match codex::exchange_session(&self.http, &cookie).await {
                Ok(auth) => {
                    let usage = self.fetch_usage(&auth).await;
                    let status = if usage.is_available {
                        format!(
                            "Connected ({})",
                            usage.plan_label.as_deref().unwrap_or("Codex")
                        )
                    } else {
                        usage
                            .status_message
                            .clone()
                            .unwrap_or_else(|| "No Codex quota".into())
                    };
                    settings.pro_last_connection_status = Some(status.clone());
                    return status;
                }
                Err(e) => {
                    settings.pro_last_connection_status = Some(e.clone());
                    return e;
                }
            }
        }
        let msg = "Codex auth not found — run codex login or paste session cookie";
        settings.pro_last_connection_status = Some(msg.into());
        msg.into()
    }

    async fn resolve_auth(
        &self,
        settings: &mut ProviderBillingSettings,
    ) -> Result<CodexAuth, String> {
        if let Some(auth) = codex::read_auth_file() {
            return Ok(auth);
        }
        if let Some(cookie) =
            codex::resolve_session_cookie(settings.pro_session_credential_id.as_deref())
        {
            return codex::exchange_session(&self.http, &cookie).await;
        }
        Err("Codex auth not found — run codex login or paste session cookie".into())
    }

    async fn fetch_usage(&self, auth: &CodexAuth) -> CodexSnapshot {
        let resp = match self
            .http
            .get("https://chatgpt.com/backend-api/wham/usage")
            .header("Authorization", format!("Bearer {}", auth.access_token))
            .header("ChatGPT-Account-Id", &auth.account_id)
            .header("OpenAI-Account-Id", &auth.account_id)
            .header("Origin", "https://chatgpt.com")
            .header("Referer", "https://chatgpt.com/")
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => return CodexSnapshot::unavailable(Some("Request failed")),
        };
        if !resp.status().is_success() {
            return CodexSnapshot::unavailable(Some("No Codex quota"));
        }
        let root: Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => return CodexSnapshot::unavailable(Some("Invalid response")),
        };
        parse_usage_response(&root)
    }
}

impl Default for CodexUsageClient {
    fn default() -> Self {
        Self::new()
    }
}

pub fn parse_usage_response(root: &Value) -> CodexSnapshot {
    let plan_type = root.get("plan_type").and_then(|v| v.as_str());
    let limit_reached = root
        .get("rate_limit")
        .and_then(|v| v.get("limit_reached"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let (session_used, weekly_used, session_reset, weekly_reset) = parse_rate_limit_windows(root);
    if session_used.is_none() && weekly_used.is_none() {
        return CodexSnapshot::unavailable(Some("No Codex quota"));
    }
    let credits = root
        .get("credits")
        .and_then(|c| c.get("balance"))
        .and_then(|v| v.as_f64());
    CodexSnapshot::from_usage(
        plan_type,
        session_used,
        weekly_used,
        session_reset,
        weekly_reset,
        credits,
        limit_reached,
    )
}

fn parse_rate_limit_windows(
    root: &Value,
) -> (Option<f64>, Option<f64>, Option<String>, Option<String>) {
    let rate_limit = root.get("rate_limit");
    let session_candidate = find_window_el(
        root,
        rate_limit,
        &["five_hour", "five_hour_limit", "five_hour_rate_limit"],
    );
    let weekly_candidate = find_window_el(
        root,
        rate_limit,
        &["weekly", "weekly_limit", "weekly_rate_limit"],
    );
    let primary_candidate = find_window_el(root, rate_limit, &["primary", "primary_window"]);
    let secondary_candidate = find_window_el(root, rate_limit, &["secondary", "secondary_window"]);

    let (session_el, weekly_el) = classify_rate_limit_windows(
        session_candidate.or(primary_candidate),
        weekly_candidate.or(secondary_candidate),
        primary_candidate,
        secondary_candidate,
    );

    let session = session_el.and_then(parse_window);
    let weekly = weekly_el.and_then(parse_window);
    (
        session.as_ref().map(|w| w.used_percent),
        weekly.as_ref().map(|w| w.used_percent),
        session.and_then(|w| w.reset_at),
        weekly.and_then(|w| w.reset_at),
    )
}

struct WindowInfo {
    used_percent: f64,
    reset_at: Option<String>,
}

fn find_window_el<'a>(
    root: &'a Value,
    rate_limit: Option<&'a Value>,
    names: &[&str],
) -> Option<&'a Value> {
    for name in names {
        if let Some(rl) = rate_limit {
            if let Some(w) = rl.get(*name) {
                if w.is_object() {
                    return Some(w);
                }
            }
        }
        if let Some(w) = root.get(*name) {
            if w.is_object() {
                return Some(w);
            }
        }
    }
    None
}

fn unwrap_rate_limit_window(window: &Value) -> &Value {
    if window.get("reset_at").is_none()
        && window.get("reset_after_seconds").is_none()
        && window
            .get("primary_window")
            .map(|v| v.is_object())
            .unwrap_or(false)
    {
        return window.get("primary_window").unwrap_or(window);
    }
    window
}

fn infer_window_role(window: Option<&Value>, default_role: &str) -> &'static str {
    let Some(element) = window else {
        return if default_role == "session" {
            "session"
        } else {
            "weekly"
        };
    };
    let unwrapped = unwrap_rate_limit_window(element);
    let Some(seconds) = unwrapped
        .get("limit_window_seconds")
        .and_then(|v| v.as_f64())
    else {
        return if default_role == "session" {
            "session"
        } else {
            "weekly"
        };
    };
    if seconds <= 6.0 * 3600.0 {
        "session"
    } else if seconds >= 6.0 * 24.0 * 3600.0 {
        "weekly"
    } else if default_role == "session" {
        "session"
    } else {
        "weekly"
    }
}

fn classify_rate_limit_windows<'a>(
    session_candidate: Option<&'a Value>,
    weekly_candidate: Option<&'a Value>,
    primary_candidate: Option<&'a Value>,
    secondary_candidate: Option<&'a Value>,
) -> (Option<&'a Value>, Option<&'a Value>) {
    let primary_role = infer_window_role(primary_candidate, "session");
    let secondary_role = infer_window_role(secondary_candidate, "weekly");
    let session_role = infer_window_role(session_candidate, "session");
    let weekly_role = infer_window_role(weekly_candidate, "weekly");

    let mut session_window: Option<&Value> = None;
    let mut weekly_window: Option<&Value> = None;

    if let Some(explicit) = session_candidate {
        if session_role == "session" {
            session_window = Some(unwrap_rate_limit_window(explicit));
        }
    }
    if let Some(explicit) = weekly_candidate {
        if weekly_role == "weekly" {
            weekly_window = Some(unwrap_rate_limit_window(explicit));
        }
    }

    if session_window.is_none() {
        if let Some(primary) = primary_candidate {
            if primary_role == "session" {
                session_window = Some(unwrap_rate_limit_window(primary));
            } else if primary_role == "weekly" && weekly_window.is_none() {
                weekly_window = Some(unwrap_rate_limit_window(primary));
            }
        }
    }

    if weekly_window.is_none() {
        if let Some(secondary) = secondary_candidate {
            if secondary_role == "weekly" {
                weekly_window = Some(unwrap_rate_limit_window(secondary));
            } else if secondary_role == "session" && session_window.is_none() {
                session_window = Some(unwrap_rate_limit_window(secondary));
            }
        }
    }

    if session_window.is_some() && weekly_window.is_some() {
        return (session_window, weekly_window);
    }

    if session_window.is_none() && weekly_window.is_none() {
        if let Some(only_primary) = primary_candidate {
            if primary_role == "weekly" {
                return (None, Some(unwrap_rate_limit_window(only_primary)));
            }
            return (Some(unwrap_rate_limit_window(only_primary)), None);
        }
    }

    (session_window, weekly_window)
}

fn parse_window(window: &Value) -> Option<WindowInfo> {
    let used_percent = window
        .get("used_percent")
        .and_then(|v| v.as_f64())
        .or_else(|| {
            window
                .get("remaining_percent")
                .and_then(|v| v.as_f64())
                .map(|r| 100.0 - r)
        })?;
    let reset_at = parse_reset(window);
    Some(WindowInfo {
        used_percent,
        reset_at,
    })
}

fn parse_reset(window: &Value) -> Option<String> {
    if let Some(ts) = window.get("reset_at").and_then(|v| v.as_i64()) {
        return DateTime::<Utc>::from_timestamp(ts, 0).map(|dt| dt.to_rfc3339());
    }
    if let Some(ts) = window.get("reset_at").and_then(|v| v.as_f64()) {
        return DateTime::<Utc>::from_timestamp(ts as i64, 0).map(|dt| dt.to_rfc3339());
    }
    if let Some(s) = window.get("reset_at").and_then(|v| v.as_str()) {
        return Some(s.to_string());
    }
    if let Some(secs) = window.get("reset_after_seconds").and_then(|v| v.as_i64()) {
        return Some((Utc::now() + chrono::Duration::seconds(secs)).to_rfc3339());
    }
    None
}
