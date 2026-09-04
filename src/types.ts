export type Priority = "Default" | "Low" | "Med" | "High" | "Crit";

export type Platform =
  | "Unity"
  | "Unreal"
  | "Web"
  | "Native"
  | "Viverse"
  | "Consulting"
  | "Other";

export type ProjectTool = "Cursor" | "Claude" | "Codex" | "OpenCode";

export const PROJECT_TOOLS: ProjectTool[] = [
  "Cursor",
  "Claude",
  "Codex",
  "OpenCode",
];

export type GithubStatus =
  | "none"
  | "remote-only"
  | "clean"
  | "dirty"
  | "ahead"
  | "behind"
  | "diverged"
  | "error";

export interface Project {
  id: string;
  name: string;
  sortIndex: number;
  priority: Priority;
  platform: Platform;
  status: string;
  category: string;
  location: string;
  localPath: string | null;
  unityVersion: string | null;
  githubUrl: string | null;
  githubRepo: string | null;
  githubStatus: GithubStatus;
  gitAhead: number;
  gitBehind: number;
  gitBranch: string | null;
  gitDirty: boolean;
  favorite: boolean;
  archived: boolean;
  notes: string;
  tools: string[];
  hasRunScript: boolean;
  agency?: string;
  client?: string;
  year?: number;
  /**
   * Product family id (emily / deac-online / …).
   * Shared across many rows when one product has a site + apps (or several apps).
   */
  siteId?: string | null;
  openshipProjectId?: string | null;
  previewUrl?: string | null;
  liveUrl?: string | null;
  /**
   * Owning machine label (ada / edgar / steve / …).
   * Each host owns different projects — not a mirrored fleet catalog.
   */
  host?: string | null;
  /**
   * Which face of the product this row is (ios / android / site / editor / pwa / …).
   * One row = one surface; ops verbs act per surface.
   */
  surface?: string | null;
  /** Sticky localhost port on the owning host only (not mesh-shared). */
  stickyPort?: number | null;
  /** Launch / rebuild hint on the owning host only (not mesh-shared). */
  launchCmd?: string | null;
  lastBuildAt?: string | null;
  updatedAt: string;
}

/** Pilot / fleet row: has OpenShip id or shared siteId. */
export function isFleetOpsRow(
  project: Pick<Project, "siteId" | "openshipProjectId">,
): boolean {
  return !!(project.openshipProjectId?.trim() || project.siteId?.trim());
}

export function normalizeHostLabel(
  raw: string | null | undefined,
): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "";
  // "Linux · ada" / "Mac · Edgar" → prefer the trailing machine token
  const parts = s
    .split(/[·•|/]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const token = parts.length > 1 ? parts[parts.length - 1]! : parts[0]!;
  return token.replace(/[\s_]+/g, "-");
}

/** Stamp owning host when this machine has a local path. */
export function withHostStamp(
  project: Project,
  thisHost: string,
): Project {
  if (!project.localPath?.trim()) return project;
  if (project.host?.trim()) return project;
  const stamp = normalizeHostLabel(thisHost);
  if (!stamp) return project;
  return { ...project, host: stamp };
}

/**
 * Does this row belong on the current machine's default list?
 * - Has a local path here → yes (this box hosts it)
 * - `host` matches this machine → yes
 * - Pathless fleet row stamped for another host → no (switch peer / All hosts)
 * - Pathless unstamped backlog → yes (shared interest list, not fleet ops)
 */
export function projectOnThisHost(
  project: Project,
  thisHost: string,
): boolean {
  if (project.localPath?.trim()) return true;
  const mine = normalizeHostLabel(thisHost);
  const stamped = normalizeHostLabel(project.host);
  if (stamped) return stamped === mine;
  if (isFleetOpsRow(project)) return false;
  return true;
}

export interface GitSyncUpdated {
  id: string;
  githubStatus: GithubStatus;
  gitAhead: number;
  gitBehind: number;
  gitBranch: string | null;
  gitDirty: boolean;
}

export type KanbanColumn =
  | "Backlog"
  | "Priority"
  | "Doing"
  | "Testing"
  | "Done";

export const KANBAN_COLUMNS: KanbanColumn[] = [
  "Backlog",
  "Priority",
  "Doing",
  "Testing",
  "Done",
];

