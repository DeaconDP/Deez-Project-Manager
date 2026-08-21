import { useEffect, useRef, useState } from "react";
import {
  fetchSnapshot,
  onSnapshot,
  onSpikeLogged,
  listSpikes,
  setSamplerPace,
} from "../api/metrics";
import type { MetricsSnapshot, SpikeEvent } from "../types/metrics";

const empty: MetricsSnapshot = {
  ts: "",
  cpu: { usagePercent: 0, coreCount: 0, brand: "" },
  memory: { totalBytes: 0, usedBytes: 0, usagePercent: 0 },
  disks: [],
  gpus: [],
  temps: { cpuC: null, gpuC: null, zones: [], notes: [] },
  processes: [],
  wifi: null,
  hostNet: {
    recvBps: 0,
    sentBps: 0,
    totalRecvBytes: 0,
    totalSentBytes: 0,
  },
  netProcesses: [],
};

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

type Options = {
  /** Prefer idle sampler pace while the window is visible (Projects-only sessions). */
  preferSlow?: boolean;
};

export function useMetrics(options: Options = {}) {
  const { preferSlow = false } = options;
  const [snap, setSnap] = useState<MetricsSnapshot>(empty);
  const [spikes, setSpikes] = useState<SpikeEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hiddenRef = useRef(isHidden());
  const preferSlowRef = useRef(preferSlow);
  preferSlowRef.current = preferSlow;

  useEffect(() => {
    let unlistenSnap: (() => void) | undefined;
    let unlistenSpike: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const [initial, spikeList] = await Promise.all([
          fetchSnapshot(),
          listSpikes(100),
        ]);
        if (cancelled) return;
        setSnap(initial);
        setSpikes(spikeList);
        setReady(true);
        unlistenSnap = await onSnapshot((next) => {
          if (hiddenRef.current) return;
          setSnap(next);
        });
        unlistenSpike = await onSpikeLogged((ev) => {
          if (hiddenRef.current) return;
          setSpikes((prev) => [ev, ...prev].slice(0, 100));
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      unlistenSnap?.();
      unlistenSpike?.();
    };
  }, []);

  useEffect(() => {
    function syncPace() {
      const hidden = isHidden();
      hiddenRef.current = hidden;
      const idle = hidden || preferSlowRef.current;
      void setSamplerPace(idle ? "idle" : "active");
      if (!hidden) {
        void fetchSnapshot()
          .then(setSnap)
          .catch(() => {});
      }
    }
    syncPace();
    document.addEventListener("visibilitychange", syncPace);
    return () => {
      document.removeEventListener("visibilitychange", syncPace);
    };
  }, [preferSlow]);

  return { snap, spikes, setSpikes, ready, error };
}
