export type ProviderBillingSettings = {
  showCursorSource: boolean;
  showDirectSource: boolean;
  showProLimits: boolean;
  showProBreakdown: boolean;
  showApiConsoleBilling: boolean;
  showDetails: boolean;
  showDirectDetails?: boolean | null;
  showProDetails?: boolean | null;
  showOnOverview: boolean;
  showDirectOnOverview: boolean;
  showProOnOverview: boolean;
  showApiOnOverview: boolean;
  monthlyBudgetUsd?: number | null;
  organizationId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  credentialId?: string | null;
  managementCredentialId?: string | null;
  proSessionCredentialId?: string | null;
  proOAuthCredentialId?: string | null;
  proLastConnectionStatus?: string | null;
  lastConnectionStatus?: string | null;
};

export type FuelSettings = {
  cursor: ProviderBillingSettings;
  openAi: ProviderBillingSettings;
  claude: ProviderBillingSettings;
  gemini: ProviderBillingSettings;
  openRouter: ProviderBillingSettings;
  openCode: ProviderBillingSettings;
  showBreakdown: boolean;
  refreshIntervalMinutes: number;
};

export type ProviderUsageSnapshot = {
  percentUsed: number;
  detailLabel: string;
  statusMessage?: string | null;
  isAvailable: boolean;
};

export type DirectProviderSnapshot = {
  spendUsd: number;
  budgetUsd?: number | null;
  remainingUsd?: number | null;
  grantedUsd?: number | null;
  percentUsed: number;
  inputTokens: number;
  outputTokens: number;
  isAvailable: boolean;
  statusMessage?: string | null;
  detailLabel: string;
};

export type CodexSnapshot = {
  sessionPercentRemaining: number;
  weeklyPercentRemaining: number;
  sessionPercentUsed: number;
  weeklyPercentUsed: number;
  hasSessionWindow: boolean;
  hasWeeklyWindow: boolean;
  sessionResetsAt?: string | null;
  weeklyResetsAt?: string | null;
  planLabel?: string | null;
  creditsBalanceUsd?: number | null;
  limitReached: boolean;
  isAvailable: boolean;
  statusMessage?: string | null;
  detailLabel: string;
};

export type ClaudeProSnapshot = {
  sessionPercentUsed: number;
  weeklyPercentUsed: number;
  sessionResetsAt?: string | null;
  weeklyResetsAt?: string | null;
  isAvailable: boolean;
  statusMessage?: string | null;
  detailLabel: string;
};

export type AntigravityGroupSnapshot = {
  sessionPercentRemaining: number;
  weeklyPercentRemaining: number;
  sessionPercentUsed: number;
  weeklyPercentUsed: number;
  sessionResetsAt?: string | null;
  weeklyResetsAt?: string | null;
  isAvailable: boolean;
  statusMessage?: string | null;
  detailLabel: string;
};

export type AntigravitySnapshot = {
  gemini: AntigravityGroupSnapshot;
  thirdParty: AntigravityGroupSnapshot;
  planLabel?: string | null;
  isAvailable: boolean;
  statusMessage?: string | null;
  detailLabel: string;
};

export type OpenRouterSnapshot = {
  balanceUsd?: number | null;
  keyLimitUsd?: number | null;
  keyLimitRemainingUsd?: number | null;
  keyLimitPercentUsed?: number | null;
  keyLimitReset?: string | null;
  isFreeTier: boolean;
  allTimeUsageUsd: number;
  dailySpendUsd: number;
  weeklySpendUsd: number;
  monthlySpendUsd: number;
  byokDailySpendUsd?: number | null;
  includeByokInLimit: boolean;
  headlinePercentUsed: number;
  isAvailable: boolean;
  statusMessage?: string | null;
  detailLabel: string;
};

export type OpenCodeWindowSnapshot = {
  percentUsed: number;
  resetsAt?: string | null;
  isAvailable: boolean;
};

