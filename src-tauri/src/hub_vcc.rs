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
            if !out.ends_with('\\') {
                out.push('\\');
            }
        } else {
            #[cfg(windows)]
            {
                out.extend(ch.to_lowercase());
            }
            #[cfg(not(windows))]
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
        });
    }
    Ok(out)
}

pub fn enrich_discovered(mut discovered: DiscoveredProject) -> DiscoveredProject {
    let probe = project_fs::probe_project(&discovered.path);
    if discovered.unity_version.is_none() {
        discovered.unity_version = probe.unity_version;
    }
    if discovered.github_repo.is_none() {
        discovered.github_repo = probe.github_repo.clone();
    }
    if discovered.github_url.is_none() {
        discovered.github_url = probe.git_remote_url.or_else(|| {
            discovered
                .github_repo
                .as_ref()
                .map(|r| format!("https://github.com/{r}"))
        });
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
    let github_status = if PathBuf::from(&discovered.path).exists()
        && (discovered.github_repo.is_some() || discovered.github_url.is_some())
    {
        project_fs::get_git_status(&discovered.path)
    } else if discovered.github_repo.is_some() || discovered.github_url.is_some() {
        GithubStatus::RemoteOnly
    } else {
        GithubStatus::None
    };

    Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: discovered.name.clone(),
        sort_index,
        priority: Priority::Default,
        platform: Platform::Unity,
        status: "To Do".into(),
        category: "Other".into(),
        location: String::new(),
        local_path: Some(discovered.path.clone()),
        unity_version: discovered.unity_version.clone(),
        github_url: discovered.github_url.clone(),
        github_repo: discovered.github_repo.clone(),
        github_status,
        favorite: discovered.favorite,
        archived: false,
        notes: String::new(),
        agency: None,
        client: None,
        year: None,
        updated_at: now,
    }
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
        if project.unity_version.is_none() {
            project.unity_version = discovered.unity_version.clone();
        }
        if project.platform == Platform::Other {
            project.platform = Platform::Unity;
        }
        if discovered.favorite {
            project.favorite = true;
        }
        project.github_status = if PathBuf::from(&discovered.path).exists() {
            project_fs::get_git_status(&discovered.path)
        } else {
            GithubStatus::RemoteOnly
        };
        project.updated_at = chrono::Utc::now().to_rfc3339();
        return true;
    }
    false
}
