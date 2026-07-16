use reqwest::Client;
use serde_json::Value;

use crate::usage::clients::{resolve_period_iso, shared_client};
use crate::usage::credentials;
use crate::usage::types::{DirectProviderSnapshot, ProviderBillingSettings};

pub struct AnthropicBillingClient {
    http: Client,
}

impl AnthropicBillingClient {
    pub fn new() -> Self {
        Self {
            http: shared_client(),
        }
    }

    pub async fn fetch(
        &self,
        settings: &mut ProviderBillingSettings,
        cycle_start_ms: Option<i64>,
        cycle_end_ms: Option<i64>,
    ) -> DirectProviderSnapshot {
        let api_key = match credentials::retrieve(settings.credential_id.as_deref()) {
            Some(k) if !k.trim().is_empty() => k,
            _ => return DirectProviderSnapshot::unavailable(Some("Admin API key not set")),
        };
        if !api_key.to_ascii_lowercase().starts_with("sk-ant-admin") {
            let msg = "Admin API key required (sk-ant-admin...)";
            settings.last_connection_status = Some(msg.into());
            return DirectProviderSnapshot::unavailable(Some(msg));
        }
        let budget = settings
            .monthly_budget_usd
            .filter(|b| *b > 0.0)
            .map(|b| b as f64);
        let (start, end) = resolve_period_iso(cycle_start_ms, cycle_end_ms);
        match self.fetch_costs_and_usage(&api_key, &start, &end).await {
            Ok((spend, input, output)) => {
                settings.last_connection_status = Some("Connected".into());
                DirectProviderSnapshot::from_billing(
                    spend,
                    budget,
                    input,
                    output,
                    Some("Priority Tier costs may not appear in cost reports"),
                )
            }
            Err(msg) => {
                settings.last_connection_status = Some(msg.clone());
                DirectProviderSnapshot::unavailable(Some(&msg))
            }
        }
    }

    pub async fn test_connection(&self, api_key: &str) -> String {
        if api_key.trim().is_empty() {
            return "API key required".into();
        }
        if !api_key.to_ascii_lowercase().starts_with("sk-ant-admin") {
            return "Admin API key required (sk-ant-admin...)".into();
        }
        let (start, end) = resolve_period_iso(None, None);
        match self.fetch_costs(api_key, &start, &end).await {
            Ok(_) => "Connected".into(),
            Err(e) => e,
        }
    }

    async fn fetch_costs_and_usage(
        &self,
        api_key: &str,
        start: &str,
        end: &str,
    ) -> Result<(f64, i64, i64), String> {
        let spend = self.fetch_costs(api_key, start, end).await?;
        let (input, output) = self.fetch_usage(api_key, start, end).await?;
        Ok((spend, input, output))
    }

    async fn fetch_costs(&self, api_key: &str, start: &str, end: &str) -> Result<f64, String> {
        let url = format!(
            "https://api.anthropic.com/v1/organizations/cost_report?starting_at={start}&ending_at={end}&bucket_width=1d&limit=31"
        );
        let resp = self.authorized_get(&url, api_key).await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Costs request failed ({status}): {body}"));
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(parse_costs(&root))
    }

    async fn fetch_usage(
        &self,
        api_key: &str,
        start: &str,
        end: &str,
    ) -> Result<(i64, i64), String> {
        let url = format!(
            "https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at={start}&ending_at={end}&bucket_width=1d&limit=31"
        );
        let resp = self.authorized_get(&url, api_key).await?;
        if !resp.status().is_success() {
            return Err(format!("Usage request failed ({})", resp.status()));
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(parse_usage(&root))
    }

    async fn authorized_get(&self, url: &str, api_key: &str) -> Result<reqwest::Response, String> {
        self.http
            .get(url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await
            .map_err(|e| e.to_string())
    }
}

impl Default for AnthropicBillingClient {
    fn default() -> Self {
        Self::new()
    }
}

fn parse_costs(root: &Value) -> f64 {
    let mut total_cents = 0.0;
    let Some(data) = root.get("data").and_then(|v| v.as_array()) else {
        return 0.0;
    };
    for bucket in data {
        let Some(results) = bucket.get("results").and_then(|v| v.as_array()) else {
            continue;
        };
        for result in results {
            if let Some(amount) = result.get("amount") {
                total_cents += match amount {
                    Value::String(s) => s.parse::<f64>().unwrap_or(0.0),
                    Value::Number(n) => n.as_f64().unwrap_or(0.0),
                    _ => 0.0,
                };
            } else if let Some(usd) = result.get("cost_usd").and_then(|v| v.as_f64()) {
                total_cents += usd * 100.0;
            }
        }
    }
    total_cents / 100.0
}

fn parse_usage(root: &Value) -> (i64, i64) {
    let mut input = 0i64;
    let mut output = 0i64;
    let Some(data) = root.get("data").and_then(|v| v.as_array()) else {
        return (input, output);
    };
    for bucket in data {
        let Some(results) = bucket.get("results").and_then(|v| v.as_array()) else {
            continue;
        };
        for result in results {
            if let Some(v) = result.get("input_tokens").and_then(|v| v.as_i64()) {
                input += v;
            }
            if let Some(v) = result.get("output_tokens").and_then(|v| v.as_i64()) {
                output += v;
            }
            if let Some(v) = result
                .get("cache_read_input_tokens")
                .and_then(|v| v.as_i64())
            {
                input += v;
            }
        }
    }
    (input, output)
}
