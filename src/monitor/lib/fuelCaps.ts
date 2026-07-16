import type {
  FuelAccent,
  FuelCap,
  FuelSettings,
  FuelSourceKind,
  FuelSourceView,
  UsageSnapshot,
} from "../types/usage";

function formatReset(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `Resets ${d.toLocaleString()}`;
}

function view(
  id: string,
  title: string,
  accent: FuelAccent,
  caps: FuelCap[],
  status?: string | null,
): FuelSourceView {
  return { id, title, accent, caps, status: status ?? null };
}

function single(
  id: string,
  title: string,
  accent: FuelAccent,
  percentUsed: number | null,
  sub: string,
  status?: string | null,
): FuelSourceView {
  return view(id, title, accent, [{ id: `${id}.main`, label: title, percentUsed, sub }], status);
}

/** Build stacked caps for one Fuel source kind. */
export function buildFuelSourceView(
  kind: FuelSourceKind,
  snap: UsageSnapshot,
  settings: FuelSettings,
): FuelSourceView {
  switch (kind) {
    case "cursor": {
      const caps: FuelCap[] = [
        {
          id: "cursor.plan",
          label: "Plan",
          percentUsed: snap.isError ? null : snap.percentUsed,
          sub: snap.isError
            ? (snap.errorMessage ?? "Unavailable")
            : snap.remainingLabel || "Plan usage",
        },
      ];
      if (
        settings.showBreakdown &&
        !snap.isError &&
        (snap.autoPercentUsed != null || snap.apiPercentUsed != null)
      ) {
        if (snap.autoPercentUsed != null) {
          caps.push({
            id: "cursor.auto",
            label: "Auto",
            percentUsed: snap.autoPercentUsed,
          });
        }
        if (snap.apiPercentUsed != null) {
          caps.push({
            id: "cursor.api",
            label: "API",
            percentUsed: snap.apiPercentUsed,
          });
        }
      }
      return view(
        "cursor",
        "Cursor plan",
        "lime",
        caps,
        snap.isError ? snap.errorMessage : null,
      );
    }

    case "openai-via-cursor":
      return single(
        "openai-via-cursor",
        "OpenAI (Cursor)",
        "cyan",
        snap.openAi.isAvailable ? snap.openAi.percentUsed : null,
        snap.openAi.detailLabel,
        snap.openAi.statusMessage,
      );

    case "openai-codex": {
      // Always stack 5h + Weekly when connected (ChatGPT/Codex dual windows).
      const caps: FuelCap[] = snap.codex.isAvailable
        ? [
            {
              id: "codex.5h",
              label: "5h",
              percentUsed: snap.codex.hasSessionWindow
                ? snap.codex.sessionPercentUsed
                : null,
              sub: formatReset(snap.codex.sessionResetsAt),
            },
            {
              id: "codex.weekly",
              label: "Weekly",
              percentUsed: snap.codex.hasWeeklyWindow
                ? snap.codex.weeklyPercentUsed
                : null,
              sub: formatReset(snap.codex.weeklyResetsAt),
            },
          ]
        : [
            {
              id: "codex.main",
              label: "Codex",
              percentUsed: null,
              sub: snap.codex.detailLabel,
            },
          ];
      const statusParts = [
        snap.codex.planLabel,
        snap.codex.creditsBalanceUsd != null
          ? `$${snap.codex.creditsBalanceUsd.toFixed(0)} credits`
          : null,
        snap.codex.statusMessage,
      ].filter(Boolean);
      return view(
        "openai-codex",
        "Codex / ChatGPT",
        "cyan",
        caps,
        statusParts.length ? statusParts.join(" · ") : null,
      );
    }

    case "openai-direct":
      return single(
        "openai-direct",
        "OpenAI API",
        "cyan",
        snap.openAiDirect.isAvailable ? snap.openAiDirect.percentUsed : null,
        snap.openAiDirect.detailLabel,
        snap.openAiDirect.statusMessage,
      );

    case "claude-via-cursor":
      return single(
        "claude-via-cursor",
        "Claude (Cursor)",
        "amber",
        snap.claude.isAvailable ? snap.claude.percentUsed : null,
        snap.claude.detailLabel,
        snap.claude.statusMessage,
      );

    case "claude-pro": {
      const caps: FuelCap[] = [];
      if (snap.claudePro.isAvailable) {
        caps.push({
          id: "claude-pro.5h",
          label: "5h",
          percentUsed: snap.claudePro.sessionPercentUsed,
          sub: formatReset(snap.claudePro.sessionResetsAt),
        });
        caps.push({
          id: "claude-pro.weekly",
          label: "Weekly",
          percentUsed: snap.claudePro.weeklyPercentUsed,
          sub: formatReset(snap.claudePro.weeklyResetsAt),
        });
      } else {
        caps.push({
          id: "claude-pro.main",
          label: "Claude Pro",
          percentUsed: null,
          sub: snap.claudePro.detailLabel,
        });
      }
      return view(
        "claude-pro",
        "Claude.ai plan",
        "amber",
        caps,
        snap.claudePro.statusMessage,
      );
    }

    case "claude-api":
      return single(
        "claude-api",
        "Claude API",
        "amber",
        snap.claudeDirect.isAvailable ? snap.claudeDirect.percentUsed : null,
        snap.claudeDirect.detailLabel,
        snap.claudeDirect.statusMessage,
      );

    case "gemini-via-cursor":
      return single(
        "gemini-via-cursor",
        "Gemini (Cursor)",
        "rose",
        snap.gemini.isAvailable ? snap.gemini.percentUsed : null,
        snap.gemini.detailLabel,
        snap.gemini.statusMessage,
      );

    case "antigravity": {
      const caps: FuelCap[] = [];
      if (snap.antigravity.gemini.isAvailable) {
        caps.push({
          id: "antigravity.gemini.5h",
          label: "Gemini 5h",
          percentUsed: snap.antigravity.gemini.sessionPercentUsed,
          sub: formatReset(snap.antigravity.gemini.sessionResetsAt),
        });
        caps.push({
          id: "antigravity.gemini.weekly",
          label: "Gemini Weekly",
          percentUsed: snap.antigravity.gemini.weeklyPercentUsed,
          sub: formatReset(snap.antigravity.gemini.weeklyResetsAt),
        });
      }
      if (snap.antigravity.thirdParty.isAvailable) {
        caps.push({
          id: "antigravity.3p.5h",
          label: "3P 5h",
          percentUsed: snap.antigravity.thirdParty.sessionPercentUsed,
          sub: formatReset(snap.antigravity.thirdParty.sessionResetsAt),
        });
        caps.push({
          id: "antigravity.3p.weekly",
          label: "3P Weekly",
          percentUsed: snap.antigravity.thirdParty.weeklyPercentUsed,
          sub: formatReset(snap.antigravity.thirdParty.weeklyResetsAt),
        });
      }
      if (caps.length === 0) {
        caps.push({
          id: "antigravity.main",
          label: "Gemini App",
          percentUsed: null,
          sub: snap.antigravity.detailLabel,
        });
      }
      return view(
        "antigravity",
        "Gemini App",
        "rose",
        caps,
        snap.antigravity.planLabel ?? snap.antigravity.statusMessage,
      );
    }

    case "openrouter":
      return single(
        "openrouter",
        "OpenRouter",
        "lime",
        snap.openRouter.isAvailable ? snap.openRouter.headlinePercentUsed : null,
        snap.openRouter.detailLabel,
        snap.openRouter.statusMessage,
      );

    case "opencode-zen":
      return single(
        "opencode-zen",
        "OpenCode Zen",
        "cyan",
        snap.openCode.zenIsAvailable
          ? (snap.openCode.zenMonthlyPercentUsed ?? 0)
          : null,
        snap.openCode.detailLabel,
        snap.openCode.statusMessage,
      );

    case "opencode-go": {
      const caps: FuelCap[] = [];
      if (snap.openCode.goRolling.isAvailable) {
        caps.push({
          id: "opencode-go.5h",
          label: "5h",
          percentUsed: snap.openCode.goRolling.percentUsed,
          sub: formatReset(snap.openCode.goRolling.resetsAt),
        });
      }
      if (snap.openCode.goWeekly.isAvailable) {
        caps.push({
          id: "opencode-go.weekly",
          label: "Weekly",
          percentUsed: snap.openCode.goWeekly.percentUsed,
          sub: formatReset(snap.openCode.goWeekly.resetsAt),
        });
      }
      if (snap.openCode.goMonthly.isAvailable) {
        caps.push({
          id: "opencode-go.monthly",
          label: "Monthly",
          percentUsed: snap.openCode.goMonthly.percentUsed,
          sub: formatReset(snap.openCode.goMonthly.resetsAt),
        });
      }
      if (caps.length === 0) {
        caps.push({
          id: "opencode-go.main",
          label: "OpenCode Go",
          percentUsed: null,
          sub: snap.openCode.detailLabel,
        });
      }
      return view(
        "opencode-go",
        "OpenCode Go",
        "cyan",
        caps,
        snap.openCode.statusMessage,
      );
    }
  }
}

