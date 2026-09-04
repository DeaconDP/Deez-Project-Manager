import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri, remoteFetch, remoteUnsupported } from "../../lib/runtime";
import {
  defaultFuelSettings,
  type FuelSettings,
  type RefreshResult,
} from "../types/usage";

export async function getFuelSettings(): Promise<FuelSettings> {
  if (!isTauri()) {
    try {
      return await remoteFetch<FuelSettings>("/api/fuel/settings");
    } catch {
      return defaultFuelSettings();
    }
  }
  return invoke<FuelSettings>("fuel_get_settings");
}

export async function saveFuelSettings(settings: FuelSettings): Promise<void> {
  if (!isTauri()) remoteUnsupported("Save fuel settings");
  return invoke("fuel_save_settings", { fuelSettings: settings });
}

export async function refreshFuel(): Promise<RefreshResult> {
  if (!isTauri()) return remoteFetch<RefreshResult>("/api/fuel");
  return invoke<RefreshResult>("fuel_refresh");
}

export async function getFuelSnapshot(): Promise<RefreshResult | null> {
  if (!isTauri()) {
    try {
      return await remoteFetch<RefreshResult>("/api/fuel");
    } catch {
      return null;
    }
  }
  return invoke<RefreshResult>("fuel_get_snapshot");
}

export async function onFuelSnapshot(
  handler: (result: RefreshResult) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const next = await getFuelSnapshot();
        if (next) handler(next);
      } catch {
        /* host offline */
      }
      if (!cancelled) window.setTimeout(tick, 15000);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }
  return listen<RefreshResult>("fuel://snapshot", (event) => {
    handler(event.payload);
  });
}

export async function fuelConnect(sourceKind: string): Promise<string> {
  if (!isTauri()) remoteUnsupported("Fuel connect");
  return invoke<string>("fuel_connect", { sourceKind });
}

export async function fuelTest(sourceKind: string): Promise<string> {
  if (!isTauri()) remoteUnsupported("Fuel test");
  return invoke<string>("fuel_test", { sourceKind });
}

export async function fuelSetCredential(args: {
  provider: string;
  existingId?: string | null;
  secret: string;
  settings: FuelSettings;
  field: string;
}): Promise<FuelSettings> {
  if (!isTauri()) remoteUnsupported("Save fuel credential");
  return invoke<FuelSettings>("fuel_set_credential", {
    provider: args.provider,
    existingId: args.existingId ?? null,
    secret: args.secret,
    settings: args.settings,
    field: args.field,
  });
}

export async function fuelClearCredential(args: {
  provider: string;
  settings: FuelSettings;
  field: string;
}): Promise<FuelSettings> {
  if (!isTauri()) remoteUnsupported("Clear fuel credential");
  return invoke<FuelSettings>("fuel_clear_credential", {
    provider: args.provider,
    settings: args.settings,
    field: args.field,
  });
}
