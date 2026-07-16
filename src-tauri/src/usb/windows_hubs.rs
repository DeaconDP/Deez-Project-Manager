//! Windows USB hub topology via SetupAPI + hub IOCTLs.
//! Walks host controllers → root hubs → ports (including empty) → nested hubs.

use crate::usb::model::{
    chrono_like_now, port_status_label, PortStatus, UsbConfiguration, UsbController, UsbDevice,
    UsbEndpoint, UsbHub, UsbInterface, UsbPort, UsbTopology, UsbWarning,
};
use crate::usb::pnp::{enrich_device, PnPIndex};
use std::collections::HashSet;
use windows::{
    core::{GUID, PCWSTR, PWSTR},
    Win32::{
        Devices::{
            DeviceAndDriverInstallation::{
                SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInterfaces, SetupDiGetClassDevsW,
                SetupDiGetDeviceInterfaceDetailW, SetupDiGetDeviceRegistryPropertyW,
                DIGCF_DEVICEINTERFACE, DIGCF_PRESENT, HDEVINFO, SPDRP_DEVICEDESC,
                SPDRP_FRIENDLYNAME, SP_DEVICE_INTERFACE_DATA, SP_DEVICE_INTERFACE_DETAIL_DATA_W,
                SP_DEVINFO_DATA,
            },
            Usb::{
                GUID_DEVINTERFACE_USB_HOST_CONTROLLER, GUID_DEVINTERFACE_USB_HUB,
                IOCTL_USB_GET_DESCRIPTOR_FROM_NODE_CONNECTION,
                IOCTL_USB_GET_NODE_CONNECTION_DRIVERKEY_NAME,
                IOCTL_USB_GET_NODE_CONNECTION_INFORMATION_EX,
                IOCTL_USB_GET_NODE_CONNECTION_INFORMATION_EX_V2,
                IOCTL_USB_GET_NODE_CONNECTION_NAME, IOCTL_USB_GET_NODE_INFORMATION,
                IOCTL_USB_GET_ROOT_HUB_NAME, USB_CONNECTION_STATUS, USB_DESCRIPTOR_REQUEST,
                USB_HUB_NODE, USB_NODE_CONNECTION_INFORMATION_EX,
                USB_NODE_CONNECTION_INFORMATION_EX_V2, USB_NODE_INFORMATION,
            },
        },
        Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE},
        Storage::FileSystem::{
            CreateFileW, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_MODE, FILE_SHARE_READ,
            FILE_SHARE_WRITE, OPEN_EXISTING,
        },
        System::IO::DeviceIoControl,
    },
};

const GENERIC_WRITE: u32 = 0x40000000;
const GENERIC_READ: u32 = 0x80000000;

