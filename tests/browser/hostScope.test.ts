import assert from "node:assert/strict";
import test from "node:test";
import { verify } from "../harness/verify.ts";

test("hostScope: empty store shows No projects on this host", async (t) => {
  const app = await verify.open(t);
  const empty = await app.emptyState();
  assert.ok(empty);
  assert.equal(empty.title, "No projects on this host.");
  await app.shot("scope-empty");
});

test("This host hides other-box stamps; All hosts shows them", async (t) => {
  const app = await verify.open(t, {
    host: "deez-verify",
    projects: [
      { name: "Here", host: "deez-verify" },
      { name: "Pathed", localPath: "/tmp/deez-fixture" },
      { name: "Elsewhere", host: "other-box" },
    ],
  });

  await app.page.locator('[data-testid="project-row"] .name-primary', {
    hasText: "Here",
  }).waitFor();
  assert.deepEqual(await app.visibleProjectNames(), ["Here", "Pathed"]);
  await app.shot("scope-this");

  await app.setHostScope("all");
  assert.deepEqual(await app.visibleProjectNames(), [
    "Here",
    "Pathed",
    "Elsewhere",
  ]);
  await app.shot("scope-all");
});

test("hostScope: localPath row gets stamped with this host and persists", async (t) => {
  const app = await verify.open(t, {
    host: "deez-verify",
    projects: [{ name: "Pathed", localPath: "/tmp/deez-fixture" }],
  });

  await app.page.waitForFunction(() => {
    const raw = localStorage.getItem("deez-projects-store");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      projects?: { name: string; host?: string | null }[];
    };
    return parsed.projects?.some((p) => p.name === "Pathed" && !!p.host?.trim());
  });

  const before = await app.storedProjects();
  const stamped = before.find((p) => p.name === "Pathed")?.host ?? null;
  assert.ok(stamped);
  await app.page.reload({ waitUntil: "domcontentloaded" });
  await app.page.locator('[data-testid="project-row"]').first().waitFor();
  const after = await app.storedProjects();
  assert.equal(after.find((p) => p.name === "Pathed")?.host, stamped);
  assert.deepEqual(await app.visibleProjectNames(), ["Pathed"]);
  await app.shot("scope-stamp");
});
