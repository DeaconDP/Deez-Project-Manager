use reqwest::Client;
use serde_json::{json, Value};

use super::parser::{
    enrich_with_breakdown, is_jwt_expired, parse_aggregated_usage, parse_current_period_usage,
};
use super::token_reader::CursorTokens;
use crate::usage::types::UsageSnapshot;

const API_BASE: &str = "https://api2.cursor.sh";
const OAUTH_CLIENT_ID: &str = "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB";
const INCLUDED_MODEL_KEY: &str = "gpt-4";

pub struct CursorClient {
    http: Client,
    access_token: Option<String>,
    refresh_token: Option<String>,
}

impl CursorClient {
    pub fn new() -> Self {
        Self {
            http: Client::new(),
            access_token: None,
            refresh_token: None,
        }
    }

    pub fn set_tokens(&mut self, tokens: &CursorTokens) {
        self.access_token = tokens.access_token.clone();
        self.refresh_token = tokens.refresh_token.clone();
    }

    pub async fn fetch(&mut self) -> UsageSnapshot {
        let access = match &self.access_token {
            Some(t) if !t.trim().is_empty() => t.clone(),
            _ => return UsageSnapshot::error("Sign in to Cursor"),
        };

        if is_jwt_expired(&access) {
            if !self.try_refresh_token().await {
                return UsageSnapshot::error("Session expired — reopen Cursor");
            }
        }

        if let Some(period) = self.try_get_current_period_usage().await {
            return self.enrich_with_provider_breakdown(period).await;
        }

        if let Some(legacy) = self.try_get_legacy_usage().await {
            return legacy;
        }

        UsageSnapshot::error("Can't fetch usage")
    }

    async fn enrich_with_provider_breakdown(&self, snapshot: UsageSnapshot) -> UsageSnapshot {
        let (Some(limit), Some(start), Some(end)) = (
            snapshot.plan_limit_cents,
            snapshot.billing_cycle_start_ms,
            snapshot.billing_cycle_end_ms,
        ) else {
            return snapshot;
        };
        if limit <= 0 {
            return snapshot;
        }

        let Some(aggregations) = self.try_get_aggregated_usage(start, end).await else {
            return snapshot;
        };
        enrich_with_breakdown(snapshot, &aggregations)
    }

    async fn try_get_current_period_usage(&self) -> Option<UsageSnapshot> {
        let token = self.access_token.as_ref()?;
        let resp = self
            .http
            .post(format!(
                "{API_BASE}/aiserver.v1.DashboardService/GetCurrentPeriodUsage"
            ))
            .header("Authorization", format!("Bearer {token}"))
            .header("Connect-Protocol-Version", "1")
            .header("Content-Type", "application/json")
            .body("{}")
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let root: Value = resp.json().await.ok()?;
        parse_current_period_usage(&root)
    }

    async fn try_get_aggregated_usage(
        &self,
        start_ms: i64,
        end_ms: i64,
    ) -> Option<Vec<(String, f64)>> {
        let token = self.access_token.as_ref()?;
        let body = json!({
            "teamId": -1,
            "startDate": start_ms.to_string(),
            "endDate": end_ms.to_string(),
        });
        let resp = self
            .http
            .post(format!(
                "{API_BASE}/aiserver.v1.DashboardService/GetAggregatedUsageEvents"
            ))
            .header("Authorization", format!("Bearer {token}"))
            .header("Connect-Protocol-Version", "1")
            .json(&body)
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let root: Value = resp.json().await.ok()?;
        parse_aggregated_usage(&root)
    }

    async fn try_get_legacy_usage(&self) -> Option<UsageSnapshot> {
        let token = self.access_token.as_ref()?;
        let resp = self
            .http
            .get(format!("{API_BASE}/auth/usage"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let root: Value = resp.json().await.ok()?;
        let bucket = root.get(INCLUDED_MODEL_KEY)?;
        let max_requests = bucket.get("maxRequestUsage")?.as_i64()?;
        if max_requests <= 0 {
            return None;
        }
        let used = bucket
            .get("numRequests")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let remaining = (max_requests - used).max(0);
        let percent = used as f64 * 100.0 / max_requests as f64;
        Some(UsageSnapshot {
            percent_used: percent.clamp(0.0, 100.0),
            remaining_label: format!("{remaining} requests left"),
            auto_percent_used: None,
            api_percent_used: None,
            has_breakdown: false,
            plan_limit_cents: None,
            billing_cycle_start_ms: None,
            billing_cycle_end_ms: None,
            open_ai: crate::usage::types::ProviderUsageSnapshot::unavailable(None),
            claude: crate::usage::types::ProviderUsageSnapshot::unavailable(None),
            gemini: crate::usage::types::ProviderUsageSnapshot::unavailable(None),
            codex: crate::usage::types::CodexSnapshot::unavailable(None),
            claude_pro: crate::usage::types::ClaudeProSnapshot::unavailable(None),
            open_ai_direct: crate::usage::types::DirectProviderSnapshot::unavailable(None),
            claude_direct: crate::usage::types::DirectProviderSnapshot::unavailable(None),
            antigravity: crate::usage::types::AntigravitySnapshot::unavailable(None),
            open_router: crate::usage::types::OpenRouterSnapshot::unavailable(None),
            open_code: crate::usage::types::OpenCodeSnapshot::unavailable(None),
            has_provider_breakdown: false,
            is_error: false,
            error_message: None,
        })
    }

    async fn try_refresh_token(&mut self) -> bool {
        let refresh = match &self.refresh_token {
            Some(t) if !t.trim().is_empty() => t.clone(),
            _ => return false,
        };
        let body = json!({
            "grant_type": "refresh_token",
            "client_id": OAUTH_CLIENT_ID,
            "refresh_token": refresh,
        });
        let resp = match self
            .http
            .post(format!("{API_BASE}/oauth/token"))
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => return false,
        };
        if !resp.status().is_success() {
            return false;
        }
        let root: Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => return false,
        };
        if root.get("shouldLogout").and_then(|v| v.as_bool()) == Some(true) {
            return false;
        }
        let new_token = root
            .get("access_token")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if let Some(token) = new_token {
            self.access_token = Some(token.to_string());
            true
        } else {
            false
        }
    }
}

impl Default for CursorClient {
    fn default() -> Self {
        Self::new()
    }
}
