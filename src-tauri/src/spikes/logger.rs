use crate::types::{MetricsSnapshot, SpikeEvent};
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

const CPU_HIGH: f32 = 85.0;
const CPU_CLEAR: f32 = 70.0;
const RAM_HIGH: f32 = 90.0;
const RAM_CLEAR: f32 = 80.0;
const GPU_HIGH: f32 = 90.0;
const GPU_CLEAR: f32 = 75.0;
const PROC_CPU_HIGH: f32 = 50.0;
const PROC_CPU_CLEAR: f32 = 35.0;
const WIFI_DROP: u32 = 25;
const WIFI_RECOVER: u32 = 40;

pub struct SpikeLogger {
    conn: Mutex<Connection>,
    latched: Mutex<HashMap<String, bool>>,
}

impl SpikeLogger {
    pub fn open() -> Result<Self, String> {
        let dir = data_dir()?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join("spikes.db");
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS spikes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                kind TEXT NOT NULL,
                source TEXT NOT NULL,
                value REAL NOT NULL,
                baseline REAL,
                note TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_spikes_ts ON spikes(ts DESC);",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
            latched: Mutex::new(HashMap::new()),
        })
    }

    pub fn evaluate(&self, snap: &MetricsSnapshot) -> Vec<SpikeEvent> {
        let mut out = Vec::new();
        self.check(
            &mut out,
            "cpu",
            "system",
            snap.cpu.usage_percent as f64,
            CPU_HIGH as f64,
            CPU_CLEAR as f64,
            Some(format!("CPU at {:.0}%", snap.cpu.usage_percent)),
        );
        self.check(
            &mut out,
            "ram",
            "system",
            snap.memory.usage_percent as f64,
            RAM_HIGH as f64,
            RAM_CLEAR as f64,
            Some(format!("RAM at {:.0}%", snap.memory.usage_percent)),
        );
        for (i, gpu) in snap.gpus.iter().enumerate() {
            if let Some(u) = gpu.usage_percent {
                let src = if snap.gpus.len() > 1 {
                    format!("{}:{}", gpu.name, i)
                } else {
                    gpu.name.clone()
                };
                self.check(
                    &mut out,
                    "gpu",
                    &src,
                    u as f64,
                    GPU_HIGH as f64,
                    GPU_CLEAR as f64,
                    Some(format!("GPU at {:.0}%", u)),
                );
            }
        }
        for p in snap.processes.iter().take(8) {
            let key_src = format!("{}:{}", p.name, p.pid);
            self.check(
                &mut out,
                "process_cpu",
                &key_src,
                p.cpu_percent as f64,
                PROC_CPU_HIGH as f64,
                PROC_CPU_CLEAR as f64,
                Some(format!("{} CPU {:.0}%", p.name, p.cpu_percent)),
            );
        }
        if let Some(wifi) = &snap.wifi {
            if let Some(sig) = wifi.signal_percent {
                // Latch when signal drops below WIFI_DROP; clear above WIFI_RECOVER.
                let key = "wifi:signal".to_string();
                let mut latched = self.latched.lock().unwrap_or_else(|e| e.into_inner());
                let was = *latched.get(&key).unwrap_or(&false);
                if !was && sig <= WIFI_DROP {
                    latched.insert(key.clone(), true);
                    drop(latched);
                    if let Some(ev) = self.insert(
                        "wifi_signal",
                        &wifi.ssid,
                        sig as f64,
                        Some(WIFI_RECOVER as f64),
                        Some(format!("Wi‑Fi signal dropped to {sig}% on {}", wifi.ssid)),
                    ) {
                        out.push(ev);
                    }
                } else if was && sig >= WIFI_RECOVER {
                    latched.insert(key, false);
                }
            }
        }
        out
    }

    fn check(
        &self,
        out: &mut Vec<SpikeEvent>,
        kind: &str,
        source: &str,
        value: f64,
        high: f64,
        clear: f64,
        note: Option<String>,
    ) {
        let key = format!("{kind}:{source}");
        let mut latched = self.latched.lock().unwrap_or_else(|e| e.into_inner());
        let was = *latched.get(&key).unwrap_or(&false);
        if !was && value >= high {
            latched.insert(key, true);
            drop(latched);
            if let Some(ev) = self.insert(kind, source, value, Some(high), note) {
                out.push(ev);
            }
        } else if was && value <= clear {
            latched.insert(key, false);
        }
    }

    fn insert(
        &self,
        kind: &str,
        source: &str,
        value: f64,
        baseline: Option<f64>,
        note: Option<String>,
    ) -> Option<SpikeEvent> {
        let ts = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().ok()?;
        conn.execute(
            "INSERT INTO spikes (ts, kind, source, value, baseline, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![ts, kind, source, value, baseline, note],
        )
        .ok()?;
        let id = conn.last_insert_rowid();
        Some(SpikeEvent {
            id,
            ts,
            kind: kind.to_string(),
            source: source.to_string(),
            value,
            baseline,
            note,
        })
    }

    pub fn list(&self, limit: usize) -> Result<Vec<SpikeEvent>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, ts, kind, source, value, baseline, note FROM spikes ORDER BY id DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(SpikeEvent {
                    id: row.get(0)?,
                    ts: row.get(1)?,
                    kind: row.get(2)?,
                    source: row.get(3)?,
                    value: row.get(4)?,
                    baseline: row.get(5)?,
                    note: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn clear(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM spikes", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or_else(|| "No data directory".to_string())?;
    Ok(base.join("Ada-Monitor"))
}
