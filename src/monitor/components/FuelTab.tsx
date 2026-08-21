import { useSharedFuel } from "./MetricsChrome";
import { FuelPanel } from "./FuelPanel";

/** Consumes shared fuel from MetricsChromeProvider. */
export function FuelTab() {
  const fuel = useSharedFuel();
  return (
    <FuelPanel
      settings={fuel.settings}
      onSettingsChange={fuel.setSettings}
      result={fuel.result}
      snapshot={fuel.snapshot}
      refreshing={fuel.refreshing}
      onRefresh={fuel.refresh}
      error={fuel.error}
    />
  );
}
