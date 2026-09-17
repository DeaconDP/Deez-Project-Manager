import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyProject,
  matchesGithubVisibility,
  githubStatusTooltip,
} from "../../src/types.ts";

test("createEmptyProject defaults githubPrivate to null", () => {
  const p = createEmptyProject({ name: "x" });
  assert.equal(p.githubPrivate, null);
});

test("matchesGithubVisibility filters private / public / unknown", () => {
  const priv = createEmptyProject({ githubPrivate: true });
  const pub = createEmptyProject({ githubPrivate: false });
  const unk = createEmptyProject({ githubPrivate: null });

  assert.equal(matchesGithubVisibility(priv, "all"), true);
  assert.equal(matchesGithubVisibility(pub, "all"), true);
  assert.equal(matchesGithubVisibility(unk, "all"), true);

  assert.equal(matchesGithubVisibility(priv, "private"), true);
  assert.equal(matchesGithubVisibility(pub, "private"), false);
  assert.equal(matchesGithubVisibility(unk, "private"), false);

  assert.equal(matchesGithubVisibility(priv, "public"), false);
  assert.equal(matchesGithubVisibility(pub, "public"), true);
  assert.equal(matchesGithubVisibility(unk, "public"), false);

  assert.equal(matchesGithubVisibility(priv, "unknown"), false);
  assert.equal(matchesGithubVisibility(pub, "unknown"), false);
  assert.equal(matchesGithubVisibility(unk, "unknown"), true);
});

test("githubStatusTooltip prefixes Private / Public", () => {
  const base = createEmptyProject({
    githubStatus: "clean",
    gitBranch: "main",
  });
  assert.match(
    githubStatusTooltip({ ...base, githubPrivate: true }),
    /^Private ·/,
  );
  assert.match(
    githubStatusTooltip({ ...base, githubPrivate: false }),
    /^Public ·/,
  );
  assert.equal(
    githubStatusTooltip({ ...base, githubPrivate: null }).startsWith("Private"),
    false,
  );
});

test("missing githubPrivate on legacy row treated as unknown", () => {
  const legacy = createEmptyProject({ name: "old" });
  // Simulate older mesh JSON without the field
  const raw = { ...legacy } as { githubPrivate?: boolean | null };
  delete raw.githubPrivate;
  const normalized = {
    ...legacy,
    githubPrivate: raw.githubPrivate ?? null,
  };
  assert.equal(normalized.githubPrivate, null);
  assert.equal(matchesGithubVisibility(normalized, "unknown"), true);
});
