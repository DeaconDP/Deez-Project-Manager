use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MetricsSnapshot {
    pub ts: String,
    pub cpu: CpuMetrics,
    pub memory: MemoryMetrics,
    pub disks: Vec<DiskMetrics>,
    pub gpus: Vec<GpuMetrics>,
    pub temps: TempMetrics,
    pub processes: Vec<ProcessMetrics>,
    pub wifi: Option<WifiMetrics>,
    pub host_net: HostNetMetrics,
    pub net_processes: Vec<NetProcessMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CpuMetrics {
    pub usage_percent: f32,
    pub core_count: usize,
    pub brand: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryMetrics {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub usage_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiskMetrics {
    pub name: String,
    pub mount: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub usage_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GpuMetrics {
    pub name: String,
    pub usage_percent: Option<f32>,
    pub memory_used_bytes: Option<u64>,
    pub memory_total_bytes: Option<u64>,
    pub temp_c: Option<f32>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TempMetrics {
    pub cpu_c: Option<f32>,
    pub gpu_c: Option<f32>,
    pub zones: Vec<TempZone>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TempZone {
    pub name: String,
    pub temp_c: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub disk_read_bps: Option<f64>,
    pub disk_write_bps: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WifiMetrics {
    pub ssid: String,
    pub signal_percent: Option<u32>,
    pub radio_type: Option<String>,
    pub channel: Option<u32>,
    pub receive_rate_mbps: Option<f64>,
    pub transmit_rate_mbps: Option<f64>,
    pub state: String,
    pub interface: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostNetMetrics {
    pub recv_bps: f64,
    pub sent_bps: f64,
    pub total_recv_bytes: u64,
    pub total_sent_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetProcessMetrics {
    pub pid: u32,
    pub name: String,
    pub connection_count: u32,
    pub read_bps: f64,
    pub write_bps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LatencyResult {
    pub probe: String,
    pub url: String,
    pub ok: bool,
    pub latency_ms: Option<f64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpikeEvent {
    pub id: i64,
    pub ts: String,
    pub kind: String,
    pub source: String,
    pub value: f64,
    pub baseline: Option<f64>,
    pub note: Option<String>,
}
