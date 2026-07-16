use std::fs;

use serde_json::Value;

use crate::usage::credentials;
use crate::usage::paths;

pub enum OpenCodeAuthSource {
    ApiKey,
    Session,
    None,
}

pub struct OpenCodeAuth {
    pub source: OpenCodeAuthSource,
    pub api_key: Option<String>,
    pub session_cookie: Option<String>,
    pub failure_message: Option<String>,
}

const AUTH_KEYS: &[&str] = &["opencode", "opencodezen", "opencode-go", "opencode-go-plan"];

pub fn read_local_api_key() -> Option<String> {
    for path in paths::opencode_auth_paths() {
        if !path.exists() {
            continue;
        }
        if let Ok(text) = fs::read_to_string(&path) {
            if let Some(key) = parse_api_key(&text) {
                return Some(key);
            }
        }
    }
    None
}

fn parse_api_key(json: &str) -> Option<String> {
    let root: Value = serde_json::from_str(json).ok()?;
    for key in AUTH_KEYS {
        if let Some(section) = root.get(*key) {
            if let Some(k) = section
                .get("key")
                .or_else(|| section.get("apiKey"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            {
                return Some(k.to_string());
            }
        }
    }
    None
}

pub fn resolve(settings: &crate::usage::types::ProviderBillingSettings) -> OpenCodeAuth {
    if let Some(key) = read_local_api_key() {
        return OpenCodeAuth {
            source: OpenCodeAuthSource::ApiKey,
            api_key: Some(key),
            session_cookie: None,
            failure_message: None,
        };
    }
    if let Some(session) = credentials::retrieve(settings.pro_session_credential_id.as_deref()) {
        return OpenCodeAuth {
            source: OpenCodeAuthSource::Session,
            api_key: None,
            session_cookie: Some(session),
            failure_message: None,
        };
    }
    OpenCodeAuth {
        source: OpenCodeAuthSource::None,
        api_key: None,
        session_cookie: None,
        failure_message: Some("OpenCode auth not found".into()),
    }
}

pub fn has_api_key_auth() -> bool {
    read_local_api_key().is_some()
}

pub fn has_detectable_auth(settings: &crate::usage::types::ProviderBillingSettings) -> bool {
    read_local_api_key().is_some()
        || credentials::retrieve(settings.pro_session_credential_id.as_deref()).is_some()
}

pub fn build_auth_cookie(session_value: &str) -> String {
    let trimmed = session_value.trim();
    if trimmed.contains('=') {
        trimmed.to_string()
    } else {
        format!("auth={trimmed}")
    }
}
