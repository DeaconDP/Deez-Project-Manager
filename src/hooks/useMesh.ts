import { useCallback, useEffect, useRef, useState } from "react";
import {
  getProjects,
  meshClearPat,
  meshGetConfig,
  meshGetPat,
  meshSaveConfig,
  meshSetPat,
  saveProjects,
  type MeshConfigPatch,
} from "../api";
import {
  detectPeerPlatform,
  runMeshSync,
  type MeshConfig,
  type MeshPeer,
} from "../lib/mesh";
import type { ProjectStore } from "../types";

const AUTO_SYNC_MS = 90_000;

export function useMesh(opts?: {
  onStoreMerged?: (store: ProjectStore) => void;
  /** Bump to nudge a background sync after local edits */
  dirtyEpoch?: number;
}) {
  const [config, setConfig] = useState<MeshConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const onMergedRef = useRef(opts?.onStoreMerged);
  onMergedRef.current = opts?.onStoreMerged;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await meshGetConfig();
      setConfig(cfg);
      setError(cfg.lastError);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patchConfig = useCallback(async (patch: MeshConfigPatch) => {
    const next = await meshSaveConfig(patch);
    setConfig(next);
    return next;
  }, []);

  const savePat = useCallback(async (secret: string) => {
    const next = await meshSetPat(secret);
    setConfig(next);
    setFeedback("GitHub PAT saved on this device.");
    setError(null);
    return next;
  }, []);

  const clearPat = useCallback(async () => {
    const next = await meshClearPat();
    setConfig(next);
    setFeedback("GitHub PAT cleared on this device.");
    return next;
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    setFeedback(null);
    try {
      let cfg = config ?? (await meshGetConfig());
      const pat = await meshGetPat();
      if (!pat?.trim()) {
        throw new Error("Add a GitHub PAT with gist scope before syncing.");
      }
      const self: MeshPeer = {
        id: cfg.deviceId,
        name: cfg.deviceName,
        platform: detectPeerPlatform(),
        lastSeenAt: new Date().toISOString(),
      };
      const local = await getProjects();
      const result = await runMeshSync({
        local,
        pat: pat.trim(),
        gistId: cfg.gistId,
        self,
      });
      await saveProjects(result.store);
      onMergedRef.current?.(result.store);
      cfg = await meshSaveConfig({
        enabled: true,
        gistId: result.gistId,
        lastSyncedAt: new Date().toISOString(),
        clearLastError: true,
        peerCount: result.peerCount,
      });
      setConfig(cfg);
      setFeedback(
        result.pulled
          ? `Mesh synced · ${result.peerCount} peer${result.peerCount === 1 ? "" : "s"}`
          : `Mesh hub created · gist ${result.gistId.slice(0, 8)}…`,
      );
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      try {
        const next = await meshSaveConfig({ lastError: msg });
        setConfig(next);
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [config]);

  // Periodic pull/push when mesh is enabled
  useEffect(() => {
    if (!config?.enabled || !config.hasPat) return;
    const id = window.setInterval(() => {
      void syncNow().catch(() => {});
    }, AUTO_SYNC_MS);
    return () => window.clearInterval(id);
  }, [config?.enabled, config?.hasPat, syncNow]);

  // After local edits settle, push once (debounced via dirtyEpoch)
  useEffect(() => {
    if (opts?.dirtyEpoch == null || opts.dirtyEpoch === 0) return;
    if (!config?.enabled || !config.hasPat) return;
    const t = window.setTimeout(() => {
      void syncNow().catch(() => {});
    }, 2500);
    return () => window.clearTimeout(t);
  }, [opts?.dirtyEpoch, config?.enabled, config?.hasPat, syncNow]);

  // Sync once shortly after enable/load
  useEffect(() => {
    if (loading || !config?.enabled || !config.hasPat) return;
    const t = window.setTimeout(() => {
      void syncNow().catch(() => {});
    }, 1200);
    return () => window.clearTimeout(t);
  }, [loading, config?.enabled, config?.hasPat]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    config,
    loading,
    syncing,
    error,
    feedback,
    setFeedback,
    setError,
    refresh,
    patchConfig,
    savePat,
    clearPat,
    syncNow,
  };
}
