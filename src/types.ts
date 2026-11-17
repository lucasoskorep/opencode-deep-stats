export type StatsRangeKey = "7d" | "30d" | "90d" | "ytd" | "all";

export type HeatmapMetric = "steps" | "tokens" | "cost" | "github";

export type ChartMetric = "cost" | "tokens" | "steps";

export type DeepStatsQuery = {
  range: StatsRangeKey;
  projectID?: string;
  githubRepo?: string;
  timezone: string;
  includeVariants: boolean;
  refresh?: boolean;
};

export type TokenBreakdown = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

export type ActivityDay = {
  date: string; // YYYY-MM-DD in query timezone
  steps: number;
  prompts: number;
  subagentPrompts: number;
  sessions: number;
  subagents: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  prsOpened: number;
  prsMerged: number;
  approvals: number;
  reviews: number;
};

export type TimeSeriesBucket = {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  days: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
  cacheHitPct: number;
  steps: number;
  prompts: number;
};

export type ModelSeriesBucket = {
  key: string;
  label: string;
  totalCost: number;
  totalTokens: number;
  totalSteps: number;
  byModel: Record<
    string,
    {
      cost: number;
      tokens: number;
      steps: number;
    }
  >;
};

export type ModelUsageRow = {
  key: string;
  providerID: string;
  modelID: string;
  variant?: string;
  steps: number;
  tokens: TokenBreakdown;
  cost: number;
  costPer1M: number;
  cacheHitPct: number;
  avgStepMs?: number;
  ttftP50Ms?: number;
  ttftAvgMs?: number;
  tpsAvg?: number;
};

export type AgentUsageRow = {
  agent: string;
  steps: number;
  tokens: number;
  cost: number;
  sharePct: number;
  avgStepMs?: number;
};

export type ToolUsageRow = {
  name: string;
  isMcp: boolean;
  mcpServer?: string;
  calls: number;
  succeeded: number;
  failed: number;
  unfinished: number;
  errorPct: number;
  p50Ms?: number;
  p95Ms?: number;
  avgMs?: number;
};

export type ToolSeriesBucket = {
  key: string;
  label: string;
  totalCalls: number;
  succeeded: number;
  failed: number;
  unfinished: number;
  errorPct: number;
  byTool: Record<string, number>;
};

export type McpServerRow = {
  server: string;
  toolsCount: number;
  calls: number;
  succeeded: number;
  failed: number;
  unfinished: number;
  errorPct: number;
  sharePct: number;
  p50Ms?: number;
  p95Ms?: number;
  avgMs?: number;
};

export type McpSeriesBucket = {
  key: string;
  label: string;
  totalCalls: number;
  succeeded: number;
  failed: number;
  unfinished: number;
  errorPct: number;
  byServer: Record<string, number>;
};

export type HourlyBucket = {
  hour: number;
  prompts: number;
  steps: number;
  tokens: number;
  cost: number;
};

export type WeekdayBucket = {
  weekday: number; // 0 = Mon .. 6 = Sun
  label: string;
  prompts: number;
  steps: number;
  tokens: number;
  cost: number;
  prsOpened: number;
  approvals: number;
};

export type ProjectUsageRow = {
  id: string;
  name: string;
  worktree: string;
  sessions: number;
  subagents: number;
  prompts: number;
  steps: number;
  tokens: number;
  cost: number;
  additions: number;
  deletions: number;
};

export type TopSessionRow = {
  id: string;
  title: string;
  projectName: string;
  createdAt: number;
  durationMs: number;
  steps: number;
  subagents: number;
  tokens: number;
  cost: number;
  additions: number;
  deletions: number;
};

export type GitHubRepoRow = {
  repo: string;
  opened: number;
  merged: number;
  open: number;
  closed: number;
  approvals: number;
  changesRequested: number;
  comments: number;
  reviews: number;
  additions: number;
  deletions: number;
};

