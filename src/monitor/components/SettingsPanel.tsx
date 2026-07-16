import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Toggle } from "./Toggle";

export function SettingsPanel() {
  const [openOnStartup, setOpenOnStartup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const on = await isEnabled();
        if (!cancelled) setOpenOnStartup(on);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function setOpenOnStartupPreference(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      if (next) await enable();
      else await disable();
      setOpenOnStartup(next);
      setFeedback(next ? "Will open when Windows starts." : "Won’t open on startup.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <header className="panel__head">
        <h2 id="settings-title">Settings</h2>
        <p className="panel__desc">App preferences for this PC</p>
      </header>

      {error ? (
        <p className="status status--error" role="alert">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p className="status status--ok" role="status">
          {feedback}
        </p>
      ) : null}

      <div className="settings-list">
        <Toggle
          id="open-on-startup"
          label="Open on startup"
          description="Launch Deez Project Manager when you sign in to Windows"
          checked={openOnStartup}
          disabled={loading}
          busy={busy}
          onChange={(v) => void setOpenOnStartupPreference(v)}
        />
      </div>
    </section>
  );
}
