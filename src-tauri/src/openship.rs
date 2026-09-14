//! Thin OpenShip CLI adapter — Deez-PM orchestrates; OpenShip stays headless.
use crate::usage::credentials;
use crate::win_cmd::command;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Output;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "openship-config.json";
const PAT_PROVIDER: &str = "openship";
const CONTEXT_NAME: &str = "deez-pm";
const DEFAULT_API_URL: &str = "http://localhost:4000";
const DEFAULT_DASHBOARD_URL: &str = "http://localhost:3001";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenshipConfigFile {
    pub api_url: String,
    pub dashboard_url: String,
    pub credential_id: Option<String>,
    pub last_error: Option<String>,
}

impl Default for OpenshipConfigFile {
    fn default() -> Self {
        Self {
            api_url: DEFAULT_API_URL.into(),
            dashboard_url: DEFAULT_DASHBOARD_URL.into(),
            credential_id: None,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenshipConfigPublic {
    pub api_url: String,
    pub dashboard_url: String,
    pub has_pat: bool,
    pub cli_available: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenshipConfigPatch {
    pub api_url: Option<String>,
    pub dashboard_url: Option<String>,
    pub clear_last_error: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenshipActionResult {
    pub ok: bool,
    pub message: String,
    pub detail: Option<String>,
    pub last_build_at: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("OPSH-001: cannot resolve app data dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("OPSH-002: cannot create app data dir: {e}"))?;
    }
    Ok(dir.join(CONFIG_FILE))
}

fn load_config(app: &AppHandle) -> Result<OpenshipConfigFile, String> {
    let path = config_path(app)?;
    if !path.exists() {
        let cfg = OpenshipConfigFile::default();
        save_config(app, &cfg)?;
        return Ok(cfg);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("OPSH-003: failed to read openship-config.json: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(OpenshipConfigFile::default());
    }
    serde_json::from_str(&raw).map_err(|e| format!("OPSH-004: invalid openship-config.json: {e}"))
}

fn save_config(app: &AppHandle, cfg: &OpenshipConfigFile) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("OPSH-005: serialize failed: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("OPSH-006: write failed: {e}"))?;
    Ok(())
}

fn cli_available() -> bool {
    find_on_path("openship").is_some()
}

fn find_on_path(bin: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(bin);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            let exe = dir.join(format!("{bin}.exe"));
            if exe.is_file() {
                return Some(exe);
            }
            let cmd = dir.join(format!("{bin}.cmd"));
            if cmd.is_file() {
                return Some(cmd);
            }
        }
    }
    None
}

fn to_public(cfg: &OpenshipConfigFile) -> OpenshipConfigPublic {
    OpenshipConfigPublic {
        api_url: cfg.api_url.clone(),
        dashboard_url: cfg.dashboard_url.clone(),
        has_pat: credentials::retrieve(cfg.credential_id.as_deref()).is_some(),
        cli_available: cli_available(),
        last_error: cfg.last_error.clone(),
    }
}

fn set_last_error(app: &AppHandle, msg: Option<String>) -> Result<(), String> {
    let mut cfg = load_config(app)?;
    cfg.last_error = msg;
    save_config(app, &cfg)
}

fn run_openship(args: &[&str]) -> Result<String, String> {
    let bin = find_on_path("openship").ok_or_else(|| {
        "OPSH-010: openship CLI not found on PATH. Install: npm i -g openship (Node 22+)".to_string()
    })?;
    let mut cmd = command(bin.to_string_lossy().as_ref());
    cmd.arg("--json");
    for a in args {
        cmd.arg(a);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("OPSH-011: failed to spawn openship: {e}"))?;
    output_to_result(output)
}

fn output_to_result(output: Output) -> Result<String, String> {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        if !stdout.is_empty() {
            return Ok(stdout);
        }
        if !stderr.is_empty() {
            return Ok(stderr);
        }
        return Ok(String::new());
    }
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("exit {}", output.status)
    };
    Err(format!("OPSH-012: openship failed — {detail}"))
}

fn ensure_context(app: &AppHandle) -> Result<(), String> {
    let cfg = load_config(app)?;
    let token = credentials::retrieve(cfg.credential_id.as_deref()).ok_or_else(|| {
        "OPSH-020: OpenShip PAT missing. Settings → OpenShip → Save PAT.".to_string()
    })?;
    // Login stores token under deez-pm context (idempotent).
    let _ = run_openship(&[
        "login",
        "--token",
        &token,
        "--api-url",
        &cfg.api_url,
        "--dashboard-url",
        &cfg.dashboard_url,
        "--context",
        CONTEXT_NAME,
    ])?;
    let _ = run_openship(&["context", "use", CONTEXT_NAME])?;
    Ok(())
}

fn ok_msg(message: impl Into<String>, detail: Option<String>) -> OpenshipActionResult {
    OpenshipActionResult {
        ok: true,
        message: message.into(),
        detail,
        last_build_at: None,
    }
}

fn err_msg(message: impl Into<String>) -> OpenshipActionResult {
    OpenshipActionResult {
        ok: false,
        message: message.into(),
        detail: None,
        last_build_at: None,
    }
}

#[tauri::command]
pub fn openship_get_config(app: AppHandle) -> Result<OpenshipConfigPublic, String> {
    let cfg = load_config(&app)?;
    Ok(to_public(&cfg))
}

#[tauri::command]
pub fn openship_save_config(
    app: AppHandle,
    patch: OpenshipConfigPatch,
) -> Result<OpenshipConfigPublic, String> {
    let mut cfg = load_config(&app)?;
    if let Some(url) = patch.api_url {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            cfg.api_url = trimmed.trim_end_matches('/').to_string();
        }
    }
    if let Some(url) = patch.dashboard_url {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            cfg.dashboard_url = trimmed.trim_end_matches('/').to_string();
        }
    }
    if patch.clear_last_error == Some(true) {
        cfg.last_error = None;
    }
    save_config(&app, &cfg)?;
    Ok(to_public(&cfg))
}

