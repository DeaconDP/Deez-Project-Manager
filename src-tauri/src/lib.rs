mod github;
mod hub_vcc;
mod launch_gate;
mod mesh;
mod metrics;
mod models;
mod net;
mod project_fs;
mod scheduler;
mod spikes;
mod startup;
mod store;
mod types;
mod usage;
mod usb;
mod win_cmd;

use models::{
    GitSyncInfo, GitSyncUpdated, GithubRepo, GithubStatus, ImportResult, Platform, Priority,
    ProbeResult, Project, ProjectStore,
};
use scheduler::{run_latency_suite, start_scheduler, SamplerState};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::{DialogExt, FilePath};
use types::{LatencyResult, MetricsSnapshot, SpikeEvent};
use mesh::{
    mesh_clear_pat, mesh_get_config, mesh_get_pat, mesh_save_config, mesh_set_pat,
};
use usage::{
    fuel_clear_credential, fuel_connect, fuel_get_settings, fuel_get_snapshot, fuel_refresh,
    fuel_save_settings, fuel_set_credential, fuel_test, start_fuel_scheduler, FuelState,
};
use usb::model::UsbDevice;
use usb::watch::{start_watcher, update_fingerprint};
use usb::{enumerate, get_device};

struct MonitorState {
    sampler: Arc<SamplerState>,
    last_usb_fingerprint: Arc<Mutex<String>>,
    usb_watch_enabled: Arc<AtomicBool>,
}

#[tauri::command]
fn get_projects(app: AppHandle) -> Result<ProjectStore, String> {
    let mut store = store::load_store(&app)?;
    // Cheap in-memory cleanup only — engine re-probe runs via heal_project_engines
    // after first paint so cold start is not blocked on disk walks.
    let mut dirty = false;
    for project in &mut store.projects {
        let empty_path = project
            .local_path
            .as_ref()
            .map(|p| p.trim().is_empty())
            .unwrap_or(true);
        if empty_path && project.has_run_script {
            project.has_run_script = false;
            dirty = true;
        }
    }
    if dirty {
        store::save_store(&app, &store)?;
    }
    Ok(store)
}

/// Filesystem engine heal (Unity/Unreal/tools). Call after first paint.
#[tauri::command]
fn heal_project_engines(app: AppHandle) -> Result<Vec<Project>, String> {
    let mut store = store::load_store(&app)?;
    if hub_vcc::reprobe_all_engines(&mut store.projects) {
        store::save_store(&app, &store)?;
    }
    Ok(store.projects)
}

/// Cheap path existence checks (no git / engine walk).
#[tauri::command]
fn check_paths_exist(paths: Vec<String>) -> Vec<bool> {
    paths
        .into_iter()
        .map(|p| {
            let path = Path::new(&p);
            !p.trim().is_empty() && path.exists()
        })
        .collect()
}

#[tauri::command]
fn save_projects(app: AppHandle, store: ProjectStore) -> Result<(), String> {
    store::save_store(&app, &store)
}

#[tauri::command]
async fn pick_project_folder(app: AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Select project folder")
        .pick_folder(move |folder| {
            let _ = sender.send(folder);
        });
    let folder = receiver
        .await
        .map_err(|_| "DIALOG-001: folder picker closed unexpectedly".to_string())?;

    Ok(folder.map(|p: FilePath| p.to_string()))
}

#[tauri::command]
async fn pick_project_folders(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Select project folder(s)")
        .pick_folders(move |folders| {
            let _ = sender.send(folders);
        });
    let folders = receiver
        .await
        .map_err(|_| "DIALOG-002: folder picker closed unexpectedly".to_string())?;

    Ok(folders.map(|paths| paths.into_iter().map(|p: FilePath| p.to_string()).collect()))
}

