import { useCallback, useEffect, useState } from "react";
import { fetchTopology, onTopologyChanged, setUsbWatch } from "../api/usb";
import type { UsbTopology } from "../types/usb";

export function useUsbTopology() {
  const [topology, setTopology] = useState<UsbTopology | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const topo = await fetchTopology();
      setTopology(topo);
      setFeedback("USB topology refreshed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void setUsbWatch(true);
    (async () => {
      try {
        const topo = await fetchTopology();
        if (!cancelled) setTopology(topo);
        unlisten = await onTopologyChanged((t) => {
          if (!cancelled) setTopology(t);
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
      void setUsbWatch(false);
    };
  }, []);

  return { topology, loading, error, feedback, refresh };
}
