/**
 * Smoke test for git update queue helpers.
 * Run: node scripts/test-git-update.mjs
 */
import assert from "node:assert/strict";

const UPDATEABLE = new Set(["behind"]);

function projectNeedsGitUpdate(project) {
  if (!project.localPath?.trim()) return false;
  if (!UPDATEABLE.has(project.githubStatus)) return false;
  return (project.gitBehind ?? 0) > 0 || project.githubStatus === "behind";
}

function enqueueGitUpdateIds(currentQueue, jobs, ids) {
  const queue = [...currentQueue];
  const nextJobs = { ...jobs };
  const pending = new Set(queue);
  for (const id of ids) {
    const existing = nextJobs[id];
    if (pending.has(id)) continue;
    if (existing?.phase === "running" || existing?.phase === "queued") continue;
    queue.push(id);
    pending.add(id);
    nextJobs[id] = { phase: "queued", pct: 6 };
  }
  return { queue, jobs: nextJobs };
}

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

const first = enqueueGitUpdateIds([], {}, ["a", "b", "a"]);
assert.deepEqual(first.queue, ["a", "b"]);
assert.equal(first.jobs.a.phase, "queued");

const second = enqueueGitUpdateIds(
  first.queue,
  { ...first.jobs, a: { phase: "running", pct: 55 } },
  ["a", "c"],
);
assert.deepEqual(second.queue, ["a", "b", "c"]);
assert.equal(second.jobs.a.phase, "running");
assert.equal(second.jobs.c.phase, "queued");

console.log("git update smoke ok");