#[tauri::command]
pub fn openship_set_pat(app: AppHandle, secret: String) -> Result<OpenshipConfigPublic, String> {
    let mut cfg = load_config(&app)?;
    let existing_id = cfg.credential_id.clone();
    credentials::replace(PAT_PROVIDER, existing_id.as_deref(), &secret, |id| {
        cfg.credential_id = id
    })?;
    save_config(&app, &cfg)?;
    match ensure_context(&app) {
        Ok(()) => {
            set_last_error(&app, None)?;
        }
        Err(e) => {
            set_last_error(&app, Some(e))?;
        }
    }
    let cfg = load_config(&app)?;
    Ok(to_public(&cfg))
}

#[tauri::command]
pub fn openship_clear_pat(app: AppHandle) -> Result<OpenshipConfigPublic, String> {
    let mut cfg = load_config(&app)?;
    credentials::delete(cfg.credential_id.as_deref());
    cfg.credential_id = None;
    cfg.last_error = None;
    save_config(&app, &cfg)?;
    Ok(to_public(&cfg))
}

#[tauri::command]
pub fn openship_ship(
    app: AppHandle,
    project_id: String,
    env: String,
) -> Result<OpenshipActionResult, String> {
    let env = env.trim().to_lowercase();
    if env != "preview" && env != "production" {
        return Ok(err_msg("OPSH-030: env must be preview or production"));
    }
    let project_id = project_id.trim();
    if project_id.is_empty() {
        return Ok(err_msg("OPSH-031: openshipProjectId is required"));
    }
    if let Err(e) = ensure_context(&app) {
        set_last_error(&app, Some(e.clone()))?;
        return Ok(err_msg(e));
    }
    match run_openship(&[
        "deploy",
        "--project",
        project_id,
        "--env",
        &env,
    ]) {
        Ok(detail) => {
            set_last_error(&app, None)?;
            let label = if env == "preview" {
                "Ship Preview"
            } else {
                "Promote Live"
            };
            Ok(ok_msg(
                format!("{label} triggered for {project_id}"),
                if detail.is_empty() { None } else { Some(detail) },
            ))
        }
        Err(e) => {
            set_last_error(&app, Some(e.clone()))?;
            Ok(err_msg(e))
        }
    }
}

