use chrono::{Duration, Utc};
use reqwest::Client;
use serde_json::Value;

use crate::usage::auth::opencode::{self, build_auth_cookie};
use crate::usage::clients::shared_client;
use crate::usage::types::{OpenCodeSnapshot, OpenCodeWindowSnapshot, ProviderBillingSettings};

const BASE_URL: &str = "https://opencode.ai";

pub struct OpenCodeUsageClient {
    http: Client,
}

impl OpenCodeUsageClient {
    pub fn new() -> Self {
        Self {
            http: shared_client(),
        }
    }

    pub async fn fetch(&self, settings: &mut ProviderBillingSettings) -> OpenCodeSnapshot {
        let auth = opencode::resolve(settings);
        if matches!(auth.source, opencode::OpenCodeAuthSource::None) {
            let msg = auth
                .failure_message
                .unwrap_or_else(|| "OpenCode auth not found".into());
            settings.pro_last_connection_status = Some(msg.clone());
            return OpenCodeSnapshot::unavailable(Some(&msg));
        }
        if let Some(ref key) = auth.api_key {
            if let Some(snap) = self.try_official_api(key, settings).await {
                settings.pro_last_connection_status = Some("Connected".into());
                return snap;
            }
        }
        let session = match auth.session_cookie {
            Some(s) => s,
            None => {
                let msg = "Usage API unavailable — sign in at opencode.ai and set workspace ID";
                settings.pro_last_connection_status = Some(msg.into());
                return OpenCodeSnapshot::unavailable(Some(msg));
            }
        };
        let workspace_id = self.resolve_workspace_id(settings, &session).await;
        let Some(workspace_id) = workspace_id else {
            let msg = "Workspace ID not set";
            settings.pro_last_connection_status = Some(msg.into());
            return OpenCodeSnapshot::unavailable(Some(msg));
        };
        let zen_html = if settings.show_direct_source {
            self.fetch_page(&format!("{BASE_URL}/workspace/{workspace_id}"), &session)
                .await
                .ok()
        } else {
            None
        };
        let go_html = if settings.show_pro_limits {
            self.fetch_page(&format!("{BASE_URL}/workspace/{workspace_id}/go"), &session)
                .await
                .ok()
        } else {
            None
        };
        let (balance, cap, used) = zen_html
            .as_deref()
            .map(parse_zen_page)
            .unwrap_or((None, None, None));
        let (has_go, rolling, weekly, monthly) = go_html
            .as_deref()
            .map(parse_go_page)
            .unwrap_or((false, None, None, None));
        let snap = build_snapshot(balance, cap, used, rolling, weekly, monthly, has_go);
        if !snap.is_available {
            let msg = "No usage data found — cookie may have expired";
            settings.pro_last_connection_status = Some(msg.into());
            return OpenCodeSnapshot::unavailable(Some(msg));
        }
        settings.pro_last_connection_status = Some("Connected".into());
        snap
    }

    pub async fn test_connection(&self, settings: &mut ProviderBillingSettings) -> String {
        let auth = opencode::resolve(settings);
        if matches!(auth.source, opencode::OpenCodeAuthSource::None) {
            return auth
                .failure_message
                .unwrap_or_else(|| "OpenCode auth not found".into());
        }
        if let Some(ref key) = auth.api_key {
            if self.try_official_api(key, settings).await.is_some() {
                return "Connected".into();
            }
            return "API key found but usage endpoints unavailable — add workspace ID for dashboard fallback"
                .into();
        }
        let Some(session) = auth.session_cookie else {
            return "Session cookie required".into();
        };
        let workspace_id = self.resolve_workspace_id(settings, &session).await;
        if workspace_id.is_none() {
            return "Workspace ID required".into();
        }
        match self
            .fetch_page(
                &format!("{BASE_URL}/workspace/{}", workspace_id.unwrap()),
                &session,
            )
            .await
        {
            Ok(html) => {
                if html.to_ascii_lowercase().contains("sign in")
                    && html.to_ascii_lowercase().contains("login")
                {
                    "Session expired — re-copy auth cookie from DevTools".into()
                } else {
                    "Connected".into()
                }
            }
            Err(e) => e,
        }
    }

