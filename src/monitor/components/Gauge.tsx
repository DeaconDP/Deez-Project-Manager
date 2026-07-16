import { formatPct } from "../lib/format";

type Props = {
  label: string;
  value: number | null | undefined;
  sub?: string;
  accent?: "cyan" | "lime" | "amber" | "rose";
};

export function Gauge({ label, value, sub, accent = "lime" }: Props) {
  const pct = value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
  const display = formatPct(pct);

  return (
    <div className={`gauge gauge--${accent}`}>
      <div className="gauge__meta">
        <span className="gauge__label">{label}</span>
        <span className="gauge__value" aria-live="polite">
          {display}
        </span>
      </div>
      <div
        className="gauge__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-valuetext={display}
      >
        <div
          className="gauge__fill"
          style={{ width: pct == null ? "0%" : `${pct}%` }}
        />
      </div>
      {sub ? <p className="gauge__sub">{sub}</p> : null}
    </div>
  );
}
