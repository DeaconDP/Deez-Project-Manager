//! When the release binary is launched from Dock / EXE (not via run.bat / run.command),
//! hand off to the smart launcher if an update is ready.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime};

pub const FROM_LAUNCHER_ENV: &str = "DEEZ_PM_FROM_LAUNCHER";

const WATCH_PATHS: &[&str] = &[
    "src",
    "src-tauri/src",
    "src-tauri/icons",
    "src-tauri/capabilities",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "package.json",
    "package-lock.json",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "tsconfig.node.json",
];

/// If this process should yield to the smart launcher, spawn it and exit.
/// Call before showing the main window.
pub fn maybe_handoff_to_launcher() {
    if cfg!(debug_assertions) {
        return;
    }
    if env::var_os(FROM_LAUNCHER_ENV).is_some() {
        return;
    }
    if env::args().any(|a| a == startup_arg()) {
        return;
    }

    let Ok(exe) = env::current_exe() else {
        return;
    };
    let Some(repo_root) = resolve_repo_root(&exe) else {
        return;
    };

    if !update_ready(&repo_root, &exe) {
        return;
    }

    if spawn_launcher(&repo_root).is_ok() {
        std::process::exit(0);
    }
}

fn startup_arg() -> &'static str {
    crate::startup::AUTOSTART_ARG
}

fn resolve_repo_root(exe: &Path) -> Option<PathBuf> {
    // Windows / bare binary: .../src-tauri/target/release/deez-project-manager[.exe]
    // macOS bundle: .../src-tauri/target/release/bundle/macos/*.app/Contents/MacOS/deez-project-manager
    let mut cur = exe.parent()?.to_path_buf();
    for _ in 0..12 {
        let marker = cur.join("src-tauri").join("Cargo.toml");
        let run_bat = cur.join("run.bat");
        let run_command = cur.join("run.command");
        if marker.is_file() && (run_bat.is_file() || run_command.is_file()) {
            return Some(cur);
        }
        if !cur.pop() {
            break;
        }
    }
    None
}

fn update_ready(repo_root: &Path, exe: &Path) -> bool {
    if source_newer_than(repo_root, exe) {
        return true;
    }
    git_behind_upstream(repo_root)
}

fn source_newer_than(repo_root: &Path, exe: &Path) -> bool {
    let Ok(exe_meta) = fs::metadata(exe) else {
        return true;
    };
    let Ok(exe_mtime) = exe_meta.modified() else {
        return false;
    };

    for rel in WATCH_PATHS {
        let path = repo_root.join(rel);
        if !path.exists() {
            continue;
        }
        if path_newer_than(&path, exe_mtime) {
            return true;
        }
    }
    false
}

fn path_newer_than(path: &Path, threshold: SystemTime) -> bool {
    if path.is_file() {
        return fs::metadata(path)
            .and_then(|m| m.modified())
            .map(|t| t > threshold)
            .unwrap_or(false);
    }
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if path_newer_than(&p, threshold) {
                return true;
            }
        } else if fs::metadata(&p)
            .and_then(|m| m.modified())
            .map(|t| t > threshold)
            .unwrap_or(false)
        {
            return true;
        }
    }
    false
}

fn git_behind_upstream(repo_root: &Path) -> bool {
    if !repo_root.join(".git").exists() {
        return false;
    }
    // Best-effort fetch; ignore failures (offline / dirty remote).
    let _ = run_git(repo_root, &["fetch", "--quiet", "--no-tags"], Duration::from_secs(8));

    let Ok(output) = run_git(
        repo_root,
        &["rev-list", "--count", "HEAD..@{upstream}"],
        Duration::from_secs(3),
    ) else {
        return false;
    };
    let count = String::from_utf8_lossy(&output).trim().parse::<u64>().unwrap_or(0);
    count > 0
}

fn run_git(repo_root: &Path, args: &[&str], timeout: Duration) -> Result<Vec<u8>, ()> {
    let mut child = Command::new("git")
        .args(args)
        .current_dir(repo_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| ())?;

    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                let mut buf = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    use std::io::Read;
                    let _ = out.read_to_end(&mut buf);
                }
                return Ok(buf);
            }
            Ok(Some(_)) => return Err(()),
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => return Err(()),
        }
    }
}

fn spawn_launcher(repo_root: &Path) -> Result<(), ()> {
    #[cfg(target_os = "windows")]
    {
        let bat = repo_root.join("run.bat");
        if !bat.is_file() {
            return Err(());
        }
        Command::new("cmd")
            .args(["/C", "start", "", &bat.to_string_lossy()])
            .current_dir(repo_root)
            .env(FROM_LAUNCHER_ENV, "1")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|_| ())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let cmd = repo_root.join("run.command");
        if !cmd.is_file() {
            return Err(());
        }
        Command::new("bash")
            .arg(&cmd)
            .current_dir(repo_root)
            .env(FROM_LAUNCHER_ENV, "1")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{Duration, SystemTime};

    #[test]
    fn from_launcher_env_name_is_stable() {
        assert_eq!(FROM_LAUNCHER_ENV, "DEEZ_PM_FROM_LAUNCHER");
    }

    #[test]
    fn resolve_repo_root_from_release_layout() {
        let tmp = std::env::temp_dir().join(format!(
            "deez-pm-launch-gate-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        let release = tmp
            .join("src-tauri")
            .join("target")
            .join("release");
        fs::create_dir_all(&release).unwrap();
        fs::write(tmp.join("src-tauri").join("Cargo.toml"), "[package]\n").unwrap();
        fs::write(tmp.join("run.command"), "#!/bin/bash\n").unwrap();
        let fake_exe = release.join("deez-project-manager");
        fs::write(&fake_exe, "").unwrap();

        let root = resolve_repo_root(&fake_exe).expect("repo root");
        assert_eq!(root, tmp);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn path_newer_detects_file() {
        let tmp = std::env::temp_dir().join(format!(
            "deez-pm-newer-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let file = tmp.join("a.txt");
        fs::write(&file, "x").unwrap();
        let old = SystemTime::now() - Duration::from_secs(3600);
        assert!(path_newer_than(&file, old));
        let future = SystemTime::now() + Duration::from_secs(3600);
        assert!(!path_newer_than(&file, future));
        let _ = fs::remove_dir_all(&tmp);
    }
}