pub fn enumerate_topology() -> Result<UsbTopology, String> {
    let pnp = PnPIndex::build();
    let mut warnings: Vec<UsbWarning> = Vec::new();
    let mut controllers: Vec<UsbController> = Vec::new();
    let mut devices: Vec<UsbDevice> = Vec::new();
    let mut seen_hubs: HashSet<String> = HashSet::new();

    let host_ifaces = match enum_device_interfaces(&GUID_DEVINTERFACE_USB_HOST_CONTROLLER) {
        Ok(v) => v,
        Err(e) => {
            return Err(format!(
                "USB-001: Failed to enumerate host controllers: {e}"
            ));
        }
    };

    if host_ifaces.is_empty() {
        warnings.push(UsbWarning {
            code: "USB-001".into(),
            message: "No USB host controllers found.".into(),
            target: None,
        });
    }

    for (idx, iface) in host_ifaces.iter().enumerate() {
        let name = iface
            .description
            .clone()
            .unwrap_or_else(|| format!("USB Host Controller {}", idx + 1));
        let controller_id = format!("hc-{idx}");

        let handle = match open_device(&iface.path) {
            Ok(h) => h,
            Err(e) => {
                warnings.push(UsbWarning {
                    code: "USB-002".into(),
                    message: format!("Could not open host controller: {e}"),
                    target: Some(name.clone()),
                });
                controllers.push(UsbController {
                    id: controller_id,
                    name,
                    device_path: Some(iface.path.clone()),
                    mapped: false,
                    hubs: vec![],
                });
                continue;
            }
        };

        let root_hub_name = match get_root_hub_name(handle) {
            Ok(n) => n,
            Err(e) => {
                let _ = unsafe { CloseHandle(handle) };
                warnings.push(UsbWarning {
                    code: "USB-002".into(),
                    message: format!("Root hub name unavailable: {e}"),
                    target: Some(name.clone()),
                });
                controllers.push(UsbController {
                    id: controller_id,
                    name,
                    device_path: Some(iface.path.clone()),
                    mapped: false,
                    hubs: vec![],
                });
                continue;
            }
        };
        let _ = unsafe { CloseHandle(handle) };

        let root_path = format!(r"\\.\{root_hub_name}");
        let hub_id = format!("{controller_id}-root");
        seen_hubs.insert(normalize_path(&root_path));
        seen_hubs.insert(normalize_path(&root_hub_name));

        match walk_hub(
            &root_path,
            &hub_id,
            &format!("{name} — Root Hub"),
            true,
            &[],
            &pnp,
            &mut devices,
            &mut warnings,
            &mut seen_hubs,
            0,
        ) {
            Ok(hub) => {
                controllers.push(UsbController {
                    id: controller_id,
                    name,
                    device_path: Some(iface.path.clone()),
                    mapped: true,
                    hubs: vec![hub],
                });
            }
            Err(e) => {
                warnings.push(UsbWarning {
                    code: "USB-002".into(),
                    message: format!("Root hub walk failed: {e}"),
                    target: Some(name.clone()),
                });
                controllers.push(UsbController {
                    id: controller_id,
                    name,
                    device_path: Some(iface.path.clone()),
                    mapped: false,
                    hubs: vec![],
                });
            }
        }
    }

    // Also surface orphan hubs not reached via HC walk (rare, but useful).
    if let Ok(hub_ifaces) = enum_device_interfaces(&GUID_DEVINTERFACE_USB_HUB) {
        for (i, iface) in hub_ifaces.iter().enumerate() {
            let key = normalize_path(&iface.path);
            if seen_hubs.contains(&key) {
                continue;
            }
            let hub_id = format!("orphan-hub-{i}");
            let hub_name = iface
                .description
                .clone()
                .unwrap_or_else(|| format!("USB Hub {i}"));
            match walk_hub(
                &iface.path,
                &hub_id,
                &hub_name,
                false,
                &[],
                &pnp,
                &mut devices,
                &mut warnings,
                &mut seen_hubs,
                0,
            ) {
                Ok(hub) => {
                    controllers.push(UsbController {
                        id: format!("orphan-hc-{i}"),
                        name: format!("Unmapped hub path — {hub_name}"),
                        device_path: Some(iface.path.clone()),
                        mapped: true,
                        hubs: vec![hub],
                    });
                }
                Err(e) => {
                    warnings.push(UsbWarning {
                        code: "USB-002".into(),
                        message: format!("Orphan hub open denied: {e}"),
                        target: Some(hub_name),
                    });
                }
            }
        }
    }

    Ok(UsbTopology {
        controllers,
        devices,
        warnings,
        enumerated_at: chrono_like_now(),
    })
}

struct DeviceIface {
    path: String,
    description: Option<String>,
}

fn enum_device_interfaces(guid: &GUID) -> Result<Vec<DeviceIface>, String> {
    unsafe {
        let devs: HDEVINFO = SetupDiGetClassDevsW(
            Some(guid as *const GUID),
            None,
            None,
            DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
        )
        .map_err(|e| e.to_string())?;

        if devs.is_invalid() {
            return Err("SetupDiGetClassDevsW returned invalid handle".into());
        }

        let mut out = Vec::new();
        let mut index = 0u32;
        loop {
            let mut if_data = SP_DEVICE_INTERFACE_DATA {
                cbSize: std::mem::size_of::<SP_DEVICE_INTERFACE_DATA>() as u32,
                ..Default::default()
            };
            if SetupDiEnumDeviceInterfaces(devs, None, guid, index, &mut if_data).is_err() {
                break;
            }

            // First call: size
            let mut required = 0u32;
            let _ = SetupDiGetDeviceInterfaceDetailW(
                devs,
                &if_data,
                None,
                0,
                Some(&mut required),
                None,
            );

            if required == 0 {
                index += 1;
                continue;
            }

            let mut buf = vec![0u8; required as usize];
            let detail = buf.as_mut_ptr() as *mut SP_DEVICE_INTERFACE_DETAIL_DATA_W;
            (*detail).cbSize = if cfg!(target_pointer_width = "64") {
                8
            } else {
                6
            };

            let mut dev_info = SP_DEVINFO_DATA {
                cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
                ..Default::default()
            };

            if SetupDiGetDeviceInterfaceDetailW(
                devs,
                &if_data,
                Some(detail),
                required,
                None,
                Some(&mut dev_info),
            )
            .is_ok()
            {
                let path = wide_ptr_to_string(PWSTR((*detail).DevicePath.as_mut_ptr()));
                let description = get_devinfo_string(devs, &dev_info, SPDRP_FRIENDLYNAME)
                    .or_else(|| get_devinfo_string(devs, &dev_info, SPDRP_DEVICEDESC));
                out.push(DeviceIface { path, description });
            }
            index += 1;
        }

        let _ = SetupDiDestroyDeviceInfoList(devs);
        Ok(out)
    }
}

