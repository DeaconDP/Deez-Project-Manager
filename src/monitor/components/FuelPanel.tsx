import { useState } from "react";
import {
  fuelClearCredential,
  fuelConnect,
  fuelSetCredential,
  fuelTest,
} from "../api/fuel";
import { buildFuelSourceView } from "../lib/fuelCaps";
import { FuelCapStack } from "./FuelCapStack";
import { Toggle } from "./Toggle";
import type {
  FuelSettings,
  FuelSourceKind,
  ProviderBillingSettings,
  RefreshResult,
  UsageSnapshot,
} from "../types/usage";

type Props = {
  settings: FuelSettings;
  onSettingsChange: (next: FuelSettings) => Promise<void>;
  result: RefreshResult | null;
  snapshot: UsageSnapshot | null;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  error: string | null;
};

type SourceDef = {
  kind: FuelSourceKind;
  title: string;
  providerKey: keyof Pick<
    FuelSettings,
    "cursor" | "openAi" | "claude" | "gemini" | "openRouter" | "openCode"
  >;
  enableKey:
    | "showCursorSource"
    | "showDirectSource"
    | "showProLimits"
    | "showApiConsoleBilling";
  overviewKey:
    | "showOnOverview"
    | "showDirectOnOverview"
    | "showProOnOverview"
    | "showApiOnOverview";
  detailsKey?: "showDetails" | "showProBreakdown";
  credential?: {
    provider: string;
    field: string;
    label: string;
    placeholder: string;
  };
  budget?: boolean;
  orgId?: boolean;
};

const SOURCES: SourceDef[] = [
  {
    kind: "cursor",
    title: "Cursor plan",
    providerKey: "cursor",
    enableKey: "showCursorSource",
    overviewKey: "showOnOverview",
    detailsKey: "showDetails",
  },
  {
    kind: "openai-via-cursor",
    title: "OpenAI via Cursor",
    providerKey: "openAi",
    enableKey: "showCursorSource",
    overviewKey: "showOnOverview",
  },
  {
    kind: "openai-codex",
    title: "Codex / ChatGPT limits",
    providerKey: "openAi",
    enableKey: "showProLimits",
    overviewKey: "showProOnOverview",
    detailsKey: "showProBreakdown",
  },
  {
    kind: "openai-direct",
    title: "OpenAI Platform API",
    providerKey: "openAi",
    enableKey: "showDirectSource",
    overviewKey: "showDirectOnOverview",
    credential: {
      provider: "openai",
      field: "credentialId",
      label: "API key",
      placeholder: "sk-…",
    },
    budget: true,
    orgId: true,
  },
  {
    kind: "claude-via-cursor",
    title: "Claude via Cursor",
    providerKey: "claude",
    enableKey: "showCursorSource",
    overviewKey: "showOnOverview",
  },
  {
    kind: "claude-pro",
    title: "Claude.ai plan limits",
    providerKey: "claude",
    enableKey: "showProLimits",
    overviewKey: "showProOnOverview",
    detailsKey: "showProBreakdown",
  },
  {
    kind: "claude-api",
    title: "Claude API console",
    providerKey: "claude",
    enableKey: "showApiConsoleBilling",
    overviewKey: "showApiOnOverview",
    credential: {
      provider: "claude",
      field: "credentialId",
      label: "Admin API key",
      placeholder: "sk-ant-admin…",
    },
    budget: true,
  },
  {
    kind: "gemini-via-cursor",
    title: "Gemini via Cursor",
    providerKey: "gemini",
    enableKey: "showCursorSource",
    overviewKey: "showOnOverview",
  },
  {
    kind: "antigravity",
    title: "Gemini App (Antigravity)",
    providerKey: "gemini",
    enableKey: "showProLimits",
    overviewKey: "showProOnOverview",
    detailsKey: "showProBreakdown",
  },
  {
    kind: "openrouter",
    title: "OpenRouter",
    providerKey: "openRouter",
    enableKey: "showProLimits",
    overviewKey: "showProOnOverview",
    credential: {
      provider: "openrouter",
      field: "credentialId",
      label: "API key",
      placeholder: "sk-or-…",
    },
  },
  {
    kind: "opencode-zen",
    title: "OpenCode Zen",
    providerKey: "openCode",
    enableKey: "showDirectSource",
    overviewKey: "showDirectOnOverview",
    credential: {
      provider: "opencode",
      field: "credentialId",
      label: "API key (optional)",
      placeholder: "opencode key",
    },
  },
  {
    kind: "opencode-go",
    title: "OpenCode Go",
    providerKey: "openCode",
    enableKey: "showProLimits",
    overviewKey: "showProOnOverview",
  },
];

