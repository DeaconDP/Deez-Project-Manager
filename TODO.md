# Deez Project Manager — TODO

## Active

- [x] Scaffold Tauri 2 + React-TS; Vite `5187` strictPort; cyberpunk shell
- [x] Project model + app-data JSON load/save with debounce
- [x] Projects table (Name / Priority / Platform / Category / Location / GitHub)
- [x] Drag-and-drop sort autosave
- [x] DnD polish: lightweight DragOverlay ghost, vertical lock, translate-only transforms
- [x] DnD smooth slides: grid rows + row-matched overlay + 250ms FLIP easing
- [x] DnD smooth slides: CSS-grid div table + opacity-only enter (no transform fight)
- [x] Add folder, probe, Open / Reveal with action feedback
- [x] Add multiple project folders (multi-select; path dedupe + GitHub-row link)
- [x] Import DeaconDP repos + refresh git statuses
- [x] Import from Unity Hub + VCC project lists
- [x] `run.bat` / `run.command`, ROADMAP, README
- [x] macOS local development: native launch paths, Unity bundle discovery, portable probes, and verified `run.command`
- [x] Fix macOS native folder/file picker event-loop freeze

## Next (post-v1 polish)

- [x] Color-code rows + priority badges (Default → Crit)
- [x] Soft-archive trash icon + Active/Archive filter with restore
- [x] Mobile-friendly shell + project cards (≤900px chrome + card list)
- [x] Mobile: no page L/R scroll; denser ≤900px chrome; cards at ≤900px
- [x] iPad/tablet: narrow shell + cards through ≤1180px; phone denser ≤700px
- [x] Loading animations: spinner, feedback pulse, initial skeleton, busy button labels
- [x] Desktop density: tighter chrome, table cells, empty state, modal; `--space-*` tokens
- [x] UI zoom control (−/%/+) with zoom-aware narrow/phone layout density
- [x] UX overhaul: slim brand chrome (hide Learn/Tools stubs), Import menu, denser table actions
- [x] Card list Category/Location parity; empty state primary Add; list enter stagger
- [x] Themed archive confirm + edit modal field groups, validation, Esc/dirty close, path Browse
- [x] Keyboard shortcut: focus search (`/` or Ctrl/Cmd+K)
- [x] Mobile/narrow use same table as desktop (scroll + sticky name cols); toolbar matches desktop wrap
- [x] No table L/R scrollbar — clip X, fluid columns (no min-width force)
- [x] Phone: icon-only Platform / Priority / Status / Category / GitHub columns (≤700px)
- [ ] Seed sample categories/locations from portfolio PDF export (optional CSV)
- [ ] Link existing local clones to imported GitHub rows by `githubRepo` (partial: Hub/VCC import already links)
- [x] Click column headers to sort; Custom handle restores drag order
- [x] Persist table sort (column + dir) in localStorage across restarts
- [x] Header sort perf: skip DnD off Custom; enter-fade once; dir toggle reverses
- [x] Drag while column-sorted auto-switches to Custom and saves order
- [x] Sort by stars (grey ★ header); equal-height header cells (no border kink)
- [x] Omit Location from table; Category = VR / AR / Other (+ Utility / Web / Game / Client)
- [x] Platform icons in table; Vite HMR polling for Tauri webview refresh
- [x] Inline priority dropdowns in projects table (Default → Crit)
- [x] Inline category dropdowns in projects table (VR / AR / Utility / Web / Game / Client / Bot / Backup / Other)
- [x] Category: Bot
- [x] Inline status dropdowns in projects table (Urgent / Experiment / To Do / WIP / Testing / Maintaining / Done / Broken)
- [x] Launch at PC start toggle (Windows autostart via Tauri plugin)
- [x] Release desktop shortcut + guard Start with PC in DEV (no debug EXE registration)
- [x] Smart release launcher: auto-rebuild when source newer than EXE, then launch; `--rebuild` forces
- [x] Dock / EXE rebuild-on-update: pin-friendly launcher shortcuts + release-binary handoff when update ready
- [x] Sync parent folders (persistent roots; immediate children → add missing)
- [x] Sync menu: Sync all roots in one pass (+ per-folder still available)
- [x] Click chrome title to rename (ALL CAPS); persist in localStorage
- [x] Deez logo/icon pack in chrome + favicon + Tauri window icons
- [x] Detect Unreal (`.uproject`) + AI tools (Cursor/Claude/Codex/OpenCode) on Add/Sync; tool icons in Platform cell
- [x] Re-probe existing on Sync/import (engine probe overwrites wrong platform e.g. Unity→Unreal; merge tools)
- [x] Bulk engine re-probe after paint via `heal_project_engines` (heals stuck Unity labels; nested `.uproject` depth-2)
- [x] Smart primary: Run when `run.bat`/`run.command` exists; Open in ··· (Unity editor / Explorer fallback)
- [x] Toolbar Refresh: prune missing local folders from dashboard + list removed paths
- [x] Git sync fields (`gitAhead`/`gitBehind`/`gitBranch`/`gitDirty`); sync status beats dirty
- [x] Explicit ahead/behind/diverged row outlines + count labels in GitHub column
- [x] Staggered background `git fetch` by priority after Refresh; `git-sync-updated` UI merge
- [x] Responsiveness: fast `get_projects` + background `heal_project_engines`
- [x] Responsiveness: bulk `check_paths_exist` prune (no sequential probe)
- [x] Responsiveness: parallel git refresh; engine-only Sync enrich (git remote only for new/link)
- [x] Responsiveness: DnD only on Custom sort; memo rows; stable `useAsyncAction.run`
- [x] Responsiveness: shared Metrics/Fuel context; idle sampler on Projects; lazy monitor/kanban

