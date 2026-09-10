import assert from "node:assert/strict";
import { after, type TestContext } from "node:test";
import type { Page } from "playwright-core";
import type { Project, Task } from "../../src/types.ts";
import { closeBrowser, useBrowser } from "./chrome.ts";
import { useDevServer } from "./devServer.ts";
import { evidenceDir, writeBytes, writeJson } from "./evidence.ts";
import { seedStorage } from "./seed.ts";

export interface SeedProject extends Partial<Project> {
  name: string;
}

export interface Seed {
  host?: string;
  projects?: SeedProject[];
  tasks?: Task[];
  hostScope?: "this" | "all";
  tab?: "projects" | "overview" | "processes" | "fuel" | "settings";
  storage?: Record<string, string>;
}

export interface App {
  readonly page: Page;
  readonly evidenceDir: string;
  visibleProjectNames(): Promise<string[]>;
  visibleProjectIds(): Promise<string[]>;
  emptyState(): Promise<{ title: string; hint: string } | null>;
  setHostScope(scope: "this" | "all"): Promise<void>;
  openTab(tab: NonNullable<Seed["tab"]>): Promise<void>;
  storedProjects(): Promise<Project[]>;
  shot(name: string): Promise<string>;
  faults(): readonly string[];
}

after(async () => {
  await closeBrowser();
});

export const verify = {
  async open(t: TestContext, seed: Seed = {}): Promise<App> {
    const server = await useDevServer();
    const browser = await useBrowser();
    const storage = seedStorage(seed);
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1280, height: 800 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: server.origin,
            localStorage: Object.entries(storage).map(([name, value]) => ({
              name,
              value,
            })),
          },
        ],
      },
    });
    const page = await context.newPage();
    const faults: string[] = [];

    page.on("pageerror", (err) => {
      faults.push(`pageerror: ${err.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (/Failed to load resource|404 \(Not Found\)|net::ERR_/.test(text)) return;
      faults.push(`console.error: ${text}`);
    });
    page.on("response", (res) => {
      const status = res.status();
      if (status < 400) return;
      let url: URL;
      try {
        url = new URL(res.url());
      } catch {
        return;
      }
      if (url.origin !== server.origin) return;
      if (url.pathname.startsWith("/api/")) return;
      faults.push(`http ${status} ${url.pathname}`);
    });

    const dir = evidenceDir();
    let opened = false;

    const snapshot = async () => {
      try {
        return await page.evaluate(() => {
          const root = document.querySelector("[data-runtime]");
          const tab = document.querySelector(
            '[role="tab"][aria-selected="true"]',
          );
          const pressed = document.querySelector(
            '[aria-label="Host inventory"] [aria-pressed="true"]',
          );
          return {
            runtime: root?.getAttribute("data-runtime") ?? "unknown",
            tab: tab?.id?.replace(/^tab-/, "") ?? null,
            hostScope: pressed?.textContent?.includes("All") ? "all" : "this",
            alerts: [...document.querySelectorAll('[role="alert"]')].map(
              (el) => el.textContent?.trim() ?? "",
            ),
            busyCount: document.querySelectorAll('[aria-busy="true"]').length,
            rowIds: [...document.querySelectorAll('[data-testid="project-row"]')]
              .map((el) => el.getAttribute("data-project-id") ?? "")
              .filter(Boolean),
          };
        });
      } catch {
        return {
          runtime: "unknown",
          tab: null,
          hostScope: "this",
          alerts: [],
          busyCount: 0,
          rowIds: [],
        };
      }
    };

    t.after(async () => {
      const hard = faults.filter((f) => !f.startsWith("http "));
      try {
        if (hard.length > 0 || !opened) {
          const shot = await Promise.race([
            snapshot(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
          ]);
          if (shot) writeJson("failure.json", shot);
        }
      } finally {
        await context.close().catch(() => {});
      }
      assert.deepEqual(hard, [], hard.join("\n"));
    });

    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.locator("[data-runtime]").waitFor({ timeout: 20_000 });
    if (seed.tab && seed.tab !== "projects") {
      await page.getByRole("tab", { name: tabLabel(seed.tab) }).click();
    }
    await settle(page, seed.tab ?? "projects");
    opened = true;

    const app: App = {
      page,
      evidenceDir: dir,
      async visibleProjectNames() {
        return page
          .locator('[data-testid="project-row"] .name-primary')
          .allTextContents()
          .then((names) => names.map((n) => n.trim()));
      },
      async visibleProjectIds() {
        return page
          .locator('[data-testid="project-row"]')
          .evaluateAll((rows) =>
            rows
              .map((row) => row.getAttribute("data-project-id") ?? "")
              .filter(Boolean),
          );
      },
      async emptyState() {
        const box = page.locator(".empty-state");
        if ((await box.count()) === 0) return null;
        const title = (await box.locator(".empty-title").innerText()).trim();
        const hint = (await box.locator(".empty-hint").innerText()).trim();
        return { title, hint };
      },
      async setHostScope(scope) {
        const name = scope === "all" ? "All hosts" : "This host";
        await page.getByRole("button", { name }).click();
        await page
          .getByRole("button", { name })
          .waitFor({ state: "visible" });
      },
      async openTab(tab) {
        await page.getByRole("tab", { name: tabLabel(tab) }).click();
        await page
          .getByRole("tab", { name: tabLabel(tab) })
          .and(page.locator('[aria-selected="true"]'))
          .waitFor();
      },
      async storedProjects() {
        const raw = await page.evaluate(() =>
          localStorage.getItem("deez-projects-store"),
        );
        if (!raw) return [];
        const parsed = JSON.parse(raw) as { projects?: Project[] };
        return parsed.projects ?? [];
      },
      async shot(name) {
        const safe = name.replace(/[^\w.-]+/g, "-");
        const bytes = await page.screenshot({ type: "png", fullPage: true });
        return writeBytes(`${safe}.png`, bytes);
      },
      faults() {
        return faults;
      },
    };
    return app;
  },
};

function tabLabel(tab: NonNullable<Seed["tab"]>): string {
  switch (tab) {
    case "projects":
      return "Projects";
    case "overview":
      return "Overview";
    case "processes":
      return "Processes";
    case "fuel":
      return "Fuel";
    case "settings":
      return "Settings";
  }
}

async function settle(page: Page, tab: NonNullable<Seed["tab"]>): Promise<void> {
  await page.locator(".projects-skeleton").waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  if (tab === "projects") {
    await Promise.race([
      page.locator('[data-testid="project-row"]').first().waitFor({ timeout: 15_000 }),
      page.locator(".empty-state").waitFor({ timeout: 15_000 }),
    ]);
    await page.locator(".save-pill").waitFor({ state: "hidden", timeout: 4_000 }).catch(() => {});
    return;
  }
  await page.locator(`#panel-${tab}`).waitFor({ timeout: 15_000 });
}
