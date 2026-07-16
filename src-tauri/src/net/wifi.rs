use crate::types::WifiMetrics;

/// Real WLAN status via `netsh wlan show interfaces` (connected interface only).
/// Returns None when Wi‑Fi is disconnected or no WLAN interface exists — never invents SSID/signal.
pub fn sample_wifi() -> Option<WifiMetrics> {
    #[cfg(windows)]
    {
        let output = crate::win_cmd::command("netsh")
            .args(["wlan", "show", "interfaces"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        parse_netsh_interfaces(&text)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn parse_netsh_interfaces(text: &str) -> Option<WifiMetrics> {
    // netsh can list multiple interfaces; pick the first connected one.
    let mut blocks: Vec<Vec<&str>> = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            if !current.is_empty() {
                blocks.push(std::mem::take(&mut current));
            }
            continue;
        }
        current.push(line);
    }
    if !current.is_empty() {
        blocks.push(current);
    }

    for block in blocks {
        let map = field_map(&block);
        let state = map.get("state").cloned().unwrap_or_else(|| "".into());
        let ssid = map.get("ssid").cloned().unwrap_or_default();
        if state.eq_ignore_ascii_case("connected") && !ssid.is_empty() {
            return Some(WifiMetrics {
                ssid,
                signal_percent: map
                    .get("signal")
                    .and_then(|s| s.trim_end_matches('%').trim().parse().ok()),
                radio_type: map
                    .get("radio type")
                    .cloned()
                    .or_else(|| map.get("radiotype").cloned()),
                channel: map.get("channel").and_then(|s| s.parse().ok()),
                receive_rate_mbps: map
                    .get("receive rate (mbps)")
                    .or_else(|| map.get("receive rate"))
                    .and_then(|s| s.parse().ok()),
                transmit_rate_mbps: map
                    .get("transmit rate (mbps)")
                    .or_else(|| map.get("transmit rate"))
                    .and_then(|s| s.parse().ok()),
                state,
                interface: map.get("name").cloned(),
            });
        }
    }
    None
}

fn field_map(lines: &[&str]) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim().to_ascii_lowercase();
            let val = v.trim().to_string();
            if !key.is_empty() {
                map.insert(key, val);
            }
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_connected_block() {
        let sample = r#"
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel Wireless
    State                  : connected
    SSID                   : HomeNet
    BSSID                  : aa:bb:cc:dd:ee:ff
    Signal                 : 82%
    Radio type             : 802.11ax
    Channel                : 36
    Receive rate (Mbps)    : 1201
    Transmit rate (Mbps)   : 1201
"#;
        let w = parse_netsh_interfaces(sample).expect("parse");
        assert_eq!(w.ssid, "HomeNet");
        assert_eq!(w.signal_percent, Some(82));
        assert_eq!(w.channel, Some(36));
    }
}
