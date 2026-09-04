//! Thin OpenShip CLI adapter — Deez-PM orchestrates; OpenShip stays headless.
use crate::usage::credentials;
use crate::win_cmd::command;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Output;
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
        "OPSH-010: openship CLI not found on PATH. Install: npm i -g openship (Node 22+)".into()
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
    credentials::replace(PAT_PROVIDER, cfg.credential_id.as_deref(), &secret, |id| {
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
        let err = String::from_utf8_lossy(&pull.stderr);
        return Err(format!("OPSH-042: git pull --ff-only failed — {err}"));
    }
    Ok(format!("pulled ({behind} behind)"))
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
