import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(
  /\/$/,
  "",
);

export type CheckStatus = "pass" | "warn" | "fail" | "notApplicable";

export interface CheckResult {
  id: string;
  status: CheckStatus;
  summary: string;
}

const RUN_ENV = "DEEZ_VERIFY_RUN_ID";

export function runId(): string {
  if (!process.env[RUN_ENV]) {
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("Z", "");
    process.env[RUN_ENV] = `${stamp}-${process.pid}`;
  }
  return process.env[RUN_ENV]!;
}

export function evidenceDir(): string {
  const dir = join(REPO_ROOT, ".tmp-verify", runId());
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(name: string, data: unknown): string {
  const path = join(evidenceDir(), name);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

export function writeBytes(name: string, bytes: Uint8Array): string {
  const path = join(evidenceDir(), name);
  writeFileSync(path, bytes);
  return path;
}

export function writeSummary(results: CheckResult[]): string {
  return writeJson("summary.json", {
    runId: runId(),
    evidenceDir: evidenceDir(),
    results,
  });
}
