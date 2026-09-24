import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_GIT_PROBE_CLOCK,
  GIT_FULL_PROBE_MS,
  GIT_LOCAL_PROBE_MS,
  dueGitProbe,
  markGitProbe,
} from "../../src/lib/gitProbeSchedule.ts";

test("dueGitProbe: empty clock is immediately due for full", () => {
  assert.equal(dueGitProbe(1_000, EMPTY_GIT_PROBE_CLOCK), "full");
});

test("dueGitProbe: local due after local interval, full not yet", () => {
  const at = 1_000_000;
  const clock = markGitProbe(EMPTY_GIT_PROBE_CLOCK, "full", at);
  assert.equal(dueGitProbe(at + GIT_LOCAL_PROBE_MS - 1, clock), null);
  assert.equal(dueGitProbe(at + GIT_LOCAL_PROBE_MS, clock), "local");
});

test("dueGitProbe: full wins when both intervals elapsed", () => {
  const at = 1_000_000;
  const clock = markGitProbe(EMPTY_GIT_PROBE_CLOCK, "full", at);
  assert.equal(dueGitProbe(at + GIT_FULL_PROBE_MS, clock), "full");
});

test("markGitProbe: full resets local timestamp", () => {
  const clock = markGitProbe(
    { lastLocalAt: 10, lastFullAt: 5 },
    "full",
    100,
  );
  assert.deepEqual(clock, { lastLocalAt: 100, lastFullAt: 100 });
});

test("markGitProbe: local keeps lastFullAt", () => {
  const clock = markGitProbe(
    { lastLocalAt: 10, lastFullAt: 5 },
    "local",
    100,
  );
  assert.deepEqual(clock, { lastLocalAt: 100, lastFullAt: 5 });
});

test("dueGitProbe: custom intervals", () => {
  const clock = EMPTY_GIT_PROBE_CLOCK;
  assert.equal(
    dueGitProbe(50, clock, { localMs: 100, fullMs: 200 }),
    "full",
  );
  const afterFull = markGitProbe(clock, "full", 0);
  assert.equal(
    dueGitProbe(100, afterFull, { localMs: 100, fullMs: 200 }),
    "local",
  );
  assert.equal(
    dueGitProbe(50, afterFull, { localMs: 100, fullMs: 200 }),
    null,
  );
});
