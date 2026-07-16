export type Priority = "Default" | "Low" | "Med" | "High" | "Crit";

export type Platform =
  | "Unity"
  | "Unreal"
  | "Web"
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
  favorite: boolean;
  archived: boolean;
  notes: string;
  tools: string[];
  hasRunScript: boolean;
  agency?: string;
  client?: string;
  year?: number;
  updatedAt: string;
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
    favorite: false,
    archived: false,
    notes: "",
    tools: [],
    hasRunScript: false,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export function githubStatusLabel(status: GithubStatus): string {
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
      return "Ahead";
    case "behind":
      return "Behind";
    case "diverged":
      return "Diverged";
    case "error":
      return "Error";
  }
}