#[tauri::command]
pub fn openship_project_status(
    app: AppHandle,
    project_id: String,
) -> Result<OpenshipActionResult, String> {
    let project_id = project_id.trim();
    if project_id.is_empty() {
        return Ok(err_msg("OPSH-031: openshipProjectId is required"));
    }
    if let Err(e) = ensure_context(&app) {
        set_last_error(&app, Some(e.clone()))?;
        return Ok(err_msg(e));
    }
    match run_openship(&["project", "get", project_id]) {
        Ok(detail) => {
            set_last_error(&app, None)?;
            Ok(ok_msg(
                format!("OpenShip status for {project_id}"),
                if detail.is_empty() { None } else { Some(detail) },
            ))
        }
        Err(e) => {
            set_last_error(&app, Some(e.clone()))?;
            Ok(err_msg(e))
        }
    }
}

#[tauri::command]
pub fn openship_cli_status(app: AppHandle) -> Result<OpenshipActionResult, String> {
    if !cli_available() {
        return Ok(err_msg(
            "OPSH-010: openship CLI not found on PATH. Install: npm i -g openship",
        ));
    }
    match run_openship(&["status"]) {
        Ok(detail) => {
            set_last_error(&app, None)?;
            Ok(ok_msg(
                "OpenShip CLI status",
                if detail.is_empty() { None } else { Some(detail) },
            ))
        }
        Err(e) => {
            set_last_error(&app, Some(e.clone()))?;
            Ok(err_msg(e))
        }
    }
}

/// Pull when behind, then rebuild via dale-auto-rebuild / run.* --rebuild.
#[tauri::command]
pub fn update_local_project(path: String) -> Result<OpenshipActionResult, String> {
    let root = PathBuf::from(path.trim());
    if !root.is_dir() {
        return Ok(err_msg("OPSH-040: local path missing or not a directory"));
    }

    let mut notes: Vec<String> = Vec::new();

    if root.join(".git").exists() {
        match git_fetch_and_pull(&root) {
            Ok(msg) => notes.push(msg),
            Err(e) => return Ok(err_msg(e)),
        }
    } else {
        notes.push("No .git — skip pull".into());
    }

    match rebuild_local(&root) {
        Ok(msg) => notes.push(msg),
        Err(e) => return Ok(err_msg(e)),
    }

    let stamp = chrono::Utc::now().to_rfc3339();
    Ok(OpenshipActionResult {
        ok: true,
        message: notes.join(" · "),
        detail: None,
        last_build_at: Some(stamp),
    })
}

