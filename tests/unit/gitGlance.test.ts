import assert from "node:assert/strict";
import test from "node:test";
import {
  GIT_GLANCE_REGISTRY,
  projectHasGitAction,
  projectNeedsPullBehind,
  resolveGitGlance,
  type GitActionKind,
  type GitGlanceGlyph,
  type GitGlanceTone,
} from "../../src/lib/gitGlance.ts";
import type { GithubStatus } from "../../src/types.ts";

const ALL_STATUSES: Exclude<GithubStatus, "none">[] = [
  "clean",
  "dirty",
  "ahead",
  "behind",
  "diverged",
  "remote-only",
  "error",
];

test("gitGlance: registry covers every non-none status", () => {
  for (const status of ALL_STATUSES) {
    assert.ok(status in GIT_GLANCE_REGISTRY, status);
  }
});

test("gitGlance: behind → pull only; dirty|ahead → publish only", () => {
  const byKind = new Map<GitActionKind | "passive", GithubStatus[]>();
  for (const status of ALL_STATUSES) {
    const kind = GIT_GLANCE_REGISTRY[status].actionKind ?? "passive";
    const list = byKind.get(kind) ?? [];
    list.push(status);
    byKind.set(kind, list);
  }
  assert.deepEqual(byKind.get("pull-behind"), ["behind"]);
  assert.deepEqual(byKind.get("publish-local")?.sort(), ["ahead", "dirty"]);
});

test("gitGlance: resolve maps glyph/tone and gates action on localPath", () => {
  const expected: Record<
    Exclude<GithubStatus, "none">,
    { glyph: GitGlanceGlyph; tone: GitGlanceTone; kind: GitActionKind | null }
  > = {
    clean: { glyph: "check", tone: "ok", kind: null },
    dirty: { glyph: "arrow-up", tone: "outbound", kind: "publish-local" },
    ahead: { glyph: "arrow-up", tone: "outbound", kind: "publish-local" },
    behind: { glyph: "arrow-down", tone: "inbound", kind: "pull-behind" },
    diverged: { glyph: "arrows-diverge", tone: "warn", kind: null },
    "remote-only": { glyph: "cloud", tone: "muted", kind: null },
    error: { glyph: "warning", tone: "danger", kind: null },
  };

  for (const status of ALL_STATUSES) {
    const withPath = resolveGitGlance({
      githubStatus: status,
      localPath: "/proj",
      gitBranch: "main",
      gitAhead: status === "ahead" ? 2 : 0,
      gitBehind: status === "behind" ? 3 : 0,
    });
    assert.ok(withPath);
    assert.equal(withPath!.glyph, expected[status].glyph);
    assert.equal(withPath!.tone, expected[status].tone);
    assert.equal(withPath!.actionKind, expected[status].kind);

    const noPath = resolveGitGlance({
      githubStatus: status,
      localPath: null,
      gitBranch: null,
      gitAhead: 0,
      gitBehind: 0,
    });
    assert.equal(noPath!.actionKind, null);
  }

  assert.equal(
    resolveGitGlance({
      githubStatus: "none",
      localPath: "/x",
      gitBranch: null,
      gitAhead: 0,
      gitBehind: 0,
    }),
    null,
  );
});

test("gitGlance: clean a11y prefers Up to date", () => {
  const bare = resolveGitGlance({
    githubStatus: "clean",
    localPath: "/x",
    gitBranch: null,
    gitAhead: 0,
    gitBehind: 0,
  });
  assert.equal(bare!.a11yLabel, "Up to date");

  const branched = resolveGitGlance({
    githubStatus: "clean",
    localPath: "/x",
    gitBranch: "main",
    gitAhead: 0,
    gitBehind: 0,
  });
  assert.equal(branched!.a11yLabel, "Up to date · main");
});

test("gitGlance: helpers for action / pull-behind", () => {
  assert.equal(
    projectHasGitAction({
      githubStatus: "dirty",
      localPath: "/a",
      gitBranch: null,
      gitAhead: 0,
      gitBehind: 0,
    }),
    true,
  );
  assert.equal(
    projectNeedsPullBehind({
      githubStatus: "behind",
      localPath: "/a",
      gitBranch: null,
      gitAhead: 0,
      gitBehind: 2,
    }),
    true,
  );
  assert.equal(
    projectNeedsPullBehind({
      githubStatus: "dirty",
      localPath: "/a",
      gitBranch: null,
      gitAhead: 0,
      gitBehind: 0,
    }),
    false,
  );
});