fn get_devinfo_string(
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
            let s = String::from_utf16_lossy(wide);
            let trimmed = s.trim_end_matches('\0').trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        } else {
            None
        }
    }
}

fn open_device(path: &str) -> Result<HANDLE, String> {
    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let handle = CreateFileW(
            PCWSTR(wide.as_ptr()),
            GENERIC_WRITE | GENERIC_READ,
            FILE_SHARE_MODE(FILE_SHARE_WRITE.0 | FILE_SHARE_READ.0),
            None,
            OPEN_EXISTING,
            FILE_FLAGS_AND_ATTRIBUTES(0),
            None,
        )
        .map_err(|e| e.to_string())?;
        if handle == INVALID_HANDLE_VALUE {
            return Err("INVALID_HANDLE_VALUE".into());
        }
        Ok(handle)
    }
}

fn get_root_hub_name(hc: HANDLE) -> Result<String, String> {
    // First probe for size
    let mut probe = [0u8; 16];
    let mut returned = 0u32;
    unsafe {
        let ok = DeviceIoControl(
            hc,
            IOCTL_USB_GET_ROOT_HUB_NAME,
            None,
            0,
            Some(probe.as_mut_ptr() as *mut _),
            probe.len() as u32,
            Some(&mut returned),
            None,
        );
        let needed = if returned >= 4 {
            u32::from_le_bytes([probe[0], probe[1], probe[2], probe[3]]) as usize + 4
        } else {
            512
        };
        let mut buf = vec![0u8; needed.max(16)];
        let ok2 = DeviceIoControl(
            hc,
            IOCTL_USB_GET_ROOT_HUB_NAME,
            None,
            0,
            Some(buf.as_mut_ptr() as *mut _),
            buf.len() as u32,
            Some(&mut returned),
            None,
        );
        if ok2.is_err() && ok.is_err() {
            return Err("IOCTL_USB_GET_ROOT_HUB_NAME failed".into());
        }
        // USB_ROOT_HUB_NAME: ULONG ActualLength; WCHAR RootHubName[1]
        if returned < 6 {
            return Err("Root hub name buffer too small".into());
        }
        let name_bytes = &buf[4..returned as usize];
        let wide =
            std::slice::from_raw_parts(name_bytes.as_ptr() as *const u16, name_bytes.len() / 2);
        let s = String::from_utf16_lossy(wide);
        Ok(s.trim_end_matches('\0').to_string())
    }
}

