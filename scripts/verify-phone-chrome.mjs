#!/usr/bin/env node
/**
 * Prove phone/PWA chrome gates host-only actions.
 * Rerun: node scripts/verify-phone-chrome.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const table = readFileSync(join(root, "src/components/ProjectsTable.tsx"), "utf8");
const settings = readFileSync(
  join(root, "src/monitor/components/SettingsPanel.tsx"),
  "utf8",
);
const modal = readFileSync(
  join(root, "src/components/ProjectEditModal.tsx"),
  "utf8",
);
const css = readFileSync(join(root, "src/App.css"), "utf8");

const checks = [
  ["App gates desktop with isDesktopApp", () => app.includes("isDesktopApp()")],
  [
    "App sets data-runtime browser|desktop",
    () => /data-runtime=\{desktop \? "desktop" : "browser"\}/.test(app),
  ],
  [
    "App hides Sync/Import/Add when !desktop",
    () =>
      app.includes("{desktop ? (") &&
      app.includes("<SyncMenu") &&
      app.includes("<ImportMenu") &&
      app.includes('"+ Add project"'),
  ],
  [
    "App omits host Open/Run/Reveal on phone",
    () =>
      app.includes("onOpen={desktop ? onOpenProject : undefined}") &&
      app.includes("onRun={desktop ? onRunProject : undefined}") &&
      app.includes("onReveal={desktop ? onRevealProject : undefined}"),
  ],
  [
    "Table host actions optional + Edit primary on phone",
    () =>
      table.includes("hostActions") &&
      table.includes("project-action-edit") &&
      table.includes("onOpen?: (project: Project) => void"),
  ],
  [
    "Settings soft-fails remoteGetInfo on phone",
    () =>
      settings.includes("Phone mesh-only PWA has no /api host") &&
      settings.includes("if (!desktop)"),
  ],
  [
    "Edit modal hides Browse off desktop",
    () => modal.includes("{desktop ? (") && modal.includes('"Browse…"'),
  ],
  [
    "Safe-area insets for PWA notches",
    () => css.includes("safe-area-inset-top"),
  ],
];

let failed = 0;
for (const [name, fn] of checks) {
  const ok = fn();
  console.log(`${ok ? "ok" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\n${checks.length} checks passed`);
