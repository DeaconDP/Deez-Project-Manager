use crate::types::GpuMetrics;
use std::time::{Duration, Instant};

pub struct GpuCollector {
    last: Vec<GpuMetrics>,
    last_at: Option<Instant>,
}

impl GpuCollector {
    pub fn new() -> Self {
        Self {
            last: Vec::new(),
            last_at: None,
        }
    }

    pub fn last(&self) -> Vec<GpuMetrics> {
        self.last.clone()
    }

    /// Refresh nvidia-smi at most every `min_interval`.
    pub fn sample(&mut self, min_interval: Duration) -> Vec<GpuMetrics> {
        let now = Instant::now();
        if let Some(t) = self.last_at {
            if now.duration_since(t) < min_interval {
                return self.last.clone();
            }
        }
        let gpus = sample_nvidia_smi();
        if !gpus.is_empty() {
            self.last = gpus.clone();
        }
        self.last_at = Some(now);
        self.last.clone()
    }
}

fn sample_nvidia_smi() -> Vec<GpuMetrics> {
    let output = crate::win_cmd::command("nvidia-smi")
        .args([
            "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok();

    let Some(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(parse_nvidia_line)
        .collect()
}

fn parse_nvidia_line(line: &str) -> Option<GpuMetrics> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    if parts.len() < 5 {
        return None;
    }

    Some(GpuMetrics {
        name: parts[0].to_string(),
        usage_percent: parts[1].parse().ok(),
        memory_used_bytes: parts[2]
            .parse::<f64>()
            .ok()
            .map(|mib| (mib * 1024.0 * 1024.0) as u64),
        memory_total_bytes: parts[3]
            .parse::<f64>()
            .ok()
            .map(|mib| (mib * 1024.0 * 1024.0) as u64),
        temp_c: parts[4].parse().ok(),
        source: "nvidia-smi".into(),
    })
}
