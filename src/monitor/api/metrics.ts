import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri, remoteFetch } from "../../lib/runtime";
import type {
  LatencyResult,
  MetricsSnapshot,
  SpikeEvent,
} from "../types/metrics";

export async function fetchSnapshot(): Promise<MetricsSnapshot> {
  if (!isTauri()) return remoteFetch<MetricsSnapshot>("/api/metrics");
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
