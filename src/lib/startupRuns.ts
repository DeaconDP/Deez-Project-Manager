import type { Project } from "../types";

/** Rows Deez should launch once after the store finishes loading. */
export function projectEligibleForStartupRun(project: Project): boolean {
  if (project.archived) return false;
  if (!project.runOnStartup) return false;
  if (!project.hasRunScript) return false;
  return !!project.localPath?.trim();
}

export function selectStartupRunTargets(projects: Project[]): Project[] {
  return projects.filter(projectEligibleForStartupRun);
}
