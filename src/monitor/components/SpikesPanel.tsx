import { useMemo, useState } from "react";
import { clearSpikes, listSpikes } from "../api/metrics";
import type { SpikeEvent } from "../types/metrics";

type Props = {
  spikes: SpikeEvent[];
  setSpikes: React.Dispatch<React.SetStateAction<SpikeEvent[]>>;
};

type UsageTone = "hot" | "warn" | null;

type Culprit = {
  key: string;
  label: string;
  kind: string;
  count: number;
  peak: number;
  lastTs: string;
};

/** How often a source must fire to count as a hog / hot culprit. */
const CULPRIT_HOG = 2;
const CULPRIT_HOT = 4;

function culpritIdentity(s: SpikeEvent): { key: string; label: string } {
  if (s.kind === "process_cpu") {
    const idx = s.source.lastIndexOf(":");
    const name = idx > 0 ? s.source.slice(0, idx) : s.source;
    return { key: `process:${name}`, label: name };
  }
  if (s.kind === "wifi_signal") {
    return { key: `wifi:${s.source}`, label: s.source };
  }
  if (s.source === "system") {
    return { key: `${s.kind}:system`, label: s.kind.toUpperCase() };
  }
  return { key: `${s.kind}:${s.source}`, label: s.source };
}

function rankCulprits(spikes: SpikeEvent[]): Culprit[] {
  const map = new Map<string, Culprit>();
  for (const s of spikes) {
    const { key, label } = culpritIdentity(s);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        key,
        label,
        kind: s.kind,
        count: 1,
        peak: s.value,
        lastTs: s.ts,
      });
      continue;
    }
    prev.count += 1;
    if (s.value > prev.peak) prev.peak = s.value;
    if (s.ts > prev.lastTs) prev.lastTs = s.ts;
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.peak - a.peak;
  });
}

function countTone(count: number): UsageTone {
  if (count >= CULPRIT_HOT) return "hot";
  if (count >= CULPRIT_HOG) return "warn";
  return null;
}

function usageClass(tone: UsageTone): string {
  if (tone === "hot") return "num usage usage--hot";
  if (tone === "warn") return "num usage usage--warn";
  return "num";
}

function hogRowClass(count: number): string | undefined {
  if (count < CULPRIT_HOG) return undefined;
  return count >= CULPRIT_HOT ? "row-hog row-hog--hot" : "row-hog";
}

export function SpikesPanel({ spikes, setSpikes }: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const culprits = useMemo(() => rankCulprits(spikes), [spikes]);
  const culpritCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of culprits) m.set(c.key, c.count);
    return m;
  }, [culprits]);

  async function onClear() {
    if (busy) return;
    if (!window.confirm("Clear all logged spikes?")) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await clearSpikes();
      setSpikes([]);
      setFeedback("Spike log cleared");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const rows = await listSpikes(100);
      setSpikes(rows);
      setFeedback("Spike log refreshed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="spikes-title">
      <header className="panel__head panel__head--row">
        <h2 id="spikes-title" className="visually-hidden">
          Spikes
        </h2>
        <div className="toolbar">
          <button
            type="button"
            className="btn btn--quiet"
            onClick={onRefresh}
            disabled={busy}
            aria-busy={busy}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={onClear}
            disabled={busy}
            aria-busy={busy}
          >
            Clear
          </button>
        </div>
      </header>

      {error ? <p className="status status--error" role="alert">{error}</p> : null}
      {feedback ? (
        <p className="status status--ok" role="status">
          {feedback}
        </p>
      ) : null}

      {culprits.length > 0 ? (
        <>
          <h3 className="subhead" id="culprits-title">
            Culprits by spike count
          </h3>
          <div className="table-wrap">
            <table className="data-table" aria-labelledby="culprits-title">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Source</th>
                  <th scope="col" className="col-desk">
                    Kind
                  </th>
                  <th scope="col">Spikes</th>
                  <th scope="col">Peak</th>
                  <th scope="col" className="col-desk">
                    Last
                  </th>
                </tr>
              </thead>
              <tbody>
                {culprits.map((c, i) => {
                  const tone = countTone(c.count);
                  const rowClass = hogRowClass(c.count);
                  return (
                    <tr
                      key={c.key}
                      className={rowClass}
                      aria-label={
                        c.count >= CULPRIT_HOG ? "Frequent spike culprit" : undefined
                      }
                    >
                      <td className="num muted">{i + 1}</td>
                      <td className="col-primary">{c.label}</td>
                      <td className="col-desk">
                        <code>{c.kind}</code>
                      </td>
                      <td className={usageClass(tone)}>{c.count}</td>
                      <td className="num">{c.peak.toFixed(1)}</td>
                      <td className="muted col-desk">{formatTs(c.lastTs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h3 className="subhead" id="spike-log-title">
        Event log
      </h3>
      <div className="table-wrap">
        <table className="data-table" aria-labelledby="spike-log-title">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Kind</th>
              <th scope="col" className="col-desk">
                Source
              </th>
              <th scope="col">Value</th>
              <th scope="col" className="col-desk">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {spikes.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  No spikes logged yet
                </td>
              </tr>
            ) : (
              spikes.map((s) => {
                const { key } = culpritIdentity(s);
                const count = culpritCounts.get(key) ?? 0;
                const isHog = count >= CULPRIT_HOG;
                const isHot = count >= CULPRIT_HOT;
                const rowClass = isHog
                  ? isHot
                    ? "row-hog row-hog--hot"
                    : "row-hog"
                  : undefined;
                return (
                  <tr
                    key={s.id}
                    className={rowClass}
                    aria-label={isHog ? "Spike from frequent culprit" : undefined}
                  >
                    <td className="muted col-primary">{formatTs(s.ts)}</td>
                    <td>
                      <code>{s.kind}</code>
                    </td>
                    <td className="col-desk">{s.source}</td>
                    <td className="num">{s.value.toFixed(1)}</td>
                    <td className="col-desk">{s.note ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}
