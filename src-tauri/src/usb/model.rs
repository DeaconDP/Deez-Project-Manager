use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbTopology {
    pub controllers: Vec<UsbController>,
    pub devices: Vec<UsbDevice>,
    pub warnings: Vec<UsbWarning>,
    pub enumerated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbWarning {
    pub code: String,
    pub message: String,
    pub target: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbController {
    pub id: String,
    pub name: String,
    pub device_path: Option<String>,
    pub mapped: bool,
    pub hubs: Vec<UsbHub>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbHub {
    pub id: String,
    pub name: String,
    pub device_path: Option<String>,
    pub is_root: bool,
    pub port_count: u32,
    pub ports: Vec<UsbPort>,
    pub child_hubs: Vec<UsbHub>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbPort {
    pub id: String,
    pub hub_id: String,
    pub port_index: u32,
    pub status: PortStatus,
    pub status_label: String,
    pub speed: Option<String>,
    pub superspeed: Option<bool>,
    pub device_id: Option<String>,
    pub is_hub: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PortStatus {
    Empty,
    Connected,
    FailedEnumeration,
    GeneralFailure,
    Overcurrent,
    NotEnoughPower,
    NotEnoughBandwidth,
    HubNestedTooDeeply,
    InLegacyHub,
    Enumerating,
    Reset,
    Unknown,
    Unmapped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbDevice {
    pub id: String,
    pub hub_id: String,
    pub port_index: u32,
    pub port_chain: Vec<u32>,
    pub vendor_id: u16,
    pub product_id: u16,
    pub revision: Option<u16>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial: Option<String>,
    pub friendly_name: Option<String>,
    pub device_class: u8,
    pub device_subclass: u8,
    pub device_protocol: u8,
    pub max_packet_size0: u8,
    pub num_configurations: u8,
    pub address: u16,
    pub speed: Option<String>,
    pub superspeed: Option<bool>,
    pub is_hub: bool,
    pub connection_status: String,
    pub driver_key: Option<String>,
    pub instance_id: Option<String>,
    pub service: Option<String>,
    pub location_paths: Vec<String>,
    pub container_id: Option<String>,
    pub pnp_status: Option<String>,
    /// Windows CM problem code; `None` or `Some(0)` means OK.
    pub pnp_problem_code: Option<u32>,
    pub configurations: Vec<UsbConfiguration>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbConfiguration {
    pub value: u8,
    pub attributes: u8,
    pub max_power_ma: u32,
    pub interfaces: Vec<UsbInterface>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbInterface {
    pub interface_number: u8,
    pub alternate_setting: u8,
    pub class: u8,
    pub subclass: u8,
    pub protocol: u8,
    pub endpoints: Vec<UsbEndpoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbEndpoint {
    pub address: u8,
    pub attributes: u8,
    pub max_packet_size: u16,
    pub interval: u8,
    pub direction: String,
    pub transfer_type: String,
}

impl UsbTopology {
    #[allow(dead_code)]
    pub fn empty_with_warning(code: &str, message: &str) -> Self {
        Self {
            controllers: vec![],
            devices: vec![],
            warnings: vec![UsbWarning {
                code: code.to_string(),
                message: message.to_string(),
                target: None,
            }],
            enumerated_at: chrono_like_now(),
        }
    }

    pub fn fingerprint(&self) -> String {
        use sha2::{Digest, Sha256};
        // Exclude enumerated_at so the poll timestamp does not fake a topology change.
        let mut stable = self.clone();
        stable.enumerated_at.clear();
        let payload = serde_json::to_string(&stable).unwrap_or_default();
        let hash = Sha256::digest(payload.as_bytes());
        hex::encode(hash)
    }
}

pub fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    ms.to_string()
}

#[cfg(windows)]
pub fn port_status_label(status: &PortStatus) -> &'static str {
    match status {
        PortStatus::Empty => "Empty",
        PortStatus::Connected => "Connected",
        PortStatus::FailedEnumeration => "Failed enumeration",
        PortStatus::GeneralFailure => "General failure",
        PortStatus::Overcurrent => "Overcurrent",
        PortStatus::NotEnoughPower => "Not enough power",
        PortStatus::NotEnoughBandwidth => "Not enough bandwidth",
        PortStatus::HubNestedTooDeeply => "Hub nested too deeply",
        PortStatus::InLegacyHub => "In legacy hub",
        PortStatus::Enumerating => "Enumerating",
        PortStatus::Reset => "Reset",
        PortStatus::Unknown => "Unknown",
        PortStatus::Unmapped => "Unmapped",
    }
}

#[allow(dead_code)]
pub fn class_name(class: u8) -> &'static str {
    match class {
        0x00 => "Interface-defined",
        0x01 => "Audio",
        0x02 => "CDC",
        0x03 => "HID",
        0x05 => "Physical",
        0x06 => "Image",
        0x07 => "Printer",
        0x08 => "Mass Storage",
        0x09 => "Hub",
        0x0A => "CDC-Data",
        0x0B => "Smart Card",
        0x0D => "Content Security",
        0x0E => "Video",
        0x0F => "Personal Healthcare",
        0x10 => "Audio/Video",
        0x11 => "Billboard",
        0x12 => "USB Type-C Bridge",
        0xDC => "Diagnostic",
        0xE0 => "Wireless",
        0xEF => "Miscellaneous",
        0xFE => "Application Specific",
        0xFF => "Vendor Specific",
        _ => "Unknown",
    }
}
