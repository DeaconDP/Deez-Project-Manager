use crate::metrics::{sample_temps, GpuCollector, SystemCollector};
use crate::net::sample_wifi;
use crate::spikes::SpikeLogger;
use crate::types::{LatencyResult, MetricsSnapshot};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub struct SamplerState {
    pub latest: Mutex<MetricsSnapshot>,
    pub spikes: SpikeLogger,
    idle: AtomicBool,
    inner: Mutex<SamplerInner>,
}

struct SamplerInner {
    system: SystemCollector,
    gpu: GpuCollector,
    last_disk: Instant,
    last_gpu: Instant,
    last_net_proc: Instant,
    last_temps: Instant,
    last_wifi: Instant,
    last_proc: Instant,
}

impl SamplerState {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            latest: Mutex::new(MetricsSnapshot::default()),
            spikes: SpikeLogger::open()?,
            idle: AtomicBool::new(false),
            inner: Mutex::new(SamplerInner {
                system: SystemCollector::new(),
                gpu: GpuCollector::new(),
                last_disk: Instant::now() - Duration::from_secs(10),
                last_gpu: Instant::now() - Duration::from_secs(10),
                last_net_proc: Instant::now() - Duration::from_secs(10),
                last_temps: Instant::now() - Duration::from_secs(10),
                last_wifi: Instant::now() - Duration::from_secs(10),
                last_proc: Instant::now() - Duration::from_secs(10),
            }),
        })
    }

    pub fn snapshot(&self) -> MetricsSnapshot {
        self.latest.lock().map(|g| g.clone()).unwrap_or_default()
    }

    pub fn set_idle(&self, idle: bool) {
        self.idle.store(idle, Ordering::Relaxed);
    }

    pub fn is_idle(&self) -> bool {
        self.idle.load(Ordering::Relaxed)
    }

    pub fn tick_once(&self) -> (MetricsSnapshot, Vec<crate::types::SpikeEvent>) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();

        inner.system.refresh_fast();
        let cpu = inner.system.cpu();
        let memory = inner.system.memory();
        let host_net = inner.system.host_net();

        let wifi = if now.duration_since(inner.last_wifi) >= Duration::from_secs(5) {
            inner.last_wifi = now;
            sample_wifi()
        } else {
            self.latest
                .lock()
                .map(|s| s.wifi.clone())
                .unwrap_or(None)
        };

        if now.duration_since(inner.last_disk) >= Duration::from_secs(3) {
            inner.system.refresh_disks();
            inner.last_disk = now;
        }
        let disks = inner.system.disks();

        // Active: sample processes every 2s; idle ticks are already sparse (~8s).
        let processes = if now.duration_since(inner.last_proc) >= Duration::from_secs(2) {
            inner.last_proc = now;
            inner.system.sample_processes(25)
        } else {
            self.latest
                .lock()
                .map(|s| s.processes.clone())
                .unwrap_or_default()
        };

        let gpus = if now.duration_since(inner.last_gpu) >= Duration::from_secs(5) {
            inner.last_gpu = now;
            inner.gpu.sample(Duration::from_secs(5))
        } else {
            inner.gpu.last()
        };

        let gpu_c = gpus.iter().find_map(|g| g.temp_c);
        let temps = if now.duration_since(inner.last_temps) >= Duration::from_secs(5) {
            inner.last_temps = now;
            sample_temps(gpu_c)
        } else {
            let mut t = self
                .latest
                .lock()
                .map(|s| s.temps.clone())
                .unwrap_or_default();
            t.gpu_c = gpu_c;
            t
        };

        let net_processes = if now.duration_since(inner.last_net_proc) >= Duration::from_secs(3) {
            inner.last_net_proc = now;
            inner.system.sample_net_processes(15)
        } else {
            self.latest
                .lock()
                .map(|s| s.net_processes.clone())
                .unwrap_or_default()
        };

        let snap = MetricsSnapshot {
            ts: chrono::Utc::now().to_rfc3339(),
            cpu,
            memory,
            disks,
            gpus,
            temps,
            processes,
            wifi,
            host_net,
            net_processes,
        };

        let events = self.spikes.evaluate(&snap);
        if let Ok(mut g) = self.latest.lock() {
            *g = snap.clone();
        }
        (snap, events)
    }
}

pub fn start_scheduler(app: AppHandle, state: Arc<SamplerState>) {
    std::thread::spawn(move || {
        {
            let _ = state.tick_once();
            std::thread::sleep(Duration::from_millis(400));
        }
        loop {
            let (snap, events) = state.tick_once();
            let _ = app.emit("metrics://snapshot", &snap);
            for ev in events {
                let _ = app.emit("spike://logged", &ev);
            }
            let sleep = if state.is_idle() {
                Duration::from_secs(8)
            } else {
                Duration::from_secs(1)
            };
            std::thread::sleep(sleep);
        }
    });
}

pub fn run_latency_suite() -> Vec<LatencyResult> {
    let probes = [
        ("Google 204", "http://clients3.google.com/generate_204"),
        ("Cloudflare", "https://www.cloudflare.com/cdn-cgi/trace"),
        (
            "Microsoft NCSI",
            "http://www.msftconnecttest.com/connecttest.txt",
        ),
    ];
    probes
        .into_iter()
        .map(|(name, url)| probe_once(name, url))
        .collect()
}

fn probe_once(name: &str, url: &str) -> LatencyResult {
    let start = Instant::now();
    let result = crate::win_cmd::command("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &format!(
                "$ProgressPreference='SilentlyContinue'; try {{ $r = Invoke-WebRequest -Uri '{url}' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) {{ 'OK' }} else {{ 'ERR:'+$r.StatusCode }} }} catch {{ 'ERR:'+$_.Exception.Message }}"
            ),
        ])
        .output();

    match result {
        Ok(out) if out.status.success() => {
            let body = String::from_utf8_lossy(&out.stdout);
            let trimmed = body.trim();
            if trimmed.starts_with("OK") {
                LatencyResult {
                    probe: name.into(),
                    url: url.into(),
                    ok: true,
                    latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
                    error: None,
                }
            } else {
                LatencyResult {
                    probe: name.into(),
                    url: url.into(),
                    ok: false,
                    latency_ms: None,
                    error: Some(trimmed.trim_start_matches("ERR:").to_string()),
                }
            }
        }
        Ok(out) => LatencyResult {
            probe: name.into(),
            url: url.into(),
            ok: false,
            latency_ms: None,
            error: Some(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        },
        Err(e) => LatencyResult {
            probe: name.into(),
            url: url.into(),
            ok: false,
            latency_ms: None,
            error: Some(e.to_string()),
        },
    }
}
