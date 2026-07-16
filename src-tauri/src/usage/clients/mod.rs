use chrono::{Datelike, TimeZone, Utc};
use reqwest::Client;
use serde_json::Value;

pub mod anthropic;
pub mod antigravity;
pub mod claude_pro;
pub mod codex;
pub mod openai_billing;
pub mod opencode;
pub mod openrouter;

pub fn shared_client() -> Client {
    Client::builder()
        .user_agent("Ada-Monitor/0.1")
        .build()
        .unwrap_or_else(|_| Client::new())
}

pub fn read_f64(element: &Value) -> f64 {
    element.as_f64().unwrap_or(0.0)
}

pub fn read_opt_f64(element: &Value) -> Option<f64> {
    match element {
        Value::Null => None,
        Value::Number(n) => n.as_f64(),
        _ => None,
    }
}

pub fn read_string_prop<'a>(element: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|k| element.get(*k).and_then(|v| v.as_str()))
}

pub fn parse_usd_amount(element: &Value) -> f64 {
    match element {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        Value::String(s) => s.parse().unwrap_or(0.0),
        Value::Object(obj) => obj.get("value").map(parse_usd_amount).unwrap_or(0.0),
        _ => 0.0,
    }
}

pub fn calendar_month_unix() -> (i64, i64) {
    let now = Utc::now();
    let start = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .unwrap();
    let (next_year, next_month) = if now.month() == 12 {
        (now.year() + 1, 1)
    } else {
        (now.year(), now.month() + 1)
    };
    let end = Utc
        .with_ymd_and_hms(next_year, next_month, 1, 0, 0, 0)
        .unwrap();
    (start.timestamp(), end.timestamp())
}

pub fn resolve_period_unix(start_ms: Option<i64>, end_ms: Option<i64>) -> (i64, i64) {
    if let (Some(start), Some(end)) = (start_ms, end_ms) {
        (start / 1000, end / 1000)
    } else {
        calendar_month_unix()
    }
}

pub fn resolve_period_iso(start_ms: Option<i64>, end_ms: Option<i64>) -> (String, String) {
    let (start, end) = resolve_period_unix(start_ms, end_ms);
    let fmt = |ts: i64| {
        chrono::DateTime::<Utc>::from_timestamp(ts, 0)
            .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
            .unwrap_or_else(|| "1970-01-01T00:00:00Z".into())
    };
    (fmt(start), fmt(end))
}
