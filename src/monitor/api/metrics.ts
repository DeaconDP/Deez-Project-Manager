import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LatencyResult,
  MetricsSnapshot,
  SpikeEvent,
} from "../types/metrics";

export async function fetchSnapshot(): Promise<MetricsSnapshot> {
  return invoke<MetricsSnapshot>("get_snapshot");
}

export type SamplerPace = "active" | "idle";

export async function setSamplerPace(pace: SamplerPace): Promise<void> {
  return invoke("set_sampler_pace", { pace });
}

export async function onSnapshot(
  handler: (snap: MetricsSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<MetricsSnapshot>("metrics://snapshot", (event) => {
    handler(event.payload);
  });
}

export async function listSpikes(limit = 100): Promise<SpikeEvent[]> {
  return invoke<SpikeEvent[]>("list_spikes", { limit });
}

export async function clearSpikes(): Promise<void> {
  return invoke("clear_spikes");
}

export async function onSpikeLogged(
  handler: (ev: SpikeEvent) => void,
): Promise<UnlistenFn> {
  return listen<SpikeEvent>("spike://logged", (event) => {
    handler(event.payload);
  });
}

export async function runLatencyProbes(): Promise<LatencyResult[]> {
  return invoke<LatencyResult[]>("run_latency_probes");
}
