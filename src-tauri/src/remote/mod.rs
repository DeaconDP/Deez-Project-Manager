//! Tailscale-bound remote HTTP for phone / PWA access.
//! Poteto: MagicDNS URL into this live node — not a cloud sync product.

mod detect;
mod server;
mod settings;

pub use detect::{detect_tailscale, TailscaleInfo};
pub use server::{RemoteHandle, RemoteServerConfig, RemoteStatus};
pub use settings::{load_settings, save_settings, RemoteSettings, DEFAULT_REMOTE_PORT};

use crate::scheduler::SamplerState;
use crate::usage::FuelState;
use qrcode::render::svg;
use qrcode::QrCode;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub settings: RemoteSettings,
    pub status: RemoteStatus,
    pub tailscale: TailscaleInfo,
    pub url: Option<String>,
    pub static_dir: Option<String>,
}

fn resolve_static_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(override_dir) = std::env::var("DEEZ_REMOTE_STATIC") {
        let p = PathBuf::from(override_dir);
        if p.join("index.html").is_file() {
            return Some(p);
        }
    }

    if let Ok(resource) = app.path().resource_dir() {
        for candidate in [resource.join("dist"), resource.clone()] {
            if candidate.join("index.html").is_file() {
                return Some(candidate);
            }
        }
    }

    let manifest_dist = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
    if let Ok(canon) = manifest_dist.canonicalize() {
        if canon.join("index.html").is_file() {
            return Some(canon);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            for candidate in [parent.join("dist"), parent.join("../dist")] {
                if candidate.join("index.html").is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

fn build_url(tailscale: &TailscaleInfo, port: u16) -> Option<String> {
    let host = tailscale
        .dns_name
        .as_deref()
        .map(|d| d.trim_end_matches('.').to_string())
        .filter(|d| !d.is_empty())
        .or_else(|| tailscale.ipv4.clone());
    host.map(|h| format!("http://{h}:{port}"))
}

fn encode_qr_svg(url: &str) -> Result<String, String> {
    let code =
        QrCode::new(url.as_bytes()).map_err(|e| format!("REMOTE-011: QR encode failed: {e}"))?;
    Ok(code
        .render::<svg::Color>()
        .min_dimensions(180, 180)
        .dark_color(svg::Color("#0a0a0a"))
        .light_color(svg::Color("#f2f2f2"))
        .build())
}

fn start_or_restart(
    app: &AppHandle,
    remote: &RemoteHandle,
    settings: &RemoteSettings,
    sampler: Arc<SamplerState>,
    fuel: FuelState,
) -> Result<(), String> {
    let tailscale = detect_tailscale();
    let bind_ip = tailscale.ipv4.clone().ok_or_else(|| {
        "REMOTE-020: Tailscale IPv4 not found — install Tailscale and join your tailnet"
            .to_string()
    })?;
    let static_dir = resolve_static_dir(app);
    remote.start(RemoteServerConfig {
        app: app.clone(),
        bind_ip,
        port: settings.port,
        token: settings.token.clone().filter(|t| !t.trim().is_empty()),
        static_dir,
        sampler,
        fuel,
    })
}

/// Auto-start remote HTTP when settings say enabled.
pub fn maybe_autostart(
    app: &AppHandle,
    remote: &RemoteHandle,
    sampler: Arc<SamplerState>,
    fuel: FuelState,
) {
    let Ok(settings) = load_settings(app) else {
        return;
    };
    if !settings.enabled {
        return;
    }
    if let Err(e) = start_or_restart(app, remote, &settings, sampler, fuel) {
        eprintln!("Deez remote autostart failed: {e}");
        remote.set_last_error(e);
    }
}

#[tauri::command]
pub fn remote_get_info(
    app: AppHandle,
    remote: State<'_, RemoteHandle>,
) -> Result<RemoteInfo, String> {
    let settings = load_settings(&app)?;
    let status = remote.status();
    let tailscale = detect_tailscale();
    let url = build_url(&tailscale, settings.port);
    let static_dir = resolve_static_dir(&app).map(|p| p.display().to_string());
    Ok(RemoteInfo {
        settings,
        status,
        tailscale,
        url,
        static_dir,
    })
}

#[tauri::command]
pub fn remote_save_settings(
    app: AppHandle,
    remote: State<'_, RemoteHandle>,
    monitor: State<'_, crate::MonitorState>,
    fuel: State<'_, FuelState>,
    settings: RemoteSettings,
) -> Result<RemoteInfo, String> {
    let mut next = settings;
    if next.port == 0 {
        next.port = DEFAULT_REMOTE_PORT;
    }
    next.peers = next
        .peers
        .into_iter()
        .map(|p| p.trim().trim_end_matches('/').to_string())
        .filter(|p| !p.is_empty())
        .collect();
    if let Some(t) = next.token.as_mut() {
        let trimmed = t.trim().to_string();
        if trimmed.is_empty() {
            next.token = None;
        } else {
            *t = trimmed;
        }
    }
    save_settings(&app, &next)?;

    if next.enabled {
        start_or_restart(
            &app,
            &remote,
            &next,
            monitor.sampler.clone(),
            (*fuel).clone(),
        )?;
    } else {
        remote.stop();
    }

    remote_get_info(app, remote)
}

#[tauri::command]
pub fn remote_qr_svg(app: AppHandle) -> Result<String, String> {
    let settings = load_settings(&app)?;
    let tailscale = detect_tailscale();
    let url = build_url(&tailscale, settings.port)
        .ok_or_else(|| "REMOTE-010: no Tailscale address to encode".to_string())?;
    encode_qr_svg(&url)
}
