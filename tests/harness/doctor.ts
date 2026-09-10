import { execFile } from "node:child_process";
import { readFileSync, readlinkSync } from "node:fs";
import { createConnection } from "node:net";
import { promisify } from "node:util";
import { DoctorError, VERIFY } from "./codes.ts";
import { findChrome } from "./chrome.ts";
import { evidenceDir, runId } from "./evidence.ts";

export { DoctorError, VERIFY };

const execFileAsync = promisify(execFile);

export type PortOwner =
  | "free"
  | "reused"
  | { pid: number; cmd: string; cwd: string | null };

export interface DoctorReport {
  node: string;
  stripTypes: boolean;
  chrome: { path: string; version: string } | null;
  port: number;
  portOwner: PortOwner;
  origin: string;
  runtime: "browser" | "desktop" | "unknown";
  gitHead: string;
  gitDirty: boolean;
  runId: string;
  evidenceDir: string;
}

export function verifyPort(): number {
  const raw = process.env.DEEZ_VERIFY_PORT;
  if (!raw) return 5187;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DoctorError(VERIFY.PORT, `invalid DEEZ_VERIFY_PORT=${raw}`);
  }
  return port;
}

export function verifyOrigin(port = verifyPort()): string {
  return `http://127.0.0.1:${port}`;
}

export function reuseAllowed(): boolean {
  return process.env.DEEZ_VERIFY_REUSE === "1";
}

export async function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

export async function inspectPort(port: number): Promise<PortOwner> {
  if (!(await portInUse(port))) return "free";
  if (reuseAllowed()) return "reused";
  const detail = await readListener(port);
  if (detail) return detail;
  return { pid: 0, cmd: "unknown", cwd: null };
}

async function readListener(
  port: number,
): Promise<{ pid: number; cmd: string; cwd: string | null } | null> {
  try {
    const { stdout } = await execFileAsync("ss", ["-lptn", `sport = :${port}`]);
    const match = stdout.match(/pid=(\d+)/);
    if (match) return describePid(Number(match[1]));
  } catch {}
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    const pid = Number(stdout.trim().split("\n")[0]);
    if (pid) return describePid(pid);
  } catch {}
  return null;
}

function describePid(pid: number): {
  pid: number;
  cmd: string;
  cwd: string | null;
} {
  let cmd = `pid ${pid}`;
  let cwd: string | null = null;
  try {
    cmd = readlinkSync(`/proc/${pid}/exe`);
  } catch {}
  try {
    cwd = readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    cwd = null;
  }
  try {
    const args = readFileSync(`/proc/${pid}/cmdline`, "utf8")
      .replace(/\0/g, " ")
      .trim();
    if (args) cmd = args.slice(0, 180);
  } catch {}
  return { pid, cmd, cwd };
}

async function gitFacts(): Promise<{ head: string; dirty: boolean }> {
  try {
    const [head, dirty] = await Promise.all([
      execFileAsync("git", ["rev-parse", "--short", "HEAD"]),
      execFileAsync("git", ["status", "--porcelain"]),
    ]);
    return {
      head: head.stdout.trim() || "unknown",
      dirty: dirty.stdout.trim().length > 0,
    };
  } catch {
    return { head: "unknown", dirty: false };
  }
}

function nodeMajor(): number {
  return Number(process.versions.node.split(".")[0]);
}

export async function doctor(): Promise<DoctorReport> {
  if (nodeMajor() < 22) {
    throw new DoctorError(
      VERIFY.NODE,
      `Node ${process.version} is too old. Need 22+ for --experimental-strip-types.`,
    );
  }

  const port = verifyPort();
  const origin = verifyOrigin(port);
  let chrome: DoctorReport["chrome"] = null;
  try {
    chrome = await findChrome();
  } catch (err) {
    if (err instanceof DoctorError) throw err;
    throw new DoctorError(VERIFY.CHROME, String(err));
  }

  const portOwner = await inspectPort(port);
  if (typeof portOwner === "object") {
    throw new DoctorError(
      VERIFY.PORT,
      `port ${port} is held by pid ${portOwner.pid} (${portOwner.cmd}` +
        `${portOwner.cwd ? `, ${portOwner.cwd}` : ""}). ` +
        `Kill it, or DEEZ_VERIFY_PORT=${port + 1} npm run test:agent, ` +
        `or DEEZ_VERIFY_REUSE=1 to accept the served tree as-is.`,
    );
  }

  const git = await gitFacts();
  const id = runId();
  return {
    node: process.version,
    stripTypes: true,
    chrome,
    port,
    portOwner,
    origin,
    runtime: "browser",
    gitHead: git.head,
    gitDirty: git.dirty,
    runId: id,
    evidenceDir: evidenceDir(),
  };
}

export function formatDoctor(report: DoctorReport): string {
  const chrome = report.chrome
    ? `${report.chrome.path}  ${report.chrome.version}`
    : "missing";
  let portLine: string;
  if (report.portOwner === "free") {
    portLine = `free. launching vite (127.0.0.1, strictPort)`;
  } else if (report.portOwner === "reused") {
    portLine = `reused (DEEZ_VERIFY_REUSE=1)`;
  } else {
    portLine = `held by pid ${report.portOwner.pid}`;
  }
  return [
    "── doctor ────────────────────────────────────────────",
    `node        ${report.node}  (strip-types ok)`,
    `chrome      ${chrome}`,
    `port ${report.port}   ${portLine}`,
    `runtime     data-runtime="${report.runtime}"   (desktop verbs are skipped, not failed)`,
    `git         ${report.gitHead}  ${report.gitDirty ? "dirty" : "clean"}`,
    `evidence    .tmp-verify/${report.runId}/`,
    "──────────────────────────────────────────────────────",
  ].join("\n");
}
