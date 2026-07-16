use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderBillingSettings {
    #[serde(
        rename = "showCursorSource",
        alias = "IsVisible",
        default = "default_true"
    )]
    pub show_cursor_source: bool,
    #[serde(default)]
    pub show_direct_source: bool,
    #[serde(default = "default_true")]
    pub show_pro_limits: bool,
    #[serde(default = "default_true")]
    pub show_pro_breakdown: bool,
    #[serde(default)]
    pub show_api_console_billing: bool,
    #[serde(default = "default_true")]
    pub show_details: bool,
    pub show_direct_details: Option<bool>,
    pub show_pro_details: Option<bool>,
    #[serde(default)]
    pub show_on_overview: bool,
    #[serde(default)]
    pub show_direct_on_overview: bool,
    #[serde(default)]
    pub show_pro_on_overview: bool,
    #[serde(default)]
    pub show_api_on_overview: bool,
    pub monthly_budget_usd: Option<f64>,
    pub organization_id: Option<String>,
    pub project_id: Option<String>,
    pub workspace_id: Option<String>,
    pub credential_id: Option<String>,
    pub management_credential_id: Option<String>,
    pub pro_session_credential_id: Option<String>,
    pub pro_oauth_credential_id: Option<String>,
    pub pro_last_connection_status: Option<String>,
    pub last_connection_status: Option<String>,
}

fn default_true() -> bool {
    true
}

