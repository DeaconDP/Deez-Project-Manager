import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useFuelUsage } from "../hooks/useFuelUsage";
import { useMetrics } from "../hooks/useMetrics";
import { buildFuelGlanceItems } from "../lib/fuelCaps";
import type { MetricsSnapshot, SpikeEvent } from "../types/metrics";
import type {
  FuelSettings,
  RefreshResult,
  UsageSnapshot,
} from "../types/usage";
import { MetricsGlance } from "./MetricsGlance";

type MetricsValue = {
  snap: MetricsSnapshot;
  spikes: SpikeEvent[];
  setSpikes: Dispatch<SetStateAction<SpikeEvent[]>>;
  ready: boolean;
  error: string | null;
};

type FuelValue = {
  settings: FuelSettings;
  setSettings: (next: FuelSettings) => Promise<void>;
  result: RefreshResult | null;
  snapshot: UsageSnapshot | null;
  ready: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

const MetricsCtx = createContext<MetricsValue | null>(null);
const FuelCtx = createContext<FuelValue | null>(null);
const FuelGlanceCtx = createContext<ReturnType<typeof buildFuelGlanceItems>>([]);

type ProviderProps = {
  children: ReactNode;
  /** When true (e.g. Projects tab), sampler uses idle pace while window is visible. */
  preferSlow?: boolean;
};

/** Owns the single metrics + fuel subscription for chrome and monitor tabs. */
export function MetricsChromeProvider({
  children,
  preferSlow = false,
}: ProviderProps) {
  const value = useMetrics({ preferSlow });
  const fuel = useFuelUsage();
  const fuelGlanceItems = buildFuelGlanceItems(fuel.settings, fuel.snapshot);
  return (
    <MetricsCtx.Provider value={value}>
      <FuelCtx.Provider value={fuel}>
        <FuelGlanceCtx.Provider value={fuelGlanceItems}>
          {children}
        </FuelGlanceCtx.Provider>
      </FuelCtx.Provider>
    </MetricsCtx.Provider>
  );
}

function useFuelGlanceItems() {
  return useContext(FuelGlanceCtx);
}

export function useSharedMetrics(): MetricsValue {
  const ctx = useContext(MetricsCtx);
  if (!ctx) {
    throw new Error("useSharedMetrics requires MetricsChromeProvider");
  }
  return ctx;
}

export function useSharedFuel(): FuelValue {
  const ctx = useContext(FuelCtx);
  if (!ctx) {
    throw new Error("useSharedFuel requires MetricsChromeProvider");
  }
  return ctx;
}

function useChromeMetrics(): MetricsValue {
  return useSharedMetrics();
}

export function MetricsGlanceSlot() {
  const { snap, ready, error } = useChromeMetrics();
  const fuelItems = useFuelGlanceItems();
  if (!ready || error) return null;
  return <MetricsGlance snap={snap} fuelItems={fuelItems} />;
}

export function MetricsLiveSlot() {
  const { snap, ready, error } = useChromeMetrics();
  return (
    <p
      className={error ? "chrome-live chrome-live--error" : "chrome-live"}
      aria-live="polite"
    >
      {!ready && !error ? "Connecting…" : null}
      {error ? `Error: ${error}` : null}
      {ready && !error && snap.ts
        ? `Live · ${new Date(snap.ts).toLocaleTimeString()}`
        : null}
    </p>
  );
}
