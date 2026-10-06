/** Local dirty/branch re-probe while the window stays visible. */
export const GIT_LOCAL_PROBE_MS = 60_000;

/** Full refresh (local probe + background fetch wave) while visible. */
export const GIT_FULL_PROBE_MS = 10 * 60_000;

export type GitProbeMode = "local" | "full";

export type GitProbeClock = {
  lastLocalAt: number | null;
  lastFullAt: number | null;
};

export const EMPTY_GIT_PROBE_CLOCK: GitProbeClock = {
  lastLocalAt: null,
  lastFullAt: null,
};

/**
 * Which silent refresh is due, if any.
 * Full wins when both intervals have elapsed.
 * A null timestamp means that probe has never succeeded.
 */
export function dueGitProbe(
  now: number,
  clock: GitProbeClock,
  opts?: { localMs?: number; fullMs?: number },
): GitProbeMode | null {
  const localMs = opts?.localMs ?? GIT_LOCAL_PROBE_MS;
  const fullMs = opts?.fullMs ?? GIT_FULL_PROBE_MS;
  if (clock.lastFullAt == null || now - clock.lastFullAt >= fullMs) {
    return "full";
  }
  if (clock.lastLocalAt == null || now - clock.lastLocalAt >= localMs) {
    return "local";
  }
  return null;
}

/** Advance the clock after a successful probe. Full also resets local. */
export function markGitProbe(
  clock: GitProbeClock,
  mode: GitProbeMode,
  at: number,
): GitProbeClock {
  if (mode === "full") {
    return { lastLocalAt: at, lastFullAt: at };
  }
  return { ...clock, lastLocalAt: at };
}
