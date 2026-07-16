import { buildFuelOverviewSources } from "../lib/fuelCaps";
import { useFuelUsage } from "../hooks/useFuelUsage";
import { useMetrics } from "../hooks/useMetrics";
import { OverviewPanel } from "./OverviewPanel";

/** Mounts metrics + fuel only while Overview is visible. */
export function OverviewTab() {
  const { snap } = useMetrics();
  const fuel = useFuelUsage();
  const fuelSources = buildFuelOverviewSources(fuel.settings, fuel.snapshot);
  return <OverviewPanel snap={snap} fuelSources={fuelSources} />;
}
