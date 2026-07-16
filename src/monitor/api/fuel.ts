import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FuelSettings, RefreshResult } from "../types/usage";

export async function getFuelSettings(): Promise<FuelSettings> {
  return invoke<FuelSettings>("fuel_get_settings");
}

export async function saveFuelSettings(settings: FuelSettings): Promise<void> {
  return invoke("fuel_save_settings", { fuelSettings: settings });
}

export async function refreshFuel(): Promise<RefreshResult> {
  return invoke<RefreshResult>("fuel_refresh");
}

export async function getFuelSnapshot(): Promise<RefreshResult> {
  return invoke<RefreshResult>("fuel_get_snapshot");
}

export async function onFuelSnapshot(
  handler: (result: RefreshResult) => void,
): Promise<UnlistenFn> {
  return listen<RefreshResult>("fuel://snapshot", (event) => {
    handler(event.payload);
  });
}

export async function fuelConnect(sourceKind: string): Promise<string> {
  return invoke<string>("fuel_connect", { sourceKind });
}

export async function fuelTest(sourceKind: string): Promise<string> {
  return invoke<string>("fuel_test", { sourceKind });
}

export async function fuelSetCredential(args: {
  provider: string;
  existingId?: string | null;
  secret: string;
  settings: FuelSettings;
  field: string;
}): Promise<FuelSettings> {
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
  return invoke<FuelSettings>("fuel_clear_credential", {
    provider: args.provider,
    settings: args.settings,
    field: args.field,
  });
}