#[tauri::command]
async fn pick_trello_json(app: AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Import Trello board JSON")
        .add_filter("JSON", &["json"])
        .pick_file(move |file| {
            let _ = sender.send(file);
        });
    let file = receiver
        .await
        .map_err(|_| "DIALOG-003: file picker closed unexpectedly".to_string())?;

    Ok(file.map(|p: FilePath| p.to_string()))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("FILE-001: failed to read {path}: {e}"))
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
fn run_project(path: String) -> Result<(), String> {
    project_fs::run_project(&path)
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
            git_ahead: 0,
            git_behind: 0,
            git_branch: None,
            git_dirty: false,
            favorite: false,
            archived: false,
            notes: repo.description.unwrap_or_default(),
            tools: Vec::new(),
            has_run_script: false,
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
    force_unity: bool,
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
        let key = hub_vcc::normalize_path_key(&raw.path);
        // Engine-only for already-tracked paths; git remote only for new/link candidates.
        let need_git = !existing_paths.contains(&key);
        let mut discovered = hub_vcc::enrich_discovered(raw, need_git);
        // Unity Hub / VCC lists are assumed Unity, but a definitive `.uproject`
        // (Unreal) from the filesystem probe must win.
        if force_unity && discovered.platform != Platform::Unreal {
            discovered.platform = Platform::Unity;
        }
        if existing_paths.contains(&key) {
            if hub_vcc::try_refresh_existing_by_path(&mut store.projects, &discovered) {
                updated += 1;
            } else {
                skipped += 1;
            }
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
            platform: Platform::Other,
            tools: Vec::new(),
            has_run_script: false,
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
    import_discovered_list(&app, discovered, false)
}

#[tauri::command]
fn sync_all_parent_folders(app: AppHandle) -> Result<ImportResult, String> {
    let store = store::load_store(&app)?;
    if store.sync_roots.is_empty() {
        return Err("SYNC-009: no parent folders to sync".into());
    }

    let mut discovered = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for root in &store.sync_roots {
        for child in list_immediate_child_dirs(root)? {
            let key = hub_vcc::normalize_path_key(&child.path);
            if key.is_empty() || !seen.insert(key) {
                continue;
            }
            discovered.push(child);
        }
    }
    discovered.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    import_discovered_list(&app, discovered, false)
}

#[tauri::command]
fn import_unity_hub(app: AppHandle) -> Result<ImportResult, String> {
    let discovered = hub_vcc::read_unity_hub_projects()?;
    import_discovered_list(&app, discovered, true)
}

#[tauri::command]
fn import_vcc(app: AppHandle) -> Result<ImportResult, String> {
    let discovered = hub_vcc::read_vcc_projects()?;
    import_discovered_list(&app, discovered, true)
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
            platform: Platform::Other,
            tools: Vec::new(),
            has_run_script: false,
        });
    }
    import_discovered_list(&app, discovered, false)
}

fn parallel_git_sync(
    jobs: &[(usize, String)],
    concurrency: usize,
) -> Vec<(usize, GitSyncInfo)> {
    if jobs.is_empty() {
        return Vec::new();
    }
    let next = AtomicUsize::new(0);
    let results = Mutex::new(Vec::with_capacity(jobs.len()));
    let workers = concurrency.min(jobs.len()).max(1);
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                loop {
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    if i >= jobs.len() {
                        break;
                    }
                    let (idx, path) = &jobs[i];
                    let sync = project_fs::get_git_sync_info(path, false);
                    if let Ok(mut guard) = results.lock() {
                        guard.push((*idx, sync));
                    }
                }
            });
        }
    });
    results.into_inner().unwrap_or_default()
}

fn priority_fetch_rank(priority: &Priority) -> u8 {
    match priority {
        Priority::Crit => 0,
        Priority::High => 1,
        Priority::Med => 2,
        Priority::Low => 3,
        Priority::Default => 4,
    }
}

/// Bumped on each Refresh so an in-flight background fetch queue aborts.
static GIT_FETCH_GEN: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
fn refresh_github_statuses(app: AppHandle) -> Result<Vec<Project>, String> {
    let mut store = store::load_store(&app)?;
    // Engine heal is separate (heal_project_engines); this path is git-only.
    let mut jobs: Vec<(usize, String)> = Vec::new();
    for (i, project) in store.projects.iter_mut().enumerate() {
        if project.github_url.is_none() && project.github_repo.is_none() {
            project_fs::clear_git_sync(project, GithubStatus::None);
            continue;
        }
        match &project.local_path {
            Some(path) if !path.is_empty() => {
                jobs.push((i, path.clone()));
            }
            _ => {
                project_fs::clear_git_sync(project, GithubStatus::RemoteOnly);
            }
        }
    }
    for (i, sync) in parallel_git_sync(&jobs, 8) {
        if let Some(project) = store.projects.get_mut(i) {
            project_fs::apply_git_sync_info(project, &sync);
        }
    }
    store::save_store(&app, &store)?;

    let gen = GIT_FETCH_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    std::thread::spawn(move || {
        run_background_git_fetch(handle, gen);
    });

    Ok(store.projects)
}

