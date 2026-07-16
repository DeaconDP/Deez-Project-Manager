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
import { MetricsGlance } from "./MetricsGlance";

type MetricsValue = {
  snap: MetricsSnapshot;
  spikes: SpikeEvent[];
  setSpikes: Dispatch<SetStateAction<SpikeEvent[]>>;
  ready: boolean;
  error: string | null;
};

const MetricsCtx = createContext<MetricsValue | null>(null);
const FuelGlanceCtx = createContext<ReturnType<typeof buildFuelGlanceItems>>([]);

/** Owns metrics + fuel subscriptions for chrome (and optional consumers under it). */
export function MetricsChromeProvider({ children }: { children: ReactNode }) {
  const value = useMetrics();
  const fuel = useFuelUsage();
  const fuelGlanceItems = buildFuelGlanceItems(fuel.settings, fuel.snapshot);
  return (
    <MetricsCtx.Provider value={value}>
      <FuelGlanceCtx.Provider value={fuelGlanceItems}>
        {children}
      </FuelGlanceCtx.Provider>
    </MetricsCtx.Provider>
  );
}

function useFuelGlanceItems() {
  return useContext(FuelGlanceCtx);
}

function useChromeMetrics(): MetricsValue {
  const ctx = useContext(MetricsCtx);
  if (!ctx) {
    throw new Error("Metrics chrome slots require MetricsChromeProvider");
  }
  return ctx;
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
