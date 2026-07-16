use std::fs;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::usage::credentials;
use crate::usage::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeOAuthToken {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_at_ms: Option<i64>,
}

impl ClaudeOAuthToken {
    pub fn is_expired(&self) -> bool {
        match self.expires_at_ms {
            Some(ms) => ms <= chrono::Utc::now().timestamp_millis(),
            None => false,
        }
    }
}

pub fn read_claude_code_oauth() -> Option<String> {
    let path = paths::claude_code_credentials();
    let text = fs::read_to_string(path).ok()?;
    let root: Value = serde_json::from_str(&text).ok()?;
    root.get("claudeAiOauth")
        .or_else(|| root.get("claude_ai_oauth"))
        .and_then(|v| v.get("accessToken").or_else(|| v.get("access_token")))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

pub fn read_app_oauth(pro_oauth_id: Option<&str>) -> Option<ClaudeOAuthToken> {
    let json = credentials::retrieve(pro_oauth_id)?;
    serde_json::from_str(&json).ok()
}

pub fn persist_app_oauth(
    settings: &mut crate::usage::types::ProviderBillingSettings,
    token: &ClaudeOAuthToken,
) {
    if let Ok(json) = serde_json::to_string(token) {
        let existing = settings.pro_oauth_credential_id.clone();
        let _ = credentials::replace("claude-pro-oauth", existing.as_deref(), &json, |id| {
            settings.pro_oauth_credential_id = id
        });
    }
}

pub fn read_session_cookie(pro_session_id: Option<&str>) -> Option<String> {
    credentials::retrieve(pro_session_id)
}

pub fn build_cookie_header(session_value: &str) -> String {
    let trimmed = session_value.trim();
    if trimmed.contains('=') {
        trimmed.to_string()
    } else {
        format!("sessionKey={trimmed}")
    }
}

pub fn normalize_utilization(value: f64) -> Option<f64> {
    if !value.is_finite() {
        return None;
    }
    Some(if value <= 1.0 { value * 100.0 } else { value })
}

pub fn parse_org_uuid(account_root: &Value) -> Option<String> {
    let memberships = account_root.get("memberships")?.as_array()?;
    for membership in memberships {
        if let Some(uuid) = membership
            .get("organization")
            .and_then(|o| o.get("uuid"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            return Some(uuid.to_string());
        }
        if let Some(uuid) = membership
            .get("uuid")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            return Some(uuid.to_string());
        }
    }
    None
}

pub async fn refresh_oauth_token(
    http: &reqwest::Client,
    refresh_token: &str,
) -> Result<ClaudeOAuthToken, String> {
    let body = serde_json::json!({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": "claude-code",
    });
    let resp = http
        .post("https://console.anthropic.com/v1/oauth/token")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err("Claude sign-in expired — sign in with Claude again in Settings".into());
    }
    let root: Value = resp.json().await.map_err(|e| e.to_string())?;
    let access = root
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Invalid refresh response".to_string())?;
    let refresh = root
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let expires_in = root
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(3600);
    Ok(ClaudeOAuthToken {
        access_token: access.to_string(),
        refresh_token: refresh,
        expires_at_ms: Some(chrono::Utc::now().timestamp_millis() + expires_in * 1000 - 60_000),
    })
}
