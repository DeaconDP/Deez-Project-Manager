use std::fs;
use std::path::Path;

use base64::Engine;
use chrono::{DateTime, Utc};
use rusqlite::{Connection, OpenFlags};
use serde_json::Value;

use crate::usage::paths;

#[derive(Debug, Clone, Default)]
pub struct OAuthTokens {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

pub enum GeminiAuthSource {
    Antigravity,
    GeminiCli,
    None,
}

pub struct GeminiAuthResult {
    pub source: GeminiAuthSource,
    pub tokens: OAuthTokens,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub failure_message: Option<String>,
}

impl GeminiAuthResult {
    pub fn has_auth(&self) -> bool {
        self.tokens.access_token.is_some() || self.tokens.refresh_token.is_some()
    }
}

pub fn antigravity_client_id() -> String {
    format!(
        "{}-{}{}",
        "1071006060591-", "tmhssin2h21lcre235vtolojh4g403ep", ".apps.googleusercontent.com"
    )
}

pub fn antigravity_client_secret() -> String {
    format!("GOCSPX-{}", "K58FWR486LdLJ1mLB8sXC4z6qDAf")
}

pub fn resolve_gemini_cli_credentials() -> (Option<String>, Option<String>) {
    if let (Ok(id), Ok(secret)) = (
        std::env::var("GEMINI_OAUTH_CLIENT_ID"),
        std::env::var("GEMINI_OAUTH_CLIENT_SECRET"),
    ) {
        if !id.trim().is_empty() && !secret.trim().is_empty() {
            return (Some(id.trim().to_string()), Some(secret.trim().to_string()));
        }
    }
    for path in paths::gemini_cli_oauth_js_paths() {
        if !path.exists() {
            continue;
        }
        if let Ok(text) = fs::read_to_string(&path) {
            let client_id = extract_js_constant(&text, "OAUTH_CLIENT_ID");
            let client_secret = extract_js_constant(&text, "OAUTH_CLIENT_SECRET");
            if client_id.is_some() && client_secret.is_some() {
                return (client_id, client_secret);
            }
        }
    }
    (None, None)
}

fn extract_js_constant(text: &str, name: &str) -> Option<String> {
    let marker = format!("{name} =");
    let marker2 = format!("{name}=");
    let idx = text.find(&marker).or_else(|| text.find(&marker2))?;
    let rest = &text[idx..];
    let quote = rest.find(['\'', '"'])?;
    let q = rest.as_bytes()[quote] as char;
    let start = quote + 1;
    let end = rest[start..].find(q)? + start;
    Some(rest[start..end].to_string())
}

pub fn read_antigravity_tokens() -> OAuthTokens {
    for db_path in paths::antigravity_state_database_paths() {
        if !db_path.exists() {
            continue;
        }
        match read_antigravity_from_path(&db_path) {
            Ok(tokens) if tokens.access_token.is_some() || tokens.refresh_token.is_some() => {
                return tokens;
            }
            Err(rusqlite::Error::SqliteFailure(_, _)) => {
                let temp = std::env::temp_dir().join(format!(
                    "antigravity-state-{}.vscdb",
                    uuid::Uuid::new_v4().simple()
                ));
                if fs::copy(&db_path, &temp).is_ok() {
                    if let Ok(tokens) = read_antigravity_from_path(&temp) {
                        let _ = fs::remove_file(temp);
                        if tokens.access_token.is_some() || tokens.refresh_token.is_some() {
                            return tokens;
                        }
                    }
                }
            }
            _ => {}
        }
    }
    OAuthTokens::default()
}

fn read_antigravity_from_path(path: &Path) -> rusqlite::Result<OAuthTokens> {
    const KEY: &str = "antigravityUnifiedStateSync.oauthToken";
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let value: Option<String> =
        match conn.query_row("SELECT value FROM ItemTable WHERE key = ?1", [KEY], |row| {
            row.get(0)
        }) {
            Ok(v) => Some(v),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(e),
        };
    Ok(parse_oauth_envelope(value.as_deref()))
}

pub fn read_gemini_cli_tokens() -> OAuthTokens {
    let path = paths::gemini_oauth_credentials();
    if !path.exists() {
        return OAuthTokens::default();
    }
    let text = fs::read_to_string(path).unwrap_or_default();
    parse_gemini_oauth_json(&text)
}

pub fn parse_gemini_oauth_json(json: &str) -> OAuthTokens {
    let Ok(root) = serde_json::from_str::<Value>(json) else {
        return OAuthTokens::default();
    };
    let access_token = read_string(&root, &["access_token", "accessToken"]);
    let refresh_token = read_string(&root, &["refresh_token", "refreshToken"]);
    let expires_at = parse_expiry(&root);
    if access_token.is_none() && refresh_token.is_none() {
        return OAuthTokens::default();
    }
    OAuthTokens {
        access_token,
        refresh_token,
        expires_at,
    }
}

fn read_string(root: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|k| root.get(*k).and_then(|v| v.as_str()).map(str::to_string))
}

fn parse_expiry(root: &Value) -> Option<DateTime<Utc>> {
    let el = root.get("expiry_date").or_else(|| root.get("expiryDate"))?;
    let ms = match el {
        Value::Number(n) => n.as_i64()?,
        Value::String(s) => s.parse().ok()?,
        _ => return None,
    };
    if ms > 1_000_000_000_000 {
        DateTime::<Utc>::from_timestamp_millis(ms)
    } else {
        DateTime::<Utc>::from_timestamp(ms, 0)
    }
}

