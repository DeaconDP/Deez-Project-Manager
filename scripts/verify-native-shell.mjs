#!/usr/bin/env node
/**
 * Prove the Capacitor native shell scaffolding is present.
 * Rerun: npm run native:verify
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const checks = [
  [
    "capacitor.config.ts webDir=dist",
    () => {
      const c = read("capacitor.config.ts");
      return c.includes('webDir: "dist"') && c.includes('appId: "io.worldbuild.deez"');
    },
  ],
  [
    "package.json native scripts",
    () => {
      const p = JSON.parse(read("package.json"));
      return (
        !!p.scripts["native:sync"] &&
        !!p.scripts["native:ios"] &&
        !!p.scripts["native:android"] &&
        !!p.dependencies["@capacitor/core"] &&
        !!p.dependencies["@capacitor/ios"] &&
        !!p.dependencies["@capacitor/android"]
      );
    },
  ],
  ["android/ project present", () => existsSync(join(root, "android/app/src/main"))],
  ["ios/ Xcode project present", () => existsSync(join(root, "ios/App/App.xcodeproj"))],
  [
    "README documents native option",
    () => {
      const r = read("README.md");
      return (
        r.includes("npm run native:ios") &&
        r.includes("npm run native:android") &&
        r.includes("d@worldbuild.io")
      );
    },
  ],
  [
    "ROADMAP Capacitor option active",
    () => {
      const r = read("ROADMAP.md");
      return (
        r.includes("Capacitor") &&
        r.includes("io.worldbuild.deez") &&
        !r.includes("No App Store / Expo / Tauri-iOS until the PWA proves")
      );
    },
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
