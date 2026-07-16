import { useMemo, useState } from "react";
import type { ProcessMetrics } from "../types/metrics";
import { formatBps, formatBytes } from "../lib/format";

type SortKey = "cpu" | "mem" | "name";
type UsageTone = "hot" | "warn" | null;

type Props = { processes: ProcessMetrics[] };

const RAM_HOT = 1_500_000_000;
const RAM_WARN = 750_000_000;

function cpuTone(pct: number): UsageTone {
  if (pct >= 50) return "hot";
  if (pct >= 25) return "warn";
  return null;
}

function ramTone(bytes: number): UsageTone {
  if (bytes > RAM_HOT) return "hot";
  if (bytes > RAM_WARN) return "warn";
  return null;
}

function usageClass(tone: UsageTone): string {
  if (tone === "hot") return "num usage usage--hot";
  if (tone === "warn") return "num usage usage--warn";
  return "num";
}

export function ProcessesPanel({ processes }: Props) {
  const [sort, setSort] = useState<SortKey>("cpu");

  const rows = useMemo(() => {
    const copy = [...processes];
    copy.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "mem") return b.memoryBytes - a.memoryBytes;
      return b.cpuPercent - a.cpuPercent;
    });
    return copy;
  }, [processes, sort]);

  return (
    <section className="panel" aria-labelledby="proc-title">
      <header className="panel__head panel__head--row">
        <h2 id="proc-title" className="visually-hidden">
          Processes
        </h2>
        <div className="toolbar" role="group" aria-label="Sort processes">
          <SortBtn active={sort === "cpu"} onClick={() => setSort("cpu")}>
            CPU
          </SortBtn>
          <SortBtn active={sort === "mem"} onClick={() => setSort("mem")}>
            RAM
          </SortBtn>
          <SortBtn active={sort === "name"} onClick={() => setSort("name")}>
            Name
          </SortBtn>
        </div>
      </header>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="col-desk">
                PID
              </th>
              <th scope="col">CPU</th>
              <th scope="col">RAM</th>
              <th scope="col" className="col-desk">
                Disk R/W
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Waiting for process sample…
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const cpu = cpuTone(p.cpuPercent);
                const ram = ramTone(p.memoryBytes);
                const hog = p.cpuPercent >= 40 || p.memoryBytes > RAM_HOT;
                const hotHog = hog && (cpu === "hot" || ram === "hot");
                const rowClass = hog
                  ? hotHog
                    ? "row-hog row-hog--hot"
                    : "row-hog"
                  : undefined;
                return (
                  <tr
                    key={p.pid}
                    className={rowClass}
                    aria-label={hog ? "High resource usage" : undefined}
                  >
                    <td className="col-primary">{p.name}</td>
                    <td className="num col-desk">{p.pid}</td>
                    <td className={usageClass(cpu)}>{p.cpuPercent.toFixed(1)}%</td>
                    <td className={usageClass(ram)}>{formatBytes(p.memoryBytes)}</td>
                    <td className="num muted col-desk">
                      {formatBps(p.diskReadBps ?? 0)} / {formatBps(p.diskWriteBps ?? 0)}
                    </td>
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

function SortBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "btn btn--quiet is-active" : "btn btn--quiet"}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