fn git_fetch_and_pull(root: &Path) -> Result<String, String> {
    let fetch = command("git")
        .args(["fetch", "--quiet"])
        .current_dir(root)
        .output()
        .map_err(|e| format!("OPSH-041: git fetch failed to start: {e}"))?;
    if !fetch.status.success() {
        let err = String::from_utf8_lossy(&fetch.stderr);
        return Err(format!("OPSH-041: git fetch failed — {err}"));
    }

    let ab = command("git")
        .args(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
        .current_dir(root)
        .output();
    let behind = match ab {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let parts: Vec<&str> = text.split_whitespace().collect();
            parts
                .get(1)
                .and_then(|s| s.parse::<i32>().ok())
                .unwrap_or(0)
        }
        _ => 0,
    };

    if behind <= 0 {
        return Ok("git up to date".into());
    }

    let pull = command("git")
        .args(["pull", "--ff-only"])
        .current_dir(root)
        .output()
        .map_err(|e| format!("OPSH-042: git pull failed to start: {e}"))?;
    if !pull.status.success() {
        let err = String::from_utf8_lossy(&pull.stderr).into_owned();
        if !is_index_lock_error(&err) {
            return Err(format!("OPSH-042: git pull --ff-only failed — {err}"));
        }
        match reconcile_index_lock(root) {
            ReconcileOutcome::Cleared => {
                let pull2 = command("git")
                    .args(["pull", "--ff-only"])
                    .current_dir(root)
                    .output()
                    .map_err(|e| format!("OPSH-042: git pull failed to start: {e}"))?;
                if !pull2.status.success() {
                    let err2 = String::from_utf8_lossy(&pull2.stderr);
                    return Err(format!("OPSH-042: git pull --ff-only failed — {err2}"));
                }
                return Ok(format!(
                    "pulled ({behind} behind); cleared stale index.lock"
                ));
            }
            ReconcileOutcome::Refused(reason) => {
                return Err(live_lock_opsh_message(reason));
            }
            ReconcileOutcome::Absent => {
                return Err(format!("OPSH-042: git pull --ff-only failed — {err}"));
            }
        }
    }
    Ok(format!("pulled ({behind} behind)"))
}

const FRESH_MTIME: Duration = Duration::from_secs(120);

#[derive(Debug, Clone)]
struct IndexLockFacts {
    path: PathBuf,
    exists: bool,
    mtime_age: Option<Duration>,
    holder_open: bool,
}

#[derive(Debug)]
struct StaleIndexLock {
    path: PathBuf,
}

impl StaleIndexLock {
    fn clear(self) -> Result<(), String> {
        fs::remove_file(&self.path).map_err(|e| format!("remove {}: {e}", self.path.display()))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum LiveLockReason {
    HolderOpen,
    Indeterminate,
}

#[derive(Debug)]
enum IndexLockState {
    Absent,
    Stale(StaleIndexLock),
    Live(LiveLockReason),
}

#[derive(Debug)]
enum ReconcileOutcome {
    Absent,
    Cleared,
    Refused(LiveLockReason),
}

fn is_index_lock_error(stderr: &str) -> bool {
    stderr.contains("index.lock")
        && (stderr.contains("File exists") || stderr.contains("Unable to create"))
}

fn classify_index_lock(facts: IndexLockFacts) -> IndexLockState {
    if !facts.exists {
        return IndexLockState::Absent;
    }
    if facts.holder_open {
        return IndexLockState::Live(LiveLockReason::HolderOpen);
    }
    match facts.mtime_age {
        Some(age) if age >= FRESH_MTIME => IndexLockState::Stale(StaleIndexLock {
            path: facts.path,
        }),
        Some(_) | None => IndexLockState::Live(LiveLockReason::Indeterminate),
    }
}

fn live_lock_opsh_message(reason: LiveLockReason) -> String {
    let detail = match reason {
        LiveLockReason::HolderOpen => {
            ".git/index.lock is held open by another process"
        }
        LiveLockReason::Indeterminate => {
            ".git/index.lock looks live; refusing to clear it"
        }
    };
    format!("OPSH-042: git pull --ff-only failed - {detail}")
}

/// Missing/failing `lsof` is not a holder.
fn lock_holder_open(path: &Path) -> bool {
    // `-t` prints PIDs only (no header), so empty stdout means no holder.
    match command("lsof").args(["-t"]).arg(path).output() {
        Ok(out) => String::from_utf8_lossy(&out.stdout)
            .lines()
            .any(|line| !line.trim().is_empty()),
        Err(_) => false,
    }
}

fn probe_index_lock(root: &Path) -> IndexLockFacts {
    let path = root.join(".git").join("index.lock");
    if !path.exists() {
        return IndexLockFacts {
            path,
            exists: false,
            mtime_age: None,
            holder_open: false,
        };
    }
    let mtime_age = fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|mtime| SystemTime::now().duration_since(mtime).ok());
    let holder_open = lock_holder_open(&path);
    IndexLockFacts {
        path,
        exists: true,
        mtime_age,
        holder_open,
    }
}

fn reconcile_index_lock(root: &Path) -> ReconcileOutcome {
    match classify_index_lock(probe_index_lock(root)) {
        IndexLockState::Absent => ReconcileOutcome::Absent,
        IndexLockState::Stale(lock) => match lock.clear() {
            Ok(()) => ReconcileOutcome::Cleared,
            Err(_) => ReconcileOutcome::Refused(LiveLockReason::Indeterminate),
        },
        IndexLockState::Live(reason) => ReconcileOutcome::Refused(reason),
    }
}

#[cfg(test)]
mod index_lock_tests {
    use super::*;

