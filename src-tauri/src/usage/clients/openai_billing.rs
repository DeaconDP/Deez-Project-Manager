use reqwest::Client;
use serde_json::Value;

use crate::usage::clients::{parse_usd_amount, resolve_period_unix, shared_client};
use crate::usage::credentials;
use crate::usage::types::{DirectProviderSnapshot, ProviderBillingSettings};

pub struct OpenAiBillingClient {
    http: Client,
}

impl OpenAiBillingClient {
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
            _ => return DirectProviderSnapshot::unavailable(Some("API key not set")),
        };
        let budget = settings
            .monthly_budget_usd
            .filter(|b| *b > 0.0)
            .map(|b| b as f64);
        let (start_unix, end_unix) = resolve_period_unix(cycle_start_ms, cycle_end_ms);

        if let Ok(grants) = self
            .fetch_credit_grants(&api_key, settings.organization_id.as_deref())
            .await
        {
            settings.last_connection_status = Some("Connected".into());
            return DirectProviderSnapshot::from_credit_grants(grants.0, grants.1, grants.2, None);
        }

        match self
            .fetch_costs_and_usage(
                &api_key,
                settings.organization_id.as_deref(),
                start_unix,
                end_unix,
            )
            .await
        {
            Ok((spend, input, output)) => {
                settings.last_connection_status = Some("Connected".into());
                DirectProviderSnapshot::from_billing(spend, budget, input, output, None)
            }
            Err(msg) => {
                settings.last_connection_status = Some(msg.clone());
                DirectProviderSnapshot::unavailable(Some(&msg))
            }
        }
    }

    pub async fn test_connection(&self, api_key: &str, organization_id: Option<&str>) -> String {
        if api_key.trim().is_empty() {
            return "API key required".into();
        }
        if self
            .fetch_credit_grants(api_key, organization_id)
            .await
            .is_ok()
        {
            return "Connected".into();
        }
        let (start, _) = resolve_period_unix(None, None);
        match self
            .fetch_costs(api_key, organization_id, start, start + 86400)
            .await
        {
            Ok(_) => "Connected".into(),
            Err(e) => e,
        }
    }

    async fn fetch_credit_grants(
        &self,
        api_key: &str,
        org: Option<&str>,
    ) -> Result<(f64, f64, f64), String> {
        let resp = self
            .authorized_get(
                "https://api.openai.com/v1/dashboard/billing/credit_grants",
                api_key,
                org,
            )
            .await?;
        if !resp.status().is_success() {
            return Err(format!("Grants request failed ({})", resp.status()));
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        parse_credit_grants(&root).ok_or_else(|| "No credit grants".into())
    }

    async fn fetch_costs_and_usage(
        &self,
        api_key: &str,
        org: Option<&str>,
        start: i64,
        end: i64,
    ) -> Result<(f64, i64, i64), String> {
        let spend = self.fetch_costs(api_key, org, start, end).await?;
        let (input, output) = self.fetch_usage(api_key, org, start, end).await?;
        Ok((spend, input, output))
    }

    async fn fetch_costs(
        &self,
        api_key: &str,
        org: Option<&str>,
        start: i64,
        end: i64,
    ) -> Result<f64, String> {
        let url = format!(
            "https://api.openai.com/v1/organization/costs?start_time={start}&end_time={end}&bucket_width=1d&limit=31"
        );
        let resp = self.authorized_get(&url, api_key, org).await?;
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
        org: Option<&str>,
        start: i64,
        end: i64,
    ) -> Result<(i64, i64), String> {
        let url = format!(
            "https://api.openai.com/v1/organization/usage/completions?start_time={start}&end_time={end}&bucket_width=1d&limit=31"
        );
        let resp = self.authorized_get(&url, api_key, org).await?;
        if !resp.status().is_success() {
            return Err(format!("Usage request failed ({})", resp.status()));
        }
        let root: Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(parse_usage(&root))
    }

    async fn authorized_get(
        &self,
        url: &str,
        api_key: &str,
        org: Option<&str>,
    ) -> Result<reqwest::Response, String> {
        let mut req = self
            .http
            .get(url)
            .header("Authorization", format!("Bearer {api_key}"));
        if let Some(org) = org.filter(|o| !o.is_empty()) {
            req = req.header("OpenAI-Organization", org);
        }
        req.send().await.map_err(|e| e.to_string())
    }
}

impl Default for OpenAiBillingClient {
    fn default() -> Self {
        Self::new()
    }
}

fn parse_credit_grants(root: &Value) -> Option<(f64, f64, f64)> {
    let granted = try_read_usd(root, "total_granted");
    let used = try_read_usd(root, "total_used");
    let remaining = try_read_usd(root, "total_available")
        .or_else(|| try_read_usd(root, "total_paid_available"));
    if granted.is_none() && used.is_none() && remaining.is_none() {
        return None;
    }
    let granted = granted.unwrap_or(0.0);
    let used = used.unwrap_or_else(|| {
        if granted > 0.0 {
            remaining.map(|r| (granted - r).max(0.0)).unwrap_or(0.0)
        } else {
            0.0
        }
    });
    let remaining = remaining.unwrap_or_else(|| (granted - used).max(0.0));
    Some((granted, used, remaining))
}

fn try_read_usd(root: &Value, key: &str) -> Option<f64> {
    root.get(key).map(parse_usd_amount)
}

fn parse_costs(root: &Value) -> f64 {
    let mut total = 0.0;
    let Some(data) = root.get("data").and_then(|v| v.as_array()) else {
        return total;
    };
    for bucket in data {
        let Some(results) = bucket.get("results").and_then(|v| v.as_array()) else {
            continue;
        };
        for result in results {
            if let Some(amount) = result.get("amount") {
                total += parse_usd_amount(amount);
            } else if let Some(cost) = result.get("cost").and_then(|v| v.as_f64()) {
                total += cost;
            }
        }
    }
    total
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
        }
    }
    (input, output)
}
