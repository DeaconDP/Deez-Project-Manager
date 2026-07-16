use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use uuid::Uuid;

use crate::usage::paths;
use crate::usage::protect;

static MEMORY_CACHE: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

fn cache() -> std::sync::MutexGuard<'static, Option<HashMap<String, Option<String>>>> {
    let mut guard = MEMORY_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    guard
}

fn credential_path(credential_id: &str) -> PathBuf {
    let safe = credential_id.replace(['\\', '/'], "_");
    paths::credentials_dir().join(format!("{safe}.cred"))
}

pub fn store(provider: &str, secret: &str) -> Result<String, String> {
    if secret.trim().is_empty() {
        return Err("Secret cannot be empty.".into());
    }
    fs::create_dir_all(paths::credentials_dir()).map_err(|e| e.to_string())?;
    let id = format!("{provider}-{}", Uuid::new_v4().simple());
    let protected = protect::protect(secret.as_bytes())?;
    fs::write(credential_path(&id), protected).map_err(|e| e.to_string())?;
    if let Some(map) = cache().as_mut() {
        map.insert(id.clone(), Some(secret.to_string()));
    }
    Ok(id)
}

pub fn retrieve(credential_id: Option<&str>) -> Option<String> {
    let id = credential_id?.trim();
    if id.is_empty() {
        return None;
    }
    if let Some(map) = cache().as_mut() {
        if let Some(cached) = map.get(id) {
            return cached.clone();
        }
    }
    let path = credential_path(id);
    if !path.exists() {
        if let Some(map) = cache().as_mut() {
            map.insert(id.to_string(), None);
        }
        return None;
    }
    match fs::read(&path)
        .ok()
        .and_then(|bytes| protect::unprotect(&bytes).ok())
        .and_then(|plain| String::from_utf8(plain).ok())
    {
        Some(secret) => {
            if let Some(map) = cache().as_mut() {
                map.insert(id.to_string(), Some(secret.clone()));
            }
            Some(secret)
        }
        None => {
            if let Some(map) = cache().as_mut() {
                map.insert(id.to_string(), None);
            }
            None
        }
    }
}

pub fn delete(credential_id: Option<&str>) {
    let Some(id) = credential_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return;
    };
    if let Some(map) = cache().as_mut() {
        map.remove(id);
    }
    let path = credential_path(id);
    let _ = fs::remove_file(path);
}

pub fn replace(
    provider: &str,
    existing_id: Option<&str>,
    new_secret: &str,
    set_credential_id: impl FnOnce(Option<String>),
) -> Result<(), String> {
    if new_secret.trim().is_empty() {
        delete(existing_id);
        set_credential_id(None);
        return Ok(());
    }
    delete(existing_id);
    let id = store(provider, new_secret)?;
    set_credential_id(Some(id));
    Ok(())
}
