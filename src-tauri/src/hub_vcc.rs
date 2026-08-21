use crate::models::{GithubStatus, Platform, Priority, Project};
use crate::project_fs;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct HubFile {
    data: HashMap<String, HubProject>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HubProject {
    title: Option<String>,
    path: Option<String>,
    version: Option<String>,
    #[serde(default)]
    is_favorite: bool,
    #[serde(default)]
    last_modified: Option<i64>,
    organization_name: Option<String>,
    repository_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VccSettings {
    #[serde(default)]
    user_projects: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct DiscoveredProject {
    pub name: String,
    pub path: String,
    pub unity_version: Option<String>,
    pub favorite: bool,
    pub github_url: Option<String>,
    pub github_repo: Option<String>,
    pub last_modified: Option<i64>,
    pub platform: Platform,
    pub tools: Vec<String>,
    pub has_run_script: bool,
}

pub fn unity_hub_projects_path() -> PathBuf {
    #[cfg(windows)]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        PathBuf::from(appdata)
            .join("UnityHub")
            .join("projects-v1.json")
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("UnityHub")
            .join("projects-v1.json")
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let config = std::env::var("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(home).join(".config"));
        config.join("UnityHub").join("projects-v1.json")
    }
}

pub fn vcc_settings_path() -> PathBuf {
    #[cfg(windows)]
    {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        PathBuf::from(local)
            .join("VRChatCreatorCompanion")
            .join("settings.json")
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("VRChatCreatorCompanion")
            .join("settings.json")
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let local = std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(home).join(".local").join("share"));
        local.join("VRChatCreatorCompanion").join("settings.json")
    }
}

pub fn normalize_path_key(path: &str) -> String {
    let trimmed = path.trim().trim_end_matches(['/', '\\']);
    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch == '/' || ch == '\\' {
            if !out.ends_with(std::path::MAIN_SEPARATOR) {
                out.push(std::path::MAIN_SEPARATOR);
            }
        } else {
            #[cfg(any(windows, target_os = "macos"))]
            {
                out.extend(ch.to_lowercase());
            }
            #[cfg(all(not(windows), not(target_os = "macos")))]
            {
                out.push(ch);
            }
        }
    }
    out
}

pub fn read_unity_hub_projects() -> Result<Vec<DiscoveredProject>, String> {
    let path = unity_hub_projects_path();
    if !path.exists() {
        return Err(format!(
            "HUB-001: Unity Hub project list not found at {}",
            path.display()
        ));
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("HUB-002: failed to read {}: {e}", path.display()))?;
    let file: HubFile = serde_json::from_str(&text)
        .map_err(|e| format!("HUB-003: failed to parse projects-v1.json: {e}"))?;

    let mut out: Vec<DiscoveredProject> = Vec::new();
    for (key, entry) in file.data {
        let project_path = entry.path.unwrap_or(key);
        if project_path.trim().is_empty() {
            continue;
        }
        let name = entry
            .title
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| {
                PathBuf::from(&project_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| project_path.clone())
            });

        let github_repo = match (
            entry.organization_name.as_deref(),
            entry.repository_name.as_deref(),
        ) {
            (Some(org), Some(repo)) if !org.is_empty() && !repo.is_empty() => {
                Some(format!("{org}/{repo}"))
            }
            _ => None,
        };
        let github_url = github_repo
            .as_ref()
            .map(|r| format!("https://github.com/{r}"));

        out.push(DiscoveredProject {
            name,
            path: project_path,
            unity_version: entry.version.filter(|v| !v.trim().is_empty()),
            favorite: entry.is_favorite,
            github_url,
            github_repo,
            last_modified: entry.last_modified,
            platform: Platform::Unity,
            tools: Vec::new(),
            has_run_script: false,
        });
    }

    out.sort_by(|a, b| {
        b.last_modified
            .cmp(&a.last_modified)
            .then(a.name.cmp(&b.name))
    });
    Ok(out)
}

