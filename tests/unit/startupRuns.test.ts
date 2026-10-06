import assert from "node:assert/strict";
import test from "node:test";
import {
  projectEligibleForStartupRun,
  selectStartupRunTargets,
} from "../../src/lib/startupRuns.ts";
import { createEmptyProject } from "../../src/types.ts";

test("startupRuns: requires flag, path, script, and active", () => {
  const ready = createEmptyProject({
    id: "ready",
    localPath: "C:/Projects/Ready",
    hasRunScript: true,
    runOnStartup: true,
  });
  assert.equal(projectEligibleForStartupRun(ready), true);

  assert.equal(
    projectEligibleForStartupRun({ ...ready, runOnStartup: false }),
    false,
  );
  assert.equal(
    projectEligibleForStartupRun({ ...ready, hasRunScript: false }),
    false,
  );
  assert.equal(
    projectEligibleForStartupRun({ ...ready, localPath: null }),
    false,
  );
  assert.equal(
    projectEligibleForStartupRun({ ...ready, localPath: "   " }),
    false,
  );
  assert.equal(
    projectEligibleForStartupRun({ ...ready, archived: true }),
    false,
  );
});

test("startupRuns: selectStartupRunTargets keeps order of eligible rows", () => {
  const rows = [
    createEmptyProject({
      id: "a",
      localPath: "C:/a",
      hasRunScript: true,
      runOnStartup: true,
    }),
    createEmptyProject({
      id: "b",
      localPath: "C:/b",
      hasRunScript: true,
      runOnStartup: false,
    }),
    createEmptyProject({
      id: "c",
      localPath: "C:/c",
      hasRunScript: true,
      runOnStartup: true,
    }),
  ];
  assert.deepEqual(
    selectStartupRunTargets(rows).map((p) => p.id),
    ["a", "c"],
  );
});
