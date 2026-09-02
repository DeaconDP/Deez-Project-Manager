import type { Project, ProjectStore, Task } from "../types";

export const MESH_GIST_FILENAME = "deez-mesh.json";

export type MeshPeerPlatform =
  | "macos"
  | "windows"
  | "linux"
  | "ios"
  | "android"
  | "web"
  | "unknown";

export interface MeshPeer {
  id: string;
  name: string;
  platform: MeshPeerPlatform;
  lastSeenAt: string;
}

export interface MeshDocument {
  version: 1;
  updatedAt: string;
  projects: Project[];
  tasks: Task[];
  peers: MeshPeer[];
}

export interface MeshConfig {
  enabled: boolean;
  gistId: string | null;
  deviceId: string;
  deviceName: string;
  hasPat: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  peerCount: number;
}

export interface MeshSyncResult {
  store: ProjectStore;
  document: MeshDocument;
  pulled: boolean;
  pushed: boolean;
  peerCount: number;
}

/** Fields that stay on the local machine — not shared across the mesh. */
function stripLocalProject(p: Project): Project {
  return {
    ...p,
    localPath: null,
    gitAhead: 0,
    gitBehind: 0,
    gitBranch: null,
    gitDirty: false,
    hasRunScript: false,
    // Keep githubStatus as remote-only when no local path on peers
    githubStatus:
      p.githubUrl || p.githubRepo ? ("remote-only" as const) : ("none" as const),
  };
}

function newerIso(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) && Number.isNaN(tb)) return false;
  if (Number.isNaN(ta)) return false;
  if (Number.isNaN(tb)) return true;
  return ta >= tb;
}

function mergeByUpdatedAt<T extends { id: string; updatedAt: string }>(
  local: T[],
  remote: T[],
  preferLocalExtras?: (winner: T, local: T | undefined, remote: T | undefined) => T,
): T[] {
  const map = new Map<string, { item: T; from: "local" | "remote" }>();
  for (const item of remote) {
    map.set(item.id, { item, from: "remote" });
  }
  for (const item of local) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, { item, from: "local" });
      continue;
    }
    const takeLocal = newerIso(item.updatedAt, existing.item.updatedAt);
    map.set(item.id, {
      item: takeLocal ? item : existing.item,
      from: takeLocal ? "local" : existing.from,
    });
  }
  return [...map.values()].map(({ item }) => {
    if (!preferLocalExtras) return item;
    const localItem = local.find((x) => x.id === item.id);
    const remoteItem = remote.find((x) => x.id === item.id);
    return preferLocalExtras(item, localItem, remoteItem);
  });
}

function restoreLocalPath(winner: Project, local?: Project): Project {
  if (!local?.localPath) return winner;
  if (winner.localPath === local.localPath) return winner;
  return {
    ...winner,
    localPath: local.localPath,
    // Keep this machine's git probe when we still have a path
    gitAhead: local.gitAhead,
    gitBehind: local.gitBehind,
    gitBranch: local.gitBranch,
    gitDirty: local.gitDirty,
    hasRunScript: local.hasRunScript,
    githubStatus: local.githubStatus,
  };
}

export function mergeStores(
  local: ProjectStore,
  remote: MeshDocument | null,
): ProjectStore {
  if (!remote) {
    return {
      version: local.version || 1,
      projects: local.projects ?? [],
      syncRoots: local.syncRoots ?? [],
      tasks: local.tasks ?? [],
    };
  }
  const projects = mergeByUpdatedAt(
    local.projects ?? [],
    remote.projects ?? [],
    (winner, loc) => restoreLocalPath(winner, loc),
  );
  const tasks = mergeByUpdatedAt(local.tasks ?? [], remote.tasks ?? []);
  return {
    version: Math.max(local.version || 1, remote.version || 1),
    projects,
    syncRoots: local.syncRoots ?? [],
    tasks,
  };
}