    #[test]
    fn detects_classic_index_lock_stderr() {
        let stderr = "error: Unable to create '/repo/.git/index.lock': File exists.";
        assert!(is_index_lock_error(stderr));
    }

    #[test]
    fn ignores_unrelated_pull_stderr() {
        let stderr = "fatal: Not possible to fast-forward, aborting.";
        assert!(!is_index_lock_error(stderr));
    }

    #[test]
    fn months_old_no_holder_is_stale() {
        let facts = IndexLockFacts {
            path: PathBuf::from("/repo/.git/index.lock"),
            exists: true,
            mtime_age: Some(Duration::from_secs(60 * 60 * 24 * 30)),
            holder_open: false,
        };
        assert!(matches!(
            classify_index_lock(facts),
            IndexLockState::Stale(_)
        ));
    }

    #[test]
    fn holder_open_is_live_never_stale() {
        let facts = IndexLockFacts {
            path: PathBuf::from("/repo/.git/index.lock"),
            exists: true,
            mtime_age: Some(Duration::from_secs(10_000)),
            holder_open: true,
        };
        assert!(matches!(
            classify_index_lock(facts),
            IndexLockState::Live(LiveLockReason::HolderOpen)
        ));
    }

    #[test]
    fn fresh_mtime_no_holder_is_live() {
        let facts = IndexLockFacts {
            path: PathBuf::from("/repo/.git/index.lock"),
            exists: true,
            mtime_age: Some(Duration::from_secs(5)),
            holder_open: false,
        };
        assert!(matches!(
            classify_index_lock(facts),
            IndexLockState::Live(LiveLockReason::Indeterminate)
        ));
    }

    #[test]
    fn missing_lock_is_absent() {
        let facts = IndexLockFacts {
            path: PathBuf::from("/repo/.git/index.lock"),
            exists: false,
            mtime_age: None,
            holder_open: false,
        };
        assert!(matches!(
            classify_index_lock(facts),
            IndexLockState::Absent
        ));
    }

    #[test]
    fn unreadable_age_is_live_indeterminate() {
        let facts = IndexLockFacts {
            path: PathBuf::from("/repo/.git/index.lock"),
            exists: true,
            mtime_age: None,
            holder_open: false,
        };
        assert!(matches!(
            classify_index_lock(facts),
            IndexLockState::Live(LiveLockReason::Indeterminate)
        ));
    }

