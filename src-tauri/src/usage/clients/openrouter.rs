use reqwest::Client;
use serde_json::Value;

use crate::usage::clients::{read_f64, read_opt_f64, shared_client};
use crate::usage::credentials;
use crate::usage::types::{OpenRouterSnapshot, ProviderBillingSettings};

const BASE_URL: &str = "https://openrouter.ai/api/v1";

pub struct OpenRouterUsageClient {
    http: Client,
}

impl OpenRouterUsageClient {
    pub fn new() -> Self {
        Self {
            http: shared_client(),
        }
    }

    pub async fn fetch(&self, settings: &mut ProviderBillingSettings) -> OpenRouterSnapshot {
        let api_key = match credentials::retrieve(settings.credential_id.as_deref()) {
            Some(k) if !k.trim().is_empty() => k,
            _ => return OpenRouterSnapshot::unavailable(Some("API key not set")),
        };
        match self
            .fetch_inner(&api_key, settings.management_credential_id.as_deref())
            .await
        {
            Ok(snap) => {
                settings.last_connection_status = Some(if snap.is_available {
                    "Connected".into()
                } else {
                    snap.status_message
                        .clone()
                        .unwrap_or_else(|| "Unavailable".into())
                });
                snap
            }
            Err(msg) => {
                settings.last_connection_status = Some(msg.clone());
                OpenRouterSnapshot::unavailable(Some(&msg))
            }
        }
    }

    pub async fn test_connection(&self, api_key: &str, management_key: Option<&str>) -> String {
        if api_key.trim().is_empty() {
            return "API key required".into();
        }
        match self.fetch_inner(api_key, management_key).await {
            Ok(snap) => {
                if snap.is_available {
                    "Connected".into()
                } else {
                    snap.status_message.unwrap_or_else(|| "Unavailable".into())
                }
            }
            Err(e) => e,
        }
    }

    async fn fetch_inner(
        &self,
        api_key: &str,
        management_key: Option<&str>,
    ) -> Result<OpenRouterSnapshot, String> {
        let key_data = self.fetch_key(api_key).await?;
        let credits = if let Some(mgmt) = management_key {
            self.try_fetch_credits(mgmt).await
        } else {
            None
        }
        .or(self.try_fetch_credits(api_key).await);
        Ok(merge_responses(key_data, credits))
    }

    async fn fetch_key(&self, api_key: &str) -> Result<KeyData, String> {
        let resp = self
            .http
            .get(format!("{BASE_URL}/key"))
            .header("Authorization", format!("Bearer {}", api_key.trim()))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err("Invalid API key".into());
        }
        if !resp.status().is_success() {
            return Err(format!("Key request failed ({})", resp.status()));
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        parse_key_response(&root)
    }

    async fn try_fetch_credits(&self, api_key: &str) -> Option<CreditsData> {
        let resp = self
            .http
            .get(format!("{BASE_URL}/credits"))
            .header("Authorization", format!("Bearer {}", api_key.trim()))
            .send()
            .await
            .ok()?;
        if resp.status() == reqwest::StatusCode::FORBIDDEN
            || resp.status() == reqwest::StatusCode::UNAUTHORIZED
        {
            return None;
        }
        if !resp.status().is_success() {
            return None;
        }
        let root: Value = resp.json().await.ok()?;
        parse_credits_response(&root)
    }
}

impl Default for OpenRouterUsageClient {
    fn default() -> Self {
        Self::new()
    }
}

struct KeyData {
    limit_usd: Option<f64>,
    limit_remaining_usd: Option<f64>,
    limit_reset: Option<String>,
    is_free_tier: bool,
    all_time_usage_usd: f64,
    daily_spend_usd: f64,
    weekly_spend_usd: f64,
    monthly_spend_usd: f64,
    include_byok_in_limit: bool,
    byok_daily_spend_usd: f64,
}

struct CreditsData {
    balance_usd: f64,
    total_credits: f64,
    total_usage: f64,
}

