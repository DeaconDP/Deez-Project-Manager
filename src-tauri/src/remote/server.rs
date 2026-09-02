use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tower_http::services::{ServeDir, ServeFile};

use crate::models::ProjectStore;
use crate::remote::detect::{detect_tailscale, TailscaleInfo};
use crate::remote::settings::{load_settings, RemoteSettings};
use crate::scheduler::SamplerState;
use crate::store;
use crate::types::MetricsSnapshot;
use crate::usage::settings as fuel_settings;
use crate::usage::types::{FuelSettings, RefreshResult};
use crate::usage::FuelState;

#[derive(Clone)]
struct AppState {
    app: AppHandle,
    sampler: Arc<SamplerState>,
    fuel: FuelState,
    token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    pub running: bool,
    pub bind: Option<String>,
    pub last_error: Option<String>,
}

pub struct RemoteServerConfig {
    pub app: AppHandle,
    pub bind_ip: String,
    pub port: u16,
    pub token: Option<String>,
    pub static_dir: Option<PathBuf>,
    pub sampler: Arc<SamplerState>,
    pub fuel: FuelState,
}

pub struct RemoteHandle {
    inner: Mutex<RemoteInner>,
}

struct RemoteInner {
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    status: RemoteStatus,
}

impl Default for RemoteHandle {
    fn default() -> Self {
        Self::new()
    }
}

impl RemoteHandle {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(RemoteInner {
                shutdown: None,
                status: RemoteStatus {
                    running: false,
                    bind: None,
                    last_error: None,
                },
            }),
        }
    }

    pub fn status(&self) -> RemoteStatus {
        self.inner
            .lock()
            .map(|g| g.status.clone())
            .unwrap_or(RemoteStatus {
                running: false,
                bind: None,
                last_error: Some("REMOTE-030: status lock poisoned".into()),
            })
    }

    pub fn set_last_error(&self, err: String) {
        if let Ok(mut g) = self.inner.lock() {
            g.status.last_error = Some(err);
            g.status.running = false;
        }
    }

    pub fn stop(&self) {
        if let Ok(mut g) = self.inner.lock() {
            if let Some(tx) = g.shutdown.take() {
                let _ = tx.send(());
            }
            g.status.running = false;
            g.status.bind = None;
            g.status.last_error = None;
        }
    }

    pub fn start(&self, cfg: RemoteServerConfig) -> Result<(), String> {
        self.stop();

        let ip: Ipv4Addr = cfg
            .bind_ip
            .parse()
            .map_err(|e| format!("REMOTE-031: bad bind IP {}: {e}", cfg.bind_ip))?;
        let octets = ip.octets();
        if !(octets[0] == 100 && (64..128).contains(&octets[1])) {
            return Err(format!(
                "REMOTE-032: refusing bind outside Tailscale CGNAT: {}",
                cfg.bind_ip
            ));
        }

        let addr = SocketAddr::new(IpAddr::V4(ip), cfg.port);
        let state = AppState {
            app: cfg.app,
            sampler: cfg.sampler,
            fuel: cfg.fuel,
            token: cfg.token,
        };
        let static_dir = cfg.static_dir;

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();

        {
            let mut g = self
                .inner
                .lock()
                .map_err(|_| "REMOTE-033: remote lock poisoned".to_string())?;
            g.shutdown = Some(shutdown_tx);
            g.status = RemoteStatus {
                running: false,
                bind: Some(addr.to_string()),
                last_error: None,
            };
        }

        tauri::async_runtime::spawn(async move {
            let router = build_router(state, static_dir);
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => {
                    let _ = ready_tx.send(Ok(()));
                    l
                }
                Err(e) => {
                    let msg = format!("REMOTE-034: bind {addr} failed: {e}");
                    let _ = ready_tx.send(Err(msg.clone()));
                    eprintln!("{msg}");
                    return;
                }
            };

            let server = axum::serve(listener, router).with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });

            if let Err(e) = server.await {
                eprintln!("REMOTE-035: server exited with error: {e}");
            }
        });

        match ready_rx.recv_timeout(std::time::Duration::from_secs(3)) {
            Ok(Ok(())) => {
                if let Ok(mut g) = self.inner.lock() {
                    g.status.running = true;
                    g.status.bind = Some(addr.to_string());
                    g.status.last_error = None;
                }
                Ok(())
            }
            Ok(Err(e)) => {
                self.set_last_error(e.clone());
                Err(e)
            }
            Err(_) => {
                if let Ok(mut g) = self.inner.lock() {
                    g.status.running = true;
                    g.status.bind = Some(addr.to_string());
                }
                Ok(())
            }
        }
    }
}

