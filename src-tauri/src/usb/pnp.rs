//! PnP enrichment — match USB devices to SetupAPI registry properties via driver key / VID:PID.

use crate::usb::model::UsbDevice;
use std::collections::HashMap;
use windows::{
    core::GUID,
    Win32::Devices::DeviceAndDriverInstallation::{
        CM_Get_DevNode_Status, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo,
        SetupDiGetClassDevsW, SetupDiGetDeviceInstanceIdW, SetupDiGetDeviceRegistryPropertyW,
        CM_PROB, CONFIGRET, DIGCF_ALLCLASSES, DIGCF_PRESENT, DN_HAS_PROBLEM, GUID_DEVCLASS_USB,
        HDEVINFO, SPDRP_COMPATIBLEIDS, SPDRP_DEVICEDESC, SPDRP_DRIVER, SPDRP_FRIENDLYNAME,
        SPDRP_HARDWAREID, SPDRP_LOCATION_PATHS, SPDRP_MFG, SPDRP_SERVICE, SP_DEVINFO_DATA,
    },
};

#[derive(Debug, Clone, Default)]
pub struct PnPDevice {
    pub instance_id: String,
    pub friendly_name: Option<String>,
    pub description: Option<String>,
    pub manufacturer: Option<String>,
    pub service: Option<String>,
    pub driver_key: Option<String>,
    pub location_paths: Vec<String>,
    pub hardware_ids: Vec<String>,
    pub pnp_status: Option<String>,
    pub pnp_problem_code: Option<u32>,
}

pub struct PnPIndex {
    by_driver: HashMap<String, PnPDevice>,
    by_vid_pid: HashMap<(u16, u16), Vec<PnPDevice>>,
}

impl PnPIndex {
    pub fn build() -> Self {
        let mut by_driver: HashMap<String, PnPDevice> = HashMap::new();
        let mut by_vid_pid: HashMap<(u16, u16), Vec<PnPDevice>> = HashMap::new();

        if let Ok(devs) = collect_usb_pnp() {
            for d in devs {
                if let Some(ref key) = d.driver_key {
                    by_driver.insert(key.to_uppercase(), d.clone());
                }
                for (vid, pid) in extract_vid_pids(&d) {
                    by_vid_pid.entry((vid, pid)).or_default().push(d.clone());
                }
            }
        }

        Self {
            by_driver,
            by_vid_pid,
        }
    }

    pub fn find(&self, device: &UsbDevice) -> Option<&PnPDevice> {
        if let Some(ref key) = device.driver_key {
            if let Some(d) = self.by_driver.get(&key.to_uppercase()) {
                return Some(d);
            }
        }
        self.by_vid_pid
            .get(&(device.vendor_id, device.product_id))
            .and_then(|list| list.first())
    }
}

pub fn enrich_device(device: &mut UsbDevice, index: &PnPIndex) {
    if let Some(pnp) = index.find(device) {
        device.instance_id = Some(pnp.instance_id.clone());
        device.service = pnp.service.clone();
        device.location_paths = pnp.location_paths.clone();
        if device.friendly_name.is_none() {
            device.friendly_name = pnp
                .friendly_name
                .clone()
                .or_else(|| pnp.description.clone());
        }
        if device.manufacturer.is_none() {
            device.manufacturer = pnp.manufacturer.clone();
        }
        if device.driver_key.is_none() {
            device.driver_key = pnp.driver_key.clone();
        }
        device.pnp_status = pnp.pnp_status.clone().or_else(|| Some("OK".into()));
        device.pnp_problem_code = pnp.pnp_problem_code;
    }
}

fn collect_usb_pnp() -> Result<Vec<PnPDevice>, String> {
    unsafe {
        let mut out = Vec::new();
        // Prefer USB class; also scan present devices with USB in hardware IDs via ALLCLASSES if needed
        let use_usb_class = [true, false];

        for usb_only in use_usb_class {
            let flags = if usb_only {
                DIGCF_PRESENT
            } else {
                DIGCF_PRESENT | DIGCF_ALLCLASSES
            };
            let class_arg: Option<*const GUID> = if usb_only {
                Some(&GUID_DEVCLASS_USB as *const GUID)
            } else {
                None
            };
            let devs: HDEVINFO = match SetupDiGetClassDevsW(class_arg, None, None, flags) {
                Ok(h) => h,
                Err(_) => continue,
            };
            if devs.is_invalid() {
                continue;
            }

            let mut index = 0u32;
            loop {
                let mut info = SP_DEVINFO_DATA {
                    cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
                    ..Default::default()
                };
                if SetupDiEnumDeviceInfo(devs, index, &mut info).is_err() {
                    break;
                }

                let instance_id = get_instance_id(devs, &info).unwrap_or_default();
                let hardware_ids = get_multi_sz(devs, &info, SPDRP_HARDWAREID);
                let compatible = get_multi_sz(devs, &info, SPDRP_COMPATIBLEIDS);

                // When scanning all classes, keep only USB-looking nodes
                if !usb_only {
                    let blob = format!(
                        "{}{}{}",
                        instance_id,
                        hardware_ids.join(";"),
                        compatible.join(";")
                    )
                    .to_uppercase();
                    if !blob.contains("USB\\")
                        && !blob.contains("USBSTOR")
                        && !blob.contains("VID_")
                    {
                        index += 1;
                        continue;
                    }
                }

                let location_paths = get_multi_sz(devs, &info, SPDRP_LOCATION_PATHS);
                let (pnp_status, pnp_problem_code) = read_devnode_status(info.DevInst);
                out.push(PnPDevice {
                    instance_id,
                    friendly_name: get_prop(devs, &info, SPDRP_FRIENDLYNAME),
                    description: get_prop(devs, &info, SPDRP_DEVICEDESC),
                    manufacturer: get_prop(devs, &info, SPDRP_MFG),
                    service: get_prop(devs, &info, SPDRP_SERVICE),
                    driver_key: get_prop(devs, &info, SPDRP_DRIVER),
                    location_paths,
                    hardware_ids,
                    pnp_status,
                    pnp_problem_code,
                });
                index += 1;
            }
            let _ = SetupDiDestroyDeviceInfoList(devs);

            // USB class scan is usually enough
            if usb_only && !out.is_empty() {
                break;
            }
        }
        Ok(out)
    }
}

