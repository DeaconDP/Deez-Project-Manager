import type { FuelGlanceItem } from "../lib/fuelCaps";
import type { MetricsSnapshot } from "../types/metrics";
import { formatPct, loadTier } from "../lib/format";

type Props = {
  snap: MetricsSnapshot;
  fuelItems?: FuelGlanceItem[];
};

type Item = {
  id: string;
  mark?: string;
  label: string;
  value: number | null;
  fuel?: boolean;
};

function maxPct(values: Array<number | null | undefined>): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    max = max == null ? v : Math.max(max, v);
  }
  return max;
}

export function MetricsGlance({ snap, fuelItems = [] }: Props) {
  const items: Item[] = [
    { id: "cpu", mark: "Ξ", label: "CPU", value: snap.cpu.usagePercent },
    { id: "ram", mark: "▤", label: "RAM", value: snap.memory.usagePercent },
    {
      id: "gpu",
      mark: "△",
      label: "GPU",
      value: maxPct(snap.gpus.map((g) => g.usagePercent)),
    },
    {
      id: "disk",
      mark: "▣",
      label: "Disk",
      value: maxPct(snap.disks.map((d) => d.usagePercent)),
    },
    ...fuelItems.map((f) => ({
      id: f.id,
      mark: "◈",
      label: f.label,
      value: f.value,
      fuel: true,
    })),
  ];

  const ariaLabel =
    fuelItems.length > 0 ? "System load and AI fuel" : "System load";

  return (
    <div
      className={
        fuelItems.length > 0
          ? "glance-pulse glance-pulse--with-fuel"
          : "glance-pulse"
      }
      role="status"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const tier = loadTier(item.value);
        return (
          <div
            key={item.id}
            className={
              item.fuel
                ? "glance-pulse__item glance-pulse__item--fuel"
                : "glance-pulse__item"
            }
          >
            {item.mark ? (
              <span className="glance-pulse__mark" aria-hidden="true">
                {item.mark}
              </span>
            ) : null}
            <span className="glance-pulse__label">{item.label}</span>
            <span
              className={
                tier
                  ? `glance-pulse__value glance-pulse__value--tier-${tier}`
                  : "glance-pulse__value"
              }
            >
              {formatPct(item.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
