//! Mesh sync config + PAT — local-only settings for cross-device gist sync.
use crate::usage::credentials;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const CONFIG_FILE: &str = "mesh-config.json";
const PAT_PROVIDER: &str = "mesh-github";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshConfigFile {
    pub enabled: bool,
    pub gist_id: Option<String>,
    pub device_id: String,
    pub device_name: String,
    pub credential_id: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    #[serde(default)]
    pub peer_count: u32,
}

impl Default for MeshConfigFile {
    fn default() -> Self {
        Self {
            enabled: false,
            gist_id: None,
            device_id: Uuid::new_v4().to_string(),
            device_name: default_device_name(),
            credential_id: None,
            last_synced_at: None,
            last_error: None,
            peer_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshConfigPublic {
    pub enabled: bool,
    pub gist_id: Option<String>,
    pub device_id: String,
    pub device_name: String,
    pub has_pat: bool,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    pub peer_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshConfigPatch {
    pub enabled: Option<bool>,
    #[serde(default)]
    pub gist_id: Option<String>,
    pub clear_gist_id: Option<bool>,
    pub device_name: Option<String>,
    pub last_synced_at: Option<String>,
    pub clear_last_synced_at: Option<bool>,
    pub last_error: Option<String>,
    pub clear_last_error: Option<bool>,
    pub peer_count: Option<u32>,
}

fn default_device_name() -> String {
    let host = hostname().unwrap_or_else(|| "device".into());
    let os = std::env::consts::OS;
    let label = match os {
        "macos" => "Mac",
        "windows" => "PC",
        "linux" => "Linux",
        _ => "Device",
    };
    format!("{label} · {host}")
}

fn hostname() -> Option<String> {
    if let Ok(h) = std::env::var("HOSTNAME") {
        if !h.trim().is_empty() {
            return Some(h);
        }
    }
    fs::read_to_string("/etc/hostname")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("MESH-001: cannot resolve app data dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("MESH-002: cannot create app data dir: {e}"))?;
    }
    Ok(dir.join(CONFIG_FILE))
}

pub fn load_config(app: &AppHandle) -> Result<MeshConfigFile, String> {
    let path = config_path(app)?;
    if !path.exists() {
        let cfg = MeshConfigFile::default();
        save_config(app, &cfg)?;
        return Ok(cfg);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("MESH-003: failed to read mesh-config.json: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(MeshConfigFile::default());
    }
    serde_json::from_str(&raw).map_err(|e| format!("MESH-004: invalid mesh-config.json: {e}"))
}

pub fn save_config(app: &AppHandle, cfg: &MeshConfigFile) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("MESH-005: serialize failed: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("MESH-006: write failed: {e}"))?;
    Ok(())
}

fn to_public(cfg: &MeshConfigFile) -> MeshConfigPublic {
    MeshConfigPublic {
        enabled: cfg.enabled,
        gist_id: cfg.gist_id.clone(),
        device_id: cfg.device_id.clone(),
        device_name: cfg.device_name.clone(),
        has_pat: credentials::retrieve(cfg.credential_id.as_deref()).is_some(),
        last_synced_at: cfg.last_synced_at.clone(),
        last_error: cfg.last_error.clone(),
        peer_count: cfg.peer_count,
    }
}

#[tauri::command]
pub fn mesh_get_config(app: AppHandle) -> Result<MeshConfigPublic, String> {
    let cfg = load_config(&app)?;
    Ok(to_public(&cfg))
}

#[tauri::command]
pub fn mesh_save_config(
    app: AppHandle,
    patch: MeshConfigPatch,
) -> Result<MeshConfigPublic, String> {
    let mut cfg = load_config(&app)?;
    if let Some(v) = patch.enabled {
        cfg.enabled = v;
    }
    if patch.clear_gist_id == Some(true) {
        cfg.gist_id = None;
    } else if let Some(g) = patch.gist_id {
        let trimmed = g.trim();
        cfg.gist_id = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(name) = patch.device_name {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            cfg.device_name = trimmed.to_string();
        }
    }
    if patch.clear_last_synced_at == Some(true) {
        cfg.last_synced_at = None;
    } else if let Some(v) = patch.last_synced_at {
        cfg.last_synced_at = Some(v);
    }
    if patch.clear_last_error == Some(true) {
        cfg.last_error = None;
    } else if let Some(v) = patch.last_error {
        cfg.last_error = if v.trim().is_empty() { None } else { Some(v) };
    }
    if let Some(n) = patch.peer_count {
        cfg.peer_count = n;
    }
    save_config(&app, &cfg)?;
    Ok(to_public(&cfg))
}

#[tauri::command]
pub fn mesh_set_pat(app: AppHandle, secret: String) -> Result<MeshConfigPublic, String> {
    let mut cfg = load_config(&app)?;
    credentials::replace(PAT_PROVIDER, cfg.credential_id.as_deref(), &secret, |id| {
        cfg.credential_id = id
    })?;
    save_config(&app, &cfg)?;
    Ok(to_public(&cfg))
}

#[tauri::command]
pub fn mesh_clear_pat(app: AppHandle) -> Result<MeshConfigPublic, String> {
    let mut cfg = load_config(&app)?;
    credentials::delete(cfg.credential_id.as_deref());
    cfg.credential_id = None;
    save_config(&app, &cfg)?;
    Ok(to_public(&cfg))
}

/// Returns the PAT for mesh HTTP from the frontend (desktop only; never logged).
#[tauri::command]
pub fn mesh_get_pat(app: AppHandle) -> Result<Option<String>, String> {
    let cfg = load_config(&app)?;
    Ok(credentials::retrieve(cfg.credential_id.as_deref()))
}
