use serde::Serialize;
use serde_json::Value;
use std::net::Ipv4Addr;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleInfo {
    pub installed: bool,
    pub ipv4: Option<String>,
    pub dns_name: Option<String>,
    pub backend_state: Option<String>,
}

impl Default for TailscaleInfo {
    fn default() -> Self {
        Self {
            installed: false,
            ipv4: None,
            dns_name: None,
            backend_state: None,
        }
    }
}

fn is_tailscale_ipv4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 100 && (64..128).contains(&o[1])
}

fn parse_ipv4(s: &str) -> Option<String> {
    let trimmed = s.trim().trim_matches(|c| c == '"' || c == '\'');
    let ip: Ipv4Addr = trimmed.parse().ok()?;
    if is_tailscale_ipv4(ip) {
        Some(ip.to_string())
    } else {
        None
    }
}

fn run_tailscale(args: &[&str]) -> Option<String> {
    let output = Command::new("tailscale").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        None
    } else {
        Some(stdout)
    }
}

fn from_status_json(raw: &str) -> TailscaleInfo {
    let Ok(v) = serde_json::from_str::<Value>(raw) else {
        return TailscaleInfo {
            installed: true,
            ..TailscaleInfo::default()
        };
    };
    let self_node = v.get("Self");
    let ipv4 = self_node
        .and_then(|s| s.get("TailscaleIPs"))
        .and_then(|ips| ips.as_array())
        .and_then(|arr| arr.iter().filter_map(|x| x.as_str()).find_map(parse_ipv4));

    let dns_name = self_node
        .and_then(|s| s.get("DNSName"))
        .and_then(|d| d.as_str())
        .map(|d| d.trim_end_matches('.').to_string())
        .filter(|d| !d.is_empty());

    let backend_state = v
        .get("BackendState")
        .and_then(|b| b.as_str())
        .map(|s| s.to_string());

    TailscaleInfo {
        installed: true,
        ipv4,
        dns_name,
        backend_state,
    }
}

fn ipv4_from_interfaces() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("ip")
            .args(["-4", "-o", "addr", "show"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            for token in line.split_whitespace() {
                if let Some(ip) = token.split('/').next().and_then(parse_ipv4) {
                    return Some(ip);
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("ifconfig").output().ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("inet ") {
                if let Some(ip) = rest.split_whitespace().next().and_then(parse_ipv4) {
                    return Some(ip);
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-NetIPAddress -AddressFamily IPv4 | Select-Object -ExpandProperty IPAddress",
            ])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if let Some(ip) = parse_ipv4(line) {
                return Some(ip);
            }
        }
    }
    None
}

pub fn detect_tailscale() -> TailscaleInfo {
    if let Some(raw) = run_tailscale(&["status", "--json"]) {
        let mut info = from_status_json(&raw);
        if info.ipv4.is_none() {
            info.ipv4 = run_tailscale(&["ip", "-4"]).and_then(|s| parse_ipv4(&s));
        }
        if info.ipv4.is_none() {
            info.ipv4 = ipv4_from_interfaces();
        }
        return info;
    }

    let ipv4 = run_tailscale(&["ip", "-4"])
        .and_then(|s| parse_ipv4(&s))
        .or_else(ipv4_from_interfaces);

    TailscaleInfo {
        installed: ipv4.is_some(),
        ipv4,
        dns_name: None,
        backend_state: None,
    }
}
