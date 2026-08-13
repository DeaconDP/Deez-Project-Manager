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

Launches the **release** desktop app (not a browser tab). Dev HMR: `npm run tauri:dev` — use the native window, not `:5194` alone.

## Features

- Projects table with Priority, Platform, Category, GitHub status
- Drag-and-drop reorder; autosave to app data
- Import from Unity Hub / VCC; add local folders; GitHub import
- Ada-Monitor: Overview, Processes, Fuel, Settings

## Limitations

- Not a full Unity Hub / VCC replacement (see ROADMAP.md)
- Some macOS metrics (Apple GPU temps, Wi‑Fi, USB topology) show unavailable states

## Development

Sticky Vite port **5194** for `tauri:dev` webview only.

## Credit

Created by [deac.online](https://deac.online) @ [worldbuild.io](https://worldbuild.io)

## License

MIT — see [LICENSE](LICENSE).
