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

## Run (Windows)

Double-click **`run.bat`**. It:

1. `git pull --ff-only` when this is a git checkout (skips cleanly if dirty / no fast-forward)
2. `npm install` (every launch)
3. Rebuilds the release EXE when it is missing or source is newer
4. Launches `src-tauri\target\release\deez-project-manager.exe`

Force a rebuild: `run.bat --rebuild`. Create Desktop + Start Menu shortcuts to the same launcher: `run.bat --shortcut`.

**Pin the Desktop or Start Menu shortcut** — not the release EXE under `src-tauri\target`, and not the running app from the taskbar (Windows would re-pin the bare binary and skip rebuild).

If you still open the release EXE directly (or pin it), it self-handoffs to `run.bat` when source is newer or git is behind upstream — then rebuilds and relaunches. **Open on startup** stays on the release EXE for a fast login and skips that check (`--autostart`); the next shortcut launch picks up updates. Enabling the toggle under `tauri dev` is disabled. After the first release launch, turn **Open on startup** back on if you want login autostart.

Do **not** pin the debug EXE or open `http://127.0.0.1:5187` in a browser — that Vite URL has no Tauri IPC.

Installers (optional): `src-tauri\target\release\bundle\nsis\` and `...\msi\`.

## Run (macOS)

Double-click **`run.command`** (or `chmod +x run.command` once if Finder complains). Same flow as Windows:

1. `git pull --ff-only` when this is a git checkout
2. `npm install` (every launch)
3. Rebuilds the release `.app` when it is missing or source is newer
4. Opens `src-tauri/target/release/bundle/macos/Deez Project Manager.app`

Force a rebuild: `./run.command --rebuild`. Shortcuts: `./run.command --shortcut` creates a Desktop `.command` alias and installs `~/Applications/Deez Project Manager.app` (smart launcher + product icon; Finder reveals it for Dock pinning).

**Pin `~/Applications/Deez Project Manager.app` to the Dock** — not the release bundle under `src-tauri/target`. If the release `.app` is opened directly, it self-handoffs to `run.command` when an update is ready (same rules as Windows). Login LaunchAgent / `--autostart` skips the check for a fast start.

Signed/notarized `.dmg` distribution is not included yet; this launches the local release build.

## Development HMR

```bash
npm install
npm run tauri dev
```

Use the desktop window — not a browser tab on `:5187`.

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
