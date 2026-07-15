use crate::models::ProjectStore;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const STORE_FILE: &str = "projects.json";

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("STORE-001: cannot resolve app data dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("STORE-002: cannot create app data dir: {e}"))?;
    }
    Ok(dir.join(STORE_FILE))
}

pub fn load_store(app: &AppHandle) -> Result<ProjectStore, String> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(ProjectStore::default());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("STORE-003: failed to read projects.json: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(ProjectStore::default());
    }
    serde_json::from_str(&raw).map_err(|e| format!("STORE-004: invalid projects.json: {e}"))
}

pub fn save_store(app: &AppHandle, store: &ProjectStore) -> Result<(), String> {
    let path = store_path(app)?;
    let raw = serde_json::to_string_pretty(store)
        .map_err(|e| format!("STORE-005: serialize failed: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("STORE-006: write failed: {e}"))?;
    Ok(())
}