export type GitHubSeriesBucket = {
  key: string;
  label: string;
  opened: number;
  merged: number;
  approvals: number;
  changesRequested: number;
  comments: number;
  reviews: number;
};

export type GitHubPrSummary = {
  number: number;
  repo: string;
  title: string;
  state: string;
  createdAt: string;
  mergedAt?: string;
  additions: number;
  deletions: number;
};

export type GitHubReviewSummary = {
  number: number;
  repo: string;
  title: string;
  prState: string;
  reviewState: string;
  submittedAt: string;
};

export type GitHubStats = {
  status: "ok" | "loading" | "unavailable" | "error";
  message?: string;
  login?: string;
  repoFilter?: string;
  openedTotal: number;
  mergedTotal: number;
  openTotal: number;
  closedTotal: number;
  avgPrsPerDay: number;
  avgPrsPerWeekday: number;
  avgPrsPerActivePrDay: number;
  mergeRatePct: number;
  medianMergeHours?: number;
  additions: number;
  deletions: number;
  avgPrSize: number;
  approvalsTotal: number;
  changesRequestedTotal: number;
  commentsTotal: number;
  reviewsTotal: number;
  uniquePrsApproved: number;
  uniquePrsReviewed: number;
  avgApprovalsPerDay: number;
  avgApprovalsPerWeekday: number;
  avgReviewsPerDay: number;
  approvalRatePct: number;
  series: GitHubSeriesBucket[];
  repos: GitHubRepoRow[];
  recentOpened: GitHubPrSummary[];
  recentReviewed: GitHubReviewSummary[];
  efficiency: {
    costPerPr?: number;
    tokensPerPr?: number;
    promptsPerPr?: number;
    sessionsPerPr?: number;
  };
};

export type DeepStatsPayload = {
  meta: {
    range: StatsRangeKey;
    from: number;
    to: number;
    daysCount: number;
    weekdaysCount: number;
    timezone: string;
    projectID?: string;
    projectLabel: string;
    generatedAt: number;
    bucketGranularity: "day" | "week";
    historyStatus: "complete" | "partial";
    cachedHours: number;
    totalHours: number;
    dbAvailable: boolean;
    dbError?: string;
  };
  summary: {
    sessions: number;
    subagents: number;
    prompts: number;
    subagentPrompts: number;
    steps: number;
    activeDays: number;
    currentStreak: number;
    bestStreak: number;
    cost: number;
    costPerDay: number;
    costPerActiveDay: number;
    tokens: TokenBreakdown;
    tokensPerDay: number;
    tokensPerActiveDay: number;
    cacheHitPct: number;
    codeDiff: {
      additions: number;
      deletions: number;
      files: number;
    };
    tools: {
      calls: number;
      succeeded: number;
      failed: number;
      unfinished: number;
    };
  };
  activity: ActivityDay[];
  tokenSeries: TimeSeriesBucket[];
  modelSeries: {
    topModels: string[];
    buckets: ModelSeriesBucket[];
  };
  models: ModelUsageRow[];
  toolSeries: {
    topTools: string[];
    buckets: ToolSeriesBucket[];
  };
  mcp: {
    totalCalls: number;
    succeeded: number;
    failed: number;
    unfinished: number;
    errorPct: number;
    shareOfAllToolsPct: number;
    servers: McpServerRow[];
    topServers: string[];
    buckets: McpSeriesBucket[];
  };
  agents: AgentUsageRow[];
  tools: ToolUsageRow[];
  hourly: HourlyBucket[];
  weekday: WeekdayBucket[];
  projects: ProjectUsageRow[];
  topSessions: TopSessionRow[];
  outcomes: {
    finishes: Record<string, number>;
    sessionOutcomes: Record<string, number>;
    parentsWithSubagents: number;
    avgSubagentsPerParent: number;
    avgStepsPerPrompt: number;
    avgSessionDurationMs: number;
  };
  github: GitHubStats;
};
