use crate::models::{GithubStatus, Platform, ProbeResult};
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn probe_project(path: &str) -> ProbeResult {
    let root = PathBuf::from(path);
    if !root.exists() || !root.is_dir() {
        return ProbeResult {
            exists: false,
            is_unity: false,
            is_unreal: false,
            platform: Platform::Other,
            unity_version: None,
            git_remote_url: None,
            github_repo: None,
            tools: Vec::new(),
        };
    }

    let unity_version = read_unity_version(&root);
    let is_unity = unity_version.is_some()
        || root
            .join("ProjectSettings")
            .join("ProjectVersion.txt")
            .exists()
        || (root.join("Assets").exists() && root.join("ProjectSettings").exists());
    let is_unreal = has_uproject(&root);
    let platform = if is_unity {
        Platform::Unity
    } else if is_unreal {
        Platform::Unreal
    } else {
        Platform::Other
    };
    let tools = detect_tools(&root);

    let git_remote_url = git_remote_url(&root);
    let github_repo = git_remote_url.as_ref().and_then(|u| parse_github_repo(u));

    ProbeResult {
        exists: true,
        is_unity,
        is_unreal,
        platform,
        unity_version,
        git_remote_url,
        github_repo,
        tools,
    }
}

fn has_uproject(root: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(root) else {
        return false;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.ends_with(".uproject") {
            return true;
        }
    }
    false
}

fn detect_tools(root: &Path) -> Vec<String> {
    let mut tools = Vec::new();
    if root.join(".cursor").is_dir() || root.join(".cursorrules").is_file() {
        tools.push("Cursor".into());
    }
    if root.join(".claude").is_dir() || root.join("CLAUDE.md").is_file() {
        tools.push("Claude".into());
    }
    if root.join(".codex").is_dir() || root.join("AGENTS.md").is_file() {
        tools.push("Codex".into());
    }
    if root.join(".opencode").is_dir()
        || root.join("opencode.json").is_file()
        || root.join("opencode.jsonc").is_file()
    {
        tools.push("OpenCode".into());
    }
    tools
}

