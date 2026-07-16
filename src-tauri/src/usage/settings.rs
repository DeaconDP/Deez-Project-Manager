use std::fs;

use crate::usage::paths;
use crate::usage::types::FuelSettings;

pub fn load() -> FuelSettings {
    let path = paths::fuel_settings_path();
    if !path.exists() {
        return FuelSettings::default();
    }
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => FuelSettings::default(),
    }
}

pub fn save(settings: &FuelSettings) -> Result<(), String> {
    let dir = paths::fuel_settings_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let path = paths::fuel_settings_path();
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}
