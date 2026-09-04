import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri, remoteFetch } from "../../lib/runtime";
import type {
  LatencyResult,
  MetricsSnapshot,
  SpikeEvent,
} from "../types/metrics";

const emptySnapshot: MetricsSnapshot = {
  ts: "",
  cpu: { usagePercent: 0, coreCount: 0, brand: "" },
  memory: { totalBytes: 0, usedBytes: 0, usagePercent: 0 },
  disks: [],
  gpus: [],
  temps: { cpuC: null, gpuC: null, zones: [], notes: [] },
  processes: [],
  wifi: null,
  hostNet: {
    recvBps: 0,
    sentBps: 0,
    totalRecvBytes: 0,
    totalSentBytes: 0,
  },
  netProcesses: [],
};

export async function fetchSnapshot(): Promise<MetricsSnapshot> {
  if (!isTauri()) {
    try {
      return await remoteFetch<MetricsSnapshot>("/api/metrics");
    } catch {
      // Mesh-only PWA has no live Ada host.
      return emptySnapshot;
    }
  }
  return invoke<MetricsSnapshot>("get_snapshot");
}

export type SamplerPace = "active" | "idle";

export async function setSamplerPace(pace: SamplerPace): Promise<void> {
  if (!isTauri()) return;
  return invoke("set_sampler_pace", { pace });
}

export async function onSnapshot(
  handler: (snap: MetricsSnapshot) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        handler(await fetchSnapshot());
      } catch {
        /* host offline */
      }
      if (!cancelled) window.setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }
  return listen<MetricsSnapshot>("metrics://snapshot", (event) => {
    handler(event.payload);
  });
}

export async function listSpikes(limit = 100): Promise<SpikeEvent[]> {
  if (!isTauri()) return [];
  return invoke<SpikeEvent[]>("list_spikes", { limit });
}

export async function clearSpikes(): Promise<void> {
  if (!isTauri()) return;
  return invoke("clear_spikes");
}

export async function onSpikeLogged(
  handler: (ev: SpikeEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    void handler;
    return () => {};
  }
  return listen<SpikeEvent>("spike://logged", (event) => {
    handler(event.payload);
  });
}

export async function runLatencyProbes(): Promise<LatencyResult[]> {
  if (!isTauri()) return [];
  return invoke<LatencyResult[]>("run_latency_probes");
}