fn read_devnode_status(dev_inst: u32) -> (Option<String>, Option<u32>) {
    unsafe {
        let mut status = Default::default();
        let mut problem = CM_PROB::default();
        let ret = CM_Get_DevNode_Status(&mut status, &mut problem, dev_inst, 0);
        if ret != CONFIGRET(0) {
            return (None, None);
        }
        let code = problem.0;
        if status.contains(DN_HAS_PROBLEM) || code != 0 {
            let label = format!("Problem 0x{code:X} — {}", problem_label(code));
            (Some(label), Some(code))
        } else {
            (Some("OK".into()), Some(0))
        }
    }
}

fn problem_label(code: u32) -> &'static str {
    match code {
        1 => "Not configured",
        10 => "Failed to start",
        14 => "Needs restart",
        22 => "Disabled",
        24 => "Device not there",
        28 => "Failed install",
        29 => "Hardware disabled",
        31 => "Failed add",
        37 => "Failed driver entry",
        39 => "Driver failed load",
        43 => "Failed post-start",
        48 => "Driver blocked",
        54 => "Device reset",
        _ => "See Device Manager",
    }
}

fn get_instance_id(devs: HDEVINFO, info: &SP_DEVINFO_DATA) -> Option<String> {
    unsafe {
        let mut required = 0u32;
        let _ = SetupDiGetDeviceInstanceIdW(devs, info, None, Some(&mut required));
        if required == 0 {
            return None;
        }
        let mut buf = vec![0u16; required as usize];
        if SetupDiGetDeviceInstanceIdW(devs, info, Some(&mut buf), Some(&mut required)).is_ok() {
            let s = String::from_utf16_lossy(&buf);
            Some(s.trim_end_matches('\0').to_string())
        } else {
            None
        }
    }
}

fn get_prop(
    devs: HDEVINFO,
    info: &SP_DEVINFO_DATA,
    prop: windows::Win32::Devices::DeviceAndDriverInstallation::SETUP_DI_REGISTRY_PROPERTY,
) -> Option<String> {
    unsafe {
        let mut required = 0u32;
        let mut reg_type = 0u32;
        let _ = SetupDiGetDeviceRegistryPropertyW(
            devs,
            info,
            prop,
            Some(&mut reg_type),
            None,
            Some(&mut required),
        );
        if required == 0 {
            return None;
        }
        let mut buf = vec![0u8; required as usize];
        if SetupDiGetDeviceRegistryPropertyW(
            devs,
            info,
            prop,
            Some(&mut reg_type),
            Some(&mut buf),
            Some(&mut required),
        )
        .is_ok()
        {
            let wide =
                std::slice::from_raw_parts(buf.as_ptr() as *const u16, required as usize / 2);
            let s = String::from_utf16_lossy(wide)
                .trim_end_matches('\0')
                .trim()
                .to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        } else {
            None
        }
    }
}

fn get_multi_sz(
    devs: HDEVINFO,
    info: &SP_DEVINFO_DATA,
    prop: windows::Win32::Devices::DeviceAndDriverInstallation::SETUP_DI_REGISTRY_PROPERTY,
) -> Vec<String> {
    match get_prop(devs, info, prop) {
        Some(raw) => raw
            .split('\0')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        None => vec![],
    }
}

fn extract_vid_pids(d: &PnPDevice) -> Vec<(u16, u16)> {
    let mut out = Vec::new();
    let sources = d.hardware_ids.iter().chain(std::iter::once(&d.instance_id));
    for s in sources {
        let upper = s.to_uppercase();
        if let (Some(vid), Some(pid)) = (
            parse_hex_after(&upper, "VID_"),
            parse_hex_after(&upper, "PID_"),
        ) {
            out.push((vid, pid));
        }
    }
    out
}

fn parse_hex_after(s: &str, marker: &str) -> Option<u16> {
    let idx = s.find(marker)?;
    let start = idx + marker.len();
    let slice = s.get(start..start + 4)?;
    u16::from_str_radix(slice, 16).ok()
}
