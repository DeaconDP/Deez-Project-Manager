use tauri::State;

use crate::usage::credentials;
use crate::usage::easy_setup;
use crate::usage::scheduler::FuelState;
use crate::usage::settings;
use crate::usage::types::{FuelSettings, RefreshResult};

#[tauri::command]
pub fn fuel_get_settings() -> FuelSettings {
    settings::load()
}

#[tauri::command]
pub fn fuel_save_settings(fuel_settings: FuelSettings) -> Result<(), String> {
    settings::save(&fuel_settings)
}

#[tauri::command]
pub async fn fuel_refresh(state: State<'_, FuelState>) -> Result<RefreshResult, String> {
    state.refresh_now().await
}

#[tauri::command]
pub fn fuel_get_snapshot(state: State<'_, FuelState>) -> RefreshResult {
    state.latest()
}

#[tauri::command]
pub async fn fuel_connect(source_kind: String) -> Result<String, String> {
    easy_setup::fuel_connect(&source_kind).await
}

#[tauri::command]
pub async fn fuel_test(source_kind: String) -> Result<String, String> {
    use crate::usage::clients::{
        anthropic::AnthropicBillingClient, antigravity::AntigravityUsageClient,
        claude_pro::ClaudeProUsageClient, codex::CodexUsageClient,
        openai_billing::OpenAiBillingClient, opencode::OpenCodeUsageClient,
        openrouter::OpenRouterUsageClient,
    };
    use crate::usage::cursor::has_access_token;

    let mut fuel_settings = settings::load();
    let status = match source_kind.as_str() {
        "cursor" => {
            if has_access_token() {
                "Connected via Cursor session".into()
            } else {
                "Sign in to Cursor IDE".into()
            }
        }
        "openai-via-cursor" => {
            if has_access_token() {
                "Via Cursor: connected".into()
            } else {
                "Via Cursor: sign in to Cursor IDE".into()
            }
        }
        "openai-codex" => {
            CodexUsageClient::new()
                .test_connection(&mut fuel_settings.open_ai)
                .await
        }
        "openai-direct" => {
            let key = credentials::retrieve(fuel_settings.open_ai.credential_id.as_deref())
                .unwrap_or_default();
            OpenAiBillingClient::new()
                .test_connection(&key, fuel_settings.open_ai.organization_id.as_deref())
                .await
        }
        "claude-pro" => {
            ClaudeProUsageClient::new()
                .test_connection(&mut fuel_settings.claude)
                .await
        }
        "claude-api" => {
            let key = credentials::retrieve(fuel_settings.claude.credential_id.as_deref())
                .unwrap_or_default();
            AnthropicBillingClient::new().test_connection(&key).await
        }
        "antigravity" => AntigravityUsageClient::new().test_connection().await,
        "openrouter" => {
            let key = credentials::retrieve(fuel_settings.open_router.credential_id.as_deref())
                .unwrap_or_default();
            OpenRouterUsageClient::new()
                .test_connection(
                    &key,
                    credentials::retrieve(
                        fuel_settings
                            .open_router
                            .management_credential_id
                            .as_deref(),
                    )
                    .as_deref(),
                )
                .await
        }
        "opencode-zen" | "opencode-go" => {
            OpenCodeUsageClient::new()
                .test_connection(&mut fuel_settings.open_code)
                .await
        }
        other => return Err(format!("Unknown test kind: {other}")),
    };
    settings::save(&fuel_settings)?;
    Ok(status)
}

#[tauri::command]
pub fn fuel_set_credential(
    provider: String,
    existing_id: Option<String>,
    secret: String,
    mut settings: FuelSettings,
    field: String,
) -> Result<FuelSettings, String> {
    match field.as_str() {
        "credentialId" => credentials::replace(&provider, existing_id.as_deref(), &secret, |id| {
            settings.set_credential_id(&provider, id)
        })?,
        "managementCredentialId" => {
            credentials::replace(&provider, existing_id.as_deref(), &secret, |id| {
                settings.open_router.management_credential_id = id
            })?
        }
        "proSessionCredentialId" => {
            credentials::replace(&provider, existing_id.as_deref(), &secret, |id| {
                settings.set_pro_session_id(&provider, id)
            })?
        }
        "proOAuthCredentialId" => {
            credentials::replace(&provider, existing_id.as_deref(), &secret, |id| {
                settings.set_pro_oauth_id(&provider, id)
            })?
        }
        other => return Err(format!("Unknown credential field: {other}")),
    }
    settings::save(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn fuel_clear_credential(
    provider: String,
    mut settings: FuelSettings,
    field: String,
) -> Result<FuelSettings, String> {
    match field.as_str() {
        "credentialId" => {
            let id = settings.credential_id_for(&provider);
            credentials::delete(id.as_deref());
            settings.set_credential_id(&provider, None);
        }
        "managementCredentialId" => {
            credentials::delete(settings.open_router.management_credential_id.as_deref());
            settings.open_router.management_credential_id = None;
        }
        "proSessionCredentialId" => {
            let id = settings.pro_session_id_for(&provider);
            credentials::delete(id.as_deref());
            settings.set_pro_session_id(&provider, None);
        }
        "proOAuthCredentialId" => {
            let id = settings.pro_oauth_id_for(&provider);
            credentials::delete(id.as_deref());
            settings.set_pro_oauth_id(&provider, None);
        }
        other => return Err(format!("Unknown credential field: {other}")),
    }
    settings::save(&settings)?;
    Ok(settings)
}

impl FuelSettings {
    fn set_credential_id(&mut self, provider: &str, id: Option<String>) {
        match provider {
            "openai-direct" | "openai" => self.open_ai.credential_id = id,
            "claude-api" | "claude" => self.claude.credential_id = id,
            "openrouter" => self.open_router.credential_id = id,
            "opencode" => self.open_code.credential_id = id,
            _ => {}
        }
    }

    fn credential_id_for(&self, provider: &str) -> Option<String> {
        match provider {
            "openai-direct" | "openai" => self.open_ai.credential_id.clone(),
            "claude-api" | "claude" => self.claude.credential_id.clone(),
            "openrouter" => self.open_router.credential_id.clone(),
            "opencode" => self.open_code.credential_id.clone(),
            _ => None,
        }
    }

    fn set_pro_session_id(&mut self, provider: &str, id: Option<String>) {
        match provider {
            "openai-codex" | "codex" => self.open_ai.pro_session_credential_id = id,
            "claude-pro" => self.claude.pro_session_credential_id = id,
            "opencode" => self.open_code.pro_session_credential_id = id,
            _ => {}
        }
    }

    fn pro_session_id_for(&self, provider: &str) -> Option<String> {
        match provider {
            "openai-codex" | "codex" => self.open_ai.pro_session_credential_id.clone(),
            "claude-pro" => self.claude.pro_session_credential_id.clone(),
            "opencode" => self.open_code.pro_session_credential_id.clone(),
            _ => None,
        }
    }

    fn set_pro_oauth_id(&mut self, provider: &str, id: Option<String>) {
        if provider == "claude-pro" {
            self.claude.pro_oauth_credential_id = id;
        }
    }

    fn pro_oauth_id_for(&self, provider: &str) -> Option<String> {
        if provider == "claude-pro" {
            self.claude.pro_oauth_credential_id.clone()
        } else {
            None
        }
    }
}
