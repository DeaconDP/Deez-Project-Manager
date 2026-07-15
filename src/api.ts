import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  GithubStatus,
  ImportResult,
  ProbeResult,
  Project,
  ProjectStore,
} from "./types";

function assertTauriBridge(cmd: string): void {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
  // #region agent log
  fetch("http://127.0.0.1:7536/ingest/e24ae17c-7642-4e3d-9932-1bb65aa9191e", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "c528a4",
    },
    body: JSON.stringify({
      sessionId: "c528a4",
      runId: "invoke-check",
      hypothesisId: "F",
      location: "api.ts:assertTauriBridge",
      message: "Tauri bridge check before invoke",
      data: {
        cmd,
        isTauri: isTauri(),
        hasInternals: !!internals,
        userAgent: navigator.userAgent.slice(0, 80),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!internals) {
    throw new Error(
      "TAURI-001: Deez Project Manager must run in the desktop app window (npm run tauri dev / run.bat). Do not use a browser tab on :5187 — there is no Tauri IPC there.",
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

export async function saveProjects(store: ProjectStore): Promise<void> {
  return tauriInvoke("save_projects", { store });
}

export async function pickProjectFolder(): Promise<string | null> {
  return tauriInvoke<string | null>("pick_project_folder");
}

export async function pickProjectFolders(): Promise<string[] | null> {
  return tauriInvoke<string[] | null>("pick_project_folders");
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

export async function addSyncRoot(path: string): Promise<string[]> {
  return tauriInvoke<string[]>("add_sync_root", { path });
}

export async function removeSyncRoot(path: string): Promise<string[]> {
  return tauriInvoke<string[]>("remove_sync_root", { path });
}

export async function syncParentFolder(path: string): Promise<ImportResult> {
  return tauriInvoke<ImportResult>("sync_parent_folder", { path });
}
