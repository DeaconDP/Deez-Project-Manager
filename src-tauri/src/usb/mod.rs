pub mod model;
pub mod watch;

#[cfg(windows)]
mod pnp;
#[cfg(windows)]
mod windows_hubs;

#[cfg(test)]
mod smoke_test;

use model::UsbTopology;

#[allow(dead_code)]
pub trait UsbBackend {
    fn enumerate(&self) -> Result<UsbTopology, String>;
}

#[allow(dead_code)]
pub struct PlatformBackend;

impl UsbBackend for PlatformBackend {
    fn enumerate(&self) -> Result<UsbTopology, String> {
        enumerate()
    }
}

pub fn enumerate() -> Result<UsbTopology, String> {
    #[cfg(windows)]
    {
        windows_hubs::enumerate_topology()
    }
    #[cfg(not(windows))]
    {
        Ok(UsbTopology::empty_with_warning(
            "USB-003",
            "This build only supports Windows USB hub enumeration.",
        ))
    }
}

pub fn get_device(topology: &UsbTopology, id: &str) -> Option<model::UsbDevice> {
    topology.devices.iter().find(|d| d.id == id).cloned()
}
