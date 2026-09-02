use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Sticky remote PWA port (sibling to Vite 5187; avoids HMR 5188).
pub const DEFAULT_REMOTE_PORT: u16 = 5197;

const SETTINGS_FILE: &str = "remote.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSettings {
    pub enabled: bool,
    pub port: u16,
    /// Optional shared secret; empty/None = tailnet ACL only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    /// MagicDNS hostnames (or host:port) for other nodes.
    #[serde(default)]
    pub peers: Vec<String>,
}

impl Default for RemoteSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            port: DEFAULT_REMOTE_PORT,
            token: None,
            peers: Vec::new(),
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("REMOTE-001: app data dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("REMOTE-002: create app data: {e}"))?;
    }
    Ok(dir.join(SETTINGS_FILE))
}

pub fn load_settings(app: &AppHandle) -> Result<RemoteSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(RemoteSettings::default());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("REMOTE-003: read remote.json: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(RemoteSettings::default());
    }
    let mut settings: RemoteSettings = serde_json::from_str(&raw)
        .map_err(|e| format!("REMOTE-004: invalid remote.json: {e}"))?;
    if settings.port == 0 {
        settings.port = DEFAULT_REMOTE_PORT;
    }
    settings.peers = settings
        .peers
        .into_iter()
        .map(|p| p.trim().trim_end_matches('/').to_string())
        .filter(|p| !p.is_empty())
        .collect();
    if let Some(t) = settings.token.as_mut() {
        let trimmed = t.trim().to_string();
        if trimmed.is_empty() {
            settings.token = None;
        } else {
            *t = trimmed;
        }
    }
    Ok(settings)
}

pub fn save_settings(app: &AppHandle, settings: &RemoteSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("REMOTE-005: serialize remote.json: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("REMOTE-006: write remote.json: {e}"))?;
    Ok(())
}