fn walk_hub(
    path: &str,
    hub_id: &str,
    hub_name: &str,
    is_root: bool,
    parent_chain: &[u32],
    pnp: &PnPIndex,
    devices: &mut Vec<UsbDevice>,
    warnings: &mut Vec<UsbWarning>,
    seen_hubs: &mut HashSet<String>,
    depth: u32,
) -> Result<UsbHub, String> {
    if depth > 12 {
        return Err("Hub nesting depth exceeded".into());
    }

    let handle = open_device(path).map_err(|e| format!("USB-002: {e}"))?;

    let port_count = match get_hub_port_count(handle) {
        Ok(n) => n,
        Err(e) => {
            let _ = unsafe { CloseHandle(handle) };
            return Err(e);
        }
    };

    // Mark seen only after the hub is actually readable.
    seen_hubs.insert(normalize_path(path));

    let mut ports: Vec<UsbPort> = Vec::new();
    let mut child_hubs: Vec<UsbHub> = Vec::new();

    for port_index in 1..=port_count {
        let port_id = format!("{hub_id}-p{port_index}");
        let conn = match get_connection_info(handle, port_index) {
            Ok(c) => c,
            Err(e) => {
                warnings.push(UsbWarning {
                    code: "USB-002".into(),
                    message: format!("Port {port_index} IOCTL failed: {e}"),
                    target: Some(port_id.clone()),
                });
                ports.push(UsbPort {
                    id: port_id,
                    hub_id: hub_id.to_string(),
                    port_index,
                    status: PortStatus::Unknown,
                    status_label: port_status_label(&PortStatus::Unknown).into(),
                    speed: None,
                    superspeed: None,
                    device_id: None,
                    is_hub: false,
                });
                continue;
            }
        };

        let status = map_connection_status(unsafe {
            std::ptr::addr_of!(conn.ConnectionStatus).read_unaligned()
        });
        let speed = speed_label(unsafe { std::ptr::addr_of!(conn.Speed).read_unaligned() });
        let superspeed = get_superspeed_capable(handle, port_index);
        let is_hub = unsafe { std::ptr::addr_of!(conn.DeviceIsHub).read_unaligned() };
        let device_address = unsafe { std::ptr::addr_of!(conn.DeviceAddress).read_unaligned() };
        let desc = read_device_descriptor(&conn);

        let mut device_id: Option<String> = None;

        if status == PortStatus::Connected {
            let mut chain = parent_chain.to_vec();
            chain.push(port_index);
            let id = format!(
                "{:04x}:{:04x}@{}-{}",
                desc.id_vendor, desc.id_product, hub_id, port_index
            );
            device_id = Some(id.clone());

            let driver_key = get_driver_key(handle, port_index).ok();
            let manufacturer = get_string_descriptor(handle, port_index, desc.i_manufacturer);
            let product = get_string_descriptor(handle, port_index, desc.i_product);
            let serial = get_string_descriptor(handle, port_index, desc.i_serial);

            let configs = get_configurations(handle, port_index, desc.num_configurations);

            let mut device = UsbDevice {
                id: id.clone(),
                hub_id: hub_id.to_string(),
                port_index,
                port_chain: chain.clone(),
                vendor_id: desc.id_vendor,
                product_id: desc.id_product,
                revision: Some(desc.bcd_device),
                manufacturer,
                product,
                serial,
                friendly_name: None,
                device_class: desc.device_class,
                device_subclass: desc.device_subclass,
                device_protocol: desc.device_protocol,
                max_packet_size0: desc.max_packet_size0,
                num_configurations: desc.num_configurations,
                address: device_address,
                speed: Some(speed.clone()),
                superspeed,
                is_hub,
                connection_status: port_status_label(&status).into(),
                driver_key: driver_key.clone(),
                instance_id: None,
                service: None,
                location_paths: vec![],
                container_id: None,
                pnp_status: None,
                pnp_problem_code: None,
                configurations: configs,
            };

            enrich_device(&mut device, pnp);

            if is_hub {
                if let Ok(child_name) = get_connection_name(handle, port_index) {
                    let child_path = format!(r"\\.\{child_name}");
                    let child_id = format!("{hub_id}-h{port_index}");
                    let child_label = device
                        .friendly_name
                        .clone()
                        .or_else(|| device.product.clone())
                        .unwrap_or_else(|| format!("Hub @ port {port_index}"));
                    match walk_hub(
                        &child_path,
                        &child_id,
                        &child_label,
                        false,
                        &chain,
                        pnp,
                        devices,
                        warnings,
                        seen_hubs,
                        depth + 1,
                    ) {
                        Ok(child) => child_hubs.push(child),
                        Err(e) => warnings.push(UsbWarning {
                            code: "USB-002".into(),
                            message: format!("Child hub walk failed: {e}"),
                            target: Some(child_id),
                        }),
                    }
                }
            }

            devices.push(device);
        }

        ports.push(UsbPort {
            id: port_id,
            hub_id: hub_id.to_string(),
            port_index,
            status: status.clone(),
            status_label: port_status_label(&status).into(),
            speed: if status == PortStatus::Connected {
                Some(speed)
            } else {
                None
            },
            superspeed,
            device_id,
            is_hub,
        });
    }

    let _ = unsafe { CloseHandle(handle) };

    Ok(UsbHub {
        id: hub_id.to_string(),
        name: hub_name.to_string(),
        device_path: Some(path.to_string()),
        is_root,
        port_count,
        ports,
        child_hubs,
    })
}

