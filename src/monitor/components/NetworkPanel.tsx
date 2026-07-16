import { useState } from "react";
import { runLatencyProbes } from "../api/metrics";
import type { LatencyResult, MetricsSnapshot } from "../types/metrics";
import { formatBps, formatPct } from "../lib/format";

type Props = { snap: MetricsSnapshot };
type UsageTone = "hot" | "warn" | null;

/** TCP ownership counts — real byte rates deferred (see ROADMAP). */
const CONN_HOT = 40;
const CONN_WARN = 15;
const CONN_HOG = 25;

function connTone(count: number): UsageTone {
  if (count >= CONN_HOT) return "hot";
  if (count >= CONN_WARN) return "warn";
  return null;
}

function usageClass(tone: UsageTone): string {
  if (tone === "hot") return "num usage usage--hot";
  if (tone === "warn") return "num usage usage--warn";
  return "num";
}

export function NetworkPanel({ snap }: Props) {
  const [latency, setLatency] = useState<LatencyResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wifi = snap.wifi;

  async function onProbe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const results = await runLatencyProbes();
      setLatency(results);
      const fails = results.filter((r) => !r.ok).length;
      setFeedback(
        fails === 0
          ? "Latency suite complete"
          : `Latency suite finished with ${fails} failure(s)`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="net-title">
      <header className="panel__head panel__head--row">
        <h2 id="net-title" className="visually-hidden">
          Network
        </h2>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onProbe}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Probing…" : "Run latency probes"}
        </button>
      </header>

      {error ? <p className="status status--error" role="alert">{error}</p> : null}
      {feedback ? (
        <p className="status status--ok" role="status">
          {feedback}
        </p>
      ) : null}

      <div className="net-grid">
        <div className="net-block">
          <h3>Wi‑Fi</h3>
          {wifi ? (
            <dl className="kv">
              <div>
                <dt>SSID</dt>
                <dd>{wifi.ssid}</dd>
              </div>
              <div>
                <dt>Signal</dt>
                <dd>{formatPct(wifi.signalPercent)}</dd>
              </div>
              <div>
                <dt>Link</dt>
                <dd>
                  {wifi.receiveRateMbps != null
                    ? `${wifi.receiveRateMbps} / ${wifi.transmitRateMbps ?? "—"} Mbps`
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt>Radio</dt>
                <dd>
                  {wifi.radioType ?? "N/A"}
                  {wifi.channel != null ? ` · ch ${wifi.channel}` : ""}
                </dd>
              </div>
              <div>
                <dt>Interface</dt>
                <dd>{wifi.interface ?? "N/A"}</dd>
              </div>
            </dl>
          ) : (
            <p className="empty">No connected Wi‑Fi interface (real status only)</p>
          )}
        </div>

        <div className="net-block">
          <h3>Host throughput</h3>
          <dl className="kv">
            <div>
              <dt>↓ Receive</dt>
              <dd>{formatBps(snap.hostNet.recvBps)}</dd>
            </div>
            <div>
              <dt>↑ Send</dt>
              <dd>{formatBps(snap.hostNet.sentBps)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {latency ? (
        <ul className="latency-list">
          {latency.map((r) => (
            <li key={r.probe} className={r.ok ? "ok" : "bad"}>
              <span>{r.probe}</span>
              <span>
                {r.ok && r.latencyMs != null
                  ? `${r.latencyMs.toFixed(0)} ms`
                  : r.error ?? "failed"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="subhead">Processes by TCP connections</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="col-desk">
                PID
              </th>
              <th scope="col">Connections</th>
            </tr>
          </thead>
          <tbody>
            {snap.netProcesses.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty">
                  No established TCP owners reported
                </td>
              </tr>
            ) : (
              snap.netProcesses.map((p) => {
                const tone = connTone(p.connectionCount);
                const hog = p.connectionCount >= CONN_HOG;
                const hotHog = hog && tone === "hot";
                const rowClass = hog
                  ? hotHog
                    ? "row-hog row-hog--hot"
                    : "row-hog"
                  : undefined;
                return (
                  <tr
                    key={p.pid}
                    className={rowClass}
                    aria-label={hog ? "High network connection count" : undefined}
                  >
                    <td className="col-primary">{p.name}</td>
                    <td className="num col-desk">{p.pid}</td>
                    <td className={usageClass(tone)}>{p.connectionCount}</td>
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
