# Deez Project Manager

Tauri portfolio project manager for Unity / Unreal / Web / consulting backlog — plus Ada-Monitor machine and AI Fuel views.

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Platform: macOS · Windows · Linux · PWA · Capacitor](https://img.shields.io/badge/platform-macOS%20%20%7C%20%20Windows%20%20%7C%20%20Linux%20%20%7C%20%20PWA%20%20%7C%20%20Capacitor-informational)

## Who it’s for

Builders juggling many local projects who want Hub/VCC-style lists, drag-and-drop priority, and a glance at CPU/RAM/GPU/disk and AI usage caps — synced across every machine and phone as a mesh.

## Quick start

**Requires** Node.js 20+, Rust, Xcode CLT (macOS) or MSVC + WebView2 (Windows). Linux needs standard Tauri/WebKitGTK deps.

| Platform | How |
|--|--|
| macOS | Double-click **`run.command`** |
| Windows | Double-click **`run.bat`** |
| Linux | `npm run tauri -- build` then run the AppImage/deb, or `npm run tauri -- dev` |
| iPhone / Android (PWA) | On an always-on box: `./scripts/serve-mesh.sh` → open the LAN URL → Add to Home Screen; or Tailscale live-node URL from Settings |
| iPhone / Android (native) | Capacitor shell around the same `dist/` — see **Native phone apps** below |

Launches the **release** desktop app (not a browser tab). Dev HMR: `npm run tauri:dev` — use the native window, not `:5187` alone.

### Native phone apps (Capacitor)

Same React UI as the PWA, wrapped for TestFlight / Play Store. Not a second product.

```bash
npm install
npm run native:sync          # vite build + cap sync into ios/ and android/
npm run native:ios           # opens Xcode (macOS)
npm run native:android       # opens Android Studio
```

- **iOS / TestFlight.** Needs a Mac with Xcode. Signing and Apple team membership: **d@worldbuild.io**. Bundle id `io.worldbuild.deez`.
- **Android.** Open the `android/` project in Android Studio, run on a device/emulator, or build a release bundle there.
- Verify scaffolding anytime: `npm run native:verify`.

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
- **Mesh network**: one private GitHub gist links all devices (Macs, PCs, Linux, iPhone, Android). Projects + kanban tasks sync; local folder paths stay on each machine.

### Link your devices (mesh)

1. Create a GitHub PAT with **`gist`** scope (classic) — never commit it.
2. On the first device → **Settings → Mesh network** → paste PAT → **Save PAT** → **Sync now** (creates a private gist).
3. Copy the **Gist ID** shown after sync.
4. On every other device (and the phone PWA): same PAT → paste that Gist ID → **Save name / gist** → **Join mesh** → **Sync now**.
5. Leave **Join mesh** on; the app pulls/pushes after edits and about every 90s.

Phones are metadata/kanban nodes. Desktop apps still own Unity / Explorer / `run.*` actions.

## Limitations

- Not a full Unity Hub / VCC replacement (see ROADMAP.md)
- Some macOS metrics (Apple GPU temps, Wi‑Fi, USB topology) show unavailable states
- Mesh does not sync machine-local paths or Ada metrics

## Development

Sticky Vite port **5187** for `tauri:dev` webview only. LAN PWA: `./scripts/serve-mesh.sh`.

## Credit

Created by [deac.online](https://deac.online) @ [worldbuild.io](https://worldbuild.io)

## License

MIT — see [LICENSE](LICENSE).
