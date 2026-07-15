mod github;
mod hub_vcc;
mod models;
mod project_fs;
mod store;

use models::{
    GithubRepo, GithubStatus, ImportResult, Platform, Priority, ProbeResult, Project, ProjectStore,
};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

#[tauri::command]
fn get_projects(app: AppHandle) -> Result<ProjectStore, String> {
    store::load_store(&app)
}

#[tauri::command]
fn save_projects(app: AppHandle, store: ProjectStore) -> Result<(), String> {
    store::save_store(&app, &store)
}

#[tauri::command]
fn pick_project_folder(app: AppHandle) -> Result<Option<String>, String> {
    let folder = app
        .dialog()
        .file()
        .set_title("Select project folder")
        .blocking_pick_folder();

    Ok(folder.map(|p: FilePath| p.to_string()))
}

#[tauri::command]
fn pick_project_folders(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let folders = app
        .dialog()
        .file()
        .set_title("Select project folder(s)")
        .blocking_pick_folders();

    Ok(folders.map(|paths| paths.into_iter().map(|p: FilePath| p.to_string()).collect()))
}

#[tauri::command]
fn probe_project(path: String) -> ProbeResult {
    project_fs::probe_project(&path)
}

#[tauri::command]
fn get_git_status(path: String) -> GithubStatus {
    project_fs::get_git_status(&path)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err("OPEN-005: path does not exist".into());
    }
    project_fs::open_in_explorer(&path)
}

#[tauri::command]
fn open_unity_project(path: String, unity_version: Option<String>) -> Result<(), String> {
    project_fs::open_unity_project(&path, unity_version.as_deref())
}

#[tauri::command]
fn list_github_repos(username: Option<String>) -> Result<Vec<GithubRepo>, String> {
    let user = username.unwrap_or_else(|| "DeaconDP".to_string());
    github::list_user_repos(&user)
}

#[tauri::command]
fn import_github_repos(app: AppHandle, username: Option<String>) -> Result<ImportResult, String> {
    let user = username.unwrap_or_else(|| "DeaconDP".to_string());
    let repos = github::list_user_repos(&user)?;
    let mut store = store::load_store(&app)?;

    let existing: std::collections::HashSet<String> = store
        .projects
        .iter()
        .filter_map(|p| p.github_repo.clone())
        .collect();

    let mut max_sort = store
        .projects
        .iter()
        .map(|p| p.sort_index)
        .max()
        .unwrap_or(-1);

    let mut added = 0u32;
    let mut skipped = 0u32;

    for repo in repos {
        if existing.contains(&repo.full_name) {
            skipped += 1;
            continue;
        }
        max_sort += 1;
        let platform = guess_platform(repo.language.as_deref(), &repo.name);
        let now = chrono::Utc::now().to_rfc3339();
        store.projects.push(Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: repo.name.clone(),
            sort_index: max_sort,
            priority: Priority::Default,
            platform,
            status: "To Do".into(),
            category: "Other".into(),
            location: String::new(),
            local_path: None,
            unity_version: None,
            github_url: Some(repo.html_url.clone()),
            github_repo: Some(repo.full_name.clone()),
            github_status: GithubStatus::RemoteOnly,
            favorite: false,
            archived: false,
            notes: repo.description.unwrap_or_default(),
            agency: None,
            client: None,
            year: None,
            updated_at: now,
        });
        added += 1;
    }

    store::save_store(&app, &store)?;
    Ok(ImportResult {
        added,
        skipped,
        updated: 0,
        projects: store.projects,
    })
}

fn import_discovered_list(
    app: &AppHandle,
    discovered: Vec<hub_vcc::DiscoveredProject>,
) -> Result<ImportResult, String> {
    let mut store = store::load_store(app)?;
    let mut existing_paths = hub_vcc::existing_path_keys(&store.projects);
    let mut max_sort = store
        .projects
        .iter()
        .map(|p| p.sort_index)
        .max()
        .unwrap_or(-1);

    let mut added = 0u32;
    let mut skipped = 0u32;
    let mut updated = 0u32;

    for raw in discovered {
        let discovered = hub_vcc::enrich_discovered(raw);
        let key = hub_vcc::normalize_path_key(&discovered.path);
        if existing_paths.contains(&key) {
            skipped += 1;
            continue;
        }
        if hub_vcc::try_link_existing(&mut store.projects, &discovered) {
            existing_paths.insert(key);
            updated += 1;
            continue;
        }
        max_sort += 1;
        store
            .projects
            .push(hub_vcc::make_project_from_discovered(&discovered, max_sort));
        existing_paths.insert(key);
        added += 1;
    }

    store::save_store(app, &store)?;
    Ok(ImportResult {
        added,
        skipped,
        updated,
        projects: store.projects,
    })
}