fn parse_key_response(root: &Value) -> Result<KeyData, String> {
    let data = root
        .get("data")
        .ok_or_else(|| "Invalid key response".to_string())?;
    Ok(KeyData {
        limit_usd: data.get("limit").and_then(|v| read_opt_f64(v)),
        limit_remaining_usd: data.get("limit_remaining").and_then(|v| read_opt_f64(v)),
        limit_reset: data
            .get("limit_reset")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        is_free_tier: data
            .get("is_free_tier")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        all_time_usage_usd: data.get("usage").map(read_f64).unwrap_or(0.0),
        daily_spend_usd: data.get("usage_daily").map(read_f64).unwrap_or(0.0),
        weekly_spend_usd: data.get("usage_weekly").map(read_f64).unwrap_or(0.0),
        monthly_spend_usd: data.get("usage_monthly").map(read_f64).unwrap_or(0.0),
        include_byok_in_limit: data
            .get("include_byok_in_limit")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        byok_daily_spend_usd: data.get("byok_usage_daily").map(read_f64).unwrap_or(0.0),
    })
}

fn parse_credits_response(root: &Value) -> Option<CreditsData> {
    let data = root.get("data")?;
    let total_credits = data.get("total_credits").map(read_f64).unwrap_or(0.0);
    let total_usage = data.get("total_usage").map(read_f64).unwrap_or(0.0);
    Some(CreditsData {
        balance_usd: total_credits - total_usage,
        total_credits,
        total_usage,
    })
}

fn merge_responses(key: KeyData, credits: Option<CreditsData>) -> OpenRouterSnapshot {
    let key_limit_percent = key.limit_usd.filter(|l| *l > 0.0).map(|limit| {
        let remaining = key.limit_remaining_usd.unwrap_or(0.0);
        ((limit - remaining) * 100.0 / limit).clamp(0.0, 100.0)
    });
    let headline = key_limit_percent.unwrap_or_else(|| {
        credits
            .as_ref()
            .filter(|c| c.total_credits > 0.0)
            .map(|c| (c.total_usage * 100.0 / c.total_credits).clamp(0.0, 100.0))
            .unwrap_or(0.0)
    });
    let balance = credits.as_ref().map(|c| c.balance_usd);
    let mut parts = Vec::new();
    if key.is_free_tier {
        parts.push("free tier".into());
    }
    if let Some(limit) = key.limit_usd {
        let remaining = key.limit_remaining_usd.unwrap_or(0.0);
        let mut part = format!("key ${remaining:.2} / ${limit:.2}");
        if let Some(ref reset) = key.limit_reset {
            part.push_str(&format!(" ({reset})"));
        }
        parts.push(part);
    } else if let Some(ref c) = credits.filter(|c| c.total_credits > 0.0) {
        parts.push(format!(
            "${:.2} used of ${:.2} credits",
            c.total_usage, c.total_credits
        ));
    } else if let Some(b) = balance {
        parts.push(format!("${b:.2} balance"));
    }
    OpenRouterSnapshot {
        balance_usd: balance,
        key_limit_usd: key.limit_usd,
        key_limit_remaining_usd: key.limit_remaining_usd,
        key_limit_percent_used: key_limit_percent,
        key_limit_reset: key.limit_reset,
        is_free_tier: key.is_free_tier,
        all_time_usage_usd: key.all_time_usage_usd,
        daily_spend_usd: key.daily_spend_usd,
        weekly_spend_usd: key.weekly_spend_usd,
        monthly_spend_usd: key.monthly_spend_usd,
        byok_daily_spend_usd: if key.include_byok_in_limit && key.byok_daily_spend_usd > 0.0 {
            Some(key.byok_daily_spend_usd)
        } else {
            None
        },
        include_byok_in_limit: key.include_byok_in_limit,
        headline_percent_used: headline,
        is_available: true,
        status_message: None,
        detail_label: if parts.is_empty() {
            "Connected".into()
        } else {
            parts.join(" · ")
        },
    }
}