## Project kanban

- [x] Task model + `ProjectStore.tasks` (TS + Rust); empty-default migrate
- [x] useProjects task CRUD + priority auto-insert; useTasks project scope
- [x] Click project name → kanban; Back to Projects
- [x] KanbanBoard columns + Add task + Opt-labeled priority colors
- [x] Task detail modal: fields + append comments with busy feedback
- [x] Multi-container dnd-kit across Backlog → Done
- [x] Import Trello board JSON into open project

## Machine monitor (Ada)

- [x] Vendor Ada Rust modules (metrics, net, spikes, USB, Fuel) + Cargo deps; wire schedulers in `lib.rs`
- [x] Header MetricsGlance (CPU/RAM/GPU/Disk) + Live status in AppChrome
- [x] Primary tabs: Projects (default) / Overview / Processes / Fuel / Settings
- [x] Processes sub-tabs: CPU/RAM · Network · USB · Spikes
- [x] Fuel panel + Overview fuel pins; reuse Ada fuel/spike on-disk paths
- [x] Settings tab owns Open on startup (chrome AutostartToggle removed)
- [x] Open on startup: clamp/show/focus after login; quote Run key; DEV clears debug registration
- [x] Runtime lightening: isolate metrics/fuel from Projects re-renders; idle sampler pace; USB watch gated; strip agent debug I/O
- [x] Header glance: true center (3-col grid chrome) + load-tier value colors (blue/green/yellow, orange >100%)

## Mesh network (gist hub)

- [x] Private GitHub gist hub (`deez-mesh.json`) for projects + tasks
- [x] LWW merge by `updatedAt`; keep per-device `localPath` / git probe / sync roots
- [x] Settings: Join mesh, device name, gist ID, PAT, Sync now, peer count
- [x] Desktop PAT via protected credential store; PWA via device storage
- [x] Auto-sync on enable, after local saves, and every ~90s
- [x] Browser/PWA store fallback so iPhone / Android can join
- [x] `scripts/serve-mesh.sh` + web manifest for LAN phone install

## Tailscale live node + phone PWA

- [x] Settings: Tailscale IPv4 / MagicDNS detect + sticky remote port; copy URL + QR
- [x] Host HTTP (tailnet bind only): serve `dist/` + read `GET` projects / metrics / fuel snapshot
- [x] PWA manifest + minimal SW; verify iPhone Add to Home Screen on MagicDNS URL
- [x] `api.ts` fetch adapter when not in Tauri; hide/disable Open Unity / Reveal / folder pickers in browser
- [x] Optional shared-secret header on remote API (tailnet ACL still primary)
- [x] Remote write: status / priority / kanban via existing `save_projects` path
- [x] Settings peer list (MagicDNS names) + switch active node from phone

## Fleet ops (OpenShip thin adapter)

- [x] Project fleet fields: siteId / openshipProjectId / preview+live URLs / host / stickyPort / launchCmd / lastBuildAt
- [x] Settings → OpenShip: API URL + PAT (credential store) + CLI status
- [x] Row overflow (fleet rows only): Ship Preview · Promote Live · Update Local · OpenShip status · open URLs
- [x] `scripts/dale-auto-rebuild.sh` shared helper contract
- [x] Per-host inventory: stamp `host`, default **This host** filter, mesh keeps sticky path/port local (Ada ≠ Edgar)
- [x] Product vs surface: shared `siteId` + `surface` label; Native platform; Emily-style multi-app = many rows
- [ ] Per site (deac-online / worldbuild / …): classify news & dynamic content as **in-repo** | **host-db/CMS** | **live-feed** | **external-CMS** — decides if Promote Live (`git` / `edgar`) is enough or a content-sync verb is needed
- [ ] Wire deac-online pilot row against Ada OpenShip (needs Ada always-on + domain)
- [ ] Rollback verb + site-ops health glance on the same row
