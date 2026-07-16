export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "N/A";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatBps(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "N/A";
  return `${formatBytes(n)}/s`;
}

export type LoadTier = "low" | "mid" | "high" | "over";

/** Color tier for a usage percentage: low → blue, mid → green, high → yellow, >100% → orange. */
export function loadTier(value: number | null | undefined): LoadTier | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value > 100) return "over";
  if (value >= 67) return "high";
  if (value >= 34) return "mid";
  return "low";
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return `${n.toFixed(0)}%`;
}

export function formatTemp(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return `${n.toFixed(0)}°C`;
}
