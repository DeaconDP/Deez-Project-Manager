import { mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { createEmptyProject } from "../../src/types.ts";
import { evidenceDir } from "./evidence.ts";
import type { Seed } from "./verify.ts";

export function seedStorage(seed: Seed = {}): Record<string, string> {
  const host = seed.host ?? "deez-verify";
  const fixtureRoot = join(evidenceDir(), "fixture-projects");
  const projects = (seed.projects ?? []).map((partial, index) => {
    let localPath = partial.localPath ?? null;
    if (localPath?.trim()) {
      const abs = isAbsolute(localPath) ? localPath : join(fixtureRoot, localPath);
      mkdirSync(abs, { recursive: true });
      localPath = abs;
    }
    return createEmptyProject({
      ...partial,
      name: partial.name,
      localPath,
      host: partial.host ?? null,
      sortIndex: partial.sortIndex ?? index,
    });
  });

  const out: Record<string, string> = {
    "deez-projects-store": JSON.stringify({
      version: 1,
      projects,
      syncRoots: [],
      tasks: seed.tasks ?? [],
    }),
    "deez-mesh-config": JSON.stringify({
      enabled: false,
      gistId: null,
      deviceId: crypto.randomUUID(),
      deviceName: host,
      lastSyncedAt: null,
      lastError: null,
      peerCount: 0,
    }),
    "deez-host-scope": seed.hostScope ?? "this",
    "deez-table-sort": JSON.stringify({ key: "custom", dir: "asc" }),
  };
  if (seed.storage) Object.assign(out, seed.storage);
  return out;
}
