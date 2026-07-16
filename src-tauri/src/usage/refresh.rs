use std::collections::HashMap;

use chrono::Utc;

use crate::usage::cursor::{read_cursor_tokens, CursorClient};
use crate::usage::direct::DirectBillingService;
use crate::usage::types::{
    AntigravitySnapshot, ClaudeProSnapshot, CodexSnapshot, DirectProviderSnapshot, FuelSettings,
    OpenCodeSnapshot, OpenRouterSnapshot, ProviderRefreshStatus, RefreshResult, UsageSnapshot,
};

pub struct UsageRefreshService {
    direct: DirectBillingService,
}

impl UsageRefreshService {
    pub fn new() -> Self {
        Self {
            direct: DirectBillingService::new(),
        }
    }

    pub fn clone_service(&self) -> Self {
        Self::new()
    }

    pub async fn refresh(&self, settings: &mut FuelSettings) -> RefreshResult {
        let refreshed_at = Utc::now().to_rfc3339();
        let tokens = read_cursor_tokens();
        let mut cursor_client = CursorClient::new();
        cursor_client.set_tokens(&tokens);

        let cursor_snapshot = cursor_client.fetch().await;
        let cursor_succeeded = !cursor_snapshot.is_error;
        let cursor_error = cursor_snapshot.error_message.clone();

        let base_snapshot = if cursor_succeeded {
            cursor_snapshot
        } else {
            create_cursor_error_base(&cursor_snapshot)
        };

        let enriched = self.direct.enrich(base_snapshot, settings).await;
        let provider_statuses = build_provider_statuses(&enriched, settings);

        RefreshResult {
            snapshot: enriched,
            refreshed_at,
            cursor_fetch_succeeded: cursor_succeeded,
            cursor_error: if cursor_succeeded { None } else { cursor_error },
            provider_statuses,
        }
    }
}

impl Default for UsageRefreshService {
    fn default() -> Self {
        Self::new()
    }
}

fn create_cursor_error_base(cursor_snapshot: &UsageSnapshot) -> UsageSnapshot {
    let msg = cursor_snapshot
        .error_message
        .clone()
        .unwrap_or_else(|| "Can't fetch Cursor usage".into());
    UsageSnapshot {
        is_error: true,
        error_message: Some(msg.clone()),
        percent_used: 0.0,
        remaining_label: msg,
        auto_percent_used: None,
        api_percent_used: None,
        has_breakdown: false,
        plan_limit_cents: None,
        billing_cycle_start_ms: None,
        billing_cycle_end_ms: None,
        open_ai: crate::usage::types::ProviderUsageSnapshot::unavailable(None),
        claude: crate::usage::types::ProviderUsageSnapshot::unavailable(None),
        gemini: crate::usage::types::ProviderUsageSnapshot::unavailable(None),
        codex: CodexSnapshot::unavailable(None),
        claude_pro: ClaudeProSnapshot::unavailable(None),
        open_ai_direct: DirectProviderSnapshot::unavailable(None),
        claude_direct: DirectProviderSnapshot::unavailable(None),
        antigravity: AntigravitySnapshot::unavailable(None),
        open_router: OpenRouterSnapshot::unavailable(None),
        open_code: OpenCodeSnapshot::unavailable(None),
        has_provider_breakdown: false,
    }
}

fn build_provider_statuses(
    snapshot: &UsageSnapshot,
    settings: &FuelSettings,
) -> HashMap<String, ProviderRefreshStatus> {
    let mut statuses = HashMap::new();
    if settings.open_ai.show_direct_source {
        statuses.insert(
            "openai-platform".into(),
            status_from_direct(&snapshot.open_ai_direct),
        );
    }
    if settings.open_ai.show_pro_limits {
        statuses.insert("codex".into(), status_from_codex(&snapshot.codex));
    }
    if settings.gemini.show_pro_limits {
        statuses.insert(
            "antigravity".into(),
            status_from_antigravity(&snapshot.antigravity),
        );
    }
    if settings.open_router.show_pro_limits {
        statuses.insert(
            "openrouter".into(),
            status_from_openrouter(&snapshot.open_router),
        );
    }
    if settings.open_code.show_direct_source || settings.open_code.show_pro_limits {
        statuses.insert("opencode".into(), status_from_opencode(&snapshot.open_code));
    }
    statuses
}

fn status_from_direct(snapshot: &DirectProviderSnapshot) -> ProviderRefreshStatus {
    if snapshot.is_available {
        ProviderRefreshStatus::ok()
    } else {
        ProviderRefreshStatus::failed(
            snapshot
                .status_message
                .clone()
                .unwrap_or_else(|| "Unavailable".into()),
            true,
        )
    }
}

fn status_from_codex(snapshot: &CodexSnapshot) -> ProviderRefreshStatus {
    if snapshot.is_available {
        ProviderRefreshStatus::ok()
    } else {
        ProviderRefreshStatus::failed(
            snapshot
                .status_message
                .clone()
                .unwrap_or_else(|| "Unavailable".into()),
            true,
        )
    }
}

fn status_from_antigravity(snapshot: &AntigravitySnapshot) -> ProviderRefreshStatus {
    if snapshot.is_available {
        ProviderRefreshStatus::ok()
    } else {
        ProviderRefreshStatus::failed(
            snapshot
                .status_message
                .clone()
                .unwrap_or_else(|| "Unavailable".into()),
            true,
        )
    }
}

fn status_from_openrouter(snapshot: &OpenRouterSnapshot) -> ProviderRefreshStatus {
    if snapshot.is_available {
        ProviderRefreshStatus::ok()
    } else {
        ProviderRefreshStatus::failed(
            snapshot
                .status_message
                .clone()
                .unwrap_or_else(|| "Unavailable".into()),
            true,
        )
    }
}

fn status_from_opencode(snapshot: &OpenCodeSnapshot) -> ProviderRefreshStatus {
    if snapshot.is_available {
        ProviderRefreshStatus::ok()
    } else {
        ProviderRefreshStatus::failed(
            snapshot
                .status_message
                .clone()
                .unwrap_or_else(|| "Unavailable".into()),
            true,
        )
    }
}
