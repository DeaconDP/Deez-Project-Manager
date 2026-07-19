use crate::models::{GithubStatus, Platform, ProbeResult};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Filesystem-only engine/tools detection (no git). Safe for bulk refresh.
#[derive(Debug, Clone)]
pub struct EngineProbe {
    pub exists: bool,
    pub is_unity: bool,
    pub is_unreal: bool,
    pub platform: Platform,
    pub unity_version: Option<String>,
    pub tools: Vec<String>,
    pub has_run_script: bool,
}

pub fn detect_engine(path: &str) -> EngineProbe {
    let root = PathBuf::from(path);
    if !root.exists() || !root.is_dir() {
        return EngineProbe {
            exists: false,
            is_unity: false,
            is_unreal: false,
            platform: Platform::Other,
            unity_version: None,
            tools: Vec::new(),
            has_run_script: false,
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
    let is_web = is_web_project(&root);
    // `.uproject` is definitive — wins over Unity folder heuristics.
    // Engines win over web markers (Unity/Unreal may carry package.json).
    let platform = if is_unreal {
        Platform::Unreal
    } else if is_unity {
        Platform::Unity
    } else if is_web {
        Platform::Web
    } else {
        Platform::Other
    };
    let tools = detect_tools(&root);
    let has_run_script = has_run_script(path);

    EngineProbe {
        exists: true,
        is_unity,
        is_unreal,
        platform,
        unity_version,
        tools,
        has_run_script,
    }
}

pub fn probe_project(path: &str) -> ProbeResult {
    let engine = detect_engine(path);
    if !engine.exists {
        return ProbeResult {
            exists: false,
            is_unity: false,
            is_unreal: false,
            platform: Platform::Other,
            unity_version: None,
            git_remote_url: None,
            github_repo: None,
            tools: Vec::new(),
            has_run_script: false,
        };
    }

    let root = PathBuf::from(path);
    let git_remote_url = git_remote_url(&root);
    let github_repo = git_remote_url.as_ref().and_then(|u| parse_github_repo(u));

    ProbeResult {
        exists: true,
        is_unity: engine.is_unity,
        is_unreal: engine.is_unreal,
        platform: engine.platform,
        unity_version: engine.unity_version,
        git_remote_url,
        github_repo,
        tools: engine.tools,
        has_run_script: engine.has_run_script,
    }
}

fn is_uproject_name(name: &str) -> bool {
    name.len() > 9 && name.to_ascii_lowercase().ends_with(".uproject")
}

fn skip_uproject_scan_dir(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "content"
            | "intermediate"
            | "saved"
            | "deriveddatacache"
            | "binaries"
            | "build"
            | ".git"
            | "library"
            | "node_modules"
    )
}

/// Root `*.uproject`, or one level down (e.g. `depot/Game.uproject`). Skips heavy UE dirs.
fn has_uproject(root: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(root) else {
        return false;
    };
    let mut child_dirs = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_file() && is_uproject_name(&name) {
            return true;
        }
        if file_type.is_dir() && !skip_uproject_scan_dir(&name) {
            child_dirs.push(entry.path());
        }
    }
    for dir in child_dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_file() && is_uproject_name(&name) {
                return true;
            }
        }
    }
    false
}

/// Root-level web markers only (cheap for bulk reprobe). No deep recursion.
fn is_web_project(root: &Path) -> bool {
    root.join("package.json").is_file()
        || root.join("index.html").is_file()
        || root.join("vite.config.ts").is_file()
        || root.join("vite.config.js").is_file()
        || root.join("next.config.js").is_file()
        || root.join("next.config.ts").is_file()
        || root.join("next.config.mjs").is_file()
        || root.join("angular.json").is_file()
        || root.join("svelte.config.js").is_file()
        || root.join("astro.config.mjs").is_file()
        || root.join("nuxt.config.ts").is_file()
        || root.join("public").join("index.html").is_file()
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

    for base in &bases {
        if !base.exists() {
            continue;
        }
        if let Some(ver) = version {
            let exact = unity_editor_executable(&base.join(ver));
            if exact.exists() {
                return Some(exact);
            }
            // try prefix match (2022.3.22f1 vs folder name)
            if let Ok(entries) = std::fs::read_dir(&base) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name == ver || name.starts_with(ver) || ver.starts_with(&name) {
                        let candidate = unity_editor_executable(&entry.path());
                        if candidate.exists() {
                            return Some(candidate);
                        }
                    }
                }
            }
        }
    }

    // any installed editor as fallback
    for base in &bases {
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let candidate = unity_editor_executable(&entry.path());
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

fn unity_editor_executable(version_dir: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        version_dir
            .join("Unity.app")
            .join("Contents")
            .join("MacOS")
            .join("Unity")
    }
    #[cfg(not(target_os = "macos"))]
    {
        version_dir.join("Editor").join(unity_bin())
    }
}