fn get_hub_port_count(hub: HANDLE) -> Result<u32, String> {
    let mut info = USB_NODE_INFORMATION::default();
    let mut returned = 0u32;
    unsafe {
        DeviceIoControl(
            hub,
            IOCTL_USB_GET_NODE_INFORMATION,
            Some(&info as *const _ as *const _),
            std::mem::size_of::<USB_NODE_INFORMATION>() as u32,
            Some(&mut info as *mut _ as *mut _),
            std::mem::size_of::<USB_NODE_INFORMATION>() as u32,
            Some(&mut returned),
            None,
        )
        .map_err(|e| format!("IOCTL_USB_GET_NODE_INFORMATION: {e}"))?;

        let node_type = std::ptr::addr_of!(info.NodeType).read_unaligned();
        let count = if node_type == USB_HUB_NODE(0) {
            let hub_info = std::ptr::addr_of!(info.u.HubInformation).read_unaligned();
            hub_info.HubDescriptor.bNumberOfPorts as u32
        } else {
            let mi = std::ptr::addr_of!(info.u.MiParentInformation).read_unaligned();
            mi.NumberOfInterfaces
        };
        if count == 0 {
            let hub_info = std::ptr::addr_of!(info.u.HubInformation).read_unaligned();
            let ports = hub_info.HubDescriptor.bNumberOfPorts as u32;
            if ports == 0 {
                return Err("Hub reported 0 ports".into());
            }
            return Ok(ports);
        }
        Ok(count)
    }
}

fn get_connection_info(
    hub: HANDLE,
    port_index: u32,
) -> Result<USB_NODE_CONNECTION_INFORMATION_EX, String> {
    // Allocate extra room for pipe list
    let base = std::mem::size_of::<USB_NODE_CONNECTION_INFORMATION_EX>();
    let extra = 64 * 8; // pipe infos
    let mut buf = vec![0u8; base + extra];
    unsafe {
        let info = buf.as_mut_ptr() as *mut USB_NODE_CONNECTION_INFORMATION_EX;
        (*info).ConnectionIndex = port_index;
        let mut returned = 0u32;
        DeviceIoControl(
            hub,
            IOCTL_USB_GET_NODE_CONNECTION_INFORMATION_EX,
            Some(info as *const _),
            buf.len() as u32,
            Some(info as *mut _),
            buf.len() as u32,
            Some(&mut returned),
            None,
        )
        .map_err(|e| format!("IOCTL_USB_GET_NODE_CONNECTION_INFORMATION_EX: {e}"))?;
        Ok(*info)
    }
}

fn get_superspeed_capable(hub: HANDLE, port_index: u32) -> Option<bool> {
    let mut info = USB_NODE_CONNECTION_INFORMATION_EX_V2::default();
    info.ConnectionIndex = port_index;
    info.Length = std::mem::size_of::<USB_NODE_CONNECTION_INFORMATION_EX_V2>() as u32;
    let mut returned = 0u32;
    unsafe {
        if DeviceIoControl(
            hub,
            IOCTL_USB_GET_NODE_CONNECTION_INFORMATION_EX_V2,
            Some(&info as *const _ as *const _),
            std::mem::size_of::<USB_NODE_CONNECTION_INFORMATION_EX_V2>() as u32,
            Some(&mut info as *mut _ as *mut _),
            std::mem::size_of::<USB_NODE_CONNECTION_INFORMATION_EX_V2>() as u32,
            Some(&mut returned),
            None,
        )
        .is_ok()
        {
            let flags = std::ptr::addr_of!(info.Flags.ul).read_unaligned();
            Some(flags & 0x1 != 0)
        } else {
            None
        }
    }
}

