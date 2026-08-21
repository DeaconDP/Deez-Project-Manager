import { useSharedMetrics } from "./MetricsChrome";
import { NetworkPanel } from "./NetworkPanel";
import { ProcessesPanel } from "./ProcessesPanel";
import { SpikesPanel } from "./SpikesPanel";
import { UsbPanel } from "./UsbPanel";

type ProcessView = "cpu" | "network" | "usb" | "spikes";

const PROCESS_VIEWS: { id: ProcessView; label: string }[] = [
  { id: "cpu", label: "CPU / RAM" },
  { id: "network", label: "Network" },
  { id: "usb", label: "USB" },
  { id: "spikes", label: "Spikes" },
];

type Props = {
  processView: ProcessView;
  onProcessViewChange: (view: ProcessView) => void;
};

/** Consumes shared metrics from MetricsChromeProvider. */
export function ProcessesHub({ processView, onProcessViewChange }: Props) {
  const { snap, spikes, setSpikes } = useSharedMetrics();

  return (
    <div className="process-hub">
      <nav
        className="tabs tabs--sub"
        role="tablist"
        aria-label="Process views"
      >
        {PROCESS_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            className={processView === v.id ? "tab is-active" : "tab"}
            aria-selected={processView === v.id}
            onClick={() => onProcessViewChange(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>
      {processView === "cpu" ? (
        <ProcessesPanel processes={snap.processes} />
      ) : null}
      {processView === "network" ? <NetworkPanel snap={snap} /> : null}
      {processView === "usb" ? <UsbPanel /> : null}
      {processView === "spikes" ? (
        <SpikesPanel spikes={spikes} setSpikes={setSpikes} />
      ) : null}
    </div>
  );
}
