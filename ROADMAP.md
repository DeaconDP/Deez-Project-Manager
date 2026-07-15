# Deez Project Manager — Roadmap

Portfolio project dashboard (Tauri) replacing day-to-day Unity Hub / VCC list usage and the spreadsheet’s project backlog.

## Shipped (v1)

- Projects dashboard with Name, Priority, Status (Urgent/Experiment/To Do/WIP/Testing/Maintaining/Done/Broken), Platform, Category (VR/AR/Utility/Web/Game/Client/Backup/Other), GitHub status (Location in edit)
- Drag-and-drop sort with autosaved `sortIndex` (local app-data JSON)
- Add local folder(s) (multi-select; probe Unity version + git remote; path dedupe + link GitHub-only rows)
- Open Unity project / reveal in Explorer
- Import public repos from `DeaconDP` + refresh local git status
- Import Unity Hub + VCC project lists (dedupe by path; link onto GitHub-only rows)
- Slim brand chrome + command bar UX (Import menu, search shortcut)
- Sync parent folders: persistent roots list; scan immediate children and add missing projects

## Epics

### Learn & Tools
- Re-introduce Learn / Tools nav when content exists


### Unity Hub parity
- Detect installed Unity editors and map to projects
- Warn when required editor version is missing
- Editor picker per project; launch with exact version
- Hub-like favorites / cloud status icons where useful

### VCC parity
- Create Avatar / World project from templates
- Package resolve / upgrade UI (“Manage Project”)
- VRChat project type classification (Avatar vs World)
- Template browser
- Read projects from `vcc.litedb` when `userProjects` is empty

### Cashflow ledger
- Monthly income columns, Gross / Nett, currency (from Income & Cashflow sheet)
- Agency / client / region reporting views
- Optional CSV import from the spreadsheet export

### Sync
- Cross-PC metadata + sort sync via private GitHub gist or repo
- Optional GitHub PAT in OS secret store (never commit tokens)
- Rate-limit handling with authenticated API

### Classification & views
- Richer priority presets, tags, active vs archive filters
- Saved views / search presets

### Multi-root scan
- ~~Watch folders (e.g. VRC projects roots) and auto-discover Unity projects~~ — manual Sync parents shipped (immediate children; Add/Remove roots)
- Optional filesystem watch / auto-discover (still open)
- Deduplicate against GitHub-imported backlog (via Sync + import path linking)

## Deferred

- 2026-07-15: Cross-PC metadata sync — v1 is local-first only (`src-tauri/src/store.rs`).
- 2026-07-15: Full Hub/VCC package + create-project — out of v1 scope; list import is shipped (`src-tauri/src/hub_vcc.rs`).
- 2026-07-15: Cashflow months/Gross/Nett UI — spreadsheet fields kept optional on Project; ledger epic later.
- 2026-07-15: GitHub PAT / private repo import — public DeaconDP import only in v1 (`src-tauri/src/github.rs`).
- 2026-07-15: Learn / Tools sidebar stubs hidden until those epics ship — brand chrome only (`src/components/AppChrome.tsx`).
- 2026-07-15: Multi-root filesystem watch / auto-discover — manual Sync parents shipped instead (`src/components/SyncMenu.tsx`).