const OVERVIEW_KINDS: {
  kind: FuelSourceKind;
  enabled: (s: FuelSettings) => boolean;
  onOverview: (s: FuelSettings) => boolean;
}[] = [
  {
    kind: "cursor",
    enabled: (s) => s.cursor.showCursorSource,
    onOverview: (s) => s.cursor.showOnOverview,
  },
  {
    kind: "openai-via-cursor",
    enabled: (s) => s.openAi.showCursorSource,
    onOverview: (s) => s.openAi.showOnOverview,
  },
  {
    kind: "openai-codex",
    enabled: (s) => s.openAi.showProLimits,
    onOverview: (s) => s.openAi.showProOnOverview,
  },
  {
    kind: "openai-direct",
    enabled: (s) => s.openAi.showDirectSource,
    onOverview: (s) => s.openAi.showDirectOnOverview,
  },
  {
    kind: "claude-via-cursor",
    enabled: (s) => s.claude.showCursorSource,
    onOverview: (s) => s.claude.showOnOverview,
  },
  {
    kind: "claude-pro",
    enabled: (s) => s.claude.showProLimits,
    onOverview: (s) => s.claude.showProOnOverview,
  },
  {
    kind: "claude-api",
    enabled: (s) => s.claude.showApiConsoleBilling,
    onOverview: (s) => s.claude.showApiOnOverview,
  },
  {
    kind: "gemini-via-cursor",
    enabled: (s) => s.gemini.showCursorSource,
    onOverview: (s) => s.gemini.showOnOverview,
  },
  {
    kind: "antigravity",
    enabled: (s) => s.gemini.showProLimits,
    onOverview: (s) => s.gemini.showProOnOverview,
  },
  {
    kind: "openrouter",
    enabled: (s) => s.openRouter.showProLimits,
    onOverview: (s) => s.openRouter.showProOnOverview,
  },
  {
    kind: "opencode-zen",
    enabled: (s) => s.openCode.showDirectSource,
    onOverview: (s) => s.openCode.showDirectOnOverview,
  },
  {
    kind: "opencode-go",
    enabled: (s) => s.openCode.showProLimits,
    onOverview: (s) => s.openCode.showProOnOverview,
  },
];

