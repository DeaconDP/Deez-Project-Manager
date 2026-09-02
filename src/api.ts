import { invoke } from "@tauri-apps/api/core";
import type {
  GitSyncUpdated,
  GithubStatus,
  ImportResult,
  ProbeResult,
  Project,
  ProjectStore,
} from "./types";
import {
  getRemoteToken,
  isTauri,
  remoteFetch,
  remoteUnsupported,
  setRemoteToken,
} from "./lib/runtime";

export type { GitSyncUpdated };
export {
  getRemoteBase,
  getRemoteToken,
  isTauri,
  setRemoteBase,
  setRemoteToken,
} from "./lib/runtime";

function assertTauriBridge(_cmd: string): void {
  if (!isTauri()) {
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
  if (!isTauri()) return remoteFetch<ProjectStore>("/api/projects");
  return tauriInvoke<ProjectStore>("get_projects");
}

/** Background engine heal after first paint — does not block cold load. */
export async function healProjectEngines(): Promise<Project[]> {
  if (!isTauri()) {
    const store = await getProjects();
    return store.projects ?? [];
  }
  return tauriInvoke<Project[]>("heal_project_engines");
}

/** Cheap existence checks — no git / engine walk. */
export async function checkPathsExist(paths: string[]): Promise<boolean[]> {
  if (!isTauri()) return paths.map((p) => p.trim().length > 0);
  return tauriInvoke<boolean[]>("check_paths_exist", { paths });
}

export async function saveProjects(store: ProjectStore): Promise<void> {
  if (!isTauri()) {
    await remoteFetch<void>("/api/projects", {
      method: "PUT",
      body: JSON.stringify(store),
    });
    return;
  }
  return tauriInvoke("save_projects", { store });
}

export async function pickProjectFolder(): Promise<string | null> {
  if (!isTauri()) remoteUnsupported("Pick folder");
  return tauriInvoke<string | null>("pick_project_folder");
}

export async function pickProjectFolders(): Promise<string[] | null> {
  if (!isTauri()) remoteUnsupported("Pick folders");
  return tauriInvoke<string[] | null>("pick_project_folders");
}

export async function pickTrelloJson(): Promise<string | null> {
  if (!isTauri()) remoteUnsupported("Pick Trello JSON");
  return tauriInvoke<string | null>("pick_trello_json");
}

export async function readTextFile(path: string): Promise<string> {
  if (!isTauri()) remoteUnsupported("Read local file");
  return tauriInvoke<string>("read_text_file", { path });
}

export async function probeProject(path: string): Promise<ProbeResult> {
  if (!isTauri()) remoteUnsupported("Probe project");
  return tauriInvoke<ProbeResult>("probe_project", { path });
}

export async function getGitStatus(path: string): Promise<GithubStatus> {
  if (!isTauri()) remoteUnsupported("Git status");
  return tauriInvoke<GithubStatus>("get_git_status", { path });
}

export async function openPath(path: string): Promise<void> {
  if (!isTauri()) remoteUnsupported("Reveal path");
  return tauriInvoke("open_path", { path });
}

export async function openUnityProject(
  path: string,
  unityVersion?: string | null,
): Promise<void> {
  if (!isTauri()) remoteUnsupported("Open Unity");
  return tauriInvoke("open_unity_project", {
    path,
    unityVersion: unityVersion ?? null,
  });
}

export async function runProject(path: string): Promise<void> {
  if (!isTauri()) remoteUnsupported("Run project");
  return tauriInvoke("run_project", { path });
}

export async function importGithubRepos(
  username = "DeaconDP",
): Promise<ImportResult> {
  if (!isTauri()) remoteUnsupported("Import GitHub");
  return tauriInvoke<ImportResult>("import_github_repos", { username });
}

export async function importUnityHub(): Promise<ImportResult> {
  if (!isTauri()) remoteUnsupported("Import Unity Hub");
  return tauriInvoke<ImportResult>("import_unity_hub");
}

export async function importVcc(): Promise<ImportResult> {
  if (!isTauri()) remoteUnsupported("Import VCC");
  return tauriInvoke<ImportResult>("import_vcc");
}

export async function importLocalFolders(
  paths: string[],
): Promise<ImportResult> {
  if (!isTauri()) remoteUnsupported("Import local folders");
  return tauriInvoke<ImportResult>("import_local_folders", { paths });
}

export async function refreshGithubStatuses(): Promise<Project[]> {
  if (!isTauri()) {
    const store = await getProjects();
    return store.projects ?? [];
  }
  return tauriInvoke<Project[]>("refresh_github_statuses");
}

export async function onGitSyncUpdated(
  handler: (update: GitSyncUpdated) => void,
): Promise<() => void> {
  if (!isTauri()) {
    void handler;
    return () => {};
  }
  assertTauriBridge("git-sync-updated");
  const { listen } = await import("@tauri-apps/api/event");
  return listen<GitSyncUpdated>("git-sync-updated", (event) => {
    handler(event.payload);
  });
}

export async function addSyncRoot(path: string): Promise<string[]> {
  if (!isTauri()) remoteUnsupported("Add sync root");
  return tauriInvoke<string[]>("add_sync_root", { path });
}

export async function removeSyncRoot(path: string): Promise<string[]> {
  if (!isTauri()) remoteUnsupported("Remove sync root");
  return tauriInvoke<string[]>("remove_sync_root", { path });
}

export async function syncParentFolder(path: string): Promise<ImportResult> {
  if (!isTauri()) remoteUnsupported("Sync parent folder");
  return tauriInvoke<ImportResult>("sync_parent_folder", { path });
}

export async function syncAllParentFolders(): Promise<ImportResult> {
  if (!isTauri()) remoteUnsupported("Sync all parents");
  return tauriInvoke<ImportResult>("sync_all_parent_folders");
}

/* —— Tailscale remote host (Settings) —— */

export type RemoteSettingsDto = {
  enabled: boolean;
  port: number;
  token?: string | null;
  peers: string[];
};

export type TailscaleInfoDto = {
  installed: boolean;
  ipv4: string | null;
  dnsName: string | null;
  backendState: string | null;
};

export type RemoteStatusDto = {
  running: boolean;
  bind: string | null;
  lastError: string | null;
};

export type RemoteInfoDto = {
  settings: RemoteSettingsDto;
  status: RemoteStatusDto;
  tailscale: TailscaleInfoDto;
  url: string | null;
  staticDir: string | null;
};

export async function remoteGetInfo(): Promise<RemoteInfoDto> {
  if (!isTauri()) return remoteFetch<RemoteInfoDto>("/api/info");
  return tauriInvoke<RemoteInfoDto>("remote_get_info");
}

export async function remoteSaveSettings(
  settings: RemoteSettingsDto,
): Promise<RemoteInfoDto> {
  if (!isTauri()) remoteUnsupported("Change host remote settings");
  return tauriInvoke<RemoteInfoDto>("remote_save_settings", { settings });
}

export async function remoteQrSvg(): Promise<string> {
  if (!isTauri()) remoteUnsupported("Host QR");
  return tauriInvoke<string>("remote_qr_svg");
}

export function rememberBrowserToken(token: string | null): void {
  setRemoteToken(token);
  void getRemoteToken;
}