fn get_driver_key(hub: HANDLE, port_index: u32) -> Result<String, String> {
    let mut probe = [0u8; 16];
    let mut returned = 0u32;
    // Structure starts with ConnectionIndex + ActualLength
    probe[0..4].copy_from_slice(&port_index.to_le_bytes());
    unsafe {
        let _ = DeviceIoControl(
            hub,
            IOCTL_USB_GET_NODE_CONNECTION_DRIVERKEY_NAME,
            Some(probe.as_ptr() as *const _),
            probe.len() as u32,
            Some(probe.as_mut_ptr() as *mut _),
            probe.len() as u32,
            Some(&mut returned),
            None,
        );
        let actual = if returned >= 8 {
            u32::from_le_bytes([probe[4], probe[5], probe[6], probe[7]]) as usize
        } else {
            512
        };
        let size = (8 + actual).max(16);
        let mut buf = vec![0u8; size];
        buf[0..4].copy_from_slice(&port_index.to_le_bytes());
        DeviceIoControl(
            hub,
            IOCTL_USB_GET_NODE_CONNECTION_DRIVERKEY_NAME,
            Some(buf.as_ptr() as *const _),
            buf.len() as u32,
            Some(buf.as_mut_ptr() as *mut _),
            buf.len() as u32,
            Some(&mut returned),
            None,
        )
        .map_err(|e| e.to_string())?;
        if returned < 10 {
            return Err("driver key empty".into());
        }
        let name_bytes = &buf[8..returned as usize];
        let wide =
            std::slice::from_raw_parts(name_bytes.as_ptr() as *const u16, name_bytes.len() / 2);
        Ok(String::from_utf16_lossy(wide)
            .trim_end_matches('\0')
            .to_string())
    }
}

fn get_connection_name(hub: HANDLE, port_index: u32) -> Result<String, String> {
    let mut probe = [0u8; 16];
    probe[0..4].copy_from_slice(&port_index.to_le_bytes());
    let mut returned = 0u32;
    unsafe {
        let _ = DeviceIoControl(
            hub,
            IOCTL_USB_GET_NODE_CONNECTION_NAME,
            Some(probe.as_ptr() as *const _),
            probe.len() as u32,
            Some(probe.as_mut_ptr() as *mut _),
            probe.len() as u32,
            Some(&mut returned),
            None,
        );
        let actual = if returned >= 8 {
            u32::from_le_bytes([probe[4], probe[5], probe[6], probe[7]]) as usize
        } else {
            512
        };
        let size = (8 + actual).max(16);
        let mut buf = vec![0u8; size];
        buf[0..4].copy_from_slice(&port_index.to_le_bytes());
        DeviceIoControl(
            hub,
            IOCTL_USB_GET_NODE_CONNECTION_NAME,
            Some(buf.as_ptr() as *const _),
            buf.len() as u32,
            Some(buf.as_mut_ptr() as *mut _),
            buf.len() as u32,
            Some(&mut returned),
            None,
        )
        .map_err(|e| e.to_string())?;
        if returned < 10 {
            return Err("connection name empty".into());
        }
        let name_bytes = &buf[8..returned as usize];
        let wide =
            std::slice::from_raw_parts(name_bytes.as_ptr() as *const u16, name_bytes.len() / 2);
        Ok(String::from_utf16_lossy(wide)
            .trim_end_matches('\0')
            .to_string())
    }
}

fn get_string_descriptor(hub: HANDLE, port_index: u32, index: u8) -> Option<String> {
    if index == 0 {
        return None;
    }
    // USB_DESCRIPTOR_REQUEST + 255 bytes
    let header = std::mem::size_of::<USB_DESCRIPTOR_REQUEST>();
    let mut buf = vec![0u8; header + 255];
    unsafe {
        let req = buf.as_mut_ptr() as *mut USB_DESCRIPTOR_REQUEST;
        (*req).ConnectionIndex = port_index;
        // SetupPacket: bmRequestType=0x80, bRequest=GET_DESCRIPTOR(6), wValue=(string<<8)|index, wIndex=0x0409, wLength=255
        let setup = &mut (*req).SetupPacket;
        setup.bmRequest = 0x80;
        setup.bRequest = 0x06;
        setup.wValue = ((0x03u16) << 8) | index as u16;
        setup.wIndex = 0x0409; // English
        setup.wLength = 255;

        let mut returned = 0u32;
        if DeviceIoControl(
            hub,
            IOCTL_USB_GET_DESCRIPTOR_FROM_NODE_CONNECTION,
            Some(req as *const _),
            buf.len() as u32,
            Some(req as *mut _),
            buf.len() as u32,
            Some(&mut returned),
            None,
        )
        .is_err()
        {
            // Retry with lang 0
            setup.wIndex = 0;
            if DeviceIoControl(
                hub,
                IOCTL_USB_GET_DESCRIPTOR_FROM_NODE_CONNECTION,
                Some(req as *const _),
                buf.len() as u32,
                Some(req as *mut _),
                buf.len() as u32,
                Some(&mut returned),
                None,
            )
            .is_err()
            {
                return None;
            }
        }

        if returned as usize <= header + 2 {
            return None;
        }
        let desc = &buf[header..returned as usize];
        // bLength, bDescriptorType, then UTF-16LE chars
        if desc.len() < 4 || desc[1] != 0x03 {
            return None;
        }
        let char_bytes = &desc[2..];
        let wide =
            std::slice::from_raw_parts(char_bytes.as_ptr() as *const u16, char_bytes.len() / 2);
        let s = String::from_utf16_lossy(wide)
            .trim_end_matches('\0')
            .trim()
            .to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }
}

