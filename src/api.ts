import { invoke } from "@tauri-apps/api/core";
import type {
  GitSyncUpdated,
  GithubStatus,
  ImportResult,
  ProbeResult,
  Project,
  ProjectStore,
} from "./types";

export type { GitSyncUpdated };

function assertTauriBridge(_cmd: string): void {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
  if (!internals) {
    throw new Error(
      "TAURI-001: Deez Project Manager must run in the desktop app window (run.bat / run.command / npm run tauri dev). Do not use a browser tab on :5187 — there is no Tauri IPC there.",
    );
  }
}

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  assertTauriBridge(cmd);
  return invoke<T>(cmd, args);
}

export async function getProjects(): Promise<ProjectStore> {
  return tauriInvoke<ProjectStore>("get_projects");
}

/** Background engine heal after first paint — does not block cold load. */
export async function healProjectEngines(): Promise<Project[]> {
  return tauriInvoke<Project[]>("heal_project_engines");
}

/** Cheap existence checks — no git / engine walk. */
export async function checkPathsExist(paths: string[]): Promise<boolean[]> {
  return tauriInvoke<boolean[]>("check_paths_exist", { paths });
}

export async function saveProjects(store: ProjectStore): Promise<void> {
  return tauriInvoke("save_projects", { store });
}

export async function pickProjectFolder(): Promise<string | null> {
  return tauriInvoke<string | null>("pick_project_folder");
}

export async function pickProjectFolders(): Promise<string[] | null> {
  return tauriInvoke<string[] | null>("pick_project_folders");
}

export async function pickTrelloJson(): Promise<string | null> {
  return tauriInvoke<string | null>("pick_trello_json");
}

export async function readTextFile(path: string): Promise<string> {
  return tauriInvoke<string>("read_text_file", { path });
}

export async function probeProject(path: string): Promise<ProbeResult> {
  return tauriInvoke<ProbeResult>("probe_project", { path });
}

export async function getGitStatus(path: string): Promise<GithubStatus> {
  return tauriInvoke<GithubStatus>("get_git_status", { path });
}

export async function openPath(path: string): Promise<void> {
  return tauriInvoke("open_path", { path });
}

export async function openUnityProject(
  path: string,
  unityVersion?: string | null,
): Promise<void> {
  return tauriInvoke("open_unity_project", {
    path,
    unityVersion: unityVersion ?? null,
  });
}

export async function runProject(path: string): Promise<void> {
  return tauriInvoke("run_project", { path });
}

export async function importGithubRepos(
  username = "DeaconDP",
): Promise<ImportResult> {
  return tauriInvoke<ImportResult>("import_github_repos", { username });
}

export async function importUnityHub(): Promise<ImportResult> {
  return tauriInvoke<ImportResult>("import_unity_hub");
}

export async function importVcc(): Promise<ImportResult> {
  return tauriInvoke<ImportResult>("import_vcc");
}

export async function importLocalFolders(
  paths: string[],
): Promise<ImportResult> {
  return tauriInvoke<ImportResult>("import_local_folders", { paths });
}

export async function refreshGithubStatuses(): Promise<Project[]> {
  return tauriInvoke<Project[]>("refresh_github_statuses");
}

export async function onGitSyncUpdated(
  handler: (update: GitSyncUpdated) => void,
): Promise<() => void> {
  assertTauriBridge("git-sync-updated");
  const { listen } = await import("@tauri-apps/api/event");
  return listen<GitSyncUpdated>("git-sync-updated", (event) => {
    handler(event.payload);
  });
}

export async function addSyncRoot(path: string): Promise<string[]> {
  return tauriInvoke<string[]>("add_sync_root", { path });
}

export async function removeSyncRoot(path: string): Promise<string[]> {
  return tauriInvoke<string[]>("remove_sync_root", { path });
}

export async function syncParentFolder(path: string): Promise<ImportResult> {
  return tauriInvoke<ImportResult>("sync_parent_folder", { path });
}

export async function syncAllParentFolders(): Promise<ImportResult> {
  return tauriInvoke<ImportResult>("sync_all_parent_folders");
}
