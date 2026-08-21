# Deez Project Manager

Tauri portfolio project manager for Unity / Unreal / Web / consulting backlog — plus Ada-Monitor machine and AI Fuel views.

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Platform: macOS · Windows](https://img.shields.io/badge/platform-macOS%20%20%7C%20%20Windows-informational)

## Who it’s for

Builders juggling many local projects who want Hub/VCC-style lists, drag-and-drop priority, and a glance at CPU/RAM/GPU/disk and AI usage caps.

## Quick start

**Requires** Node.js 20+, Rust, Xcode CLT (macOS) or MSVC + WebView2 (Windows).

| Platform | How |
|--|--|
| macOS | Double-click **`run.command`** |
| Windows | Double-click **`run.bat`** |

Launches the **release** desktop app (not a browser tab). Dev HMR: `npm run tauri:dev` — use the native window, not `:5187` alone.

### Windows shortcuts

`run.bat --shortcut` creates Desktop + Start Menu shortcuts to the same launcher.

**Pin the Desktop or Start Menu shortcut** — not the release EXE under `src-tauri\target`, and not the running app from the taskbar (Windows would re-pin the bare binary and skip rebuild).

If you still open the release EXE directly (or pin it), it self-handoffs to `run.bat` when source is newer or git is behind upstream — then rebuilds and relaunches. **Open on startup** stays on the release EXE for a fast login and skips that check (`--autostart`); the next shortcut launch picks up updates.

### macOS Dock launcher

`./run.command --shortcut` creates a Desktop `.command` alias and installs `~/Applications/Deez Project Manager.app` (smart launcher + product icon).

**Pin `~/Applications/Deez Project Manager.app` to the Dock** — not the release bundle under `src-tauri/target`. If the release `.app` is opened directly, it self-handoffs to `run.command` when an update is ready (same rules as Windows). Login LaunchAgent / `--autostart` skips the check for a fast start.

Force a rebuild: `run.bat --rebuild` / `./run.command --rebuild`.

## Features

- Projects table with Priority, Platform, Category, GitHub status (ahead/behind)
- Drag-and-drop reorder; autosave to app data
- Import from Unity Hub / VCC; add local folders; GitHub import
- Ada-Monitor: Overview, Processes, Fuel, Settings

## Limitations

- Not a full Unity Hub / VCC replacement (see ROADMAP.md)
- Some macOS metrics (Apple GPU temps, Wi‑Fi, USB topology) show unavailable states

## Development

Sticky Vite port **5187** for `tauri:dev` webview only.

## Credit

Created by [deac.online](https://deac.online) @ [worldbuild.io](https://worldbuild.io)

## License

MIT — see [LICENSE](LICENSE).
