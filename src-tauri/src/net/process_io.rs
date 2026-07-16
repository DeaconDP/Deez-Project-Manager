use crate::types::NetProcessMetrics;
use std::collections::HashMap;
use sysinfo::System;

/// Real process network pressure via established TCP ownership counts (Windows).
/// Byte rates are host-level only elsewhere — Windows does not expose cheap per-PID
/// network byte counters without ETW, so we never invent them.
pub struct NetProcessCollector;

impl NetProcessCollector {
    pub fn new() -> Self {
        Self
    }

    pub fn sample(&mut self, sys: &System, top_n: usize) -> Vec<NetProcessMetrics> {
        let Some(counts) = tcp_connection_counts() else {
            return Vec::new();
        };

        let mut rows: Vec<NetProcessMetrics> = counts
            .into_iter()
            .map(|(pid, connection_count)| {
                let name = sys
                    .process(sysinfo::Pid::from_u32(pid))
                    .map(|p| p.name().to_string_lossy().to_string())
                    .unwrap_or_else(|| format!("pid-{pid}"));
                NetProcessMetrics {
                    pid,
                    name,
                    connection_count,
                    read_bps: 0.0,
                    write_bps: 0.0,
                }
            })
            .collect();

        rows.sort_by(|a, b| b.connection_count.cmp(&a.connection_count));
        rows.truncate(top_n);
        rows
    }
}

#[cfg(windows)]
fn tcp_connection_counts() -> Option<HashMap<u32, u32>> {
    let script = r#"
Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
  Group-Object OwningProcess |
  ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }
"#;
    let output = crate::win_cmd::command("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            script,
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let mut map = HashMap::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if let Some((pid, count)) = line.trim().split_once('=') {
            if let (Ok(p), Ok(c)) = (pid.parse::<u32>(), count.parse::<u32>()) {
                map.insert(p, c);
            }
        }
    }
    if map.is_empty() {
        None
    } else {
        Some(map)
    }
}

#[cfg(not(windows))]
fn tcp_connection_counts() -> Option<HashMap<u32, u32>> {
    None
}
