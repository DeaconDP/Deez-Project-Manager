import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { isTauri } from "@tauri-apps/api/core";
import { Spinner } from "./Spinner";

interface Props {
  onFeedback?: (kind: "success" | "error", message: string) => void;
}

/** Toggle OS login autostart for the packaged (or current) app binary. */
export function AutostartToggle({ onFeedback }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isTauri()) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const on = await isEnabled();
        if (!cancelled) setEnabled(on);
      } catch {
        // Leave off if we can't read (e.g. unsupported env).
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle() {
    if (!isTauri() || busy || !ready) return;
    const next = !enabled;
    setBusy(true);
    try {
      if (next) {
        await enable();
      } else {
        await disable();
      }
      setEnabled(next);
      onFeedback?.(
        "success",
        next ? "Will launch at PC start" : "Removed from PC start",
      );
    } catch (e) {
      onFeedback?.(
        "error",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!isTauri()) return null;

  return (
    <button
      type="button"
      className={`autostart-toggle${enabled ? " is-on" : ""}`}
      role="switch"
      aria-checked={enabled}
      aria-busy={busy || !ready}
      disabled={busy || !ready}
      onClick={() => void handleToggle()}
      title={
        enabled
          ? "Deez Project Manager launches when Windows starts"
          : "Launch Deez Project Manager when Windows starts"
      }
    >
      {busy || !ready ? (
        <Spinner size="sm" />
      ) : (
        <span className="autostart-track" aria-hidden>
          <span className="autostart-thumb" />
        </span>
      )}
      <span className="autostart-label">Start with PC</span>
    </button>
  );
}
