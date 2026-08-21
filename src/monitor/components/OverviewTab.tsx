import { buildFuelOverviewSources } from "../lib/fuelCaps";
import { useSharedFuel, useSharedMetrics } from "./MetricsChrome";
import { OverviewPanel } from "./OverviewPanel";

/** Consumes shared metrics + fuel from MetricsChromeProvider. */
export function OverviewTab() {
  const { snap } = useSharedMetrics();
  const fuel = useSharedFuel();
  const fuelSources = buildFuelOverviewSources(fuel.settings, fuel.snapshot);
  return <OverviewPanel snap={snap} fuelSources={fuelSources} />;
}
