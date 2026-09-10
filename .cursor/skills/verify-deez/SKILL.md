---
name: verify-deez
description: Prove a Deez Project Manager change works. Use when you changed src/ and
  need behavior evidence, not a source grep. Headless Linux friendly.
---

# Verify Deez

```bash
npm ci            # once per VM; node_modules starts empty
npm test          # fast: real-module unit tests + static residue
npm run test:agent  # adds the browser smoke; writes .tmp-verify/<runId>/
```

`test:agent` prints a doctor block first (node, chrome, port 5187 owner, runtime mode, git head, evidence dir). Read it before reading failures. Most red runs are a held port or a missing `npm ci`.

Evidence lands in `.tmp-verify/<runId>/`. Screenshots, `doctor.json`, and `summary.json` are gitignored. Cite the path in your PR. Do not commit it.

## Launch

`test:agent` starts Vite on `127.0.0.1:5187` with `strictPort` when the port is free. Set `DEEZ_VERIFY_PORT` to move it. Do not edit `vite.config.ts` to dodge a collision.

## Doctor

The printed block names who owns 5187. A foreign process fails with `DEEZ-VERIFY-003` unless you set `DEEZ_VERIFY_REUSE=1`. Chrome comes from `google-chrome-stable`, `chromium`, or `DEEZ_CHROME`.

## Drive

Add a browser case in `tests/browser/*.test.ts` with `verify.open(t, seed)`. Add a unit case in `tests/unit/*.test.ts` that imports the real module from `src/`. Never copy app logic into a test. Feature recipes live in `features/`.

## Evidence

A passing agent run writes screenshots plus `doctor.json` and `summary.json`. Results use `pass`, `warn`, `fail`, and `notApplicable`. Browser success does not claim native coverage. A browser fault also writes `failure.json` (runtime, tab, hostScope, alerts, busyCount, rowIds).

## Cleanup

The run closes browser contexts and kills only the Vite process it started. Evidence stays on disk.

## Helpers

`npm run native:verify` checks Capacitor config only. Tauri host verbs, Tailscale `/api/*`, and Capacitor shells cannot run headless. The suite marks those `notApplicable` instead of faking them.
