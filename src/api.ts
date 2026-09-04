import { invoke } from "@tauri-apps/api/core";
import type {
  GitSyncUpdated,
  GithubStatus,
  ImportResult,
  ProbeResult,
  Project,
  ProjectStore,
} from "./types";
import type { MeshConfig } from "./lib/mesh";
import { defaultDeviceName, newDeviceId } from "./lib/mesh";
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

const BROWSER_STORE_KEY = "deez-projects-store";
const BROWSER_MESH_KEY = "deez-mesh-config";
const BROWSER_PAT_KEY = "deez-mesh-pat";

function assertTauriBridge(cmd: string): void {
  if (!isTauri()) {
    throw new Error(
      `TAURI-001: "${cmd}" needs the desktop app (run.bat / run.command). Mesh sync and project lists work in the phone PWA; folder/Unity actions do not.`,
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

function emptyStore(): ProjectStore {
  return { version: 1, projects: [], syncRoots: [], tasks: [] };
}

function readBrowserStore(): ProjectStore {
  try {
    const raw = localStorage.getItem(BROWSER_STORE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as ProjectStore;
    return {
      version: parsed.version || 1,
      projects: parsed.projects ?? [],
      syncRoots: parsed.syncRoots ?? [],
      tasks: parsed.tasks ?? [],
    };
  } catch {
    return emptyStore();
  }
}

function writeBrowserStore(store: ProjectStore): void {
  localStorage.setItem(BROWSER_STORE_KEY, JSON.stringify(store));
}

/** Tailscale-hosted PWA uses /api; standalone mesh PWA falls back to localStorage. */
async function browserGetStore(): Promise<ProjectStore> {
  try {
    return await remoteFetch<ProjectStore>("/api/projects");
  } catch {
    return readBrowserStore();
  }
}

async function browserSaveStore(store: ProjectStore): Promise<void> {
  try {
    await remoteFetch<void>("/api/projects", {
      method: "PUT",
      body: JSON.stringify(store),
    });
  } catch {
    writeBrowserStore(store);
  }
}

type BrowserMeshConfig = Omit<MeshConfig, "hasPat"> & { hasPat?: boolean };

function readBrowserMesh(): MeshConfig {
  try {
    const raw = localStorage.getItem(BROWSER_MESH_KEY);
    const pat = localStorage.getItem(BROWSER_PAT_KEY);
    if (!raw) {
      return {
        enabled: false,
        gistId: null,
        deviceId: newDeviceId(),
        deviceName: defaultDeviceName(),
        hasPat: !!pat,
        lastSyncedAt: null,
        lastError: null,
        peerCount: 0,
      };
    }
    const parsed = JSON.parse(raw) as BrowserMeshConfig;
    return {
      enabled: !!parsed.enabled,
      gistId: parsed.gistId ?? null,
      deviceId: parsed.deviceId || newDeviceId(),
      deviceName: parsed.deviceName || defaultDeviceName(),
      hasPat: !!pat,
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      lastError: parsed.lastError ?? null,
      peerCount: parsed.peerCount ?? 0,
    };
  } catch {
    return {
      enabled: false,
      gistId: null,
      deviceId: newDeviceId(),
      deviceName: defaultDeviceName(),
      hasPat: !!localStorage.getItem(BROWSER_PAT_KEY),
      lastSyncedAt: null,
      lastError: null,
      peerCount: 0,
    };
  }
}

function writeBrowserMesh(cfg: MeshConfig): void {
  const { hasPat: _hasPat, ...rest } = cfg;
  localStorage.setItem(BROWSER_MESH_KEY, JSON.stringify(rest));
}

export async function getProjects(): Promise<ProjectStore> {
  if (!isTauri()) return browserGetStore();
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
    await browserSaveStore(store);
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
  if (!isTauri()) return () => {};
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

export type MeshConfigPatch = {
  enabled?: boolean;
  gistId?: string;
  clearGistId?: boolean;
  deviceName?: string;
  lastSyncedAt?: string;
  clearLastSyncedAt?: boolean;
  lastError?: string;
  clearLastError?: boolean;
  peerCount?: number;
};

export async function meshGetConfig(): Promise<MeshConfig> {
  if (!isTauri()) {
    const cfg = readBrowserMesh();
    writeBrowserMesh(cfg);
    return cfg;
  }
  return tauriInvoke<MeshConfig>("mesh_get_config");
}

export async function meshSaveConfig(
  patch: MeshConfigPatch,
): Promise<MeshConfig> {
  if (!isTauri()) {
    const cfg = readBrowserMesh();
    if (patch.enabled !== undefined) cfg.enabled = patch.enabled;
    if (patch.clearGistId) cfg.gistId = null;
    else if (patch.gistId !== undefined) {
      cfg.gistId = patch.gistId.trim() ? patch.gistId.trim() : null;
    }
    if (patch.deviceName?.trim()) cfg.deviceName = patch.deviceName.trim();
    if (patch.clearLastSyncedAt) cfg.lastSyncedAt = null;
    else if (patch.lastSyncedAt !== undefined) {
      cfg.lastSyncedAt = patch.lastSyncedAt;
    }
    if (patch.clearLastError) cfg.lastError = null;
    else if (patch.lastError !== undefined) {
      cfg.lastError = patch.lastError.trim() ? patch.lastError : null;
    }
    if (patch.peerCount !== undefined) cfg.peerCount = patch.peerCount;
    writeBrowserMesh(cfg);
    return { ...cfg, hasPat: !!localStorage.getItem(BROWSER_PAT_KEY) };
  }
  return tauriInvoke<MeshConfig>("mesh_save_config", { patch });
}

export async function meshSetPat(secret: string): Promise<MeshConfig> {
  if (!isTauri()) {
    if (!secret.trim()) throw new Error("Secret cannot be empty.");
    localStorage.setItem(BROWSER_PAT_KEY, secret.trim());
    const cfg = readBrowserMesh();
    cfg.hasPat = true;
    writeBrowserMesh(cfg);
    return cfg;
  }
  return tauriInvoke<MeshConfig>("mesh_set_pat", { secret });
}

export async function meshClearPat(): Promise<MeshConfig> {
  if (!isTauri()) {
    localStorage.removeItem(BROWSER_PAT_KEY);
    const cfg = readBrowserMesh();
    cfg.hasPat = false;
    writeBrowserMesh(cfg);
    return cfg;
  }
  return tauriInvoke<MeshConfig>("mesh_clear_pat");
}

export async function meshGetPat(): Promise<string | null> {
  if (!isTauri()) {
    return localStorage.getItem(BROWSER_PAT_KEY);
  }
  return tauriInvoke<string | null>("mesh_get_pat");
}

export type OpenshipConfig = {
  apiUrl: string;
  dashboardUrl: string;
  hasPat: boolean;
  cliAvailable: boolean;
  lastError: string | null;
};

export type OpenshipConfigPatch = {
  apiUrl?: string;
  dashboardUrl?: string;
  clearLastError?: boolean;
};

export type OpenshipActionResult = {
  ok: boolean;
  message: string;
  detail?: string | null;
  lastBuildAt?: string | null;
};

export async function openshipGetConfig(): Promise<OpenshipConfig> {
  if (!isTauri()) {
    return {
      apiUrl: "http://localhost:4000",
      dashboardUrl: "http://localhost:3001",
      hasPat: false,
      cliAvailable: false,
      lastError: null,
    };
  }
  return tauriInvoke<OpenshipConfig>("openship_get_config");
}

export async function openshipSaveConfig(
  patch: OpenshipConfigPatch,
): Promise<OpenshipConfig> {
  if (!isTauri()) remoteUnsupported("OpenShip settings");
  return tauriInvoke<OpenshipConfig>("openship_save_config", { patch });
}

export async function openshipSetPat(secret: string): Promise<OpenshipConfig> {
  if (!isTauri()) remoteUnsupported("OpenShip PAT");
  return tauriInvoke<OpenshipConfig>("openship_set_pat", { secret });
}

export async function openshipClearPat(): Promise<OpenshipConfig> {
  if (!isTauri()) remoteUnsupported("OpenShip PAT");
  return tauriInvoke<OpenshipConfig>("openship_clear_pat");
}

export async function openshipShip(
  projectId: string,
  env: "preview" | "production",
): Promise<OpenshipActionResult> {
  if (!isTauri()) remoteUnsupported("OpenShip ship");
  return tauriInvoke<OpenshipActionResult>("openship_ship", {
    projectId,
    env,
  });
}

export async function openshipProjectStatus(
  projectId: string,
): Promise<OpenshipActionResult> {
  if (!isTauri()) remoteUnsupported("OpenShip status");
  return tauriInvoke<OpenshipActionResult>("openship_project_status", {
    projectId,
  });
}

export async function openshipCliStatus(): Promise<OpenshipActionResult> {
  if (!isTauri()) remoteUnsupported("OpenShip CLI status");
  return tauriInvoke<OpenshipActionResult>("openship_cli_status");
}

export async function updateLocalProject(
  path: string,
): Promise<OpenshipActionResult> {
  if (!isTauri()) remoteUnsupported("Update Local");
  return tauriInvoke<OpenshipActionResult>("update_local_project", { path });
}

export function isDesktopApp(): boolean {
  return isTauri();
}

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
  if (!isTauri()) {
    const body = await remoteFetch<{
      settings: RemoteSettingsDto;
      tailscale: TailscaleInfoDto;
      status?: RemoteStatusDto;
      url?: string | null;
      staticDir?: string | null;
    }>("/api/info");
    return {
      settings: body.settings,
      status: body.status ?? { running: true, bind: null, lastError: null },
      tailscale: body.tailscale,
      url: body.url ?? null,
      staticDir: body.staticDir ?? null,
    };
  }
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
