# Deez Project Manager

Windows-first Tauri desktop app for your Unity / Unreal / Web / consulting portfolio backlog. Replaces day-to-day Unity Hub + VCC project lists and the spreadsheet’s project registry (Priority, Platform, Category, Location, GitHub status) with drag-and-drop sort that autosaves locally.

Also includes **Ada-Monitor** machine + AI Fuel views: slim CPU/RAM/GPU/Disk glance in the header, and tabs for Overview, Processes (CPU/Network/USB/Spikes), Fuel, and Settings.

Created by deac.online @ worldbuild.io

## Local URL

**http://127.0.0.1:5187** (Vite `strictPort` — does not hop)

## Requirements

- Node.js 20+
- Rust (rustup) + Windows build tools for Tauri

## Run (development)

Double-click **`run.bat`** (Windows) or **`run.command`** (macOS), or:

```bash
npm install
npm run tauri dev
```

Use the **Deez Project Manager desktop window**. Do not open `http://127.0.0.1:5187` in Chrome/Edge — that Vite URL has no Tauri IPC and will error with `invoke`.

`run.bat` / `tauri dev` is for development only. Do **not** pin or shortcut `src-tauri\target\debug\deez-project-manager.exe` — that binary needs Vite running and will open blank alone.

## Desktop shortcut & Start with PC (release)

Daily use needs a **release** build (UI embedded, no Vite). Create a Desktop shortcut with:

```bash
install-shortcut.bat
```

That shortcut points at **`launch-release.bat`**, which:

1. Compares source mtimes to `src-tauri\target\release\deez-project-manager.exe`
2. Runs `npm run tauri build` only when the EXE is missing or stale
3. Launches the release EXE

Double-click `launch-release.bat` for the same behavior without a shortcut. For active coding with HMR, keep using `run.bat` / `tauri dev`.

**Start with PC** still registers the **release EXE** (not the launcher). Enabling it while running under `tauri dev` would register the debug EXE and fail on next boot — the toggle is disabled in dev and clears a bad registration if one exists. After launching the release build once, turn **Start with PC** back on if you want login autostart.

Installers (optional): `src-tauri\target\release\bundle\nsis\` and `...\msi\`.
## v1 features

- Dense projects table (Hub/VCC-style)
- Fields: Name, Priority, Platform, Category (VR/AR/Utility/Web/Game/Client/Bot/Backup/Other), GitHub status (+ Location, path, agency/client/year in edit)
- Drag-and-drop reorder → autosaved to app data (`projects.json`)
- Add local project folder (Unity version + git remote probe)
- Import projects from Unity Hub (`projects-v1.json`) and VCC (`settings.json` userProjects)
- Open with Unity when possible, else Explorer
- Import public GitHub repos for [DeaconDP](https://github.com/DeaconDP?tab=repositories)
- Refresh local git clean/dirty/ahead/behind status

## Not in v1

Full Unity Hub installs UI, VCC package/create-project, cashflow ledger, cross-device sync — see [ROADMAP.md](ROADMAP.md).

## Data

Projects persist under the OS app-data directory for identifier `com.deez.projectmanager` (e.g. `%APPDATA%\com.deez.projectmanager\projects.json` on Windows). Removing a row from the list does **not** delete files on disk.

## License

[MIT](LICENSE)