export interface TaskComment {
  id: string;
  body: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  column: KanbanColumn;
  priority: Priority;
  sortIndex: number;
  comments: TaskComment[];
  trelloCardId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStore {
  version: number;
  projects: Project[];
  syncRoots: string[];
  tasks: Task[];
}

export interface TrelloImportResult {
  added: number;
  skipped: number;
  tasks: Task[];
}

export interface ProbeResult {
  exists: boolean;
  isUnity: boolean;
  isUnreal: boolean;
  platform: Platform;
  unityVersion: string | null;
  gitRemoteUrl: string | null;
  githubRepo: string | null;
  tools: string[];
  hasRunScript: boolean;
}

export interface GithubRepo {
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  updatedAt: string;
  private: boolean;
}

export interface ImportResult {
  added: number;
  skipped: number;
  updated?: number;
  projects: Project[];
}

export const PRIORITIES: Priority[] = [
  "Default",
  "Low",
  "Med",
  "High",
  "Crit",
];

export function normalizePriority(value: string): Priority {
  switch (value) {
    case "Default":
    case "Low":
    case "Med":
    case "High":
    case "Crit":
      return value;
    // Legacy P0–Backlog → new scale
    case "P0":
      return "Crit";
    case "P1":
      return "High";
    case "P2":
      return "Med";
    case "P3":
      return "Low";
    case "Backlog":
    case "Opt":
      return "Default";
    default:
      return "Default";
  }
}

/** Crit first → Opt last (for kanban auto-insert). */
export const PRIORITY_RANK: Record<Priority, number> = {
  Crit: 0,
  High: 1,
  Med: 2,
  Low: 3,
  Default: 4,
};

export function priorityLabel(priority: Priority, optAsOpt = false): string {
  if (optAsOpt && priority === "Default") return "Opt";
  return priority;
}

export function normalizeKanbanColumn(value: string): KanbanColumn {
  if ((KANBAN_COLUMNS as string[]).includes(value)) {
    return value as KanbanColumn;
  }
  return "Backlog";
}

export function createEmptyTask(
  projectId: string,
  partial?: Partial<Task>,
): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    projectId,
    title: "",
    description: "",
    column: "Backlog",
    priority: "Default",
    sortIndex: 0,
    comments: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export const PLATFORMS: Platform[] = [
  "Unity",
  "Unreal",
  "Web",
  "Native",
  "Viverse",
  "Consulting",
  "Other",
];

export type Category =
  | "VR"
  | "AR"
  | "Utility"
  | "Web"
  | "Game"
  | "Client"
  | "Bot"
  | "Backup"
  | "Other";

export const CATEGORIES: Category[] = [
  "VR",
  "AR",
  "Utility",
  "Web",
  "Game",
  "Client",
  "Bot",
  "Backup",
  "Other",
];

export function normalizeCategory(value: string): Category {
  if ((CATEGORIES as string[]).includes(value)) return value as Category;
  return "Other";
}

export type Status =
  | "Urgent"
  | "Experiment"
  | "To Do"
  | "WIP"
  | "Testing"
  | "Maintaining"
  | "Done"
  | "Broken"
  | "Delete";

export const STATUSES: Status[] = [
  "Urgent",
  "Experiment",
  "To Do",
  "WIP",
  "Testing",
  "Maintaining",
  "Done",
  "Broken",
  "Delete",
];

export function normalizeStatus(value: string | undefined | null): Status {
  if (value && (STATUSES as string[]).includes(value)) return value as Status;
  return "To Do";
}

/** CSS class slug for status badges/pickers (e.g. "To Do" → "to-do"). */
export function statusClassSlug(status: Status | string): string {
  return normalizeStatus(status).toLowerCase().replace(/\s+/g, "-");
}

export function createEmptyProject(partial?: Partial<Project>): Project {
  return {
    id: crypto.randomUUID(),
    name: "",
    sortIndex: 0,
    priority: "Default",
    platform: "Other",
    status: "To Do",
    category: "Other",
    location: "",
    localPath: null,
    unityVersion: null,
    githubUrl: null,
    githubRepo: null,
    githubStatus: "none",
    gitAhead: 0,
    gitBehind: 0,
    gitBranch: null,
    gitDirty: false,
    favorite: false,
    archived: false,
    notes: "",
    tools: [],
    hasRunScript: false,
    siteId: null,
    openshipProjectId: null,
    previewUrl: null,
    liveUrl: null,
    host: null,
    surface: null,
    stickyPort: null,
    launchCmd: null,
    lastBuildAt: null,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

/** Glance rank for GitHub column sort — behind / diverged float first. */
export const GITHUB_STATUS_SORT_RANK: Record<GithubStatus, number> = {
  behind: 0,
  diverged: 1,
  ahead: 2,
  dirty: 3,
  error: 4,
  "remote-only": 5,
  clean: 6,
  none: 7,
};

export function githubStatusLabel(
  status: GithubStatus,
  project?: Pick<Project, "gitAhead" | "gitBehind">,
): string {
  const ahead = project?.gitAhead ?? 0;
  const behind = project?.gitBehind ?? 0;
  switch (status) {
    case "none":
      return "—";
    case "remote-only":
      return "Remote only";
    case "clean":
      return "Clean";
    case "dirty":
      return "Dirty";
    case "ahead":
      return ahead > 0 ? `Ahead · ${ahead}` : "Ahead";
    case "behind":
      return behind > 0 ? `Behind · ${behind}` : "Behind";
    case "diverged":
      return `Diverged · ↑${ahead} ↓${behind}`;
    case "error":
      return "Error";
  }
}

export function githubStatusTooltip(project: Project): string {
  let label = githubStatusLabel(project.githubStatus, project);
  if (project.gitBranch?.trim()) {
    label = `${label} · ${project.gitBranch.trim()}`;
  }
  if (project.gitDirty && project.githubStatus !== "dirty") {
    label = `${label} (uncommitted changes)`;
  }
  return label;
}
