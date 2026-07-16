use std::time::Duration;

use tokio::time::timeout;

use crate::usage::clients::{
    anthropic::AnthropicBillingClient, antigravity::AntigravityUsageClient,
    claude_pro::ClaudeProUsageClient, codex::CodexUsageClient, openai_billing::OpenAiBillingClient,
    opencode::OpenCodeUsageClient, openrouter::OpenRouterUsageClient,
};
use crate::usage::types::{
    AntigravitySnapshot, ClaudeProSnapshot, CodexSnapshot, DirectProviderSnapshot, FuelSettings,
    OpenCodeSnapshot, OpenRouterSnapshot, UsageSnapshot,
};

pub const PROVIDER_TIMEOUT: Duration = Duration::from_secs(30);

pub struct DirectBillingService {
    open_ai: OpenAiBillingClient,
    codex: CodexUsageClient,
    anthropic: AnthropicBillingClient,
    claude_pro: ClaudeProUsageClient,
    antigravity: AntigravityUsageClient,
    open_router: OpenRouterUsageClient,
    open_code: OpenCodeUsageClient,
}

impl DirectBillingService {
    pub fn new() -> Self {
        Self {
            open_ai: OpenAiBillingClient::new(),
            codex: CodexUsageClient::new(),
            anthropic: AnthropicBillingClient::new(),
            claude_pro: ClaudeProUsageClient::new(),
            antigravity: AntigravityUsageClient::new(),
            open_router: OpenRouterUsageClient::new(),
            open_code: OpenCodeUsageClient::new(),
        }
    }

    pub async fn enrich(
        &self,
        snapshot: UsageSnapshot,
        settings: &mut FuelSettings,
    ) -> UsageSnapshot {
        let cycle_start = snapshot.billing_cycle_start_ms;
        let cycle_end = snapshot.billing_cycle_end_ms;

        let open_ai_direct = if settings.open_ai.show_direct_source {
            fetch_with_timeout(
                self.open_ai
                    .fetch(&mut settings.open_ai, cycle_start, cycle_end),
                DirectProviderSnapshot::unavailable(None),
            )
            .await
        } else {
            DirectProviderSnapshot::unavailable(None)
        };

        let codex = if settings.open_ai.show_pro_limits {
            fetch_with_timeout(
                self.codex.fetch(&mut settings.open_ai),
                CodexSnapshot::unavailable(None),
            )
            .await
        } else {
            CodexSnapshot::unavailable(None)
        };

        let claude_direct = if settings.claude.show_api_console_billing {
            fetch_with_timeout(
                self.anthropic
                    .fetch(&mut settings.claude, cycle_start, cycle_end),
                DirectProviderSnapshot::unavailable(None),
            )
            .await
        } else {
            DirectProviderSnapshot::unavailable(None)
        };

        let claude_pro = if settings.claude.show_pro_limits {
            fetch_with_timeout(
                self.claude_pro.fetch(&mut settings.claude),
                ClaudeProSnapshot::unavailable(None),
            )
            .await
        } else {
            ClaudeProSnapshot::unavailable(None)
        };

        let antigravity = if settings.gemini.show_pro_limits {
            fetch_with_timeout(
                self.antigravity.fetch(&mut settings.gemini),
                AntigravitySnapshot::unavailable(None),
            )
            .await
        } else {
            AntigravitySnapshot::unavailable(None)
        };

        // OpenRouter enabled always when showProLimits (Ada ignores Deez feature flag)
        let open_router = if settings.open_router.show_pro_limits {
            fetch_with_timeout(
                self.open_router.fetch(&mut settings.open_router),
                OpenRouterSnapshot::unavailable(None),
            )
            .await
        } else {
            OpenRouterSnapshot::unavailable(None)
        };

        let open_code =
            if settings.open_code.show_direct_source || settings.open_code.show_pro_limits {
                fetch_with_timeout(
                    self.open_code.fetch(&mut settings.open_code),
                    OpenCodeSnapshot::unavailable(None),
                )
                .await
            } else {
                OpenCodeSnapshot::unavailable(None)
            };

        copy_with_enrichment(
            snapshot,
            open_ai_direct,
            codex,
            claude_direct,
            claude_pro,
            antigravity,
            open_router,
            open_code,
        )
    }
}

impl Default for DirectBillingService {
    fn default() -> Self {
        Self::new()
    }
}

async fn fetch_with_timeout<T: Clone>(fut: impl std::future::Future<Output = T>, fallback: T) -> T {
    match timeout(PROVIDER_TIMEOUT, fut).await {
        Ok(value) => value,
        Err(_) => fallback,
    }
}

pub fn copy_with_enrichment(
    source: UsageSnapshot,
    open_ai_direct: DirectProviderSnapshot,
    codex: CodexSnapshot,
    claude_direct: DirectProviderSnapshot,
    claude_pro: ClaudeProSnapshot,
    antigravity: AntigravitySnapshot,
    open_router: OpenRouterSnapshot,
    open_code: OpenCodeSnapshot,
) -> UsageSnapshot {
    UsageSnapshot {
        percent_used: source.percent_used,
        remaining_label: source.remaining_label,
        auto_percent_used: source.auto_percent_used,
        api_percent_used: source.api_percent_used,
        has_breakdown: source.has_breakdown,
        plan_limit_cents: source.plan_limit_cents,
        billing_cycle_start_ms: source.billing_cycle_start_ms,
        billing_cycle_end_ms: source.billing_cycle_end_ms,
        open_ai: source.open_ai,
        claude: source.claude,
        gemini: source.gemini,
        codex,
        claude_pro,
        open_ai_direct,
        claude_direct,
        antigravity,
        open_router,
        open_code,
        has_provider_breakdown: source.has_provider_breakdown,
        is_error: source.is_error,
        error_message: source.error_message,
    }
}
