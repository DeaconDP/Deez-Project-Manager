//! Login / cold-start window visibility and Windows Run-key hygiene.

use tauri::{Manager, PhysicalPosition, Runtime, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

pub const AUTOSTART_ARG: &str = "--autostart";

/// If the window is mostly off any monitor (e.g. missing second display), center it.
/// Always show + focus so login launches aren't buried or left hidden by window-state.
pub fn ensure_main_window_visible<R: Runtime>(app: &impl Manager<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    clamp_window_on_screen(&window);
    let _ = window.show();
    let _ = window.set_focus();
}

fn clamp_window_on_screen<R: Runtime>(window: &WebviewWindow<R>) {
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let Ok(monitors) = window.available_monitors() else {
        return;
    };
    if monitors.is_empty() {
        return;
    }

    let wx = i64::from(pos.x);
    let wy = i64::from(pos.y);
    let ww = i64::from(size.width);
    let wh = i64::from(size.height);
    let total = ww.saturating_mul(wh);
    if total <= 0 {
        return;
    }

    let mut max_visible = 0i64;
    for m in &monitors {
        let mp = m.position();
        let ms = m.size();
        let mx = i64::from(mp.x);
        let my = i64::from(mp.y);
        let mw = i64::from(ms.width);
        let mh = i64::from(ms.height);
        let ix = wx.max(mx);
        let iy = wy.max(my);
        let ix2 = (wx + ww).min(mx + mw);
        let iy2 = (wy + wh).min(my + mh);
        let area = (ix2 - ix).max(0) * (iy2 - iy).max(0);
        if area > max_visible {
            max_visible = area;
        }
    }

    // Less than half visible → center on primary (or first) monitor.
    if max_visible * 2 >= total {
        return;
    }

    let target = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| monitors.into_iter().next());
    let Some(m) = target else {
        return;
    };
    let mp = m.position();
    let ms = m.size();
    let nx = mp.x + ((ms.width as i32 - size.width as i32) / 2).max(0);
    let ny = mp.y + ((ms.height as i32 - size.height as i32) / 2).max(0);
    let _ = window.set_position(PhysicalPosition::new(nx, ny));
}

/// Refresh Run registration to current EXE + args, then quote the Windows value.
pub fn refresh_autostart_registration<R: Runtime>(app: &impl Manager<R>) {
    let mgr = app.autolaunch();
    match mgr.is_enabled() {
        Ok(true) => {
            let _ = mgr.enable();
            #[cfg(windows)]
            quote_run_key(&app.package_info().name);
        }
        Ok(false) | Err(_) => {}
    }
}

#[cfg(windows)]
fn quote_run_key(app_name: &str) {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let cmd = format!("\"{}\" {AUTOSTART_ARG}", exe.display());
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(key) = hkcu.open_subkey_with_flags(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
        KEY_SET_VALUE,
    ) else {
        return;
    };
    let _ = key.set_value(app_name, &cmd);
}

#[cfg(test)]
mod tests {
    #[test]
    fn autostart_arg_is_stable() {
        assert_eq!(super::AUTOSTART_ARG, "--autostart");
    }
}
