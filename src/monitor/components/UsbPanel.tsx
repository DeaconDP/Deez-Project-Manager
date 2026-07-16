import { useUsbTopology } from "../hooks/useUsbTopology";
import { deviceDisplayName } from "../types/usb";

export function UsbPanel() {
  const { topology, loading, error, feedback, refresh } = useUsbTopology();

  const deviceCount = topology?.devices.length ?? 0;
  const hubCount =
    topology?.controllers.reduce(
      (n, c) => n + countHubs(c.hubs),
      0,
    ) ?? 0;

  return (
    <section className="panel" aria-labelledby="usb-title">
      <header className="panel__head panel__head--row">
        <h2 id="usb-title" className="visually-hidden">
          USB
        </h2>
        <button
          type="button"
          className="btn btn--primary"
          onClick={refresh}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? "Refreshing…" : "Refresh USB"}
        </button>
      </header>

      {error ? <p className="status status--error" role="alert">{error}</p> : null}
      {feedback ? (
        <p className="status status--ok" role="status">
          {feedback}
        </p>
      ) : null}

      {!topology ? (
        <p className="empty">Enumerating USB…</p>
      ) : (
        <>
          <p className="hint">
            {topology.controllers.length} controller(s) · {hubCount} hub(s) ·{" "}
            {deviceCount} device(s)
            {topology.enumeratedAt
              ? ` · ${new Date(topology.enumeratedAt).toLocaleTimeString()}`
              : ""}
          </p>

          {topology.warnings.length > 0 ? (
            <ul className="warn-list">
              {topology.warnings.map((w) => (
                <li key={`${w.code}-${w.message}`}>
                  <code>{w.code}</code> {w.message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">VID:PID</th>
                  <th scope="col" className="col-desk">
                    Speed
                  </th>
                  <th scope="col" className="col-desk">
                    Port
                  </th>
                </tr>
              </thead>
              <tbody>
                {topology.devices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      No USB devices in topology
                    </td>
                  </tr>
                ) : (
                  topology.devices.map((d) => (
                    <tr key={d.id}>
                      <td className="col-primary">{deviceDisplayName(d)}</td>
                      <td className="num">
                        {formatId(d.vendorId)}:{formatId(d.productId)}
                      </td>
                      <td className="col-desk">{d.speed ?? "N/A"}</td>
                      <td className="num muted col-desk">
                        {d.portChain?.join(".") ?? d.portIndex}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function countHubs(
  hubs: { childHubs: unknown[] }[],
): number {
  let n = hubs.length;
  for (const h of hubs) {
    n += countHubs(h.childHubs as { childHubs: unknown[] }[]);
  }
  return n;
}

function formatId(n: number | null | undefined): string {
  if (n == null) return "????";
  return n.toString(16).padStart(4, "0");
}
