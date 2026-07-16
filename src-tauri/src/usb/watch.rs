use crate::usb::model::UsbTopology;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn start_watcher(
    app: AppHandle,
    last_fp: Arc<Mutex<String>>,
    enabled: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(5));
            if !enabled.load(Ordering::Relaxed) {
                continue;
            }
            match crate::usb::enumerate() {
                Ok(topo) => {
                    let fp = topo.fingerprint();
                    let mut guard = last_fp.lock().unwrap_or_else(|e| e.into_inner());
                    if *guard != fp {
                        *guard = fp;
                        let _ = app.emit("usb://topology-changed", topo);
                    }
                }
                Err(_) => {
                    // Keep polling; UI can refresh manually for errors.
                }
            }
        }
    });
}

pub fn update_fingerprint(store: &Arc<Mutex<String>>, topo: &UsbTopology) {
    if let Ok(mut g) = store.lock() {
        *g = topo.fingerprint();
    }
}