pub fn read_vcc_projects() -> Result<Vec<DiscoveredProject>, String> {
    let path = vcc_settings_path();
    if !path.exists() {
        return Err(format!(
            "VCC-001: VCC settings not found at {}",
            path.display()
        ));
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("VCC-002: failed to read {}: {e}", path.display()))?;
    let settings: VccSettings = serde_json::from_str(&text)
        .map_err(|e| format!("VCC-003: failed to parse settings.json: {e}"))?;

    if settings.user_projects.is_empty() {
        return Err(
            "VCC-004: no userProjects in settings.json (newer VCC may store projects only in vcc.litedb — add projects in VCC or import from Unity Hub)."
                .into(),
        );
    }

    let mut out: Vec<DiscoveredProject> = Vec::new();
    let mut seen = HashSet::new();
    for project_path in settings.user_projects {
        let key = normalize_path_key(&project_path);
        if key.is_empty() || !seen.insert(key) {
            continue;
        }
        let name = PathBuf::from(&project_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| project_path.clone());
        out.push(DiscoveredProject {
            name,
            path: project_path,
            unity_version: None,
            favorite: false,
            github_url: None,
            github_repo: None,
            last_modified: None,
            platform: Platform::Unity,
            tools: Vec::new(),
            has_run_script: false,
        });
    }
    Ok(out)
}

/// Enrich with filesystem engine detection. When `include_git` is true, also
/// resolve `git remote` (needed for new/link candidates). Skip git for paths
/// already tracked — Sync All over fat parents stays cheap.
pub fn enrich_discovered(mut discovered: DiscoveredProject, include_git: bool) -> DiscoveredProject {
    let engine = project_fs::detect_engine(&discovered.path);
    if discovered.unity_version.is_none() {
        discovered.unity_version = engine.unity_version.clone();
    }
    discovered.platform = engine.platform.clone();
    // Hub/VCC may stamp a Unity version; clear it when filesystem says Unreal.
    if discovered.platform == Platform::Unreal {
        discovered.unity_version = None;
    }
    discovered.tools = engine.tools;
    discovered.has_run_script = engine.has_run_script;

    if include_git && engine.exists {
        let root = PathBuf::from(&discovered.path);
        let remote = project_fs::git_remote_url(&root);
        let repo = remote.as_ref().and_then(|u| project_fs::parse_github_repo(u));
        if discovered.github_repo.is_none() {
            discovered.github_repo = repo;
        }
        if discovered.github_url.is_none() {
            discovered.github_url = remote.or_else(|| {
                discovered
                    .github_repo
                    .as_ref()
                    .map(|r| format!("https://github.com/{r}"))
            });
        }
    }
    discovered
}

pub fn existing_path_keys(projects: &[Project]) -> HashSet<String> {
    projects
        .iter()
        .filter_map(|p| p.local_path.as_ref())
        .filter(|p| !p.is_empty())
        .map(|p| normalize_path_key(p))
        .collect()
}

pub fn make_project_from_discovered(discovered: &DiscoveredProject, sort_index: i32) -> Project {
    let now = chrono::Utc::now().to_rfc3339();
    let sync = if PathBuf::from(&discovered.path).exists()
        && (discovered.github_repo.is_some() || discovered.github_url.is_some())
    {
        project_fs::get_git_sync_info(&discovered.path, false)
    } else if discovered.github_repo.is_some() || discovered.github_url.is_some() {
        crate::models::GitSyncInfo::remote_only()
    } else {
        crate::models::GitSyncInfo::default()
    };

    let mut project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: discovered.name.clone(),
        sort_index,
        priority: Priority::Default,
        platform: discovered.platform.clone(),
        status: "To Do".into(),
        category: "Other".into(),
        location: String::new(),
        local_path: Some(discovered.path.clone()),
        unity_version: discovered.unity_version.clone(),
        github_url: discovered.github_url.clone(),
        github_repo: discovered.github_repo.clone(),
        github_status: sync.status.clone(),
        git_ahead: 0,
        git_behind: 0,
        git_branch: None,
        git_dirty: false,
        favorite: discovered.favorite,
        archived: false,
        notes: String::new(),
        tools: discovered.tools.clone(),
        has_run_script: discovered.has_run_script,
        agency: None,
        client: None,
        year: None,
        updated_at: now,
    };
    project_fs::apply_git_sync_info(&mut project, &sync);
    project
}

