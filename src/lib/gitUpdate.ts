import type { GithubStatus, Project } from "../types";

/** Pull-behind statuses where Update Local (ff-only) can catch up. */
const UPDATEABLE: ReadonlySet<GithubStatus> = new Set(["behind"]);

export type GitUpdatePhase = "queued" | "running" | "done" | "error";

export interface GitUpdateJob {
  phase: GitUpdatePhase;
  /** 0–100 glance fill; running is indeterminate in CSS. */
  pct: number;
  message?: string;
}

export function projectNeedsGitUpdate(
  project: Pick<Project, "localPath" | "githubStatus" | "gitBehind">,
): boolean {
  if (!project.localPath?.trim()) return false;
  if (!UPDATEABLE.has(project.githubStatus)) return false;
  return (project.gitBehind ?? 0) > 0 || project.githubStatus === "behind";
}

export function gitUpdatePct(phase: GitUpdatePhase): number {
  switch (phase) {
    case "queued":
      return 6;
    case "running":
      return 55;
    case "done":
    case "error":
      return 100;
  }
}

/** Stable unique append — skip ids already queued/running. */
export function enqueueGitUpdateIds(
  currentQueue: string[],
  jobs: Record<string, GitUpdateJob>,
  ids: string[],
): { queue: string[]; jobs: Record<string, GitUpdateJob> } {
  const queue = [...currentQueue];
  const nextJobs = { ...jobs };
  const pending = new Set(queue);
  for (const id of ids) {
    const existing = nextJobs[id];
    if (pending.has(id)) continue;
    if (existing?.phase === "running" || existing?.phase === "queued") continue;
    queue.push(id);
    pending.add(id);
    nextJobs[id] = { phase: "queued", pct: gitUpdatePct("queued") };
  }
  return { queue, jobs: nextJobs };
}
