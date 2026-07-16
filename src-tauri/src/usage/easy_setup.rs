use std::process::Command;

use crate::usage::auth::gemini;
use crate::usage::auth::opencode;
use crate::usage::clients::{
    antigravity::AntigravityUsageClient, claude_pro::ClaudeProUsageClient, codex::CodexUsageClient,
    openrouter::OpenRouterUsageClient,
};
use crate::usage::credentials;
use crate::usage::cursor::{has_access_token, read_cursor_tokens};
use crate::usage::paths;
use crate::usage::settings;
use crate::usage::types::FuelSettings;

pub async fn fuel_connect(source_kind: &str) -> Result<String, String> {
    let mut fuel_settings = settings::load();
    let status = match source_kind {
        "cursor" => setup_cursor(&mut fuel_settings),
        "openai-via-cursor" => setup_openai_via_cursor(&mut fuel_settings),
        "openai-codex" => setup_codex(&mut fuel_settings).await,
        "openai-direct" => {
            return Err("Use Advanced settings to paste an OpenAI Platform API key".into());
        }
        "claude-via-cursor" => setup_claude_via_cursor(&mut fuel_settings),
        "claude-pro" => setup_claude_pro(&mut fuel_settings).await,
        "claude-api" => {
            return Err(
                "Use Advanced settings to paste a Claude Admin API key (sk-ant-admin...)".into(),
            );
        }
        "gemini-via-cursor" => setup_gemini_via_cursor(&mut fuel_settings),
        "antigravity" => setup_antigravity(&mut fuel_settings).await,
        "openrouter" => setup_openrouter(&mut fuel_settings).await,
        "opencode-zen" | "opencode-go" => setup_opencode(&mut fuel_settings),
        other => return Err(format!("Unknown connect kind: {other}")),
    };
    settings::save(&fuel_settings)?;
    Ok(status)
}

fn setup_cursor(settings: &mut FuelSettings) -> String {
    settings.cursor.show_cursor_source = true;
    settings.cursor.show_details = true;
    settings.show_breakdown = true;
    if has_access_token() {
        let msg = "Connected via Cursor session";
        settings.cursor.last_connection_status = Some(msg.into());
        return msg.into();
    }
    if launch_cursor_ide() {
        let msg = "Sign in to Cursor IDE, then click Test";
        settings.cursor.last_connection_status = Some(msg.into());
        msg.into()
    } else {
        let msg = "Could not launch Cursor IDE — open it manually, then click Test";
        settings.cursor.last_connection_status = Some(msg.into());
        msg.into()
    }
}

fn setup_openai_via_cursor(settings: &mut FuelSettings) -> String {
    settings.open_ai.show_cursor_source = true;
    settings.open_ai.show_details = true;
    let tokens = read_cursor_tokens();
    let msg = if tokens.access_token.as_deref().unwrap_or("").is_empty() {
        "Via Cursor: sign in to Cursor IDE"
    } else {
        "Via Cursor: connected"
    };
    settings.open_ai.last_connection_status = Some(msg.into());
    msg.into()
}

fn setup_claude_via_cursor(settings: &mut FuelSettings) -> String {
    settings.claude.show_cursor_source = true;
    settings.claude.show_details = true;
    "Via Cursor: enabled".into()
}

fn setup_gemini_via_cursor(settings: &mut FuelSettings) -> String {
    settings.gemini.show_cursor_source = true;
    settings.gemini.show_details = true;
    "Via Cursor: enabled".into()
}

async fn setup_codex(settings: &mut FuelSettings) -> String {
    settings.open_ai.show_pro_limits = true;
    settings.open_ai.show_pro_details = Some(true);
    let client = CodexUsageClient::new();
    if codex_auth_detectable(&settings.open_ai) {
        let status = client.refresh_and_connect(&mut settings.open_ai).await;
        settings.open_ai.pro_last_connection_status = Some(if status.starts_with("Connected") {
            format!("Codex: {status}")
        } else {
            status.clone()
        });
        return status;
    }
    let _ = try_launch_codex_login();
    open_url("https://chatgpt.com/");
    let msg =
        "Codex: run codex login in the terminal, or paste a ChatGPT session cookie in Advanced";
    settings.open_ai.pro_last_connection_status = Some(msg.into());
    msg.into()
}