export type OpenCodeSnapshot = {
  zenBalanceUsd?: number | null;
  zenMonthlyCapUsd?: number | null;
  zenMonthlyUsedUsd?: number | null;
  zenMonthlyPercentUsed?: number | null;
  goRolling: OpenCodeWindowSnapshot;
  goWeekly: OpenCodeWindowSnapshot;
  goMonthly: OpenCodeWindowSnapshot;
  hasGoSubscription: boolean;
  zenIsAvailable: boolean;
  isAvailable: boolean;
  statusMessage?: string | null;
  detailLabel: string;
};

export type UsageSnapshot = {
  percentUsed: number;
  remainingLabel: string;
  autoPercentUsed?: number | null;
  apiPercentUsed?: number | null;
  hasBreakdown: boolean;
  planLimitCents?: number | null;
  billingCycleStartMs?: number | null;
  billingCycleEndMs?: number | null;
  openAi: ProviderUsageSnapshot;
  claude: ProviderUsageSnapshot;
  gemini: ProviderUsageSnapshot;
  codex: CodexSnapshot;
  claudePro: ClaudeProSnapshot;
  openAiDirect: DirectProviderSnapshot;
  claudeDirect: DirectProviderSnapshot;
  antigravity: AntigravitySnapshot;
  openRouter: OpenRouterSnapshot;
  openCode: OpenCodeSnapshot;
  hasProviderBreakdown: boolean;
  isError: boolean;
  errorMessage?: string | null;
};

export type ProviderRefreshStatus = {
  succeeded: boolean;
  errorMessage?: string | null;
  isDegraded: boolean;
};

export type RefreshResult = {
  snapshot: UsageSnapshot;
  refreshedAt: string;
  cursorFetchSucceeded: boolean;
  cursorError?: string | null;
  providerStatuses: Record<string, ProviderRefreshStatus>;
};

export type FuelAccent = "cyan" | "lime" | "amber" | "rose";

/** One progress bar within a source (plan, 5h, weekly, Auto, …). */
export type FuelCap = {
  id: string;
  label: string;
  percentUsed: number | null;
  sub?: string;
};

/** Source title + ordered caps — UI stacks without knowing window semantics. */
export type FuelSourceView = {
  id: string;
  title: string;
  accent: FuelAccent;
  status?: string | null;
  caps: FuelCap[];
};

export type FuelSourceKind =
  | "cursor"
  | "openai-via-cursor"
  | "openai-codex"
  | "openai-direct"
  | "claude-via-cursor"
  | "claude-pro"
  | "claude-api"
  | "gemini-via-cursor"
  | "antigravity"
  | "openrouter"
  | "opencode-zen"
  | "opencode-go";

export function defaultProviderSettings(
  overrides: Partial<ProviderBillingSettings> = {},
): ProviderBillingSettings {
  return {
    showCursorSource: true,
    showDirectSource: false,
    showProLimits: true,
    showProBreakdown: true,
    showApiConsoleBilling: false,
    showDetails: true,
    showDirectDetails: null,
    showProDetails: null,
    showOnOverview: false,
    showDirectOnOverview: false,
    showProOnOverview: false,
    showApiOnOverview: false,
    monthlyBudgetUsd: null,
    organizationId: null,
    projectId: null,
    workspaceId: null,
    credentialId: null,
    managementCredentialId: null,
    proSessionCredentialId: null,
    proOAuthCredentialId: null,
    proLastConnectionStatus: null,
    lastConnectionStatus: null,
    ...overrides,
  };
}

export function defaultFuelSettings(): FuelSettings {
  return {
    cursor: defaultProviderSettings({ showOnOverview: true }),
    openAi: defaultProviderSettings(),
    claude: defaultProviderSettings(),
    gemini: defaultProviderSettings(),
    openRouter: defaultProviderSettings(),
    openCode: defaultProviderSettings(),
    showBreakdown: true,
    refreshIntervalMinutes: 5,
  };
}
