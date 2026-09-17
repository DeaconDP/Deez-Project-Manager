import type { Project } from "../types";
import {
  type GitActionKind,
  projectNeedsPullBehind,
} from "./gitGlance.ts";

export type { GitActionKind };
export { projectNeedsPullBehind };

/** Behind-only alias for toolbar Update-all. */
export function projectNeedsGitUpdate(
  project: Pick<Project, "localPath" | "githubStatus" | "gitBehind">,
): boolean {
  return projectNeedsPullBehind(project);
}

export type GitUpdatePhase = "queued" | "running" | "done" | "error";

export interface GitUpdateJob {
  phase: GitUpdatePhase;
  /** 0–100 glance fill; running is indeterminate in CSS. */
  pct: number;
  message?: string;
  actionKind?: GitActionKind;
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

/** Stable unique append — skip ids already queued/running. Default kind is pull-behind. */
export function enqueueGitUpdateIds(
  currentQueue: string[],
  jobs: Record<string, GitUpdateJob>,
  ids: string[],
  actionKind: GitActionKind = "pull-behind",
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
    nextJobs[id] = {
      phase: "queued",
      pct: gitUpdatePct("queued"),
      actionKind,
    };
  }
  return { queue, jobs: nextJobs };
}