export function toMeshDocument(
  store: ProjectStore,
  peers: MeshPeer[],
  self: MeshPeer,
): MeshDocument {
  const withoutSelf = peers.filter((p) => p.id !== self.id);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects: (store.projects ?? []).map(stripLocalProject),
    tasks: store.tasks ?? [],
    peers: [...withoutSelf, self].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function parseMeshDocument(raw: string): MeshDocument | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const data = JSON.parse(trimmed) as Partial<MeshDocument>;
  if (!data || typeof data !== "object") return null;
  return {
    version: 1,
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
    projects: Array.isArray(data.projects) ? (data.projects as Project[]) : [],
    tasks: Array.isArray(data.tasks) ? (data.tasks as Task[]) : [],
    peers: Array.isArray(data.peers) ? (data.peers as MeshPeer[]) : [],
  };
}

export function detectPeerPlatform(): MeshPeerPlatform {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Mac OS X|Macintosh/i.test(ua) && !/Mobile/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua)) return "linux";
  return "web";
}

export function defaultDeviceName(): string {
  const platform = detectPeerPlatform();
  const host =
    typeof window !== "undefined"
      ? window.location.hostname || "device"
      : "device";
  const label =
    platform === "ios"
      ? "iPhone"
      : platform === "android"
        ? "Android"
        : platform === "macos"
          ? "Mac"
          : platform === "windows"
            ? "PC"
            : platform === "linux"
              ? "Linux"
              : "Web";
  return `${label} · ${host}`;
}

export function newDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const GH_API = "https://api.github.com";
const UA = "Deez-Project-Manager/0.1";

export async function gistFetchContent(
  pat: string,
  gistId: string,
): Promise<string | null> {
  const res = await fetch(`${GH_API}/gists/${gistId}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${pat}`,
      "User-Agent": UA,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) {
    throw new Error("MESH-404: Gist not found — check the ID and PAT scopes (gist).");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "MESH-401: GitHub rejected the PAT — need gist scope (and repo if private org).",
    );
  }
  if (!res.ok) {
    throw new Error(`MESH-GET: GitHub HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    files?: Record<string, { content?: string } | null>;
  };
  const file =
    body.files?.[MESH_GIST_FILENAME] ??
    Object.values(body.files ?? {})[0] ??
    null;
  return file?.content ?? null;
}

export async function gistCreate(
  pat: string,
  content: string,
): Promise<string> {
  const res = await fetch(`${GH_API}/gists`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${pat}`,
      "User-Agent": UA,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      description: "Deez Project Manager mesh sync",
      public: false,
      files: {
        [MESH_GIST_FILENAME]: { content },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`MESH-CREATE: GitHub HTTP ${res.status}`);
  }
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error("MESH-CREATE: missing gist id");
  return body.id;
}

export async function gistUpdate(
  pat: string,
  gistId: string,
  content: string,
): Promise<void> {
  const res = await fetch(`${GH_API}/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${pat}`,
      "User-Agent": UA,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      files: {
        [MESH_GIST_FILENAME]: { content },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`MESH-PUSH: GitHub HTTP ${res.status}`);
  }
}

export async function runMeshSync(args: {
  local: ProjectStore;
  pat: string;
  gistId: string | null;
  self: MeshPeer;
}): Promise<MeshSyncResult & { gistId: string }> {
  let remote: MeshDocument | null = null;
  let pulled = false;
  let gistId = args.gistId;

  if (gistId) {
    const raw = await gistFetchContent(args.pat, gistId);
    if (raw) {
      remote = parseMeshDocument(raw);
      pulled = true;
    }
  }

  const merged = mergeStores(args.local, remote);
  const peers = remote?.peers ?? [];
  const document = toMeshDocument(merged, peers, args.self);
  const payload = JSON.stringify(document, null, 2);

  if (!gistId) {
    gistId = await gistCreate(args.pat, payload);
  } else {
    await gistUpdate(args.pat, gistId, payload);
  }

  return {
    store: merged,
    document,
    pulled,
    pushed: true,
    peerCount: document.peers.length,
    gistId,
  };
}