/// Re-apply probe onto an already-tracked path. Engine detection (Unity/Unreal)
/// overwrites a wrong platform; merges AI tools; fills/clears Unity version.
/// Returns true if anything changed. Probe `Other` leaves platform alone
/// (except demotion of false Unity is handled by [`apply_engine_probe`]).
pub fn try_refresh_existing_by_path(
    projects: &mut [Project],
    discovered: &DiscoveredProject,
) -> bool {
    let key = normalize_path_key(&discovered.path);
    for project in projects.iter_mut() {
        let Some(path) = project.local_path.as_ref() else {
            continue;
        };
        if path.trim().is_empty() || normalize_path_key(path) != key {
            continue;
        }

        let engine = project_fs::EngineProbe {
            exists: true,
            is_unity: discovered.platform == Platform::Unity,
            is_unreal: discovered.platform == Platform::Unreal,
            platform: discovered.platform.clone(),
            unity_version: discovered.unity_version.clone(),
            tools: discovered.tools.clone(),
            has_run_script: discovered.has_run_script,
        };
        // Import/sync path: only promote to Unity/Unreal (do not demote here —
        // demotion of false Unity happens on bulk re-probe via detect_engine).
        return apply_engine_probe(project, &engine, false);
    }
    false
}

/// Apply filesystem engine probe onto a stored project.
/// When `demote_false_unity` is true and probe is Other while platform is Unity,
/// demote to Other (heals Hub/VCC force-Unity junk folders).
pub fn apply_engine_probe(
    project: &mut Project,
    engine: &project_fs::EngineProbe,
    demote_false_unity: bool,
) -> bool {
    if !engine.exists {
        return false;
    }

    let mut changed = false;

    match engine.platform {
        Platform::Unity | Platform::Unreal => {
            if project.platform != engine.platform {
                project.platform = engine.platform.clone();
                changed = true;
            }
        }
        Platform::Web => {
            if project.platform == Platform::Other
                || (demote_false_unity && project.platform == Platform::Unity)
            {
                project.platform = Platform::Web;
                changed = true;
            }
        }
        Platform::Other if demote_false_unity && project.platform == Platform::Unity => {
            project.platform = Platform::Other;
            changed = true;
        }
        _ => {}
    }

    if project.platform == Platform::Unreal && project.unity_version.is_some() {
        project.unity_version = None;
        changed = true;
    } else if project.platform == Platform::Unity
        && project.unity_version.is_none()
        && engine.unity_version.is_some()
    {
        project.unity_version = engine.unity_version.clone();
        changed = true;
    } else if project.platform != Platform::Unity && project.unity_version.is_some() {
        project.unity_version = None;
        changed = true;
    }

    for tool in &engine.tools {
        if !project.tools.iter().any(|t| t == tool) {
            project.tools.push(tool.clone());
            changed = true;
        }
    }

    if project.has_run_script != engine.has_run_script {
        project.has_run_script = engine.has_run_script;
        changed = true;
    }

    if changed {
        project.updated_at = chrono::Utc::now().to_rfc3339();
    }
    changed
}

/// Re-probe every project with a local path (filesystem only, no git).
/// Returns true if any row changed.
pub fn reprobe_all_engines(projects: &mut [Project]) -> bool {
    let mut any = false;
    for project in projects.iter_mut() {
        let Some(path) = project.local_path.as_ref() else {
            continue;
        };
        if path.trim().is_empty() {
            continue;
        }
        let path = path.clone();
        let engine = project_fs::detect_engine(&path);
        if apply_engine_probe(project, &engine, true) {
            any = true;
        }
    }
    any
}