function patchProvider(
  settings: FuelSettings,
  key: SourceDef["providerKey"],
  patch: Partial<ProviderBillingSettings>,
): FuelSettings {
  return { ...settings, [key]: { ...settings[key], ...patch } };
}

export function FuelPanel({
  settings,
  onSettingsChange,
  result,
  snapshot,
  refreshing,
  onRefresh,
  error,
}: Props) {
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [orgDrafts, setOrgDrafts] = useState<Record<string, string>>({});

  async function runAction(
    kind: string,
    fn: () => Promise<string>,
  ): Promise<void> {
    if (busyKind) return;
    setBusyKind(kind);
    setActionError(null);
    setActionFeedback(null);
    try {
      const msg = await fn();
      setActionFeedback(msg);
      await onRefresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKind(null);
    }
  }

  async function saveSecret(def: SourceDef) {
    if (!def.credential || busyKind) return;
    const secret = secretDrafts[def.kind] ?? "";
    if (!secret.trim()) {
      setActionError("Enter a secret before saving");
      return;
    }
    setBusyKind(`${def.kind}-cred`);
    setActionError(null);
    setActionFeedback(null);
    try {
      const p = settings[def.providerKey];
      const existing =
        def.credential.field === "credentialId" ? p.credentialId : null;
      const next = await fuelSetCredential({
        provider: def.credential.provider,
        existingId: existing,
        secret: secret.trim(),
        settings,
        field: def.credential.field,
      });
      await onSettingsChange(next);
      setSecretDrafts((d) => ({ ...d, [def.kind]: "" }));
      setActionFeedback("Credential saved");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKind(null);
    }
  }

  async function clearSecret(def: SourceDef) {
    if (!def.credential || busyKind) return;
    setBusyKind(`${def.kind}-clear`);
    setActionError(null);
    try {
      const next = await fuelClearCredential({
        provider: def.credential.provider,
        settings,
        field: def.credential.field,
      });
      await onSettingsChange(next);
      setActionFeedback("Credential cleared");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKind(null);
    }
  }

  return (
    <section className="panel fuel-panel" aria-labelledby="fuel-title">
      <header className="panel__head panel__head--row">
        <div>
          <h2 id="fuel-title">Fuel</h2>
          <p className="panel__desc">
            AI usage &amp; limits · DeezFuelGauge parity
            {result?.refreshedAt
              ? ` · ${new Date(result.refreshedAt).toLocaleTimeString()}`
              : null}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error ? (
        <p className="status status--error" role="alert">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p className="status status--error" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionFeedback ? (
        <p className="status status--ok" role="status">
          {actionFeedback}
        </p>
      ) : null}

      <div className="fuel-global">
        <Toggle
          id="fuel-breakdown"
          label="Show Cursor Auto / API breakdown"
          checked={settings.showBreakdown}
          onChange={(v) => void onSettingsChange({ ...settings, showBreakdown: v })}
        />
        <label className="fuel-interval">
          <span>Refresh (minutes)</span>
          <input
            type="number"
            min={1}
            max={120}
            value={settings.refreshIntervalMinutes}
            onChange={(e) => {
              const n = Math.max(1, Math.min(120, Number(e.target.value) || 5));
              void onSettingsChange({
                ...settings,
                refreshIntervalMinutes: n,
              });
            }}
          />
        </label>
      </div>

      <ul className="fuel-sources">
        {SOURCES.map((def) => {
          const p = settings[def.providerKey];
          const enabled = Boolean(p[def.enableKey]);
          const onOverview = Boolean(p[def.overviewKey]);
          const sourceView =
            enabled && snapshot
              ? buildFuelSourceView(def.kind, snapshot, settings)
              : null;
          const refreshStatus =
            def.kind === "cursor"
              ? result?.cursorError
              : result?.providerStatuses[
                  def.kind === "openai-direct"
                    ? "openai-platform"
                    : def.kind === "openai-codex"
                      ? "codex"
                      : def.kind === "antigravity"
                        ? "antigravity"
                        : def.kind === "openrouter"
                          ? "openrouter"
                          : def.kind.startsWith("opencode")
                            ? "opencode"
                            : ""
                ]?.errorMessage;
          const status = refreshStatus || sourceView?.status;
          const hasCred = Boolean(
            def.credential &&
              def.credential.field === "credentialId" &&
              p.credentialId,
          );

          return (
            <li key={def.kind} className="fuel-source">
              <div className="fuel-source__head">
                <h3>{def.title}</h3>
                {status && enabled ? (
                  <span className="fuel-source__status">{status}</span>
                ) : null}
              </div>

              <div className="fuel-source__toggles">
                <Toggle
                  id={`${def.kind}-enable`}
                  label="Track"
                  checked={enabled}
                  onChange={(v) =>
                    void onSettingsChange(
                      patchProvider(settings, def.providerKey, {
                        [def.enableKey]: v,
                      }),
                    )
                  }
                />
                <Toggle
                  id={`${def.kind}-overview`}
                  label="Show on Overview"
                  checked={onOverview}
                  disabled={!enabled}
                  onChange={(v) =>
                    void onSettingsChange(
                      patchProvider(settings, def.providerKey, {
                        [def.overviewKey]: v,
                      }),
                    )
                  }
                />
                {def.detailsKey ? (
                  <Toggle
                    id={`${def.kind}-details`}
                    label={
                      def.detailsKey === "showProBreakdown"
                        ? "Breakdown"
                        : "Details"
                    }
                    checked={Boolean(p[def.detailsKey])}
                    disabled={!enabled}
                    onChange={(v) =>
                      void onSettingsChange(
                        patchProvider(settings, def.providerKey, {
                          [def.detailsKey!]: v,
                        }),
                      )
                    }
                  />
                ) : null}
              </div>

              {sourceView ? <FuelCapStack view={sourceView} /> : null}

              {enabled ? (
                <div className="fuel-source__actions">
                  <button
                    type="button"
                    className="btn btn--quiet"
                    disabled={busyKind !== null}
                    aria-busy={busyKind === `${def.kind}-connect`}
                    onClick={() =>
                      void runAction(`${def.kind}-connect`, () =>
                        fuelConnect(def.kind),
                      )
                    }
                  >
                    {busyKind === `${def.kind}-connect` ? "Connecting…" : "Connect"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busyKind !== null}
                    aria-busy={busyKind === `${def.kind}-test`}
                    onClick={() =>
                      void runAction(`${def.kind}-test`, () => fuelTest(def.kind))
                    }
                  >
                    {busyKind === `${def.kind}-test` ? "Testing…" : "Test"}
                  </button>
                </div>
              ) : null}

              {enabled && def.credential ? (
                <div className="fuel-source__secret">
                  <label>
                    <span>
                      {def.credential.label}
                      {hasCred ? " · saved" : ""}
                    </span>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={def.credential.placeholder}
                      value={secretDrafts[def.kind] ?? ""}
                      onChange={(e) =>
                        setSecretDrafts((d) => ({
                          ...d,
                          [def.kind]: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="fuel-source__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busyKind !== null}
                      aria-busy={busyKind === `${def.kind}-cred`}
                      onClick={() => void saveSecret(def)}
                    >
                      {busyKind === `${def.kind}-cred` ? "Saving…" : "Save key"}
                    </button>
                    {hasCred ? (
                      <button
                        type="button"
                        className="btn btn--danger"
                        disabled={busyKind !== null}
                        onClick={() => void clearSecret(def)}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {enabled && def.budget ? (
                <label className="fuel-field">
                  <span>Monthly budget (USD)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder={String(p.monthlyBudgetUsd ?? "")}
                    value={
                      budgetDrafts[def.kind] ??
                      (p.monthlyBudgetUsd != null
                        ? String(p.monthlyBudgetUsd)
                        : "")
                    }
                    onChange={(e) =>
                      setBudgetDrafts((d) => ({
                        ...d,
                        [def.kind]: e.target.value,
                      }))
                    }
                    onBlur={() => {
                      const raw = budgetDrafts[def.kind];
                      if (raw === undefined) return;
                      const n = raw.trim() === "" ? null : Number(raw);
                      void onSettingsChange(
                        patchProvider(settings, def.providerKey, {
                          monthlyBudgetUsd:
                            n != null && Number.isFinite(n) ? n : null,
                        }),
                      );
                    }}
                  />
                </label>
              ) : null}

              {enabled && def.orgId ? (
                <label className="fuel-field">
                  <span>Organization ID</span>
                  <input
                    type="text"
                    value={
                      orgDrafts[def.kind] ?? p.organizationId ?? ""
                    }
                    onChange={(e) =>
                      setOrgDrafts((d) => ({
                        ...d,
                        [def.kind]: e.target.value,
                      }))
                    }
                    onBlur={() => {
                      const raw = orgDrafts[def.kind];
                      if (raw === undefined) return;
                      void onSettingsChange(
                        patchProvider(settings, def.providerKey, {
                          organizationId: raw.trim() || null,
                        }),
                      );
                    }}
                  />
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