impl Default for ProviderBillingSettings {
    fn default() -> Self {
        Self {
            show_cursor_source: true,
            show_direct_source: false,
            show_pro_limits: true,
            show_pro_breakdown: true,
            show_api_console_billing: false,
            show_details: true,
            show_direct_details: None,
            show_pro_details: None,
            show_on_overview: false,
            show_direct_on_overview: false,
            show_pro_on_overview: false,
            show_api_on_overview: false,
            monthly_budget_usd: None,
            organization_id: None,
            project_id: None,
            workspace_id: None,
            credential_id: None,
            management_credential_id: None,
            pro_session_credential_id: None,
            pro_oauth_credential_id: None,
            pro_last_connection_status: None,
            last_connection_status: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FuelSettings {
    #[serde(default = "default_cursor")]
    pub cursor: ProviderBillingSettings,
    #[serde(default)]
    pub open_ai: ProviderBillingSettings,
    #[serde(default)]
    pub claude: ProviderBillingSettings,
    #[serde(default)]
    pub gemini: ProviderBillingSettings,
    #[serde(default)]
    pub open_router: ProviderBillingSettings,
    #[serde(default)]
    pub open_code: ProviderBillingSettings,
    #[serde(default = "default_true")]
    pub show_breakdown: bool,
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval_minutes: u32,
}

fn default_refresh_interval() -> u32 {
    5
}

fn default_cursor() -> ProviderBillingSettings {
    ProviderBillingSettings {
        show_cursor_source: true,
        show_on_overview: true,
        ..ProviderBillingSettings::default()
    }
}

impl Default for FuelSettings {
    fn default() -> Self {
        Self {
            cursor: default_cursor(),
            open_ai: ProviderBillingSettings::default(),
            claude: ProviderBillingSettings::default(),
            gemini: ProviderBillingSettings::default(),
            open_router: ProviderBillingSettings::default(),
            open_code: ProviderBillingSettings::default(),
            show_breakdown: true,
            refresh_interval_minutes: 5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageSnapshot {
    pub percent_used: f64,
    pub detail_label: String,
    pub status_message: Option<String>,
    pub is_available: bool,
}

impl ProviderUsageSnapshot {
    pub fn unavailable(message: Option<&str>) -> Self {
        Self {
            percent_used: 0.0,
            detail_label: message.unwrap_or("—").to_string(),
            status_message: message.map(str::to_string),
            is_available: false,
        }
    }

    pub fn from_spend(spend_cents: f64, plan_limit_cents: i64) -> Self {
        if plan_limit_cents <= 0 {
            return Self::unavailable(None);
        }
        let percent = spend_cents * 100.0 / plan_limit_cents as f64;
        Self {
            percent_used: percent.clamp(0.0, 100.0),
            detail_label: format!("${:.2} of plan", spend_cents / 100.0),
            status_message: None,
            is_available: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectProviderSnapshot {
    pub spend_usd: f64,
    pub budget_usd: Option<f64>,
    pub remaining_usd: Option<f64>,
    pub granted_usd: Option<f64>,
    pub percent_used: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub is_available: bool,
    pub status_message: Option<String>,
    pub detail_label: String,
}

impl DirectProviderSnapshot {
    pub fn unavailable(message: Option<&str>) -> Self {
        Self {
            spend_usd: 0.0,
            budget_usd: None,
            remaining_usd: None,
            granted_usd: None,
            percent_used: 0.0,
            input_tokens: 0,
            output_tokens: 0,
            is_available: false,
            status_message: message.map(str::to_string),
            detail_label: message.unwrap_or("—").to_string(),
        }
    }

    pub fn from_billing(
        spend_usd: f64,
        budget_usd: Option<f64>,
        input_tokens: i64,
        output_tokens: i64,
        status_message: Option<&str>,
    ) -> Self {
        let percent = budget_usd
            .filter(|b| *b > 0.0)
            .map(|b| (spend_usd * 100.0 / b).clamp(0.0, 100.0))
            .unwrap_or(0.0);
        let spend_label = format!("${spend_usd:.2}");
        let budget_label = budget_usd
            .filter(|b| *b > 0.0)
            .map(|b| format!(" / ${b:.2}"))
            .unwrap_or_default();
        let token_label = if input_tokens + output_tokens > 0 {
            format!(" · {input_tokens} in / {output_tokens} out tokens")
        } else {
            String::new()
        };
        Self {
            spend_usd,
            budget_usd,
            remaining_usd: None,
            granted_usd: None,
            percent_used: percent,
            input_tokens,
            output_tokens,
            is_available: true,
            status_message: status_message.map(str::to_string),
            detail_label: format!("{spend_label}{budget_label}{token_label}"),
        }
    }

    pub fn from_credit_grants(
        granted_usd: f64,
        used_usd: f64,
        remaining_usd: f64,
        status_message: Option<&str>,
    ) -> Self {
        let percent = if granted_usd > 0.0 {
            (used_usd * 100.0 / granted_usd).clamp(0.0, 100.0)
        } else if remaining_usd <= 0.0 {
            100.0
        } else {
            0.0
        };
        let granted_label = if granted_usd > 0.0 {
            format!(" of ${granted_usd:.2}")
        } else {
            String::new()
        };
        Self {
            spend_usd: used_usd,
            budget_usd: None,
            remaining_usd: Some(remaining_usd),
            granted_usd: Some(granted_usd),
            percent_used: percent,
            input_tokens: 0,
            output_tokens: 0,
            is_available: true,
            status_message: status_message.map(str::to_string),
            detail_label: format!("${remaining_usd:.2} remaining{granted_label}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSnapshot {
    pub session_percent_remaining: f64,
    pub weekly_percent_remaining: f64,
    pub session_percent_used: f64,
    pub weekly_percent_used: f64,
    pub has_session_window: bool,
    pub has_weekly_window: bool,
    pub session_resets_at: Option<String>,
    pub weekly_resets_at: Option<String>,
    pub plan_label: Option<String>,
    pub credits_balance_usd: Option<f64>,
    pub limit_reached: bool,
    pub is_available: bool,
    pub status_message: Option<String>,
    pub detail_label: String,
}

impl CodexSnapshot {
    pub fn unavailable(message: Option<&str>) -> Self {
        Self {
            session_percent_remaining: 0.0,
            weekly_percent_remaining: 0.0,
            session_percent_used: 0.0,
            weekly_percent_used: 0.0,
            has_session_window: false,
            has_weekly_window: false,
            session_resets_at: None,
            weekly_resets_at: None,
            plan_label: None,
            credits_balance_usd: None,
            limit_reached: false,
            is_available: false,
            status_message: message.map(str::to_string),
            detail_label: message.unwrap_or("—").to_string(),
        }
    }

    pub fn from_usage(
        plan_type: Option<&str>,
        session_used_percent: Option<f64>,
        weekly_used_percent: Option<f64>,
        session_resets_at: Option<String>,
        weekly_resets_at: Option<String>,
        credits_balance_usd: Option<f64>,
        limit_reached: bool,
    ) -> Self {
        let session_remaining = session_used_percent
            .map(|u| (100.0 - u).clamp(0.0, 100.0))
            .unwrap_or(100.0);
        let weekly_remaining = weekly_used_percent
            .map(|u| (100.0 - u).clamp(0.0, 100.0))
            .unwrap_or(100.0);
        let plan_label = plan_type.map(format_plan_label);
        let mut parts = Vec::new();
        if let Some(ref p) = plan_label {
            parts.push(p.clone());
        }
        if let Some(b) = credits_balance_usd {
            parts.push(format!("${b:.0} credits"));
        }
        if let Some(s) = session_used_percent {
            parts.push(format!("5h {:.0}%", s.clamp(0.0, 100.0)));
        }
        if let Some(w) = weekly_used_percent {
            parts.push(format!("wk {:.0}%", w.clamp(0.0, 100.0)));
        }
        Self {
            session_percent_remaining: session_remaining,
            weekly_percent_remaining: weekly_remaining,
            session_percent_used: (100.0 - session_remaining).clamp(0.0, 100.0),
            weekly_percent_used: (100.0 - weekly_remaining).clamp(0.0, 100.0),
            has_session_window: session_used_percent.is_some(),
            has_weekly_window: weekly_used_percent.is_some(),
            session_resets_at,
            weekly_resets_at,
            plan_label,
            credits_balance_usd,
            limit_reached,
            is_available: true,
            status_message: None,
            detail_label: if parts.is_empty() {
                "—".into()
            } else {
                parts.join(" · ")
            },
        }
    }
}

fn format_plan_label(plan_type: &str) -> String {
    if plan_type.contains('_') {
        plan_type
            .split('_')
            .filter(|p| !p.is_empty())
            .map(|p| {
                let mut c = p.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => {
                        f.to_uppercase().collect::<String>() + c.as_str().to_lowercase().as_str()
                    }
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    } else if plan_type.len() == 1 {
        plan_type.to_uppercase()
    } else {
        let mut c = plan_type.chars();
        let first = c.next().unwrap().to_uppercase().collect::<String>();
        first + &c.as_str().to_lowercase()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeProSnapshot {
    pub session_percent_used: f64,
    pub weekly_percent_used: f64,
    pub session_resets_at: Option<String>,
    pub weekly_resets_at: Option<String>,
    pub is_available: bool,
    pub status_message: Option<String>,
    pub detail_label: String,
}

impl ClaudeProSnapshot {
    pub fn unavailable(message: Option<&str>) -> Self {
        Self {
            session_percent_used: 0.0,
            weekly_percent_used: 0.0,
            session_resets_at: None,
            weekly_resets_at: None,
            is_available: false,
            status_message: message.map(str::to_string),
            detail_label: message.unwrap_or("—").to_string(),
        }
    }

    pub fn from_usage(
        session_percent: f64,
        weekly_percent: f64,
        session_resets_at: Option<String>,
        weekly_resets_at: Option<String>,
    ) -> Self {
        let session = session_percent.clamp(0.0, 100.0);
        let weekly = weekly_percent.clamp(0.0, 100.0);
        Self {
            session_percent_used: session,
            weekly_percent_used: weekly,
            session_resets_at,
            weekly_resets_at,
            is_available: true,
            status_message: None,
            detail_label: format!("5h {session:.0}% · wk {weekly:.0}%"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityGroupSnapshot {
    pub session_percent_remaining: f64,
    pub weekly_percent_remaining: f64,
    pub session_percent_used: f64,
    pub weekly_percent_used: f64,
    pub session_resets_at: Option<String>,
    pub weekly_resets_at: Option<String>,
    pub is_available: bool,
    pub status_message: Option<String>,
    pub detail_label: String,
}

impl AntigravityGroupSnapshot {
    pub fn unavailable(message: Option<&str>) -> Self {
        Self {
            session_percent_remaining: 0.0,
            weekly_percent_remaining: 0.0,
            session_percent_used: 0.0,
            weekly_percent_used: 0.0,
            session_resets_at: None,
            weekly_resets_at: None,
            is_available: false,
            status_message: message.map(str::to_string),
            detail_label: message.unwrap_or("—").to_string(),
        }
    }

    pub fn from_usage(
        session_percent_remaining: f64,
        weekly_percent_remaining: f64,
        session_resets_at: Option<String>,
        weekly_resets_at: Option<String>,
    ) -> Self {
        let session = session_percent_remaining.clamp(0.0, 100.0);
        let weekly = weekly_percent_remaining.clamp(0.0, 100.0);
        let session_used = (100.0 - session).clamp(0.0, 100.0);
        let weekly_used = (100.0 - weekly).clamp(0.0, 100.0);
        Self {
            session_percent_remaining: session,
            weekly_percent_remaining: weekly,
            session_percent_used: session_used,
            weekly_percent_used: weekly_used,
            session_resets_at,
            weekly_resets_at,
            is_available: true,
            status_message: None,
            detail_label: format!("5h {session_used:.0}% · wk {weekly_used:.0}%"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AntigravitySnapshot {
    pub gemini: AntigravityGroupSnapshot,
    pub third_party: AntigravityGroupSnapshot,
    pub plan_label: Option<String>,
    pub is_available: bool,
    pub status_message: Option<String>,
    pub detail_label: String,
}

impl AntigravitySnapshot {
    pub fn unavailable(message: Option<&str>) -> Self {
        Self {
            gemini: AntigravityGroupSnapshot::unavailable(message),
            third_party: AntigravityGroupSnapshot::unavailable(None),
            plan_label: None,
            is_available: false,
            status_message: message.map(str::to_string),
            detail_label: message.unwrap_or("—").to_string(),
        }
    }

    pub fn from_groups(
        plan_label: Option<String>,
        gemini: AntigravityGroupSnapshot,
        third_party: AntigravityGroupSnapshot,
    ) -> Self {
        let is_available = gemini.is_available || third_party.is_available;
        let mut parts = Vec::new();
        if let Some(ref p) = plan_label {
            parts.push(p.clone());
        }
        if gemini.is_available {
            parts.push(format!("Gemini {}", gemini.detail_label));
        }
        if third_party.is_available {
            parts.push(format!("3P {}", third_party.detail_label));
        }
        Self {
            gemini,
            third_party,
            plan_label,
            is_available,
            status_message: None,
            detail_label: if parts.is_empty() {
                "—".into()
            } else {
                parts.join(" · ")
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRouterSnapshot {
    pub balance_usd: Option<f64>,
    pub key_limit_usd: Option<f64>,
    pub key_limit_remaining_usd: Option<f64>,
    pub key_limit_percent_used: Option<f64>,
    pub key_limit_reset: Option<String>,
    pub is_free_tier: bool,
    pub all_time_usage_usd: f64,
    pub daily_spend_usd: f64,
    pub weekly_spend_usd: f64,
    pub monthly_spend_usd: f64,
    pub byok_daily_spend_usd: Option<f64>,
    pub include_byok_in_limit: bool,
    pub headline_percent_used: f64,
    pub is_available: bool,
    pub status_message: Option<String>,
    pub detail_label: String,
}

impl OpenRouterSnapshot {
    pub fn unavailable(message: Option<&str>) -> Self {
        Self {
            balance_usd: None,
            key_limit_usd: None,
            key_limit_remaining_usd: None,
            key_limit_percent_used: None,
            key_limit_reset: None,
            is_free_tier: false,
            all_time_usage_usd: 0.0,
            daily_spend_usd: 0.0,
            weekly_spend_usd: 0.0,
            monthly_spend_usd: 0.0,
            byok_daily_spend_usd: None,
            include_byok_in_limit: false,
            headline_percent_used: 0.0,
            is_available: false,
            status_message: message.map(str::to_string),
            detail_label: message.unwrap_or("—").to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeWindowSnapshot {
    pub percent_used: f64,
    pub resets_at: Option<String>,
    pub is_available: bool,
}

impl OpenCodeWindowSnapshot {
    pub fn unavailable() -> Self {
        Self {
            percent_used: 0.0,
            resets_at: None,
            is_available: false,
        }
    }

    pub fn from_usage(percent_used: f64, resets_at: Option<String>) -> Self {
        Self {
            percent_used: percent_used.clamp(0.0, 100.0),
            resets_at,
            is_available: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeSnapshot {
    pub zen_balance_usd: Option<f64>,
    pub zen_monthly_cap_usd: Option<f64>,
    pub zen_monthly_used_usd: Option<f64>,
    pub zen_monthly_percent_used: Option<f64>,
    pub go_rolling: OpenCodeWindowSnapshot,
    pub go_weekly: OpenCodeWindowSnapshot,
    pub go_monthly: OpenCodeWindowSnapshot,
    pub has_go_subscription: bool,
    pub zen_is_available: bool,
    pub is_available: bool,
    pub status_message: Option<String>,
    pub detail_label: String,
}

impl OpenCodeSnapshot {
    pub fn unavailable(message: Option<&str>) -> Self {
        Self {
            zen_balance_usd: None,
            zen_monthly_cap_usd: None,
            zen_monthly_used_usd: None,
            zen_monthly_percent_used: None,
            go_rolling: OpenCodeWindowSnapshot::unavailable(),
            go_weekly: OpenCodeWindowSnapshot::unavailable(),
            go_monthly: OpenCodeWindowSnapshot::unavailable(),
            has_go_subscription: false,
            zen_is_available: false,
            is_available: false,
            status_message: message.map(str::to_string),
            detail_label: message.unwrap_or("—").to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub percent_used: f64,
    pub remaining_label: String,
    pub auto_percent_used: Option<f64>,
    pub api_percent_used: Option<f64>,
    pub has_breakdown: bool,
    pub plan_limit_cents: Option<i64>,
    pub billing_cycle_start_ms: Option<i64>,
    pub billing_cycle_end_ms: Option<i64>,
    #[serde(default = "default_unavailable_provider")]
    pub open_ai: ProviderUsageSnapshot,
    #[serde(default = "default_unavailable_claude")]
    pub claude: ProviderUsageSnapshot,
    #[serde(default = "default_unavailable_gemini")]
    pub gemini: ProviderUsageSnapshot,
    #[serde(default = "default_unavailable_codex")]
    pub codex: CodexSnapshot,
    #[serde(default = "default_unavailable_claude_pro")]
    pub claude_pro: ClaudeProSnapshot,
    #[serde(default = "default_unavailable_direct")]
    pub open_ai_direct: DirectProviderSnapshot,
    #[serde(default = "default_unavailable_direct_claude")]
    pub claude_direct: DirectProviderSnapshot,
    #[serde(default = "default_unavailable_antigravity")]
    pub antigravity: AntigravitySnapshot,
    #[serde(default = "default_unavailable_openrouter")]
    pub open_router: OpenRouterSnapshot,
    #[serde(default = "default_unavailable_opencode")]
    pub open_code: OpenCodeSnapshot,
    pub has_provider_breakdown: bool,
    pub is_error: bool,
    pub error_message: Option<String>,
}

fn default_unavailable_provider() -> ProviderUsageSnapshot {
    ProviderUsageSnapshot::unavailable(None)
}
fn default_unavailable_claude() -> ProviderUsageSnapshot {
    ProviderUsageSnapshot::unavailable(None)
}
fn default_unavailable_gemini() -> ProviderUsageSnapshot {
    ProviderUsageSnapshot::unavailable(None)
}
fn default_unavailable_codex() -> CodexSnapshot {
    CodexSnapshot::unavailable(None)
}
fn default_unavailable_claude_pro() -> ClaudeProSnapshot {
    ClaudeProSnapshot::unavailable(None)
}
fn default_unavailable_direct() -> DirectProviderSnapshot {
    DirectProviderSnapshot::unavailable(None)
}
fn default_unavailable_direct_claude() -> DirectProviderSnapshot {
    DirectProviderSnapshot::unavailable(None)
}
fn default_unavailable_antigravity() -> AntigravitySnapshot {
    AntigravitySnapshot::unavailable(None)
}
fn default_unavailable_openrouter() -> OpenRouterSnapshot {
    OpenRouterSnapshot::unavailable(None)
}
fn default_unavailable_opencode() -> OpenCodeSnapshot {
    OpenCodeSnapshot::unavailable(None)
}

impl UsageSnapshot {
    pub fn error(message: &str) -> Self {
        Self {
            percent_used: 0.0,
            remaining_label: message.to_string(),
            auto_percent_used: None,
            api_percent_used: None,
            has_breakdown: false,
            plan_limit_cents: None,
            billing_cycle_start_ms: None,
            billing_cycle_end_ms: None,
            open_ai: ProviderUsageSnapshot::unavailable(None),
            claude: ProviderUsageSnapshot::unavailable(None),
            gemini: ProviderUsageSnapshot::unavailable(None),
            codex: CodexSnapshot::unavailable(None),
            claude_pro: ClaudeProSnapshot::unavailable(None),
            open_ai_direct: DirectProviderSnapshot::unavailable(None),
            claude_direct: DirectProviderSnapshot::unavailable(None),
            antigravity: AntigravitySnapshot::unavailable(None),
            open_router: OpenRouterSnapshot::unavailable(None),
            open_code: OpenCodeSnapshot::unavailable(None),
            has_provider_breakdown: false,
            is_error: true,
            error_message: Some(message.to_string()),
        }
    }

    pub fn recompute_flags(&mut self) {
        self.has_breakdown = self.auto_percent_used.is_some() || self.api_percent_used.is_some();
        self.has_provider_breakdown =
            self.open_ai.is_available || self.claude.is_available || self.gemini.is_available;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRefreshStatus {
    pub succeeded: bool,
    pub error_message: Option<String>,
    pub is_degraded: bool,
}

impl ProviderRefreshStatus {
    pub fn ok() -> Self {
        Self {
            succeeded: true,
            error_message: None,
            is_degraded: false,
        }
    }

    pub fn failed(message: impl Into<String>, degraded: bool) -> Self {
        Self {
            succeeded: false,
            error_message: Some(message.into()),
            is_degraded: degraded,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshResult {
    pub snapshot: UsageSnapshot,
    pub refreshed_at: String,
    pub cursor_fetch_succeeded: bool,
    pub cursor_error: Option<String>,
    pub provider_statuses: std::collections::HashMap<String, ProviderRefreshStatus>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelProvider {
    OpenAi,
    Gemini,
    Unknown,
}

pub fn classify_model(model_name: &str) -> ModelProvider {
    let lower = model_name.to_lowercase();
    if lower.contains("gemini") || lower.contains("google") {
        ModelProvider::Gemini
    } else if lower.starts_with("gpt")
        || lower.starts_with("o1")
        || lower.starts_with("o3")
        || lower.starts_with("o4")
        || lower.contains("chatgpt")
        || lower.contains("codex")
    {
        ModelProvider::OpenAi
    } else {
        ModelProvider::Unknown
    }
}