fn build_router(state: AppState, static_dir: Option<PathBuf>) -> Router {
    let api = Router::new()
        .route("/health", get(health))
        .route("/info", get(api_info))
        .route("/projects", get(get_projects).put(put_projects))
        .route("/metrics", get(get_metrics))
        .route("/fuel", get(get_fuel))
        .route("/fuel/settings", get(get_fuel_settings_route))
        .layer(middleware::from_fn_with_state(state.clone(), token_guard));

    let mut router = Router::new().nest("/api", api).with_state(state);

    if let Some(dir) = static_dir {
        let index = dir.join("index.html");
        let serve = ServeDir::new(dir).not_found_service(ServeFile::new(index));
        router = router.fallback_service(serve);
    } else {
        router = router.fallback(get(missing_static));
    }

    router
}

async fn token_guard(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let Some(expected) = state.token.as_ref().filter(|t| !t.is_empty()) else {
        return Ok(next.run(req).await);
    };
    if token_matches(req.headers(), expected) {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

fn token_matches(headers: &HeaderMap, expected: &str) -> bool {
    if let Some(v) = headers.get("x-deez-token").and_then(|v| v.to_str().ok()) {
        if v == expected {
            return true;
        }
    }
    if let Some(v) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        if let Some(rest) = v.strip_prefix("Bearer ") {
            if rest == expected {
                return true;
            }
        }
    }
    false
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "service": "deez-remote" }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiInfoBody {
    settings: RemoteSettings,
    tailscale: TailscaleInfo,
    node: String,
}

async fn api_info(
    State(state): State<AppState>,
) -> Result<Json<ApiInfoBody>, (StatusCode, String)> {
    let settings =
        load_settings(&state.app).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let tailscale = detect_tailscale();
    let node = tailscale
        .dns_name
        .clone()
        .or_else(|| tailscale.ipv4.clone())
        .unwrap_or_else(|| "deez-node".into());
    Ok(Json(ApiInfoBody {
        settings,
        tailscale,
        node,
    }))
}

async fn get_projects(
    State(state): State<AppState>,
) -> Result<Json<ProjectStore>, (StatusCode, String)> {
    store::load_store(&state.app)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

async fn put_projects(
    State(state): State<AppState>,
    Json(body): Json<ProjectStore>,
) -> Result<StatusCode, (StatusCode, String)> {
    store::save_store(&state.app, &body).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_metrics(State(state): State<AppState>) -> Json<MetricsSnapshot> {
    Json(state.sampler.snapshot())
}

async fn get_fuel(State(state): State<AppState>) -> Json<RefreshResult> {
    Json(state.fuel.latest())
}

async fn get_fuel_settings_route() -> Json<FuelSettings> {
    Json(fuel_settings::load())
}

async fn missing_static() -> Html<&'static str> {
    Html(
        r#"<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Deez remote</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0c;color:#e8e8e8;padding:2rem;max-width:36rem;margin:0 auto;line-height:1.45}
code{background:#1a1a1a;padding:.1rem .35rem;border-radius:4px}</style></head>
<body>
<h1>Deez remote API is up</h1>
<p>Static UI not found. On the host, run <code>npm run build</code> (or a release build) so <code>dist/</code> exists, then toggle Remote access off/on.</p>
<p>API: <code>/api/health</code> · <code>/api/projects</code> · <code>/api/metrics</code></p>
</body></html>"#,
    )
}
