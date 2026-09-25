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

/// Established TCP owners via `GetExtendedTcpTable`.
#[cfg(windows)]
fn tcp_connection_counts() -> Option<HashMap<u32, u32>> {
    use windows::Win32::NetworkManagement::IpHelper::MIB_TCP_STATE_ESTAB;
    use windows::Win32::Networking::WinSock::{AF_INET, AF_INET6};

    let estab = MIB_TCP_STATE_ESTAB.0 as u32;
    let mut map = HashMap::new();
    fill_ipv4_tcp_owners(&mut map, estab, AF_INET.0 as u32)?;
    let _ = fill_ipv6_tcp_owners(&mut map, estab, AF_INET6.0 as u32);
    if map.is_empty() {
        None
    } else {
        Some(map)
    }
}

#[cfg(windows)]
fn fill_ipv4_tcp_owners(map: &mut HashMap<u32, u32>, estab: u32, family: u32) -> Option<()> {
    use windows::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID,
        TCP_TABLE_OWNER_PID_CONNECTIONS,
    };

    unsafe {
        let mut size: u32 = 0;
        let probe = GetExtendedTcpTable(
            None,
            &mut size,
            false,
            family,
            TCP_TABLE_OWNER_PID_CONNECTIONS,
            0,
        );
        if probe != ERROR_INSUFFICIENT_BUFFER.0 || size == 0 {
            return None;
        }
        let mut buf = vec![0u8; size as usize];
        if GetExtendedTcpTable(
            Some(buf.as_mut_ptr().cast()),
            &mut size,
            false,
            family,
            TCP_TABLE_OWNER_PID_CONNECTIONS,
            0,
        ) != 0
        {
            return None;
        }
        let table = &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
        let rows = std::slice::from_raw_parts(
            table.table.as_ptr() as *const MIB_TCPROW_OWNER_PID,
            table.dwNumEntries as usize,
        );
        for row in rows {
            if row.dwState == estab && row.dwOwningPid != 0 {
                *map.entry(row.dwOwningPid).or_insert(0) += 1;
            }
        }
    }
    Some(())
}

#[cfg(windows)]
fn fill_ipv6_tcp_owners(map: &mut HashMap<u32, u32>, estab: u32, family: u32) -> Option<()> {
    use windows::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCP6TABLE_OWNER_PID,
        TCP_TABLE_OWNER_PID_CONNECTIONS,
    };

    unsafe {
        let mut size: u32 = 0;
        let probe = GetExtendedTcpTable(
            None,
            &mut size,
            false,
            family,
            TCP_TABLE_OWNER_PID_CONNECTIONS,
            0,
        );
        if probe != ERROR_INSUFFICIENT_BUFFER.0 || size == 0 {
            return None;
        }
        let mut buf = vec![0u8; size as usize];
        if GetExtendedTcpTable(
            Some(buf.as_mut_ptr().cast()),
            &mut size,
            false,
            family,
            TCP_TABLE_OWNER_PID_CONNECTIONS,
            0,
        ) != 0
        {
            return None;
        }
        let table = &*(buf.as_ptr() as *const MIB_TCP6TABLE_OWNER_PID);
        let rows = std::slice::from_raw_parts(
            table.table.as_ptr() as *const MIB_TCP6ROW_OWNER_PID,
            table.dwNumEntries as usize,
        );
        for row in rows {
            if row.dwState == estab && row.dwOwningPid != 0 {
                *map.entry(row.dwOwningPid).or_insert(0) += 1;
            }
        }
    }
    Some(())
}

#[cfg(not(windows))]
fn tcp_connection_counts() -> Option<HashMap<u32, u32>> {
    None
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn tcp_counts_without_powershell() {
        let counts = tcp_connection_counts().expect("GetExtendedTcpTable should work");
        assert!(
            counts.values().any(|c| *c > 0),
            "expected at least one established TCP owner"
        );
    }
}
