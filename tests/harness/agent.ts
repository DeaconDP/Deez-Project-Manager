import { spawn } from "node:child_process";
import { DoctorError } from "./codes.ts";
import { stopLaunchedServer, useDevServer } from "./devServer.ts";
import { doctor, formatDoctor } from "./doctor.ts";
import { writeJson, writeSummary, type CheckResult } from "./evidence.ts";

const results: CheckResult[] = [];

function record(id: string, status: CheckResult["status"], summary: string) {
  results.push({ id, status, summary });
}

function runScript(script: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("npm", script === "test" ? ["test"] : ["run", script], {
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function skipDesktop(): void {
  record(
    "tauri-host-verbs",
    "notApplicable",
    "Open/Run/Reveal/Import/Sync need a desktop session",
  );
  record(
    "remote-api",
    "notApplicable",
    "axum /api binds Tailscale CGNAT only (REMOTE-032)",
  );
  record(
    "capacitor",
    "notApplicable",
    "phone shells stay on npm run native:verify",
  );
}

try {
  const report = await doctor();
  console.log(formatDoctor(report));
  writeJson("doctor.json", report);
  record("doctor", "pass", `port ${report.port} ${report.portOwner}`);

  const unit = await runScript("test");
  record("unit", unit === 0 ? "pass" : "fail", "npm test");
  if (unit !== 0) {
    skipDesktop();
    writeSummary(results);
    process.exit(unit);
  }

  if (report.portOwner === "free") {
    await useDevServer();
  }
  const browser = await runScript("test:browser", { DEEZ_VERIFY_REUSE: "1" });
  record("browser", browser === 0 ? "pass" : "fail", "npm run test:browser");
  skipDesktop();
  const summaryPath = writeSummary(results);
  await stopLaunchedServer();

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(
    `\n${passed} pass  ${failed} fail\nevidence: ${report.evidenceDir} (doctor.json, summary.json)`,
  );
  console.log(`summary: ${summaryPath}`);
  process.exit(browser);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`FAIL doctor: ${message}`);
  if (err instanceof DoctorError) {
    record("doctor", "fail", `${err.code} ${message}`);
  } else {
    record("doctor", "fail", message);
  }
  skipDesktop();
  writeSummary(results);
  process.exit(1);
}
