# Deez verification map

This directory is the maintained source for verifying user-facing behavior in the browser runtime. Read the index before driving the app, then use the matching feature file.

## Baseline preconditions

- Run `npm ci` once so Vite and `playwright-core` exist.
- Run `npm run test:agent` or `npm run test:browser` from the repo root.
- Doctor must report port 5187 free, or you must set `DEEZ_VERIFY_PORT` / `DEEZ_VERIFY_REUSE=1`.
- Seed through `verify.open(t, seed)`. Do not set `deez-remote-base`.
- Never drive a Vite process this run did not launch unless reuse is explicit.

## Driving conventions

- Start each recipe from `verify.open` so the browser context is fresh.
- Prefer ARIA roles and `data-testid="project-row"` over CSS position.
- Host identity is the mesh `deviceName` (default `deez-verify`).
- Keep proof artifacts. Cleanup must not delete `.tmp-verify/<runId>/`.

## Proof and skip reporting

- Capture the click and the resulting rows or panel, not only a final screenshot.
- Record `notApplicable` for Tauri verbs, Tailscale `/api`, and Capacitor shells.
- Do not report a skipped desktop path as verified through the browser.

## Features

- [Host scope](./host-scope.md) covers This host / All hosts filtering and host stamping.
- [Tabs](./tabs.md) covers the five section tabs and keyboard movement.
- [Overview metrics](./overview-metrics.md) covers metrics soft-fail with no alert.