pub fn parse_oauth_envelope(envelope: Option<&str>) -> OAuthTokens {
    let Some(raw) = envelope.filter(|s| !s.trim().is_empty()) else {
        return OAuthTokens::default();
    };
    let Ok(outer) = base64::engine::general_purpose::STANDARD.decode(raw.trim()) else {
        return OAuthTokens::default();
    };
    let wrapper = read_bytes_field(&outer, 1);
    if wrapper.is_empty() {
        return OAuthTokens::default();
    }
    let payload = read_bytes_field(wrapper, 2);
    if payload.is_empty() {
        return OAuthTokens::default();
    }
    let inner_b64 = match read_string_field(payload, 1) {
        Some(s) => s,
        None => return OAuthTokens::default(),
    };
    let Ok(token_info) = base64::engine::general_purpose::STANDARD.decode(inner_b64.trim()) else {
        return OAuthTokens::default();
    };
    let access_token = read_string_field(&token_info, 1);
    let refresh_token = read_string_field(&token_info, 3);
    let expiry_seconds = read_varint_field(&token_info, 4);
    let expires_at = expiry_seconds
        .filter(|&s| s > 0)
        .and_then(|s| DateTime::<Utc>::from_timestamp(s, 0));
    OAuthTokens {
        access_token,
        refresh_token,
        expires_at,
    }
}

fn read_string_field(message: &[u8], target: u32) -> Option<String> {
    for field in iter_fields(message) {
        if field.0 == target && field.1 == 2 {
            return String::from_utf8(field.2.clone()).ok();
        }
    }
    None
}

fn read_bytes_field(message: &[u8], target: u32) -> &[u8] {
    for field in iter_fields(message) {
        if field.0 == target && field.1 == 2 {
            return &message[field.3..field.3 + field.2.len()];
        }
    }
    &[]
}

fn read_varint_field(message: &[u8], target: u32) -> Option<i64> {
    for field in iter_fields(message) {
        if field.0 == target && field.1 == 0 {
            return Some(field.4 as i64);
        }
    }
    None
}

fn iter_fields(data: &[u8]) -> Vec<(u32, u32, Vec<u8>, usize, u64)> {
    let mut out = Vec::new();
    let mut offset = 0;
    while offset < data.len() {
        let Some((tag, tag_len)) = read_varint_at(data, offset) else {
            break;
        };
        offset += tag_len;
        let field_number = (tag >> 3) as u32;
        let wire_type = (tag & 0x7) as u32;
        match wire_type {
            0 => {
                let Some((value, len)) = read_varint_at(data, offset) else {
                    break;
                };
                out.push((field_number, wire_type, vec![], offset, value));
                offset += len;
            }
            2 => {
                let Some((len, len_bytes)) = read_varint_at(data, offset) else {
                    break;
                };
                offset += len_bytes;
                let len = len as usize;
                if offset + len > data.len() {
                    break;
                }
                let bytes = data[offset..offset + len].to_vec();
                out.push((field_number, wire_type, bytes, offset, 0));
                offset += len;
            }
            1 => offset += 8,
            5 => offset += 4,
            _ => break,
        }
    }
    out
}

fn read_varint_at(data: &[u8], mut offset: usize) -> Option<(u64, usize)> {
    let start = offset;
    let mut value = 0u64;
    let mut shift = 0;
    while offset < data.len() {
        let b = data[offset];
        offset += 1;
        value |= u64::from(b & 0x7F) << shift;
        if b & 0x80 == 0 {
            return Some((value, offset - start));
        }
        shift += 7;
        if shift > 63 {
            return None;
        }
    }
    None
}

pub fn resolve() -> GeminiAuthResult {
    let antigravity = read_antigravity_tokens();
    if antigravity.access_token.is_some() || antigravity.refresh_token.is_some() {
        return GeminiAuthResult {
            source: GeminiAuthSource::Antigravity,
            tokens: antigravity,
            client_id: Some(antigravity_client_id()),
            client_secret: Some(antigravity_client_secret()),
            failure_message: None,
        };
    }
    let gemini_cli = read_gemini_cli_tokens();
    if gemini_cli.access_token.is_some() || gemini_cli.refresh_token.is_some() {
        let (client_id, client_secret) = resolve_gemini_cli_credentials();
        return GeminiAuthResult {
            source: GeminiAuthSource::GeminiCli,
            tokens: gemini_cli,
            client_id,
            client_secret,
            failure_message: None,
        };
    }
    GeminiAuthResult {
        source: GeminiAuthSource::None,
        tokens: OAuthTokens::default(),
        client_id: None,
        client_secret: None,
        failure_message: Some(
            "Sign in to Antigravity IDE or run gemini login (Gemini CLI) on this machine".into(),
        ),
    }
}

pub fn has_detectable_auth() -> bool {
    resolve().has_auth()
}

pub async fn refresh_access_token(
    http: &reqwest::Client,
    refresh_token: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<String, String> {
    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    let resp = http
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err("Gemini session expired — sign in again".into());
    }
    let root: Value = resp.json().await.map_err(|e| e.to_string())?;
    root.get("access_token")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Invalid token response".into())
}

pub fn token_needs_refresh(tokens: &OAuthTokens) -> bool {
    match (&tokens.access_token, &tokens.expires_at) {
        (None, _) => true,
        (Some(_), Some(exp)) => *exp <= Utc::now() + chrono::Duration::minutes(1),
        (Some(_), None) => false,
    }
}
