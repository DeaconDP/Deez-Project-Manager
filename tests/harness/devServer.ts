import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DoctorError, VERIFY } from "./codes.ts";
import { inspectPort, verifyOrigin, verifyPort } from "./doctor.ts";
import { REPO_ROOT } from "./evidence.ts";

export interface DevServer {
  readonly origin: string;
  readonly launched: boolean;
}

type Slot = {
  server: DevServer;
  child: ChildProcess | null;
};

let slot: Promise<Slot> | null = null;

export async function useDevServer(): Promise<DevServer> {
  if (!slot) slot = boot();
  return (await slot).server;
}

export async function stopLaunchedServer(): Promise<void> {
  if (!slot) return;
  const live = await slot;
  slot = null;
  if (live.child) {
    live.child.kill("SIGTERM");
    live.child = null;
  }
}

async function boot(): Promise<Slot> {
  const port = verifyPort();
  const origin = verifyOrigin(port);
  const owner = await inspectPort(port);

  if (owner === "reused") {
    await waitHealthy(origin);
    return { server: { origin, launched: false }, child: null };
  }
  if (owner !== "free") {
    throw new DoctorError(
      VERIFY.PORT,
      `port ${port} is held by a process this run did not launch.`,
    );
  }

  const viteBin = join(REPO_ROOT, "node_modules/vite/bin/vite.js");
  if (!existsSync(viteBin)) {
    throw new DoctorError(
      VERIFY.VITE,
      "vite is not installed. Run npm ci first.",
    );
  }

  const child = spawn(
    process.execPath,
    [viteBin, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, BROWSER: "none" },
      stdio: "ignore",
    },
  );

  const stop = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  };
  process.on("exit", stop);

  try {
    await waitHealthy(origin, child);
  } catch (err) {
    stop();
    throw err;
  }

  return { server: { origin, launched: true }, child };
}

async function waitHealthy(origin: string, child?: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  let last = "";
  while (Date.now() < deadline) {
    if (child?.exitCode != null) {
      throw new DoctorError(
        VERIFY.VITE,
        `vite exited ${child.exitCode} before becoming healthy. ${last}`,
      );
    }
    try {
      const res = await fetch(origin, { redirect: "manual" });
      if (res.status < 500) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new DoctorError(
    VERIFY.VITE,
    `vite at ${origin} did not become healthy. ${last}`,
  );
}
