import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueGitUpdateIds,
  projectNeedsGitUpdate,
} from "../../src/lib/gitUpdate.ts";

test("gitUpdate: only behind rows are updateable", () => {
  assert.equal(
    projectNeedsGitUpdate({
      localPath: "/a",
      githubStatus: "behind",
      gitBehind: 3,
    }),
    true,
  );
  assert.equal(
    projectNeedsGitUpdate({
      localPath: "/a",
      githubStatus: "clean",
      gitBehind: 0,
    }),
    false,
  );
  assert.equal(
    projectNeedsGitUpdate({
      localPath: null,
      githubStatus: "behind",
      gitBehind: 2,
    }),
    false,
  );
  assert.equal(
    projectNeedsGitUpdate({
      localPath: "/a",
      githubStatus: "diverged",
      gitBehind: 2,
    }),
    false,
  );
});

test("gitUpdate: enqueue stamps actionKind (default pull-behind)", () => {
  const first = enqueueGitUpdateIds([], {}, ["a", "b", "a"]);
  assert.deepEqual(first.queue, ["a", "b"]);
  assert.equal(first.jobs.a?.phase, "queued");
  assert.equal(first.jobs.a?.actionKind, "pull-behind");

  const publish = enqueueGitUpdateIds([], {}, ["c"], "publish-local");
  assert.equal(publish.jobs.c?.actionKind, "publish-local");

  const second = enqueueGitUpdateIds(
    first.queue,
    { ...first.jobs, a: { phase: "running", pct: 55, actionKind: "pull-behind" } },
    ["a", "c"],
  );
  assert.deepEqual(second.queue, ["a", "b", "c"]);
  assert.equal(second.jobs.a?.phase, "running");
  assert.equal(second.jobs.c?.phase, "queued");
});