/// If an existing GitHub-only row matches this clone, fill in local path instead of adding.
pub fn try_link_existing(projects: &mut [Project], discovered: &DiscoveredProject) -> bool {
    let Some(repo) = discovered.github_repo.as_ref() else {
        return false;
    };
    let repo_l = repo.to_lowercase();
    for project in projects.iter_mut() {
        let Some(existing) = project.github_repo.as_ref() else {
            continue;
        };
        if existing.to_lowercase() != repo_l {
            continue;
        }
        let needs_path = project
            .local_path
            .as_ref()
            .map(|p| p.trim().is_empty())
            .unwrap_or(true);
        if !needs_path {
            continue;
        }
        project.local_path = Some(discovered.path.clone());
        if matches!(discovered.platform, Platform::Unity | Platform::Unreal)
            && project.platform != discovered.platform
        {
            project.platform = discovered.platform.clone();
        }
        if project.platform == Platform::Unreal {
            project.unity_version = None;
        } else if project.platform == Platform::Unity
            && project.unity_version.is_none()
            && discovered.unity_version.is_some()
        {
            project.unity_version = discovered.unity_version.clone();
        }
        if project.tools.is_empty() && !discovered.tools.is_empty() {
            project.tools = discovered.tools.clone();
        }
        project.has_run_script = discovered.has_run_script;
        if discovered.favorite {
            project.favorite = true;
        }
        if PathBuf::from(&discovered.path).exists() {
            let sync = project_fs::get_git_sync_info(&discovered.path, false);
            project_fs::apply_git_sync_info(project, &sync);
        } else {
            project_fs::clear_git_sync(project, GithubStatus::RemoteOnly);
        }
        project.updated_at = chrono::Utc::now().to_rfc3339();
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ProjectStore;
    use std::fs;

    #[test]
    fn normalizes_mixed_path_separators() {
        let components = if cfg!(any(windows, target_os = "macos")) {
            ["users", "dale", "projects"]
        } else {
            ["Users", "Dale", "Projects"]
        };
        let expected = components.join(std::path::MAIN_SEPARATOR_STR);
        assert_eq!(normalize_path_key(r"Users/Dale\Projects/"), expected);
    }

    #[cfg(any(windows, target_os = "macos"))]
    #[test]
    fn normalizes_case_on_case_insensitive_desktop_platforms() {
        assert_eq!(
            normalize_path_key("/Users/Dale/Project"),
            normalize_path_key("/users/dale/project")
        );
    }

    #[test]
    fn reprobe_heals_live_store_unreal_labels() {
        let Ok(appdata) = std::env::var("APPDATA") else {
            return;
        };
        let path = PathBuf::from(appdata)
            .join("com.deez.projectmanager")
            .join("projects.json");
        if !path.exists() {
            return;
        }
        let raw = fs::read_to_string(&path).expect("read store");
        let mut store: ProjectStore = serde_json::from_str(&raw).expect("parse store");
        let before_unreal = store
            .projects
            .iter()
            .filter(|p| p.platform == Platform::Unreal)
            .count();
        let changed = reprobe_all_engines(&mut store.projects);
        let after_unreal = store
            .projects
            .iter()
            .filter(|p| p.platform == Platform::Unreal)
            .count();
        let still_unity_unreal_path = store
            .projects
            .iter()
            .filter(|p| {
                p.platform == Platform::Unity
                    && p.local_path
                        .as_ref()
                        .is_some_and(|lp| lp.contains("Unreal Projects"))
            })
            .count();
        assert!(
            changed || after_unreal > before_unreal || still_unity_unreal_path == 0,
            "expected engine re-probe to heal Unreal rows"
        );
        assert_eq!(
            still_unity_unreal_path, 0,
            "Unreal Projects paths must not stay labeled Unity"
        );
        assert!(
            after_unreal >= 50,
            "expected dozens of Unreal rows, got {after_unreal}"
        );
        // Persist so the app shows healed labels immediately.
        let out = serde_json::to_string_pretty(&store).expect("serialize");
        fs::write(&path, out).expect("write store");
    }
}
