use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::usage::refresh::UsageRefreshService;
use crate::usage::settings;
use crate::usage::types::RefreshResult;

#[derive(Clone)]
pub struct FuelState {
    inner: Arc<Mutex<FuelInner>>,
}

struct FuelInner {
    latest: RefreshResult,
    refresh: UsageRefreshService,
}

impl FuelState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(FuelInner {
                latest: RefreshResult {
                    snapshot: crate::usage::types::UsageSnapshot::error("Not refreshed"),
                    refreshed_at: chrono::Utc::now().to_rfc3339(),
                    cursor_fetch_succeeded: false,
                    cursor_error: Some("Not refreshed".into()),
                    provider_statuses: std::collections::HashMap::new(),
                },
                refresh: UsageRefreshService::new(),
            })),
        }
    }

    pub fn latest(&self) -> RefreshResult {
        self.inner
            .lock()
            .map(|g| g.latest.clone())
            .unwrap_or_else(|e| e.into_inner().latest.clone())
    }

    pub async fn refresh_now(&self) -> Result<RefreshResult, String> {
        let mut fuel_settings = settings::load();
        let result = {
            let refresh = {
                let guard = self.inner.lock().map_err(|e| e.to_string())?;
                guard.refresh.clone_service()
            };
            refresh.refresh(&mut fuel_settings).await
        };
        settings::save(&fuel_settings)?;
        if let Ok(mut guard) = self.inner.lock() {
            guard.latest = result.clone();
        }
        Ok(result)
    }
}

pub fn start_fuel_scheduler(app: AppHandle, state: FuelState) {
    tauri::async_runtime::spawn(async move {
        loop {
            let interval_minutes = settings::load().refresh_interval_minutes.max(1);
            match state.refresh_now().await {
                Ok(result) => {
                    let _ = app.emit("fuel://snapshot", &result);
                }
                Err(e) => {
                    eprintln!("Ada-Monitor fuel refresh error: {e}");
                }
            }
            tokio::time::sleep(Duration::from_secs(u64::from(interval_minutes) * 60)).await;
        }
    });
}
