import type { GithubStatus, Project } from "../types";

export type GitActionKind = "pull-behind" | "publish-local";

export type GitGlanceGlyph =
  | "check"
  | "arrow-up"
  | "arrow-down"
  | "arrows-diverge"
  | "cloud"
  | "warning";

export type GitGlanceTone =
  | "ok"
  | "outbound"
  | "inbound"
  | "warn"
  | "muted"
  | "danger";

export interface GitGlanceSpec {
  glyph: GitGlanceGlyph;
  tone: GitGlanceTone;
  actionKind: GitActionKind | null;
  a11yLabel: string;
}

type GlanceBase = Omit<GitGlanceSpec, "a11yLabel" | "actionKind"> & {
  actionKind: GitActionKind | null;
  label: string;
};

/** Exhaustive status → glance. `none` is not rendered. */
export const GIT_GLANCE_REGISTRY = {
  clean: {
    glyph: "check",
    tone: "ok",
    actionKind: null,
    label: "Up to date",
  },
  dirty: {
    glyph: "arrow-up",
    tone: "outbound",
    actionKind: "publish-local",
    label: "Publish local changes",
  },
  ahead: {
    glyph: "arrow-up",
    tone: "outbound",
    actionKind: "publish-local",
    label: "Push ahead commits",
  },
  behind: {
    glyph: "arrow-down",
    tone: "inbound",
    actionKind: "pull-behind",
    label: "Pull latest and rebuild",
  },
  diverged: {
    glyph: "arrows-diverge",
    tone: "warn",
    actionKind: null,
    label: "Diverged from upstream",
  },
  "remote-only": {
    glyph: "cloud",
    tone: "muted",
    actionKind: null,
    label: "Remote only",
  },
  error: {
    glyph: "warning",
    tone: "danger",
    actionKind: null,
    label: "Git status error",
  },
} as const satisfies Record<Exclude<GithubStatus, "none">, GlanceBase>;

type GlanceProjectLoose = Pick<Project, "githubStatus" | "localPath"> &
  Partial<Pick<Project, "gitBranch" | "gitAhead" | "gitBehind">>;

function a11yFor(
  status: Exclude<GithubStatus, "none">,
  project: GlanceProjectLoose,
): string {
  const base = GIT_GLANCE_REGISTRY[status];
  const branch = project.gitBranch?.trim();
  const ahead = project.gitAhead ?? 0;
  const behind = project.gitBehind ?? 0;

  let label: string = base.label;
  if (status === "clean") {
    label = branch ? `Up to date · ${branch}` : "Up to date";
  } else if (status === "ahead" && ahead > 0) {
    label = `Push ahead commits · ${ahead}`;
  } else if (status === "behind" && behind > 0) {
    label = `Pull latest and rebuild · ${behind}`;
  } else if (status === "diverged") {
    label = `Diverged from upstream · ↑${ahead} ↓${behind}`;
  }

  if (branch && status !== "clean") {
    label = `${label} · ${branch}`;
  }
  return label;
}

export function resolveGitGlance(
  project: GlanceProjectLoose,
): GitGlanceSpec | null {
  const status = project.githubStatus;
  if (status === "none") return null;

  const base = GIT_GLANCE_REGISTRY[status];
  const hasPath = Boolean(project.localPath?.trim());
  return {
    glyph: base.glyph,
    tone: base.tone,
    actionKind: hasPath ? base.actionKind : null,
    a11yLabel: a11yFor(status, project),
  };
}

export function projectHasGitAction(project: GlanceProjectLoose): boolean {
  return resolveGitGlance(project)?.actionKind != null;
}

/** Toolbar Update-all and overflow: behind rows only. */
export function projectNeedsPullBehind(project: GlanceProjectLoose): boolean {
  return resolveGitGlance(project)?.actionKind === "pull-behind";
}
