use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::usage::types::{classify_model, ModelProvider, ProviderUsageSnapshot, UsageSnapshot};

pub fn parse_current_period_usage(root: &Value) -> Option<UsageSnapshot> {
    let plan_usage = root.get("planUsage")?;
    let limit = plan_usage.get("limit")?.as_i64()?;
    if limit <= 0 {
        return None;
    }

    let mut percent = get_finite_percent(plan_usage, "totalPercentUsed");
    if percent.is_none() {
        let included_spend = plan_usage
            .get("includedSpend")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        percent = Some(if limit > 0 {
            included_spend as f64 * 100.0 / limit as f64
        } else {
            0.0
        });
    }
    let percent = percent?;

    let remaining = plan_usage
        .get("remaining")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| {
            let included = plan_usage
                .get("includedSpend")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            (limit - included).max(0)
        });

    let auto_percent =
        get_finite_percent(plan_usage, "autoPercentUsed").map(|p| p.clamp(0.0, 100.0));
    let api_percent = get_finite_percent(plan_usage, "apiPercentUsed").map(|p| p.clamp(0.0, 100.0));

    let mut snap = UsageSnapshot {
        percent_used: percent.clamp(0.0, 100.0),
        remaining_label: format!("${:.2} left", remaining as f64 / 100.0),
        auto_percent_used: auto_percent,
        api_percent_used: api_percent,
        has_breakdown: false,
        plan_limit_cents: Some(limit),
        billing_cycle_start_ms: try_parse_timestamp_ms(root, "billingCycleStart"),
        billing_cycle_end_ms: try_parse_timestamp_ms(root, "billingCycleEnd"),
        open_ai: ProviderUsageSnapshot::unavailable(None),
        claude: ProviderUsageSnapshot::unavailable(None),
        gemini: ProviderUsageSnapshot::unavailable(None),
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
    };
    snap.recompute_flags();
    Some(snap)
}

pub fn parse_aggregated_usage(root: &Value) -> Option<Vec<(String, f64)>> {
    let aggregations = root.get("aggregations")?.as_array()?;
    let mut results = Vec::new();
    for item in aggregations {
        let model_name = item.get("modelIntent")?.as_str()?;
        if model_name.trim().is_empty() {
            continue;
        }
        let cents = read_finite_double(item.get("totalCents")?)?;
        if cents <= 0.0 {
            continue;
        }
        results.push((model_name.to_string(), cents));
    }
    Some(results)
}

pub fn enrich_with_breakdown(
    mut snapshot: UsageSnapshot,
    aggregations: &[(String, f64)],
) -> UsageSnapshot {
    let limit = snapshot.plan_limit_cents.unwrap_or(0);
    if limit <= 0 {
        return snapshot;
    }
    let mut spend = [(ModelProvider::OpenAi, 0.0), (ModelProvider::Gemini, 0.0)];
    for (model, cents) in aggregations {
        match classify_model(model) {
            ModelProvider::OpenAi => spend[0].1 += cents,
            ModelProvider::Gemini => spend[1].1 += cents,
            ModelProvider::Unknown => {}
        }
    }
    snapshot.open_ai = ProviderUsageSnapshot::from_spend(spend[0].1, limit);
    snapshot.gemini = ProviderUsageSnapshot::from_spend(spend[1].1, limit);
    snapshot.recompute_flags();
    snapshot
}

pub fn try_parse_timestamp_ms(root: &Value, property: &str) -> Option<i64> {
    root.get(property)
        .and_then(|el| try_parse_timestamp_element(el))
}

pub fn try_parse_timestamp_element(element: &Value) -> Option<i64> {
    match element {
        Value::Number(n) => {
            if let Some(ms) = n.as_i64() {
                Some(normalize_unix_timestamp_ms(ms))
            } else if let Some(f) = n.as_f64() {
                if f.is_finite() && f > 0.0 {
                    Some(normalize_unix_timestamp_ms(f as i64))
                } else {
                    None
                }
            } else {
                None
            }
        }
        Value::String(text) => {
            if let Ok(ms) = text.parse::<i64>() {
                return Some(normalize_unix_timestamp_ms(ms));
            }
            DateTime::parse_from_rfc3339(text)
                .ok()
                .map(|dt| dt.with_timezone(&Utc).timestamp_millis())
        }
        _ => None,
    }
}

fn normalize_unix_timestamp_ms(value: i64) -> i64 {
    if value > 1_000_000_000_000 {
        value
    } else {
        value * 1000
    }
}

fn get_finite_percent(parent: &Value, property: &str) -> Option<f64> {
    parent
        .get(property)
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite())
}

fn read_finite_double(element: &Value) -> Option<f64> {
    match element {
        Value::Number(n) => n.as_f64().filter(|v| v.is_finite()),
        Value::String(s) => s.parse::<f64>().ok().filter(|v| v.is_finite()),
        _ => None,
    }
}

pub fn is_jwt_expired(jwt: &str) -> bool {
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() < 2 {
        return true;
    }
    let mut payload = parts[1].to_string();
    let padding = payload.len() % 4;
    if padding > 0 {
        payload.push_str(&"=".repeat(4 - padding));
    }
    let decoded = payload.replace('-', "+").replace('_', "/");
    let bytes = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, decoded) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let json: Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let Some(exp) = json.get("exp").and_then(|v| v.as_i64()) else {
        return false;
    };
    let exp = DateTime::<Utc>::from_timestamp(exp, 0);
    exp.map(|e| e <= Utc::now() + chrono::Duration::minutes(1))
        .unwrap_or(false)
}
