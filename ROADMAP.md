# Deez Project Manager — Roadmap

Portfolio project dashboard (Tauri) replacing day-to-day Unity Hub / VCC list usage and the spreadsheet’s project backlog.

## Shipped (v1)

- Projects dashboard with Name, Priority, Status (Urgent/Experiment/To Do/WIP/Testing/Maintaining/Done/Broken), Platform, Category (VR/AR/Utility/Web/Game/Client/Bot/Backup/Other), GitHub status (Location in edit)
- Drag-and-drop sort with autosaved `sortIndex` (local app-data JSON)
- Add local folder(s) (multi-select; probe Unity version + git remote; path dedupe + link GitHub-only rows)
- Open Unity project / reveal in Explorer
- Run `run.bat` / `run.command` when present (primary); Open in ··· menu
- Import public repos from `DeaconDP` + refresh local git status
- Import Unity Hub + VCC project lists (dedupe by path; link onto GitHub-only rows)
- Slim brand chrome + command bar UX (Import menu, search shortcut)
- Sync parent folders: persistent roots list; scan immediate children and add missing projects
- Machine monitor (Ada): header MetricsGlance (CPU/RAM/GPU/Disk) + tabs Overview / Processes / Fuel / Settings; Fuel + spike data reuse Ada on-disk paths

## Epics

### Learn & Tools
- ~~Re-introduce Learn / Tools nav when content exists~~ — superseded by Projects / Overview / Processes / Fuel / Settings tabs (`src/App.tsx`)

### Machine monitor (Ada)
- [x] Vendor Ada metrics / spikes / net / USB / Fuel into Tauri backend
- [x] Header glance + primary tabs (Projects default)
- [x] Overview gauges, Processes hub (CPU/Network/USB/Spikes), Fuel, Settings
- Polish monitor density to match projects chrome; optional tray later

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

### Project kanban
- Per-project board opened from project name click (Backlog → Priority → Doing → Testing → Done)
- Add task with Opt/Low/Med/High/Crit (color-coded; Opt = store Default); auto-sort on add / priority change
- Task comments (append-only); multi-column drag-and-drop reorder
- Import Trello board JSON export into the open project (list→column map, card dedupe)
- Trello import expansion:
  - Paste raw board JSON or a public Trello board URL
  - Drag-and-drop `.json` files onto the board
  - Import due dates, checklists as Markdown tasks, labels as tags, archived cards, and attachment links
  - Re-sync imported cards with an update-existing mode instead of always skipping duplicates
  - Preview and edit Trello list → kanban column mappings before import
  - Import Trello Premium CSV and generic mapped CSV
  - Choose a destination project or create a project from an imported board
  - Trello REST API personal key/token flow for private boards, board browsing, complete comments, and periodic sync; keep credentials in the OS secret store
  - Full Trello OAuth flow after the personal-token integration
- Deferred: custom columns, WIP limits, comment edit/delete

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
- 2026-07-15: Learn / Tools sidebar stubs — superseded by Projects/Overview/Processes/Fuel/Settings tabs (`src/App.tsx`).
- 2026-07-15: Multi-root filesystem watch / auto-discover — manual Sync parents shipped instead (`src/components/SyncMenu.tsx`).
- 2026-07-16: Shared Ada-Monitor / Deez-USB-Hub Rust crate — vendored copy into PM instead (`src-tauri/src/metrics/`, `src-tauri/src/usb/`, `src-tauri/src/usage/`).
- 2026-07-16: Delete / archive standalone Ada-Monitor app — leave sibling repo; PM is day-to-day home.
- 2026-07-16: Process-list virtualization / gauge CSS redesign during lightening pass — not needed at current load; runtime wins were isolate + idle pace + USB gate (`src/App.tsx`, `src-tauri/src/scheduler.rs`).
- 2026-07-16: Kanban custom columns / WIP limits / comment edit-delete — v1 is fixed columns with append-only comments (`src/components/KanbanBoard.tsx`).
- 2026-07-16: Rename project-table Priority “Default” → “Opt” — board tasks only; projects keep Default (`src/types.ts`).
