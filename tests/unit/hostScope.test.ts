import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyProject,
  normalizeHostLabel,
  projectOnThisHost,
  withHostStamp,
} from "../../src/types.ts";

test("hostScope: pathless row stamped for another host is off-host", () => {
  assert.equal(normalizeHostLabel("Linux · ada"), "ada");
  assert.equal(normalizeHostLabel("deez-verify"), "deez-verify");

  const elsewhere = createEmptyProject({
    name: "Elsewhere",
    host: "other-box",
  });
  assert.equal(projectOnThisHost(elsewhere, "deez-verify"), false);

  const here = createEmptyProject({ name: "Here", host: "deez-verify" });
  assert.equal(projectOnThisHost(here, "deez-verify"), true);

  const backlog = createEmptyProject({ name: "Backlog" });
  assert.equal(projectOnThisHost(backlog, "deez-verify"), true);

  const pathed = createEmptyProject({
    name: "Pathed",
    localPath: "/tmp/deez-fixture",
    host: "other-box",
  });
  assert.equal(projectOnThisHost(pathed, "deez-verify"), true);
});

test("hostScope: withHostStamp writes this host onto path rows", () => {
  const raw = createEmptyProject({
    name: "Pathed",
    localPath: "/tmp/deez-fixture",
  });
  assert.equal(raw.host, null);
  assert.equal(withHostStamp(raw, "deez-verify").host, "deez-verify");

  const already = createEmptyProject({
    name: "Kept",
    localPath: "/tmp/deez-fixture",
    host: "other-box",
  });
  assert.equal(withHostStamp(already, "deez-verify").host, "other-box");
});