fn get_configurations(
    hub: HANDLE,
    port_index: u32,
    num_configurations: u8,
) -> Vec<UsbConfiguration> {
    let mut configs = Vec::new();
    let n = num_configurations.max(1).min(8);
    for cfg_idx in 0..n {
        if let Some(cfg) = get_config_descriptor(hub, port_index, cfg_idx) {
            configs.push(cfg);
        }
    }
    configs
}

fn get_config_descriptor(
    hub: HANDLE,
    port_index: u32,
    config_index: u8,
) -> Option<UsbConfiguration> {
    let header = std::mem::size_of::<USB_DESCRIPTOR_REQUEST>();
    // First request: 9-byte config header to learn wTotalLength
    let mut buf = vec![0u8; header + 9];
    unsafe {
        let req = buf.as_mut_ptr() as *mut USB_DESCRIPTOR_REQUEST;
        (*req).ConnectionIndex = port_index;
        let setup = &mut (*req).SetupPacket;
        setup.bmRequest = 0x80;
        setup.bRequest = 0x06;
        setup.wValue = (0x02u16 << 8) | config_index as u16;
        setup.wIndex = 0;
        setup.wLength = 9;
        let mut returned = 0u32;
        if DeviceIoControl(
            hub,
            IOCTL_USB_GET_DESCRIPTOR_FROM_NODE_CONNECTION,
            Some(req as *const _),
            buf.len() as u32,
            Some(req as *mut _),
            buf.len() as u32,
            Some(&mut returned),
            None,
        )
        .is_err()
        {
            return None;
        }
        let desc = &buf[header..returned as usize];
        if desc.len() < 9 {
            return None;
        }
        let total = u16::from_le_bytes([desc[2], desc[3]]) as usize;
        if total < 9 {
            return None;
        }

        let mut full = vec![0u8; header + total];
        let req2 = full.as_mut_ptr() as *mut USB_DESCRIPTOR_REQUEST;
        (*req2).ConnectionIndex = port_index;
        let setup2 = &mut (*req2).SetupPacket;
        setup2.bmRequest = 0x80;
        setup2.bRequest = 0x06;
        setup2.wValue = (0x02u16 << 8) | config_index as u16;
        setup2.wIndex = 0;
        setup2.wLength = total as u16;
        if DeviceIoControl(
            hub,
            IOCTL_USB_GET_DESCRIPTOR_FROM_NODE_CONNECTION,
            Some(req2 as *const _),
            full.len() as u32,
            Some(req2 as *mut _),
            full.len() as u32,
            Some(&mut returned),
            None,
        )
        .is_err()
        {
            return None;
        }
        let raw = &full[header..returned as usize];
        parse_config_descriptor(raw)
    }
}

fn parse_config_descriptor(raw: &[u8]) -> Option<UsbConfiguration> {
    if raw.len() < 9 || raw[1] != 0x02 {
        return None;
    }
    let value = raw[5];
    let attributes = raw[7];
    let max_power_ma = raw[8] as u32 * 2;
    let mut interfaces: Vec<UsbInterface> = Vec::new();
    let mut i = 9usize;
    let mut current: Option<UsbInterface> = None;

    while i + 1 < raw.len() {
        let len = raw[i] as usize;
        if len < 2 || i + len > raw.len() {
            break;
        }
        let dtype = raw[i + 1];
        match dtype {
            0x04 if len >= 9 => {
                if let Some(iface) = current.take() {
                    interfaces.push(iface);
                }
                current = Some(UsbInterface {
                    interface_number: raw[i + 2],
                    alternate_setting: raw[i + 3],
                    class: raw[i + 5],
                    subclass: raw[i + 6],
                    protocol: raw[i + 7],
                    endpoints: vec![],
                });
            }
            0x05 if len >= 7 => {
                if let Some(ref mut iface) = current {
                    let addr = raw[i + 2];
                    let attrs = raw[i + 3];
                    let mps = u16::from_le_bytes([raw[i + 4], raw[i + 5]]);
                    let interval = raw[i + 6];
                    let direction = if addr & 0x80 != 0 { "IN" } else { "OUT" };
                    let transfer_type = match attrs & 0x03 {
                        0 => "Control",
                        1 => "Isochronous",
                        2 => "Bulk",
                        3 => "Interrupt",
                        _ => "Unknown",
                    };
                    iface.endpoints.push(UsbEndpoint {
                        address: addr,
                        attributes: attrs,
                        max_packet_size: mps,
                        interval,
                        direction: direction.into(),
                        transfer_type: transfer_type.into(),
                    });
                }
            }
            _ => {}
        }
        i += len;
    }
    if let Some(iface) = current {
        interfaces.push(iface);
    }

    Some(UsbConfiguration {
        value,
        attributes,
        max_power_ma,
        interfaces,
    })
}