async fn setup_claude_pro(settings: &mut FuelSettings) -> String {
    settings.claude.show_pro_limits = true;
    let client = ClaudeProUsageClient::new();
    let status = client.refresh_and_connect(&mut settings.claude).await;
    if status.starts_with("Connected") {
        return status;
    }
    open_url("https://claude.ai/");
    let msg = "Run 'claude login', or paste a session key in Settings, then click Refresh";
    settings.claude.pro_last_connection_status = Some(msg.into());
    msg.into()
}

async fn setup_antigravity(settings: &mut FuelSettings) -> String {
    settings.gemini.show_pro_limits = true;
    if !gemini::has_detectable_auth() {
        if !try_launch_gemini_login() {
            launch_antigravity_ide();
        }
        let msg = "Gemini: sign in via gemini in the terminal, or sign in to Antigravity IDE, then click Test";
        settings.gemini.pro_last_connection_status = Some(msg.into());
        return msg.into();
    }
    let client = AntigravityUsageClient::new();
    let status = client.test_connection().await;
    settings.gemini.pro_last_connection_status = Some(status.clone());
    status
}

async fn setup_openrouter(settings: &mut FuelSettings) -> String {
    settings.open_router.show_pro_limits = true;
    settings.open_router.show_details = true;
    let api_key = credentials::retrieve(settings.open_router.credential_id.as_deref());
    if api_key.as_deref().unwrap_or("").is_empty() {
        open_url("https://openrouter.ai/keys");
        let msg = "Paste your OpenRouter API key (sk-or-...) in Advanced. Optional management key adds account balance.";
        settings.open_router.last_connection_status = Some(msg.into());
        return msg.into();
    }
    let client = OpenRouterUsageClient::new();
    let status = client
        .test_connection(
            api_key.as_deref().unwrap(),
            credentials::retrieve(settings.open_router.management_credential_id.as_deref())
                .as_deref(),
        )
        .await;
    settings.open_router.last_connection_status = Some(status.clone());
    status
}

fn setup_opencode(settings: &mut FuelSettings) -> String {
    settings.open_code.show_direct_source = true;
    settings.open_code.show_pro_limits = true;
    settings.open_code.show_details = true;
    if opencode::has_api_key_auth() {
        return "Connected via OpenCode CLI".into();
    }
    if opencode::has_detectable_auth(&settings.open_code) {
        return settings
            .open_code
            .pro_last_connection_status
            .clone()
            .unwrap_or_else(|| "Connected".into());
    }
    open_url("https://opencode.ai/");
    let msg =
        "Sign in at opencode.ai or run opencode /connect; set workspace ID in Advanced if needed";
    settings.open_code.pro_last_connection_status = Some(msg.into());
    msg.into()
}

fn codex_auth_detectable(settings: &crate::usage::types::ProviderBillingSettings) -> bool {
    crate::usage::auth::codex::read_auth_file().is_some()
        || credentials::retrieve(settings.pro_session_credential_id.as_deref()).is_some()
}

fn launch_cursor_ide() -> bool {
    for path in paths::cursor_executable_paths() {
        if path.exists() {
            return Command::new(&path).spawn().is_ok();
        }
    }
    false
}

fn launch_antigravity_ide() -> bool {
    for path in paths::antigravity_executable_paths() {
        if path.exists() {
            return Command::new(&path).spawn().is_ok();
        }
    }
    false
}

fn try_launch_codex_login() -> bool {
    Command::new("cmd")
        .args(["/C", "start", "cmd", "/K", "codex login"])
        .spawn()
        .is_ok()
}

fn try_launch_gemini_login() -> bool {
    Command::new("cmd")
        .args(["/C", "start", "cmd", "/K", "gemini"])
        .spawn()
        .is_ok()
}

fn open_url(url: &str) {
    let _ = Command::new("cmd").args(["/C", "start", "", url]).spawn();
}
