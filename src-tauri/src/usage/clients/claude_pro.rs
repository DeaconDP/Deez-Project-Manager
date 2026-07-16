use reqwest::Client;
use serde_json::Value;

use crate::usage::auth::claude_pro::{
    self, build_cookie_header, normalize_utilization, persist_app_oauth, read_app_oauth,
    read_claude_code_oauth, read_session_cookie,
};
use crate::usage::clients::shared_client;
use crate::usage::types::{ClaudeProSnapshot, ProviderBillingSettings};

const OAUTH_USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const CLIENT_USER_AGENT: &str = "claude-code/2.0.14";

pub struct ClaudeProUsageClient {
    http: Client,
}

impl ClaudeProUsageClient {
    pub fn new() -> Self {
        Self {
            http: shared_client(),
        }
    }

    pub async fn fetch(&self, settings: &mut ProviderBillingSettings) -> ClaudeProSnapshot {
        match self.fetch_with_auth(settings).await {
            Ok(snap) => {
                settings.pro_last_connection_status = Some(if snap.is_available {
                    "Connected".into()
                } else {
                    snap.status_message
                        .clone()
                        .unwrap_or_else(|| "Unavailable".into())
                });
                snap
            }
            Err(msg) => {
                settings.pro_last_connection_status = Some(msg.clone());
                ClaudeProSnapshot::unavailable(Some(&msg))
            }
        }
    }

    pub async fn refresh_and_connect(&self, settings: &mut ProviderBillingSettings) -> String {
        match self.fetch_with_auth(settings).await {
            Ok(snap) => {
                let status = if snap.is_available {
                    "Connected".into()
                } else {
                    snap.status_message
                        .clone()
                        .unwrap_or_else(|| "Unavailable".into())
                };
                settings.pro_last_connection_status = Some(status.clone());
                status
            }
            Err(msg) => {
                settings.pro_last_connection_status = Some(msg.clone());
                msg
            }
        }
    }

    pub async fn test_connection(&self, settings: &mut ProviderBillingSettings) -> String {
        self.refresh_and_connect(settings).await
    }

    async fn fetch_with_auth(
        &self,
        settings: &mut ProviderBillingSettings,
    ) -> Result<ClaudeProSnapshot, String> {
        if let Some(mut token) = read_app_oauth(settings.pro_oauth_credential_id.as_deref()) {
            if token.is_expired() {
                if let Some(refresh) = token.refresh_token.clone() {
                    token = claude_pro::refresh_oauth_token(&self.http, &refresh).await?;
                    persist_app_oauth(settings, &token);
                } else {
                    return Err(
                        "Claude sign-in expired — sign in with Claude again in Settings".into(),
                    );
                }
            }
            return self.fetch_oauth_usage(&token.access_token).await;
        }
        if let Some(oauth) = read_claude_code_oauth() {
            return self.fetch_oauth_usage(&oauth).await;
        }
        let session = read_session_cookie(settings.pro_session_credential_id.as_deref())
            .ok_or_else(|| "Sign in with Claude in Settings, or run 'claude login'".to_string())?;
        let org = self.fetch_org_uuid(&session).await?;
        self.fetch_session_usage(&session, &org).await
    }

    async fn fetch_oauth_usage(&self, access_token: &str) -> Result<ClaudeProSnapshot, String> {
        let resp = self
            .http
            .get(OAUTH_USAGE_URL)
            .header("Authorization", format!("Bearer {access_token}"))
            .header("anthropic-beta", "oauth-2025-04-20")
            .header("User-Agent", CLIENT_USER_AGENT)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("OAuth usage failed ({})", resp.status()));
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(parse_usage_response(&root))
    }

    async fn fetch_org_uuid(&self, session: &str) -> Result<String, String> {
        let resp = self
            .http
            .get("https://claude.ai/api/account")
            .header("Cookie", build_cookie_header(session))
            .header("Referer", "https://claude.ai/settings/usage")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err("No organization found".into());
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        claude_pro::parse_org_uuid(&root).ok_or_else(|| "No organization found".into())
    }

    async fn fetch_session_usage(
        &self,
        session: &str,
        org_uuid: &str,
    ) -> Result<ClaudeProSnapshot, String> {
        let url = format!("https://claude.ai/api/organizations/{org_uuid}/usage");
        let resp = self
            .http
            .get(url)
            .header("Cookie", build_cookie_header(session))
            .header("Referer", "https://claude.ai/settings/usage")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err("No Pro quota".into());
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(parse_usage_response(&root))
    }
}

impl Default for ClaudeProUsageClient {
    fn default() -> Self {
        Self::new()
    }
}

pub fn parse_usage_response(root: &Value) -> ClaudeProSnapshot {
    let session = parse_window_percent(root, "five_hour");
    let weekly = parse_window_percent(root, "seven_day");
    if session.is_none() && weekly.is_none() {
        return ClaudeProSnapshot::unavailable(Some("No Pro quota"));
    }
    ClaudeProSnapshot::from_usage(
        session.unwrap_or(0.0),
        weekly.unwrap_or(0.0),
        parse_window_reset(root, "five_hour"),
        parse_window_reset(root, "seven_day"),
    )
}

fn parse_window_percent(root: &Value, key: &str) -> Option<f64> {
    let window = root.get(key)?;
    let util = window.get("utilization")?;
    if util.is_null() {
        return None;
    }
    util.as_f64().and_then(normalize_utilization)
}

fn parse_window_reset(root: &Value, key: &str) -> Option<String> {
    root.get(key)
        .and_then(|w| w.get("resets_at"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}
