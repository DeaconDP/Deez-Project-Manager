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
- [ ] Seed sample categories/locations from portfolio PDF export (optional CSV)
- [ ] Link existing local clones to imported GitHub rows by `githubRepo` (partial: Hub/VCC import already links)
- [x] Click column headers to sort; Custom handle restores drag order
- [x] Sort by stars (grey ★ header); equal-height header cells (no border kink)
- [x] Omit Location from table; Category = VR / AR / Other (+ Utility / Web / Game / Client)
- [x] Platform icons in table; Vite HMR polling for Tauri webview refresh
- [x] Inline priority dropdowns in projects table (Default → Crit)
- [x] Inline category dropdowns in projects table (VR / AR / Utility / Web / Game / Client / Backup / Other)
- [x] Inline status dropdowns in projects table (Urgent / Experiment / To Do / WIP / Testing / Maintaining / Done / Broken)
- [x] Launch at PC start toggle (Windows autostart via Tauri plugin)
- [x] Sync parent folders (persistent roots; immediate children → add missing)
- [x] Click chrome title to rename (ALL CAPS); persist in localStorage
- [x] Deez logo/icon pack in chrome + favicon + Tauri window icons