fn run_background_git_fetch(app: AppHandle, gen: u64) {
    let Ok(store) = store::load_store(&app) else {
        return;
    };

    let mut queue: Vec<(String, String, u8, bool)> = store
        .projects
        .iter()
        .filter(|p| !p.archived)
        .filter(|p| p.github_url.is_some() || p.github_repo.is_some())
        .filter_map(|p| {
            let path = p.local_path.as_ref()?.trim();
            if path.is_empty() {
                return None;
            }
            Some((
                p.id.clone(),
                path.to_string(),
                priority_fetch_rank(&p.priority),
                p.favorite,
            ))
        })
        .collect();

    // Crit → Default; favorites first within the same priority band.
    queue.sort_by(|a, b| a.2.cmp(&b.2).then_with(|| b.3.cmp(&a.3)));

    let stagger = std::time::Duration::from_millis(project_fs::git_fetch_stagger_ms());

    for (i, (id, path, _, _)) in queue.into_iter().enumerate() {
        if GIT_FETCH_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        if i > 0 {
            std::thread::sleep(stagger);
            if GIT_FETCH_GEN.load(Ordering::SeqCst) != gen {
                return;
            }
        }

        let sync = project_fs::get_git_sync_info(&path, true);
        if GIT_FETCH_GEN.load(Ordering::SeqCst) != gen {
            return;
        }

        let Ok(mut store) = store::load_store(&app) else {
            continue;
        };
        let Some(project) = store.projects.iter_mut().find(|p| p.id == id) else {
            continue;
        };
        project_fs::apply_git_sync_info(project, &sync);
        project.updated_at = chrono::Utc::now().to_rfc3339();

        let payload = GitSyncUpdated {
            id: id.clone(),
            github_status: project.github_status.clone(),
            git_ahead: project.git_ahead,
            git_behind: project.git_behind,
            git_branch: project.git_branch.clone(),
            git_dirty: project.git_dirty,
        };

        if store::save_store(&app, &store).is_err() {
            continue;
        }
        let _ = app.emit("git-sync-updated", &payload);
    }
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

#[tauri::command]
fn get_snapshot(state: tauri::State<'_, MonitorState>) -> MetricsSnapshot {
    state.sampler.snapshot()
}

#[tauri::command]
fn set_sampler_pace(state: tauri::State<'_, MonitorState>, pace: String) -> Result<(), String> {
    match pace.as_str() {
        "idle" => state.sampler.set_idle(true),
        "active" => state.sampler.set_idle(false),
        other => return Err(format!("unknown sampler pace: {other}")),
    }
    Ok(())
}

#[tauri::command]
fn set_usb_watch(state: tauri::State<'_, MonitorState>, enabled: bool) {
    state
        .usb_watch_enabled
        .store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn list_spikes(
    state: tauri::State<'_, MonitorState>,
    limit: Option<usize>,
) -> Result<Vec<SpikeEvent>, String> {
    state.sampler.spikes.list(limit.unwrap_or(100))
}

#[tauri::command]
fn clear_spikes(state: tauri::State<'_, MonitorState>) -> Result<(), String> {
    state.sampler.spikes.clear()
}

#[tauri::command]
fn run_latency_probes() -> Vec<LatencyResult> {
    run_latency_suite()
}

#[tauri::command]
fn get_topology(state: tauri::State<'_, MonitorState>) -> Result<usb::model::UsbTopology, String> {
    let topo = enumerate()?;
    update_fingerprint(&state.last_usb_fingerprint, &topo);
    Ok(topo)
}

#[tauri::command]
fn get_device_detail(state: tauri::State<'_, MonitorState>, id: String) -> Result<UsbDevice, String> {
    let topo = enumerate()?;
    update_fingerprint(&state.last_usb_fingerprint, &topo);
    get_device(&topo, &id).ok_or_else(|| format!("USB-001: Device not found: {id}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    launch_gate::maybe_handoff_to_launcher();

    let sampler = match SamplerState::new() {
        Ok(s) => Arc::new(s),
        Err(e) => {
            eprintln!("Deez Project Manager: failed to init metrics sampler: {e}");
            panic!("failed to init sampler: {e}");
        }
    };
    let fingerprint = Arc::new(Mutex::new(String::new()));
    let fp_for_watch = fingerprint.clone();
    let usb_watch_enabled = Arc::new(AtomicBool::new(false));
    let usb_enabled_for_watch = usb_watch_enabled.clone();
    let sampler_for_sched = sampler.clone();
    let fuel_state = FuelState::new();
    let fuel_for_sched = fuel_state.clone();

    let window_state_flags = tauri_plugin_window_state::StateFlags::all()
        .difference(tauri_plugin_window_state::StateFlags::VISIBLE);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![startup::AUTOSTART_ARG.into()]),
        ))
        .manage(MonitorState {
            sampler,
            last_usb_fingerprint: fingerprint,
            usb_watch_enabled,
        })
        .manage(fuel_state)
        .invoke_handler(tauri::generate_handler![
            get_projects,
            heal_project_engines,
            check_paths_exist,
            save_projects,
            pick_project_folder,
            pick_project_folders,
            pick_trello_json,
            read_text_file,
            probe_project,
            get_git_status,
            open_path,
            open_unity_project,
            run_project,
            list_github_repos,
            import_github_repos,
            import_unity_hub,
            import_vcc,
            import_local_folders,
            refresh_github_statuses,
            add_sync_root,
            remove_sync_root,
            sync_parent_folder,
            sync_all_parent_folders,
            get_snapshot,
            set_sampler_pace,
            list_spikes,
            clear_spikes,
            run_latency_probes,
            get_topology,
            get_device_detail,
            set_usb_watch,
            fuel_get_settings,
            fuel_save_settings,
            fuel_refresh,
            fuel_get_snapshot,
            fuel_connect,
            fuel_test,
            fuel_set_credential,
            fuel_clear_credential,
            mesh_get_config,
            mesh_save_config,
            mesh_set_pat,
            mesh_clear_pat,
            mesh_get_pat,
        ])
        .setup(move |app| {
            startup::refresh_autostart_registration(app);
            // Window-state restores on window-ready; defer so we clamp/show after that.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(250));
                let handle2 = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    startup::ensure_main_window_visible(&handle2);
                });
            });
            let handle = app.handle().clone();
            start_scheduler(handle.clone(), sampler_for_sched);
            start_watcher(handle.clone(), fp_for_watch, usb_enabled_for_watch);
            start_fuel_scheduler(handle, fuel_for_sched);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
