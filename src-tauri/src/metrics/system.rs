use crate::metrics::process::ProcessCollector;
use crate::net::process_io::NetProcessCollector;
use crate::types::{
    CpuMetrics, DiskMetrics, HostNetMetrics, MemoryMetrics, NetProcessMetrics, ProcessMetrics,
};
use std::collections::HashMap;
use std::time::Instant;
use sysinfo::{Disks, Networks, System};

pub struct SystemCollector {
    sys: System,
    disks: Disks,
    networks: Networks,
    prev_net: HashMap<String, (u64, u64)>,
    prev_net_at: Option<Instant>,
    processes: ProcessCollector,
    net_procs: NetProcessCollector,
}

impl SystemCollector {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_all();
        sys.refresh_memory();
        Self {
            sys,
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            prev_net: HashMap::new(),
            prev_net_at: None,
            processes: ProcessCollector::new(),
            net_procs: NetProcessCollector::new(),
        }
    }

    pub fn refresh_fast(&mut self) {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        self.networks.refresh(true);
    }

    pub fn refresh_disks(&mut self) {
        self.disks.refresh(true);
    }

    pub fn cpu(&self) -> CpuMetrics {
        CpuMetrics {
            usage_percent: self.sys.global_cpu_usage(),
            core_count: self.sys.cpus().len(),
            brand: self
                .sys
                .cpus()
                .first()
                .map(|c| c.brand().to_string())
                .unwrap_or_default(),
        }
    }

    pub fn memory(&self) -> MemoryMetrics {
        let total = self.sys.total_memory();
        let used = self.sys.used_memory();
        let usage = if total > 0 {
            (used as f64 / total as f64 * 100.0) as f32
        } else {
            0.0
        };
        MemoryMetrics {
            total_bytes: total,
            used_bytes: used,
            usage_percent: usage,
        }
    }

    pub fn disks(&self) -> Vec<DiskMetrics> {
        self.disks
            .iter()
            .map(|d| {
                let total = d.total_space();
                let available = d.available_space();
                let used = total.saturating_sub(available);
                let usage = if total > 0 {
                    (used as f64 / total as f64 * 100.0) as f32
                } else {
                    0.0
                };
                DiskMetrics {
                    name: d.name().to_string_lossy().to_string(),
                    mount: d.mount_point().to_string_lossy().to_string(),
                    total_bytes: total,
                    available_bytes: available,
                    usage_percent: usage,
                }
            })
            .collect()
    }

    pub fn host_net(&mut self) -> HostNetMetrics {
        let now = Instant::now();
        let mut total_recv = 0u64;
        let mut total_sent = 0u64;
        let mut recv_bps = 0.0;
        let mut sent_bps = 0.0;

        let dt = self
            .prev_net_at
            .map(|t| now.duration_since(t).as_secs_f64())
            .unwrap_or(0.0);

        for (name, data) in self.networks.iter() {
            let recv = data.total_received();
            let sent = data.total_transmitted();
            total_recv = total_recv.saturating_add(recv);
            total_sent = total_sent.saturating_add(sent);

            if dt > 0.05 {
                if let Some((pr, ps)) = self.prev_net.get(name) {
                    recv_bps += (recv.saturating_sub(*pr)) as f64 / dt;
                    sent_bps += (sent.saturating_sub(*ps)) as f64 / dt;
                }
            }
            self.prev_net.insert(name.to_string(), (recv, sent));
        }

        self.prev_net_at = Some(now);

        HostNetMetrics {
            recv_bps,
            sent_bps,
            total_recv_bytes: total_recv,
            total_sent_bytes: total_sent,
        }
    }

    pub fn sample_processes(&mut self, top_n: usize) -> Vec<ProcessMetrics> {
        let Self { sys, processes, .. } = self;
        processes.sample(sys, top_n)
    }

    pub fn sample_net_processes(&mut self, top_n: usize) -> Vec<NetProcessMetrics> {
        let Self { sys, net_procs, .. } = self;
        net_procs.sample(sys, top_n)
    }
}
