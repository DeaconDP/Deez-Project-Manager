import type { MetricsSnapshot } from "../types/metrics";
import type { FuelSourceView } from "../types/usage";
import { formatBytes, formatTemp } from "../lib/format";
import { Gauge } from "./Gauge";
import { FuelCapStack } from "./FuelCapStack";

type Props = {
  snap: MetricsSnapshot;
  fuelSources?: FuelSourceView[];
};

function gpuLabel(index: number, total: number): string {
  if (total <= 1) return "GPU";
  return `GPU ${index}`;
}

function diskLabel(mount: string, name: string, index: number, total: number): string {
  const base = mount || name || `Disk ${index}`;
  if (total <= 1) return "Disk";
  return base;
}

function shortGpuName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 28) return trimmed;
  return `${trimmed.slice(0, 25)}…`;
}

export function OverviewPanel({ snap, fuelSources = [] }: Props) {
  const gpus = snap.gpus;
  const disks = snap.disks;

  return (
    <section className="panel" aria-labelledby="overview-title">
      <header className="panel__head visually-hidden">
        <h2 id="overview-title">Overview</h2>
        <p className="panel__desc">
          Live system load · temps show N/A when sensors are unavailable
          {fuelSources.length > 0 ? " · selected Fuel gauges below" : null}
        </p>
      </header>

      <div className="gauge-grid">
        <Gauge
          label="CPU"
          value={snap.cpu.usagePercent}
          sub={`${snap.cpu.coreCount} cores · ${formatTemp(snap.temps.cpuC)}`}
          accent="lime"
        />
        <Gauge
          label="RAM"
          value={snap.memory.usagePercent}
          sub={`${formatBytes(snap.memory.usedBytes)} / ${formatBytes(snap.memory.totalBytes)}`}
          accent="cyan"
        />

        <div className="fuel-cap-stack" data-source="gpu">
          <div className="fuel-cap-stack__bars" role="group" aria-label="GPU">
            {gpus.length === 0 ? (
              <Gauge
                label="GPU"
                value={null}
                sub="No GPU telemetry (NVIDIA nvidia-smi not found)"
                accent="amber"
              />
            ) : (
              gpus.map((g, i) => (
                <Gauge
                  key={`${g.name}-${i}`}
                  label={gpuLabel(i, gpus.length)}
                  value={g.usagePercent}
                  sub={`${shortGpuName(g.name)} · ${formatTemp(g.tempC ?? (i === 0 ? snap.temps.gpuC : null))}${
                    g.memoryUsedBytes != null && g.memoryTotalBytes != null
                      ? ` · ${formatBytes(g.memoryUsedBytes)} / ${formatBytes(g.memoryTotalBytes)}`
                      : ""
                  }`}
                  accent="amber"
                />
              ))
            )}
          </div>
        </div>

        <div className="fuel-cap-stack" data-source="disk">
          <div className="fuel-cap-stack__bars" role="group" aria-label="Disk">
            {disks.length === 0 ? (
              <Gauge label="Disk" value={null} sub="No volumes reported" accent="rose" />
            ) : (
              disks.map((d, i) => (
                <Gauge
                  key={`${d.mount}-${d.name}-${i}`}
                  label={diskLabel(d.mount, d.name, i, disks.length)}
                  value={d.usagePercent}
                  sub={
                    disks.length > 1
                      ? `${formatBytes(d.availableBytes)} free · ${formatBytes(d.totalBytes)}`
                      : `${d.mount || d.name} · ${formatBytes(d.availableBytes)} free`
                  }
                  accent="rose"
                />
              ))
            )}
          </div>
        </div>
      </div>

      {fuelSources.length > 0 ? (
        <div className="overview-fuel" aria-label="AI usage">
          <h3 className="overview-fuel__title">Fuel</h3>
          <div className="overview-fuel__sources">
            {fuelSources.map((src) => (
              <FuelCapStack key={src.id} view={src} showTitle />
            ))}
          </div>
        </div>
      ) : null}

      {snap.temps.notes.length > 0 ? (
        <p className="hint">{snap.temps.notes[0]}</p>
      ) : null}
    </section>
  );
}