fn list_immediate_child_dirs(parent: &str) -> Result<Vec<hub_vcc::DiscoveredProject>, String> {
    let root = std::path::PathBuf::from(parent);
    if !root.is_dir() {
        return Err(format!(
            "SYNC-001: parent folder does not exist or is not a directory: {parent}"
        ));
    }

    let entries = std::fs::read_dir(&root)
        .map_err(|e| format!("SYNC-002: failed to read parent folder: {e}"))?;

    let mut discovered = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("SYNC-003: failed to read directory entry: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("SYNC-004: failed to read entry type: {e}"))?;
        if !file_type.is_dir() {
            continue;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        discovered.push(hub_vcc::DiscoveredProject {
            name,
            path: path.to_string_lossy().to_string(),
            unity_version: None,
            favorite: false,
            github_url: None,
            github_repo: None,
            last_modified: None,
        });
    }

    discovered.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(discovered)
}

#[tauri::command]
fn add_sync_root(app: AppHandle, path: String) -> Result<Vec<String>, String> {
    let key = hub_vcc::normalize_path_key(&path);
    if key.is_empty() {
        return Err("SYNC-005: empty sync root path".into());
    }
    let root = std::path::PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("SYNC-006: sync root is not a directory: {path}"));
    }

    let mut store = store::load_store(&app)?;
    let already = store
        .sync_roots
        .iter()
        .any(|p| hub_vcc::normalize_path_key(p) == key);
    if !already {
        store.sync_roots.push(path);
        store::save_store(&app, &store)?;
    }
    Ok(store.sync_roots)
}

#[tauri::command]
fn remove_sync_root(app: AppHandle, path: String) -> Result<Vec<String>, String> {
    let key = hub_vcc::normalize_path_key(&path);
    let mut store = store::load_store(&app)?;
    store
        .sync_roots
        .retain(|p| hub_vcc::normalize_path_key(p) != key);
    store::save_store(&app, &store)?;
    Ok(store.sync_roots)
}

#[tauri::command]
fn sync_parent_folder(app: AppHandle, path: String) -> Result<ImportResult, String> {
    let key = hub_vcc::normalize_path_key(&path);
    if key.is_empty() {
        return Err("SYNC-007: empty parent path".into());
    }
    let store = store::load_store(&app)?;
    let known = store
        .sync_roots
        .iter()
        .any(|p| hub_vcc::normalize_path_key(p) == key);
    if !known {
        return Err("SYNC-008: parent is not in the sync roots list".into());
    }
    let discovered = list_immediate_child_dirs(&path)?;
    import_discovered_list(&app, discovered)
}

#[tauri::command]
fn import_unity_hub(app: AppHandle) -> Result<ImportResult, String> {
    let discovered = hub_vcc::read_unity_hub_projects()?;
    import_discovered_list(&app, discovered)
}

#[tauri::command]
fn import_vcc(app: AppHandle) -> Result<ImportResult, String> {
    let discovered = hub_vcc::read_vcc_projects()?;
    import_discovered_list(&app, discovered)
}

#[tauri::command]
fn import_local_folders(app: AppHandle, paths: Vec<String>) -> Result<ImportResult, String> {
    let mut discovered = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for project_path in paths {
        let key = hub_vcc::normalize_path_key(&project_path);
        if key.is_empty() || !seen.insert(key) {
            continue;
        }
        let name = std::path::PathBuf::from(&project_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| project_path.clone());
        discovered.push(hub_vcc::DiscoveredProject {
            name,
            path: project_path,
            unity_version: None,
            favorite: false,
            github_url: None,
            github_repo: None,
            last_modified: None,
        });
    }
    import_discovered_list(&app, discovered)
}

#[tauri::command]
fn refresh_github_statuses(app: AppHandle) -> Result<Vec<Project>, String> {
    let mut store = store::load_store(&app)?;
    for project in &mut store.projects {
        if project.github_url.is_none() && project.github_repo.is_none() {
            project.github_status = GithubStatus::None;
            continue;
        }
        match &project.local_path {
            Some(path) if !path.is_empty() => {
                project.github_status = project_fs::get_git_status(path);
            }
            _ => {
                project.github_status = GithubStatus::RemoteOnly;
            }
        }
    }
    store::save_store(&app, &store)?;
    Ok(store.projects)
}

fn guess_platform(language: Option<&str>, name: &str) -> Platform {
    let name_l = name.to_lowercase();
    if name_l.contains("unity") || name_l.contains("vrc") || name_l.contains("vrchat") {
        return Platform::Unity;
    }
    if name_l.contains("unreal") {
        return Platform::Unreal;
    }
    match language {
        Some("C#") => Platform::Unity,
        Some("C++") => Platform::Unreal,
        Some("TypeScript") | Some("JavaScript") | Some("HTML") | Some("CSS") => Platform::Web,
        _ => Platform::Other,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            get_projects,
            save_projects,
            pick_project_folder,
            pick_project_folders,
            probe_project,
            get_git_status,
            open_path,
            open_unity_project,
            list_github_repos,
            import_github_repos,
            import_unity_hub,
            import_vcc,
            import_local_folders,
            refresh_github_statuses,
            add_sync_root,
            remove_sync_root,
            sync_parent_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
