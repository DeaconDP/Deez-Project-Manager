use crate::types::ProcessMetrics;
use std::collections::HashMap;
use std::time::Instant;
use sysinfo::{Pid, ProcessesToUpdate, System};

pub struct ProcessCollector {
    prev_cpu: HashMap<u32, f32>,
    prev_io: HashMap<u32, (u64, u64, Instant)>,
}

impl ProcessCollector {
    pub fn new() -> Self {
        Self {
            prev_cpu: HashMap::new(),
            prev_io: HashMap::new(),
        }
    }

    pub fn sample(&mut self, sys: &mut System, top_n: usize) -> Vec<ProcessMetrics> {
        sys.refresh_processes(ProcessesToUpdate::All, true);

        let now = Instant::now();
        let mut rows: Vec<ProcessMetrics> = Vec::new();

        for (pid, proc_) in sys.processes() {
            let pid_u = pid_as_u32(pid);
            let cpu = proc_.cpu_usage();
            self.prev_cpu.insert(pid_u, cpu);

            let mut disk_read_bps = None;
            let mut disk_write_bps = None;
            let disk = proc_.disk_usage();
            let read = disk.total_read_bytes;
            let write = disk.total_written_bytes;
            if let Some((pr, pw, t0)) = self.prev_io.get(&pid_u) {
                let dt = now.duration_since(*t0).as_secs_f64();
                if dt > 0.05 {
                    disk_read_bps = Some(read.saturating_sub(*pr) as f64 / dt);
                    disk_write_bps = Some(write.saturating_sub(*pw) as f64 / dt);
                }
            }
            self.prev_io.insert(pid_u, (read, write, now));

            rows.push(ProcessMetrics {
                pid: pid_u,
                name: proc_.name().to_string_lossy().to_string(),
                cpu_percent: cpu,
                memory_bytes: proc_.memory(),
                disk_read_bps,
                disk_write_bps,
            });
        }

        rows.sort_by(|a, b| match b.cpu_percent.partial_cmp(&a.cpu_percent) {
            Some(ord) => ord.then_with(|| b.memory_bytes.cmp(&a.memory_bytes)),
            None => b.memory_bytes.cmp(&a.memory_bytes),
        });
        rows.truncate(top_n);
        rows
    }
}

fn pid_as_u32(pid: &Pid) -> u32 {
    pid.as_u32()
}