    #[test]
    fn reconcile_clears_months_old_lock_in_tmp_repo() {
        let root = std::env::temp_dir().join(format!(
            "opsh042-index-lock-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".git")).expect("mkdir .git");
        let lock = root.join(".git").join("index.lock");
        fs::write(&lock, b"").expect("write lock");
        let old = SystemTime::now() - Duration::from_secs(60 * 60 * 24 * 30);
        let file = fs::File::options()
            .write(true)
            .open(&lock)
            .expect("open lock");
        file.set_modified(old).expect("set mtime");
        drop(file);

        let outcome = reconcile_index_lock(&root);
        assert!(
            matches!(outcome, ReconcileOutcome::Cleared),
            "expected Cleared, got {outcome:?}"
        );
        assert!(!lock.exists(), "stale lock should be gone");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn verify_repo_stale_lock_then_pull_when_env_set() {
        let Ok(raw) = std::env::var("OPSH042_VERIFY_REPO") else {
            return;
        };
        let root = PathBuf::from(raw);
        let lock = root.join(".git").join("index.lock");
        assert!(
            lock.is_file(),
            "expected stale lock at {}",
            lock.display()
        );
        let before = command("git")
            .args(["pull", "--ff-only"])
            .current_dir(&root)
            .output()
            .expect("git pull before");
        assert!(
            !before.status.success(),
            "precondition: pull should fail while lock exists"
        );
        assert!(
            is_index_lock_error(&String::from_utf8_lossy(&before.stderr)),
            "precondition: stderr should be index.lock"
        );

        let msg = git_fetch_and_pull(&root).expect("git_fetch_and_pull after harden");
        assert!(
            msg.contains("cleared stale index.lock") || msg.contains("pulled"),
            "unexpected success note: {msg}"
        );
        assert!(!lock.exists(), "lock should be cleared");
    }
}

fn rebuild_local(root: &Path) -> Result<String, String> {
    let helper = root.join("scripts").join("dale-auto-rebuild.sh");
    if helper.is_file() {
        return run_rebuild_script(&helper, root, &["--rebuild"]);
    }

    #[cfg(windows)]
    {
        let bat = root.join("run.bat");
        if bat.is_file() {
            let status = command("cmd")
                .args(["/C", "run.bat", "--rebuild"])
                .current_dir(root)
                .status()
                .map_err(|e| format!("OPSH-043: run.bat --rebuild failed: {e}"))?;
            if status.success() {
                return Ok("run.bat --rebuild ok".into());
            }
            return Err("OPSH-043: run.bat --rebuild exited non-zero".into());
        }
    }

    let cmd = root.join("run.command");
    if cmd.is_file() {
        return run_rebuild_script(&cmd, root, &["--rebuild"]);
    }

    Err(
        "OPSH-044: no dale-auto-rebuild.sh or run.command/--rebuild helper in project"
            .into(),
    )
}

fn run_rebuild_script(script: &Path, root: &Path, args: &[&str]) -> Result<String, String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = script
            .metadata()
            .map_err(|e| format!("OPSH-043: cannot inspect helper: {e}"))?
            .permissions()
            .mode();
        if mode & 0o111 == 0 {
            return Err(format!(
                "OPSH-043: {} is not executable",
                script.display()
            ));
        }
    }
    #[cfg(windows)]
    {
        let mut c = command("cmd");
        let script_name = script
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| script.display().to_string());
        let mut argv = vec!["/C".to_string(), script_name];
        for a in args {
            argv.push((*a).to_string());
        }
        let status = c
            .args(&argv)
            .current_dir(root)
            .status()
            .map_err(|e| format!("OPSH-043: rebuild helper failed: {e}"))?;
        if status.success() {
            return Ok(format!(
                "{} ok",
                script.file_name().unwrap_or_default().to_string_lossy()
            ));
        }
        return Err(format!(
            "OPSH-043: {} exited non-zero",
            script.file_name().unwrap_or_default().to_string_lossy()
        ));
    }
    #[cfg(not(windows))]
    {
        let mut c = command("/bin/bash");
        c.arg(script);
        for a in args {
            c.arg(a);
        }
        let status = c
            .current_dir(root)
            .status()
            .map_err(|e| format!("OPSH-043: rebuild helper failed: {e}"))?;
        if status.success() {
            Ok(format!(
                "{} ok",
                script.file_name().unwrap_or_default().to_string_lossy()
            ))
        } else {
            Err(format!(
                "OPSH-043: {} exited non-zero",
                script.file_name().unwrap_or_default().to_string_lossy()
            ))
        }
    }
}