pub fn read_unity_version(root: &Path) -> Option<String> {
    let file = root.join("ProjectSettings").join("ProjectVersion.txt");
    let text = std::fs::read_to_string(file).ok()?;
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("m_EditorVersion:") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

pub fn git_remote_url(root: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(["-C", &root.to_string_lossy(), "remote", "get-url", "origin"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if url.is_empty() {
        None
    } else {
        Some(url)
    }
}

pub fn parse_github_repo(url: &str) -> Option<String> {
    let cleaned = url.trim().trim_end_matches(".git");
    if let Some(rest) = cleaned.strip_prefix("git@github.com:") {
        return Some(rest.to_string());
    }
    if let Some(rest) = cleaned.strip_prefix("https://github.com/") {
        return Some(rest.to_string());
    }
    if let Some(rest) = cleaned.strip_prefix("http://github.com/") {
        return Some(rest.to_string());
    }
    if let Some(rest) = cleaned.strip_prefix("ssh://git@github.com/") {
        return Some(rest.to_string());
    }
    None
}

pub fn get_git_status(path: &str) -> GithubStatus {
    let root = PathBuf::from(path);
    if !root.exists() {
        return GithubStatus::RemoteOnly;
    }
    if !root.join(".git").exists() {
        // could be worktree; try git rev-parse
        let ok = Command::new("git")
            .args(["-C", path, "rev-parse", "--is-inside-work-tree"])
            .output()
            .ok()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !ok {
            return GithubStatus::RemoteOnly;
        }
    }

    let porcelain = Command::new("git")
        .args(["-C", path, "status", "--porcelain"])
        .output();

    let Ok(porcelain) = porcelain else {
        return GithubStatus::Error;
    };
    if !porcelain.status.success() {
        return GithubStatus::Error;
    }
    let dirty = !String::from_utf8_lossy(&porcelain.stdout).trim().is_empty();

    // fetch left/right vs upstream
    let ahead_behind = Command::new("git")
        .args([
            "-C",
            path,
            "rev-list",
            "--left-right",
            "--count",
            "@{u}...HEAD",
        ])
        .output();

    let (behind, ahead) = match ahead_behind {
        Ok(out) if out.status.success() => {
            let s = String::from_utf8_lossy(&out.stdout);
            let parts: Vec<&str> = s.split_whitespace().collect();
            if parts.len() >= 2 {
                (
                    parts[0].parse::<i32>().unwrap_or(0),
                    parts[1].parse::<i32>().unwrap_or(0),
                )
            } else {
                (0, 0)
            }
        }
        _ => (0, 0),
    };

    if dirty {
        return GithubStatus::Dirty;
    }
    match (ahead > 0, behind > 0) {
        (true, true) => GithubStatus::Diverged,
        (true, false) => GithubStatus::Ahead,
        (false, true) => GithubStatus::Behind,
        (false, false) => GithubStatus::Clean,
    }
}

pub fn find_unity_editor(version: Option<&str>) -> Option<PathBuf> {
    let bases: Vec<PathBuf> = {
        #[cfg(windows)]
        {
            let mut v = vec![
                PathBuf::from(r"C:\Program Files\Unity\Hub\Editor"),
                PathBuf::from(r"C:\Program Files (x86)\Unity\Hub\Editor"),
            ];
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                v.push(
                    PathBuf::from(local)
                        .join("Programs")
                        .join("Unity")
                        .join("Hub")
                        .join("Editor"),
                );
            }
            v
        }
        #[cfg(not(windows))]
        {
            vec![
                PathBuf::from("/Applications/Unity/Hub/Editor"),
                dirs_fallback(),
            ]
        }
    };

    for base in bases {
        if !base.exists() {
            continue;
        }
        if let Some(ver) = version {
            let exact = base.join(ver).join("Editor").join(unity_bin());
            if exact.exists() {
                return Some(exact);
            }
            // try prefix match (2022.3.22f1 vs folder name)
            if let Ok(entries) = std::fs::read_dir(&base) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name == ver || name.starts_with(ver) || ver.starts_with(&name) {
                        let candidate = entry.path().join("Editor").join(unity_bin());
                        if candidate.exists() {
                            return Some(candidate);
                        }
                    }
                }
            }
        }
    }

    // any installed editor as fallback
    for base in [
        PathBuf::from(r"C:\Program Files\Unity\Hub\Editor"),
        PathBuf::from(r"C:\Program Files (x86)\Unity\Hub\Editor"),
    ] {
        if let Ok(mut entries) = std::fs::read_dir(&base) {
            if let Some(Ok(entry)) = entries.next() {
                let candidate = entry.path().join("Editor").join(unity_bin());
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

#[cfg(windows)]
fn unity_bin() -> &'static str {
    "Unity.exe"
}

#[cfg(not(windows))]
fn unity_bin() -> &'static str {
    "Unity"
}

#[cfg(not(windows))]
fn dirs_fallback() -> PathBuf {
    PathBuf::from(format!(
        "{}/Unity/Hub/Editor",
        std::env::var("HOME").unwrap_or_default()
    ))
}

pub fn open_in_explorer(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("OPEN-001: failed to open Explorer: {e}"))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("OPEN-001: failed to open Finder: {e}"))?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("OPEN-001: failed to open file manager: {e}"))?;
        Ok(())
    }
}

pub fn open_unity_project(path: &str, version: Option<&str>) -> Result<(), String> {
    let root = PathBuf::from(path);
    if !root.exists() {
        return Err("OPEN-002: project path does not exist".into());
    }

    let editor = find_unity_editor(version)
        .ok_or_else(|| "OPEN-003: no Unity editor found. Install via Unity Hub.".to_string())?;

    Command::new(&editor)
        .arg("-projectPath")
        .arg(path)
        .spawn()
        .map_err(|e| format!("OPEN-004: failed to launch Unity: {e}"))?;
    Ok(())
}
