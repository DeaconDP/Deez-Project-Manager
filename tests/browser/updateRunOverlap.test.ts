import assert from "node:assert/strict";
import test from "node:test";
import { verify } from "../harness/verify.ts";

const WIDTHS = [390, 640, 900, 1280] as const;
const ZOOM_FROM = [75, 85, 100, 110, 125] as const;
/** Minimum clear air between glance and Run in pre-zoom CSS pixels. */
const MIN_GAP_CSS_PX = 10;
/** Category↔git and git↔Run should match within this tolerance. */
const SIDE_GAP_TOLERANCE_CSS_PX = 2;

async function setUiZoom(
  page: {
    locator: (s: string) => {
      textContent: () => Promise<string | null>;
    };
    getByRole: (
      role: string,
      opts: { name: string },
    ) => { click: () => Promise<void> };
    waitForTimeout: (ms: number) => Promise<void>;
  },
  target: number,
) {
  for (let i = 0; i < 24; i++) {
    const label = (await page.locator(".zoom-label").textContent()) ?? "";
    const z = Number.parseInt(label, 10);
    if (z === target) return;
    if (Number.isNaN(z)) throw new Error(`bad zoom label: ${label}`);
    if (z < target) await page.getByRole("button", { name: "Zoom in" }).click();
    else await page.getByRole("button", { name: "Zoom out" }).click();
    await page.waitForTimeout(40);
  }
  throw new Error(`could not reach zoom ${target}`);
}

test("projects: git glance matches square field icons and never overlaps Run", async (t) => {
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

  for (const width of WIDTHS) {
    await app.page.setViewportSize({ width, height: 900 });
    await setUiZoom(app.page, 100);
    await app.page.evaluate(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await app.page.waitForTimeout(120);

    const metrics = await app.page.evaluate(() => {
      const row = document.querySelector('[data-testid="project-row"]');
      if (!row) return { err: "no row" as const };
      const glance = row.querySelector(".git-glance") as HTMLElement | null;
      const category = row.querySelector(
        ".col-category .priority-picker-trigger, .col-category .badge.badge-icon, .col-category button",
      ) as HTMLElement | null;
      const square = row.querySelector(
        ".col-priority .priority-picker.is-icon-only .priority-picker-trigger, .col-priority .priority-picker-trigger, .badge.badge-icon",
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
          height: r.height,
        };
      };
      const g = box(glance);
      const cat = box(category);
      const s = box(square);
      const p = box(primary);
      const c = box(gh);
      const zoom = Number.parseFloat(
        document.documentElement.style.zoom || "1",
      );
      const overlapX =
        g && p
          ? Math.max(0, Math.min(g.right, p.right) - Math.max(g.left, p.left))
          : 0;
      const overlapY =
        g && p
          ? Math.max(0, Math.min(g.bottom, p.bottom) - Math.max(g.top, p.top))
          : 0;
      const gapCss = g && p ? (p.left - g.right) / zoom : null;
      const catToGitCss = g && cat ? (g.left - cat.right) / zoom : null;
      const overflowsGithub =
        g && c ? g.right > c.right + 0.5 || g.left < c.left - 0.5 : false;
      const layout = document
        .querySelector(".app-shell")
        ?.getAttribute("data-layout");
      const sizeMatch =
        layout === "phone" && g && s
          ? Math.abs(g.width - s.width) < 1 && Math.abs(g.height - s.height) < 1
          : true;
      return {
        layout,
        overlapX,
        overlapY,
        gapCss,
        catToGitCss,
        overflowsGithub,
        sizeMatch,
        glance: g,
        square: s,
        hasGlance: !!glance,
      };
    });

    assert.equal(metrics.err, undefined, `width ${width}`);
    assert.equal(metrics.hasGlance, true, `width ${width}: missing glance`);
    assert.equal(
      metrics.overlapX * metrics.overlapY,
      0,
      `width ${width}: glance overlaps primary (ox=${metrics.overlapX}, oy=${metrics.overlapY})`,
    );
    assert.equal(
      metrics.overflowsGithub,
      false,
      `width ${width}: glance paints outside GitHub column`,
    );
    assert.equal(
      metrics.sizeMatch,
      true,
      `width ${width}: glance ${JSON.stringify(metrics.glance)} vs square ${JSON.stringify(metrics.square)}`,
    );
    if (metrics.gapCss != null) {
      assert.ok(
        metrics.gapCss + 0.01 >= MIN_GAP_CSS_PX,
        `width ${width}@100%: gapCss=${metrics.gapCss} < ${MIN_GAP_CSS_PX}`,
      );
    }
    if (metrics.catToGitCss != null && metrics.gapCss != null) {
      assert.ok(
        Math.abs(metrics.catToGitCss - metrics.gapCss) <= SIDE_GAP_TOLERANCE_CSS_PX,
        `width ${width}: cat→git ${metrics.catToGitCss} vs git→Run ${metrics.gapCss}`,
      );
    }
  }

  await app.page.setViewportSize({ width: 640, height: 900 });
  for (const zoom of ZOOM_FROM) {
    await setUiZoom(app.page, zoom);
    await app.page.evaluate(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await app.page.waitForTimeout(100);

    const gap = await app.page.evaluate(() => {
      const row = document.querySelector('[data-testid="project-row"]');
      const glance = row?.querySelector(".git-glance");
      const category = row?.querySelector(
        ".col-category .priority-picker-trigger, .col-category .badge.badge-icon, .col-category button",
      );
      const primary = row?.querySelector(
        ".project-action-run, .project-action-open, .project-action-edit, .btn-primary",
      );
      if (!glance || !primary) return { err: "missing" as const };
      const g = glance.getBoundingClientRect();
      const p = primary.getBoundingClientRect();
      const c = category?.getBoundingClientRect();
      const z = Number.parseFloat(document.documentElement.style.zoom || "1");
      const ox = Math.max(0, Math.min(g.right, p.right) - Math.max(g.left, p.left));
      const oy = Math.max(
        0,
        Math.min(g.bottom, p.bottom) - Math.max(g.top, p.top),
      );
      return {
        gapCss: (p.left - g.right) / z,
        catToGitCss: c ? (g.left - c.right) / z : null,
        overlap: ox * oy,
        layout: document.querySelector(".app-shell")?.getAttribute("data-layout"),
      };
    });

    assert.equal(gap.err, undefined, `zoom ${zoom}`);
    assert.equal(gap.overlap, 0, `zoom ${zoom}: bounding-box overlap`);
    assert.ok(
      (gap.gapCss ?? 0) + 0.01 >= MIN_GAP_CSS_PX,
      `zoom ${zoom}: gapCss=${gap.gapCss} < ${MIN_GAP_CSS_PX} (layout=${gap.layout})`,
    );
    if (gap.catToGitCss != null && gap.gapCss != null) {
      assert.ok(
        Math.abs(gap.catToGitCss - gap.gapCss) <= SIDE_GAP_TOLERANCE_CSS_PX,
        `zoom ${zoom}: cat→git ${gap.catToGitCss} vs git→Run ${gap.gapCss}`,
      );
    }
  }

  await setUiZoom(app.page, 100);
  await app.page.waitForFunction(
    () =>
      document.querySelector(".app-shell")?.getAttribute("data-layout") ===
      "phone",
  );
  await app.shot("update-run-phone");
});