#[cfg(windows)]
fn unity_bin() -> &'static str {
    "Unity.exe"
}

#[cfg(all(not(windows), not(target_os = "macos")))]
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

/// Prefer the platform-native one-click script at the project root.
pub fn has_run_script(path: &str) -> bool {
    find_run_script(Path::new(path)).is_some()
}

fn find_run_script(root: &Path) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let bat = root.join("run.bat");
        if bat.is_file() {
            return Some(bat);
        }
        let command = root.join("run.command");
        if command.is_file() {
            return Some(command);
        }
    }
    #[cfg(not(windows))]
    {
        let command = root.join("run.command");
        if command.is_file() {
            return Some(command);
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let bat = root.join("run.bat");
        if bat.is_file() {
            return Some(bat);
        }
    }
    None
}

/// Launch `run.bat` / `run.command` from the project root in a new console/terminal.
pub fn run_project(path: &str) -> Result<(), String> {
    let root = PathBuf::from(path);
    if !root.is_dir() {
        return Err("RUN-001: project path does not exist or is not a directory".into());
    }
    let script = find_run_script(&root).ok_or_else(missing_run_script_error)?;
    let script_name = script
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| script.display().to_string());

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = script
            .metadata()
            .map_err(|e| format!("RUN-004: cannot inspect {script_name}: {e}"))?
            .permissions()
            .mode();
        if mode & 0o111 == 0 {
            return Err(format!(
                "RUN-004: {script_name} is not executable. Run: chmod +x \"{}\"",
                script.display()
            ));
        }
    }

    #[cfg(windows)]
    {
        // `start` opens a new console so long-running servers keep a visible window.
        Command::new("cmd")
            .args(["/C", "start", "", &script_name])
            .current_dir(&root)
            .spawn()
            .map_err(|e| format!("RUN-003: failed to launch {script_name}: {e}"))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&script)
            .current_dir(&root)
            .spawn()
            .map_err(|e| format!("RUN-003: failed to launch {script_name}: {e}"))?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("/bin/bash")
            .arg(&script)
            .current_dir(&root)
            .spawn()
            .map_err(|e| format!("RUN-003: failed to launch {script_name}: {e}"))?;
        Ok(())
    }
}

fn missing_run_script_error() -> String {
    #[cfg(target_os = "macos")]
    {
        "RUN-002: no compatible run.command in project root".into()
    }
    #[cfg(not(target_os = "macos"))]
    {
        "RUN-002: no run.bat or run.command in project root".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_root_uproject() {
        let sample = r"C:\Users\deaco\Documents\Unreal Projects\ArthursAudioBPsV1001-503";
        if !Path::new(sample).is_dir() {
            return;
        }
        let engine = detect_engine(sample);
        assert_eq!(engine.platform, Platform::Unreal);
        assert!(engine.is_unreal);
    }

    #[test]
    fn detects_nested_uproject() {
        let sample = r"C:\Users\deaco\Perforce\ProjectFVRM";
        if !Path::new(sample).is_dir() {
            return;
        }
        let engine = detect_engine(sample);
        assert_eq!(engine.platform, Platform::Unreal);
        assert!(engine.is_unreal);
    }

    #[test]
    fn web_folder_detects_as_web() {
        let sample = r"C:\Projects\Cursor\Deez-Project-Manager";
        if !Path::new(sample).is_dir() {
            return;
        }
        let engine = detect_engine(sample);
        assert_eq!(engine.platform, Platform::Web);
        assert!(!engine.is_unity);
        assert!(!engine.is_unreal);
    }

    #[test]
    fn bare_folder_is_other() {
        let dir = std::env::temp_dir().join("deez_pm_bare_folder_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let engine = detect_engine(dir.to_str().unwrap());
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(engine.platform, Platform::Other);
        assert!(!engine.is_unity);
        assert!(!engine.is_unreal);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn resolves_macos_unity_bundle_executable() {
        let version_dir = Path::new("/Applications/Unity/Hub/Editor/6000.0.1f1");
        assert_eq!(
            unity_editor_executable(version_dir),
            version_dir.join("Unity.app/Contents/MacOS/Unity")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn ignores_windows_only_run_script_on_macos() {
        let dir = std::env::temp_dir().join("deez_pm_macos_run_script_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        std::fs::write(dir.join("run.bat"), "@echo off").expect("write run.bat");
        assert!(!has_run_script(dir.to_str().unwrap()));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