/** Overview Fuel section: sources with Show on Overview. */
export function buildFuelOverviewSources(
  settings: FuelSettings,
  snap: UsageSnapshot | null,
): FuelSourceView[] {
  if (!snap) return [];
  return OVERVIEW_KINDS.filter(
    (row) => row.enabled(settings) && row.onOverview(settings),
  ).map((row) => buildFuelSourceView(row.kind, snap, settings));
}

export type FuelGlanceItem = {
  id: string;
  label: string;
  value: number;
};

const GLANCE_LABELS: Partial<Record<FuelSourceKind, string>> = {
  cursor: "Cursor",
  "openai-via-cursor": "OpenAI",
  "openai-codex": "Codex",
  "openai-direct": "OpenAI API",
  "claude-via-cursor": "Claude",
  "claude-pro": "Claude",
  "claude-api": "Claude API",
  "gemini-via-cursor": "Gemini",
  antigravity: "Gemini",
  openrouter: "OpenRouter",
  "opencode-zen": "Zen",
  "opencode-go": "Go",
};

function headlinePct(caps: FuelCap[]): number | null {
  let max: number | null = null;
  for (const cap of caps) {
    const v = cap.percentUsed;
    if (v == null || !Number.isFinite(v)) continue;
    max = max == null ? v : Math.max(max, v);
  }
  return max;
}

function hasWorkingFuelData(view: FuelSourceView): boolean {
  return view.caps.some(
    (c) => c.percentUsed != null && Number.isFinite(c.percentUsed),
  );
}

/** Chrome glance: overview sources with at least one live cap. */
export function buildFuelGlanceItems(
  settings: FuelSettings,
  snap: UsageSnapshot | null,
): FuelGlanceItem[] {
  return buildFuelOverviewSources(settings, snap)
    .filter(hasWorkingFuelData)
    .map((view) => {
      const value = headlinePct(view.caps);
      if (value == null) return null;
      return {
        id: view.id,
        label: GLANCE_LABELS[view.id as FuelSourceKind] ?? view.title,
        value,
      };
    })
    .filter((item): item is FuelGlanceItem => item != null);
}
