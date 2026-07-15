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
  agency?: string;
  client?: string;
  year?: number;
  updatedAt: string;
}

export interface ProjectStore {
  version: number;
  projects: Project[];
  syncRoots: string[];
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
      return "Default";
    default:
      return "Default";
  }
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
  | "Backup"
  | "Other";

export const CATEGORIES: Category[] = [
  "VR",
  "AR",
  "Utility",
  "Web",
  "Game",
  "Client",
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
  | "Broken";

export const STATUSES: Status[] = [
  "Urgent",
  "Experiment",
  "To Do",
  "WIP",
  "Testing",
  "Maintaining",
  "Done",
  "Broken",
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