fn map_connection_status(status: USB_CONNECTION_STATUS) -> PortStatus {
    match status.0 {
        0 => PortStatus::Empty,
        1 => PortStatus::Connected,
        2 => PortStatus::FailedEnumeration,
        3 => PortStatus::GeneralFailure,
        4 => PortStatus::Overcurrent,
        5 => PortStatus::NotEnoughPower,
        6 => PortStatus::NotEnoughBandwidth,
        7 => PortStatus::HubNestedTooDeeply,
        8 => PortStatus::InLegacyHub,
        9 => PortStatus::Enumerating,
        10 => PortStatus::Reset,
        _ => PortStatus::Unknown,
    }
}

fn speed_label(speed: u8) -> String {
    match speed {
        0 => "Low (1.5 Mbps)".into(),
        1 => "Full (12 Mbps)".into(),
        2 => "High (480 Mbps)".into(),
        3 => "SuperSpeed (5 Gbps)".into(),
        _ => format!("Unknown ({speed})"),
    }
}

fn read_device_descriptor(conn: &USB_NODE_CONNECTION_INFORMATION_EX) -> DeviceDescFields {
    unsafe {
        let d = std::ptr::addr_of!(conn.DeviceDescriptor);
        DeviceDescFields {
            id_vendor: std::ptr::addr_of!((*d).idVendor).read_unaligned(),
            id_product: std::ptr::addr_of!((*d).idProduct).read_unaligned(),
            bcd_device: std::ptr::addr_of!((*d).bcdDevice).read_unaligned(),
            device_class: std::ptr::addr_of!((*d).bDeviceClass).read_unaligned(),
            device_subclass: std::ptr::addr_of!((*d).bDeviceSubClass).read_unaligned(),
            device_protocol: std::ptr::addr_of!((*d).bDeviceProtocol).read_unaligned(),
            max_packet_size0: std::ptr::addr_of!((*d).bMaxPacketSize0).read_unaligned(),
            num_configurations: std::ptr::addr_of!((*d).bNumConfigurations).read_unaligned(),
            i_manufacturer: std::ptr::addr_of!((*d).iManufacturer).read_unaligned(),
            i_product: std::ptr::addr_of!((*d).iProduct).read_unaligned(),
            i_serial: std::ptr::addr_of!((*d).iSerialNumber).read_unaligned(),
        }
    }
}

#[derive(Clone, Copy)]
struct DeviceDescFields {
    id_vendor: u16,
    id_product: u16,
    bcd_device: u16,
    device_class: u8,
    device_subclass: u8,
    device_protocol: u8,
    max_packet_size0: u8,
    num_configurations: u8,
    i_manufacturer: u8,
    i_product: u8,
    i_serial: u8,
}

fn normalize_path(path: &str) -> String {
    let upper = path.trim().to_uppercase();
    let stripped = upper
        .strip_prefix(r"\\?\")
        .or_else(|| upper.strip_prefix(r"\\.\"))
        .unwrap_or(upper.as_str());
    // Drop device-interface GUID suffix: ...#{xxxxxxxx-...}
    let without_iface = match stripped.find("#{") {
        Some(idx) => &stripped[..idx],
        None => stripped,
    };
    without_iface.trim_end_matches('\\').to_string()
}

fn wide_ptr_to_string(ptr: PWSTR) -> String {
    unsafe {
        if ptr.is_null() {
            return String::new();
        }
        let mut len = 0;
        while *ptr.0.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(ptr.0, len);
        String::from_utf16_lossy(slice)
    }
}
