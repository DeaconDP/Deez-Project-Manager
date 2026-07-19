# Deez Project Manager

Tauri desktop app for macOS and Windows for your Unity / Unreal / Web / consulting portfolio backlog. Replaces day-to-day Unity Hub + VCC project lists and the spreadsheet’s project registry (Priority, Platform, Category, Location, GitHub status) with drag-and-drop sort that autosaves locally.

Also includes **Ada-Monitor** machine + AI Fuel views: slim CPU/RAM/GPU/Disk glance in the header, and tabs for Overview, Processes (CPU/Network/USB/Spikes), Fuel, and Settings.

Created by deac.online @ worldbuild.io

## Local URL

**http://127.0.0.1:5187** (Vite `strictPort` — does not hop)

## Requirements

- Node.js 20+
- Current stable Rust through [rustup](https://rustup.rs) (selected per project by `rust-toolchain.toml`)
- macOS: Xcode Command Line Tools (`xcode-select --install`); Apple Silicon and Intel are supported for local development
- Windows: Microsoft C++ Build Tools and WebView2 for Tauri

## Run (development)

Double-click **`run.bat`** (Windows) or **`run.command`** (macOS), or:

```bash
npm install
npm run tauri dev
```

Use the **Deez Project Manager desktop window**. Do not open `http://127.0.0.1:5187` in a browser — that Vite URL has no Tauri IPC and will error with `invoke`.

On macOS, Finder may require approval the first time `run.command` opens Terminal. If macOS reports that the script is not executable, run `chmod +x run.command` once.

`run.bat`, `run.command`, and `tauri dev` are for development only. Do **not** pin or shortcut the debug executable — it needs Vite running and will open blank alone.

## Windows desktop shortcut & startup (release)

Daily use needs a **release** build (UI embedded, no Vite). Create a Desktop shortcut with:

```bash
install-shortcut.bat
```

That shortcut points at **`launch-release.bat`**, which:

1. Launches the existing release EXE immediately when source hasn't changed
2. Rebuilds the release EXE first when it is missing or when watched source is newer, then launches — so every launch runs the latest version
3. `launch-release.bat --rebuild` forces a rebuild even when timestamps match

Double-click `launch-release.bat` for the same behavior without a shortcut. If a rebuild fails, the previous EXE is launched as a fallback. For active coding with HMR, keep using `run.bat` / `tauri dev`.

**Open on startup** registers the **release EXE** (not the launcher) under the Windows Run key — login launches skip the rebuild check so sign-in stays fast; the next shortcut/`launch-release.bat` launch picks up source changes. It is registered as a quoted path with `--autostart`. On each launch the app refreshes that entry, clamps the window on-screen if a saved position is mostly off-monitor, and shows + focuses the window so login launches are visible. Enabling the toggle while running under `tauri dev` is disabled — a bad debug registration is cleared if one exists. After launching the release build once, turn **Open on startup** back on if you want login autostart.

Installers (optional): `src-tauri\target\release\bundle\nsis\` and `...\msi\`.

Signed/notarized macOS `.app` and `.dmg` distribution is not included yet; this release workflow remains Windows-only.

## v1 features

- Dense projects table (Hub/VCC-style)
- Fields: Name, Priority, Platform, Category (VR/AR/Utility/Web/Game/Client/Bot/Backup/Other), GitHub status (+ Location, path, agency/client/year in edit)
- Drag-and-drop reorder → autosaved to app data (`projects.json`)
- Add local project folder (Unity version + git remote probe)
- Import projects from Unity Hub (`projects-v1.json`) and VCC (`settings.json` userProjects)
- Open with Unity when possible, else the platform file manager
- Import public GitHub repos for [DeaconDP](https://github.com/DeaconDP?tab=repositories)
- Refresh local git clean/dirty/ahead/behind status

## Not in v1

Full Unity Hub installs UI, VCC package/create-project, cashflow ledger, cross-device sync — see [ROADMAP.md](ROADMAP.md).

## Data

Projects persist under the OS app-data directory for identifier `com.deez.projectmanager` (for example `%APPDATA%\com.deez.projectmanager\projects.json` on Windows or the app-support directory under `~/Library` on macOS). Removing a row from the list does **not** delete files on disk.

## macOS monitor limitations

Core CPU, RAM, disk, host-network, process, project, kanban, GitHub, and Fuel features run on macOS. Native Apple GPU metrics, CPU temperatures, Wi‑Fi details, USB topology, and per-process TCP ownership are not implemented yet; those views show explicit unavailable states instead of fabricated values.

## License

[MIT](LICENSE)
