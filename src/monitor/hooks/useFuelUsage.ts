import { useCallback, useEffect, useRef, useState } from "react";
import {
  getFuelSettings,
  getFuelSnapshot,
  onFuelSnapshot,
  refreshFuel,
  saveFuelSettings,
} from "../api/fuel";
import {
  defaultFuelSettings,
  type FuelSettings,
  type RefreshResult,
} from "../types/usage";

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

export function useFuelUsage() {
  const [settings, setSettings] = useState<FuelSettings>(defaultFuelSettings());
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const hiddenRef = useRef(isHidden());

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const [s, snap] = await Promise.all([
          getFuelSettings(),
          getFuelSnapshot(),
        ]);
        if (cancelled) return;
        setSettings(s);
        setResult(snap);
        setReady(true);
        unlisten = await onFuelSnapshot((next) => {
          if (hiddenRef.current) return;
          setResult(next);
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    function syncVisibility() {
      const hidden = isHidden();
      hiddenRef.current = hidden;
      if (!hidden) {
        void getFuelSnapshot()
          .then(setResult)
          .catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  const persistSettings = useCallback(async (next: FuelSettings) => {
    setSettings(next);
    try {
      await saveFuelSettings(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const next = await refreshFuel();
      setResult(next);
    } catch (e) {
      // Phone mesh-only: Fuel needs a Tailscale live node — stay quiet.
      if (result == null) {
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, result]);

  return {
    settings,
    setSettings: persistSettings,
    result,
    snapshot: result?.snapshot ?? null,
    ready,
    error,
    refreshing,
    refresh,
  };
}
