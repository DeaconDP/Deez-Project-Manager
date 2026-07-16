use std::fs;

use base64::Engine;
use serde_json::Value;

use crate::usage::credentials;
use crate::usage::paths;

#[derive(Debug, Clone)]
pub struct CodexAuth {
    pub access_token: String,
    pub account_id: String,
}

pub fn read_auth_file() -> Option<CodexAuth> {
    let path = paths::codex_auth_file();
    let text = fs::read_to_string(path).ok()?;
    parse_auth_json(&text)
}

pub fn parse_auth_json(json: &str) -> Option<CodexAuth> {
    let root: Value = serde_json::from_str(json).ok()?;
    if root
        .get("auth_mode")
        .and_then(|v| v.as_str())
        .map(|m| !m.eq_ignore_ascii_case("chatgpt"))
        .unwrap_or(false)
    {
        return None;
    }
    let tokens = root.get("tokens")?;
    let access_token = tokens.get("access_token")?.as_str()?.trim();
    if access_token.is_empty() {
        return None;
    }
    let account_id = tokens
        .get("account_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| extract_account_id_from_token(access_token))?;
    Some(CodexAuth {
        access_token: access_token.to_string(),
        account_id,
    })
}

pub fn resolve_session_cookie(pro_session_id: Option<&str>) -> Option<String> {
    credentials::retrieve(pro_session_id)
}

pub fn extract_account_id_from_token(token: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let mut payload = parts[1].to_string();
    let pad = payload.len() % 4;
    if pad > 0 {
        payload.push_str(&"=".repeat(4 - pad));
    }
    let decoded = payload.replace('-', "+").replace('_', "/");
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(decoded)
        .ok()?;
    let json: Value = serde_json::from_slice(&bytes).ok()?;
    json.get("chatgpt_account_id")
        .or_else(|| json.get("https://api.openai.com/auth.chatgpt_account_id"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

pub async fn exchange_session(
    http: &reqwest::Client,
    session_cookie: &str,
) -> Result<CodexAuth, String> {
    let cookie = if session_cookie.contains('=') {
        session_cookie.to_string()
    } else {
        format!("__Secure-next-auth.session-token={session_cookie}")
    };
    let resp = http
        .get("https://chatgpt.com/api/auth/session")
        .header("Cookie", cookie)
        .header("Referer", "https://chatgpt.com/")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(
            "Session expired — run codex login or paste a new ChatGPT session cookie".into(),
        );
    }
    let root: Value = resp.json().await.map_err(|e| e.to_string())?;
    let access_token = root
        .get("accessToken")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Invalid session response".to_string())?;
    let account_id = root
        .get("account")
        .and_then(|a| a.get("id"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| extract_account_id_from_token(access_token))
        .ok_or_else(|| "No account id in session".to_string())?;
    Ok(CodexAuth {
        access_token: access_token.to_string(),
        account_id,
    })
}