    async fn try_official_api(
        &self,
        api_key: &str,
        _settings: &ProviderBillingSettings,
    ) -> Option<OpenCodeSnapshot> {
        let balance_resp = self
            .http
            .get(format!("{BASE_URL}/zen/v1/balance"))
            .header("Authorization", format!("Bearer {api_key}"))
            .send()
            .await
            .ok()?;
        let mut zen_balance = None;
        if balance_resp.status().is_success() {
            let root: Value = balance_resp.json().await.ok()?;
            zen_balance = root.get("balance").and_then(|v| v.as_f64());
        }
        let go_resp = self
            .http
            .get(format!("{BASE_URL}/zen/go/v1/usage"))
            .header("Authorization", format!("Bearer {api_key}"))
            .send()
            .await
            .ok()?;
        let (rolling, weekly, monthly, has_go) = if go_resp.status().is_success() {
            let root: Value = go_resp.json().await.ok()?;
            parse_go_api(&root)
        } else {
            (None, None, None, false)
        };
        let snap = build_snapshot(zen_balance, None, None, rolling, weekly, monthly, has_go);
        if snap.is_available {
            Some(snap)
        } else if zen_balance.is_some() {
            Some(snap)
        } else {
            None
        }
    }

    async fn resolve_workspace_id(
        &self,
        settings: &ProviderBillingSettings,
        session: &str,
    ) -> Option<String> {
        if let Some(id) = settings
            .workspace_id
            .as_ref()
            .filter(|s| !s.is_empty())
            .cloned()
        {
            return Some(id);
        }
        let html = self.fetch_page(BASE_URL, session).await.ok()?;
        extract_workspace_id(&html)
    }

    async fn fetch_page(&self, url: &str, session: &str) -> Result<String, String> {
        let resp = self
            .http
            .get(url)
            .header("Cookie", build_auth_cookie(session))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Page request failed ({})", resp.status()));
        }
        resp.text().await.map_err(|e| e.to_string())
    }
}

impl Default for OpenCodeUsageClient {
    fn default() -> Self {
        Self::new()
    }
}

