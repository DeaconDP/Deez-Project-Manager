import { useFuelUsage } from "../hooks/useFuelUsage";
import { FuelPanel } from "./FuelPanel";

/** Mounts fuel subscription only while Fuel tab is visible. */
export function FuelTab() {
  const fuel = useFuelUsage();
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
