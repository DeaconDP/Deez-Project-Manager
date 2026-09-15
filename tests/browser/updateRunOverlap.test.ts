import assert from "node:assert/strict";
import test from "node:test";
import { verify } from "../harness/verify.ts";

test("projects: clickable GitHub status does not overlap primary action at phone width", async (t) => {
  const app = await verify.open(t, {
    hostScope: "all",
    projects: [
      {
        name: "Behind-Proj",
        localPath: "behind-proj",
        host: "deez-verify",
        githubStatus: "behind",
        hasRunScript: true,
        priority: "High",
        status: "Active",
        category: "Utility",
        platform: "Web",
      },
    ],
  });

  await app.page.waitForSelector('[data-testid="project-row"]');
  await app.page.waitForSelector("button.git-glance");
  assert.equal(
    await app.page.locator(".gh-update-btn").count(),
    0,
    "legacy .gh-update-btn must be gone",
  );

  await app.page.setViewportSize({ width: 640, height: 900 });
  await app.page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
  });
  await app.page.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-layout") ===
      "phone",
  );

  const metrics = await app.page.evaluate(() => {
    const row = document.querySelector('[data-testid="project-row"]');
    if (!row) return { err: "no row" as const };
    const update = row.querySelector(
      "button.git-glance",
    ) as HTMLElement | null;
    const primary = row.querySelector(
      ".project-action-run, .project-action-open, .project-action-edit, .btn-primary",
    ) as HTMLElement | null;
    const gh = row.querySelector(".col-github") as HTMLElement | null;
    const box = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
      };
    };
    const u = box(update);
    const p = box(primary);
    const g = box(gh);
    const overlapX =
      u && p
        ? Math.max(0, Math.min(u.right, p.right) - Math.max(u.left, p.left))
        : 0;
    const overlapY =
      u && p
        ? Math.max(0, Math.min(u.bottom, p.bottom) - Math.max(u.top, p.top))
        : 0;
    const overflowsGithub =
      u && g ? u.right > g.right + 0.5 || u.left < g.left - 0.5 : false;
    return {
      overlapX,
      overlapY,
      overflowsGithub,
      hasUpdateBtn: !!update,
      legacyUpdateBtn: !!row.querySelector(".gh-update-btn"),
      layout: document.querySelector(".app-shell")?.getAttribute("data-layout"),
    };
  });

  assert.equal(metrics.err, undefined);
  assert.equal(metrics.layout, "phone");
  assert.equal(metrics.hasUpdateBtn, true);
  assert.equal(metrics.legacyUpdateBtn, false);
  assert.equal(
    metrics.overlapX * metrics.overlapY,
    0,
    `Update overlaps primary action (ox=${metrics.overlapX}, oy=${metrics.overlapY})`,
  );
  assert.equal(
    metrics.overflowsGithub,
    false,
    "Update must not paint outside the GitHub column",
  );
  await app.shot("update-run-phone");
});