fn extract_workspace_id(html: &str) -> Option<String> {
    let marker = "/workspace/wrk_";
    let idx = html.find(marker)?;
    let rest = &html[idx + "/workspace/".len()..];
    let end = rest
        .find(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

fn parse_zen_page(html: &str) -> (Option<f64>, Option<f64>, Option<f64>) {
    let balance = extract_json_number(html, "balance");
    let cap = extract_json_number(html, "monthlyCap")
        .or_else(|| extract_json_number(html, "monthlyLimit"));
    let used = extract_nested_number(html, "monthlyUsage", "usage");
    (balance, cap, used)
}

fn parse_go_page(
    html: &str,
) -> (
    bool,
    Option<OpenCodeWindowSnapshot>,
    Option<OpenCodeWindowSnapshot>,
    Option<OpenCodeWindowSnapshot>,
) {
    let has_sub = html.contains("rollingUsage") || html.contains("goSubscription");
    let rolling = parse_window(html, "rollingUsage").or_else(|| parse_window(html, "rolling5h"));
    let weekly = parse_window(html, "weeklyUsage");
    let monthly = parse_window(html, "monthlyUsage");
    (has_sub, rolling, weekly, monthly)
}

fn parse_go_api(
    root: &Value,
) -> (
    Option<OpenCodeWindowSnapshot>,
    Option<OpenCodeWindowSnapshot>,
    Option<OpenCodeWindowSnapshot>,
    bool,
) {
    let rolling = parse_api_window(root.get("rolling5h").or_else(|| root.get("rolling")));
    let weekly = parse_api_window(root.get("weekly"));
    let monthly = parse_api_window(root.get("monthly"));
    let has_go = rolling.is_some() || weekly.is_some() || monthly.is_some();
    (rolling, weekly, monthly, has_go)
}

fn parse_api_window(node: Option<&Value>) -> Option<OpenCodeWindowSnapshot> {
    let node = node?;
    let percent = node
        .get("usagePercent")
        .or_else(|| node.get("percent"))
        .and_then(|v| v.as_f64())?;
    let reset = node
        .get("resetInSec")
        .and_then(|v| v.as_i64())
        .map(|secs| (Utc::now() + Duration::seconds(secs)).to_rfc3339());
    Some(OpenCodeWindowSnapshot::from_usage(percent, reset))
}

fn parse_window(html: &str, key: &str) -> Option<OpenCodeWindowSnapshot> {
    let percent = extract_nested_number(html, key, "usagePercent")
        .or_else(|| extract_nested_number(html, key, "percent"))?;
    let reset_secs = extract_nested_number(html, key, "resetInSec").map(|s| s as i64);
    let reset = reset_secs.map(|secs| (Utc::now() + Duration::seconds(secs)).to_rfc3339());
    Some(OpenCodeWindowSnapshot::from_usage(percent, reset))
}

fn extract_json_number(html: &str, key: &str) -> Option<f64> {
    let pattern = format!(r#""{key}"\s*:\s*([0-9.]+)"#);
    let re = regex_simple(&pattern, html)?;
    re.parse().ok()
}

fn extract_nested_number(html: &str, object_key: &str, field: &str) -> Option<f64> {
    let idx = html.find(object_key)?;
    let slice = &html[idx..idx.saturating_add(500)];
    let pattern = format!(r#""{field}"\s*:\s*([0-9.]+)"#);
    regex_simple(&pattern, slice)?.parse().ok()
}

fn regex_simple(pattern: &str, text: &str) -> Option<String> {
    let key = pattern.trim_start_matches('"').split('"').next()?;
    let idx = text.find(key)?;
    let rest = &text[idx..];
    let num_start = rest.find(':')? + 1;
    let digits: String = rest[num_start..]
        .chars()
        .skip_while(|c| c.is_whitespace())
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    if digits.is_empty() {
        None
    } else {
        Some(digits)
    }
}

fn build_snapshot(
    zen_balance: Option<f64>,
    zen_cap: Option<f64>,
    zen_used: Option<f64>,
    rolling: Option<OpenCodeWindowSnapshot>,
    weekly: Option<OpenCodeWindowSnapshot>,
    monthly: Option<OpenCodeWindowSnapshot>,
    has_go: bool,
) -> OpenCodeSnapshot {
    let rolling = rolling.unwrap_or_else(OpenCodeWindowSnapshot::unavailable);
    let weekly = weekly.unwrap_or_else(OpenCodeWindowSnapshot::unavailable);
    let monthly = monthly.unwrap_or_else(OpenCodeWindowSnapshot::unavailable);
    let zen_available = zen_balance.is_some() || zen_cap.is_some();
    let go_available =
        has_go && (rolling.is_available || weekly.is_available || monthly.is_available);
    let zen_monthly_percent = match (zen_cap, zen_used) {
        (Some(cap), Some(used)) if cap > 0.0 => Some((used * 100.0 / cap).clamp(0.0, 100.0)),
        _ => None,
    };
    let mut parts = Vec::new();
    if let Some(b) = zen_balance {
        parts.push(format!("Zen ${b:.2}"));
    }
    if let Some(p) = zen_monthly_percent {
        parts.push(format!("mo {p:.0}%"));
    }
    if go_available {
        if rolling.is_available {
            parts.push(format!("5h {:.0}%", rolling.percent_used));
        }
        if weekly.is_available {
            parts.push(format!("wk {:.0}%", weekly.percent_used));
        }
        if monthly.is_available {
            parts.push(format!("mo {:.0}%", monthly.percent_used));
        }
    }
    OpenCodeSnapshot {
        zen_balance_usd: zen_balance,
        zen_monthly_cap_usd: zen_cap,
        zen_monthly_used_usd: zen_used,
        zen_monthly_percent_used: zen_monthly_percent,
        go_rolling: rolling,
        go_weekly: weekly,
        go_monthly: monthly,
        has_go_subscription: has_go,
        zen_is_available: zen_available,
        is_available: zen_available || go_available,
        status_message: None,
        detail_label: if parts.is_empty() {
            "Connected".into()
        } else {
            parts.join(" · ")
        },
    }
}
