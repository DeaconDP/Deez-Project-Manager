import { useCallback, useEffect, useState } from "react";

export type UiLayout = "desktop" | "narrow" | "phone";

export const UI_ZOOM_STEPS = [
  25, 35, 50, 65, 75, 85, 100, 110, 125, 150,
] as const;
export type UiZoomPercent = (typeof UI_ZOOM_STEPS)[number];

const STORAGE_KEY = "deez-ui-zoom";
const DEFAULT_ZOOM: UiZoomPercent = 100;
const NARROW_MAX = 1180;
const PHONE_MAX = 700;

function isZoomStep(value: number): value is UiZoomPercent {
  return (UI_ZOOM_STEPS as readonly number[]).includes(value);
}

function readStoredZoom(): UiZoomPercent {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_ZOOM;
    const n = Number(raw);
    if (isZoomStep(n)) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_ZOOM;
}

function applyHtmlZoom(zoom: UiZoomPercent) {
  document.documentElement.style.zoom = String(zoom / 100);
}

function layoutFromViewport(zoom: UiZoomPercent): UiLayout {
  const effective = window.innerWidth / (zoom / 100);
  if (effective <= PHONE_MAX) return "phone";
  if (effective <= NARROW_MAX) return "narrow";
  return "desktop";
}

function nearestStep(current: UiZoomPercent, direction: 1 | -1): UiZoomPercent {
  const idx = UI_ZOOM_STEPS.indexOf(current);
  const next = idx + direction;
  if (next < 0) return UI_ZOOM_STEPS[0];
  if (next >= UI_ZOOM_STEPS.length) return UI_ZOOM_STEPS[UI_ZOOM_STEPS.length - 1];
  return UI_ZOOM_STEPS[next];
}

export function useUiZoom() {
  const [zoom, setZoomState] = useState<UiZoomPercent>(() =>
    typeof window !== "undefined" ? readStoredZoom() : DEFAULT_ZOOM,
  );
  const [layout, setLayout] = useState<UiLayout>(() =>
    typeof window !== "undefined"
      ? layoutFromViewport(readStoredZoom())
      : "desktop",
  );

  const setZoom = useCallback((next: UiZoomPercent) => {
    setZoomState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
    applyHtmlZoom(next);
    setLayout(layoutFromViewport(next));
  }, []);

  useEffect(() => {
    applyHtmlZoom(zoom);
    setLayout(layoutFromViewport(zoom));

    const onResize = () => setLayout(layoutFromViewport(zoom));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [zoom]);

  const zoomIn = useCallback(() => {
    setZoom(nearestStep(zoom, 1));
  }, [setZoom, zoom]);

  const zoomOut = useCallback(() => {
    setZoom(nearestStep(zoom, -1));
  }, [setZoom, zoom]);

  const reset = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, [setZoom]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoomState((z) => {
          const next = nearestStep(z, 1);
          try {
            localStorage.setItem(STORAGE_KEY, String(next));
          } catch {
            /* ignore */
          }
          applyHtmlZoom(next);
          setLayout(layoutFromViewport(next));
          return next;
        });
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoomState((z) => {
          const next = nearestStep(z, -1);
          try {
            localStorage.setItem(STORAGE_KEY, String(next));
          } catch {
            /* ignore */
          }
          applyHtmlZoom(next);
          setLayout(layoutFromViewport(next));
          return next;
        });
      } else if (e.key === "0") {
        e.preventDefault();
        setZoomState(() => {
          try {
            localStorage.setItem(STORAGE_KEY, String(DEFAULT_ZOOM));
          } catch {
            /* ignore */
          }
          applyHtmlZoom(DEFAULT_ZOOM);
          setLayout(layoutFromViewport(DEFAULT_ZOOM));
          return DEFAULT_ZOOM;
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const canZoomIn = zoom < UI_ZOOM_STEPS[UI_ZOOM_STEPS.length - 1];
  const canZoomOut = zoom > UI_ZOOM_STEPS[0];

  return {
    zoom,
    layout,
    zoomIn,
    zoomOut,
    reset,
    canZoomIn,
    canZoomOut,
  };
}
