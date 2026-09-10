import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium, type Browser } from "playwright-core";
import { DoctorError, VERIFY } from "./codes.ts";

const execFileAsync = promisify(execFile);

const CANDIDATES = [
  process.env.DEEZ_CHROME,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/opt/google/chrome/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((p): p is string => !!p);

let browserPromise: Promise<Browser> | null = null;

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    /* already closed */
  }
}

export async function findChrome(): Promise<{ path: string; version: string }> {
  for (const path of CANDIDATES) {
    if (!existsSync(path)) continue;
    try {
      const { stdout } = await execFileAsync(path, ["--version"], {
        timeout: 5000,
      });
      return { path, version: stdout.trim() };
    } catch {
      return { path, version: "unknown" };
    }
  }
  throw new DoctorError(
    VERIFY.CHROME,
    "Chrome not found. Set DEEZ_CHROME to a chromium binary.",
  );
}

export async function useBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const chrome = await findChrome();
      try {
        const browser = await chromium.launch({
          executablePath: chrome.path,
          headless: true,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        });
        const stop = () => {
          void browser.close().catch(() => {});
        };
        process.on("exit", stop);
        return browser;
      } catch (err) {
        browserPromise = null;
        throw new DoctorError(
          VERIFY.BROWSER,
          err instanceof Error ? err.message : String(err),
        );
      }
    })();
  }
  return browserPromise;
}
