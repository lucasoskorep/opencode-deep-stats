/** @jsxImportSource @opentui/solid */
import { RGBA } from "@opentui/core";
import { testRender } from "@opentui/solid";
import type { ResolvedTheme } from "@opencode/theme/tui";
import { describe, expect, it } from "bun:test";
import type { DeepStatsPayload } from "../src/types.ts";
import { DeepStatsScreen, type ViewTab } from "../src/ui/DeepStatsScreen.tsx";

function createMockTheme(): ResolvedTheme {
  const c = (hex: string) => RGBA.fromHex(hex);
  const scale = (hex: string) => ({
    100: c(hex),
    200: c(hex),
    300: c(hex),
    400: c(hex),
    500: c(hex),
    600: c(hex),
    700: c(hex),
    800: c(hex),
    900: c(hex),
  });
  const stateful = (hex: string) => ({
    base: c(hex),
    hovered: c(hex),
    focused: c(hex),
    pressed: c(hex),
    selected: c(hex),
    disabled: c(hex),
    state: () => c(hex),
  });
  const base: any = {
    hue: {
      interactive: scale("#66d9ef"),
      accent: scale("#f92672"),
      neutral: scale("#75715e"),
    },
    categorical: [
      scale("#a6e22e"),
      scale("#66d9ef"),
      scale("#fd971f"),
      scale("#ae81ff"),
      scale("#f92672"),
      scale("#e6db74"),
    ],
    source: () => undefined,
    increase: (col: RGBA) => col,
    decrease: (col: RGBA) => col,
    text: {
      base: c("#f8f8f2"),
      muted: c("#75715e"),
      action: { primary: stateful("#a6e22e"), secondary: stateful("#66d9ef"), destructive: stateful("#f92672") },
      formfield: stateful("#f8f8f2"),
      feedback: {
        error: { base: c("#f92672"), muted: c("#f92672") },
        warning: { base: c("#fd971f"), muted: c("#fd971f") },
        success: { base: c("#a6e22e"), muted: c("#a6e22e") },
        info: { base: c("#66d9ef"), muted: c("#66d9ef") },
      },
    },
    background: {
      base: c("#272822"),
      raised: {
        base: c("#2e2f28"),
        high: c("#3e3d32"),
        max: c("#49483e"),
      },
      action: { primary: stateful("#3e3d32"), secondary: stateful("#2e2f28"), destructive: stateful("#f92672") },
      formfield: stateful("#2e2f28"),
      feedback: {
        error: { base: c("#f92672") },
        warning: { base: c("#fd971f") },
        success: { base: c("#a6e22e") },
        info: { base: c("#66d9ef") },
      },
    },
    border: { base: c("#49483e") },
    scrollbar: { base: c("#75715e") },
  };
  base.surface = () => base;
  return base as ResolvedTheme;
}

function createMockStats(): DeepStatsPayload {
  const days = ["2026-11-15", "2026-11-16", "2026-11-17"];
  return {
    meta: {
      range: "30d",
      from: Date.parse("2026-11-15T00:00:00Z"),
      to: Date.parse("2026-11-17T23:59:59Z"),
      daysCount: 30,
      weekdaysCount: 22,
      timezone: "UTC",
      projectLabel: "all projects",
      generatedAt: Date.now(),
      bucketGranularity: "day",
      historyStatus: "complete",
      cachedHours: 720,
      totalHours: 720,
      dbAvailable: true,
    },
    summary: {
      sessions: 42,
      subagents: 118,
      prompts: 290,
      subagentPrompts: 118,
      steps: 2_140,
      activeDays: 24,
      currentStreak: 5,
      bestStreak: 9,
      cost: 194.52,
      costPerDay: 6.48,
      costPerActiveDay: 8.11,
      tokens: {
        input: 64_000_000,
        output: 1_800_000,
        reasoning: 2_400_000,
        cacheRead: 810_000_000,
        cacheWrite: 12_000_000,
        total: 890_200_000,
      },
      tokensPerDay: 29_673_333,
      tokensPerActiveDay: 37_091_666,
      cacheHitPct: 91.4,
      codeDiff: { additions: 3_420, deletions: 890, files: 112 },
      tools: { calls: 9_800, succeeded: 9_680, failed: 115, unfinished: 5 },
    },
    activity: days.map((date, idx) => ({
      date,
      steps: 400 + idx * 150,
      prompts: 30 + idx * 10,
      subagentPrompts: 15,
      sessions: 5 + idx,
      subagents: 12,
      tokens: 150_000_000 + idx * 30_000_000,
      inputTokens: 12_000_000,
      outputTokens: 350_000,
      reasoningTokens: 450_000,
      cacheReadTokens: 135_000_000,
      cacheWriteTokens: 2_200_000,
      cost: 32 + idx * 12,
      prsOpened: 1 + idx,
      prsMerged: idx,
      approvals: 3 + idx,
      reviews: 4 + idx,
    })),
    tokenSeries: days.map((date, idx) => ({
      key: date,
      label: date.slice(5),
      startDate: date,
      endDate: date,
      days: 1,
      input: 12_000_000,
      output: 350_000,
      reasoning: 450_000,
      cacheRead: 135_000_000,
      cacheWrite: 2_200_000,
      total: 150_000_000 + idx * 30_000_000,
      cost: 32 + idx * 12,
      cacheHitPct: 90.5,
      steps: 400 + idx * 150,
      prompts: 30 + idx * 10,
    })),
    modelSeries: {
      topModels: ["google/gemini-4-hydrogen", "google/gemini-3.8-flash"],
      buckets: days.map((date, idx) => ({
        key: date,
        label: date.slice(5),
        totalCost: 32 + idx * 12,
        totalTokens: 150_000_000 + idx * 30_000_000,
        totalSteps: 400 + idx * 150,
        byModel: {
          "google/gemini-4-hydrogen": { cost: 26 + idx * 10, tokens: 120_000_000, steps: 320 },
          "google/gemini-3.8-flash": { cost: 6 + idx * 2, tokens: 30_000_000, steps: 80 },
        },
      })),
    },
    models: [
      {
        key: "google/gemini-4-hydrogen",
        providerID: "google",
        modelID: "gemini-4-hydrogen",
        steps: 1_700,
        tokens: { input: 50_000_000, output: 1_500_000, reasoning: 2_000_000, cacheRead: 700_000_000, cacheWrite: 10_000_000, total: 763_500_000 },
        cost: 165.0,
        costPer1M: 0.22,
        cacheHitPct: 92.1,
        avgStepMs: 3200,
        ttftP50Ms: 1400,
        tpsAvg: 185.4,
      },
      {
        key: "google/gemini-3.8-flash",
        providerID: "google",
        modelID: "gemini-3.8-flash",
        steps: 440,
        tokens: { input: 14_000_000, output: 300_000, reasoning: 400_000, cacheRead: 110_000_000, cacheWrite: 2_000_000, total: 126_700_000 },
        cost: 29.52,
        costPer1M: 0.23,
        cacheHitPct: 87.3,
        avgStepMs: 1200,
        ttftP50Ms: 650,
        tpsAvg: 240.0,
      },
    ],
    agents: [
      { agent: "build", steps: 1_400, tokens: 600_000_000, cost: 130, sharePct: 65.4, avgStepMs: 2800 },
      { agent: "general", steps: 740, tokens: 290_200_000, cost: 64.52, sharePct: 34.6, avgStepMs: 2100 },
    ],
    tools: [
      { name: "shell", isMcp: false, calls: 5_000, succeeded: 4_990, failed: 10, unfinished: 0, errorPct: 0.2, p50Ms: 420, p95Ms: 2_400, avgMs: 610 },
      { name: "jira_get_issue", isMcp: true, mcpServer: "jira", calls: 120, succeeded: 118, failed: 2, unfinished: 0, errorPct: 1.7, p50Ms: 310, p95Ms: 890, avgMs: 350 },
    ],
    toolSeries: {
      topTools: ["shell", "jira_get_issue"],
      buckets: days.map((date, idx) => ({
        key: date,
        label: date.slice(5),
        totalCalls: 1_500 + idx * 300,
        succeeded: 1_495 + idx * 300,
        failed: 5,
        unfinished: 0,
        errorPct: 0.3,
        byTool: {
          shell: 1_460 + idx * 290,
          jira_get_issue: 40 + idx * 10,
        },
      })),
    },
    mcp: {
      totalCalls: 150,
      succeeded: 147,
      failed: 3,
      unfinished: 0,
      errorPct: 2.0,
      shareOfAllToolsPct: 2.9,
      servers: [
        { server: "jira", toolsCount: 1, calls: 150, succeeded: 147, failed: 3, unfinished: 0, errorPct: 2.0, sharePct: 100, p50Ms: 310, p95Ms: 890, avgMs: 350 },
      ],
      topServers: ["jira"],
      buckets: days.map((date, idx) => ({
        key: date,
        label: date.slice(5),
        totalCalls: 40 + idx * 10,
        succeeded: 39 + idx * 10,
        failed: 1,
        unfinished: 0,
        errorPct: 2.0,
        byServer: {
          jira: 40 + idx * 10,
        },
      })),
    },
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      prompts: hour >= 9 && hour <= 17 ? 24 : 4,
      steps: hour >= 9 && hour <= 17 ? 180 : 20,
      tokens: 1_000_000,
      cost: 2,
    })),
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, weekday) => ({
      weekday,
      label,
      prompts: weekday < 5 ? 50 : 10,
      steps: weekday < 5 ? 380 : 60,
      tokens: 10_000_000,
      cost: weekday < 5 ? 34 : 5,
      prsOpened: weekday < 5 ? 4 : 0,
      approvals: weekday < 5 ? 9 : 1,
    })),
    projects: [
      { id: "p1", name: "api", worktree: "~/acme/api", sessions: 28, subagents: 90, prompts: 210, steps: 1500, tokens: 600_000_000, cost: 145, additions: 2500, deletions: 600 },
    ],
    topSessions: [
      { id: "s1", title: "Review API PR queue", projectName: "api", createdAt: Date.now() - 86400_000, durationMs: 1800_000, steps: 320, subagents: 14, tokens: 120_000_000, cost: 42.1, additions: 500, deletions: 120 },
    ],
    outcomes: {
      finishes: { "tool-calls": 1850, stop: 280, error: 10 },
      sessionOutcomes: { succeeded: 40, failed: 2 },
      parentsWithSubagents: 24,
      avgSubagentsPerParent: 4.9,
      avgStepsPerPrompt: 7.4,
      avgSessionDurationMs: 650_000,
    },
    github: {
      status: "ok",
      login: "octocat",
      openedTotal: 60,
      mergedTotal: 48,
      openTotal: 8,
      closedTotal: 4,
      avgPrsPerDay: 2.0,
      avgPrsPerWeekday: 2.73,
      avgPrsPerActivePrDay: 2.5,
      mergeRatePct: 92.3,
      medianMergeHours: 4.5,
      additions: 6_200,
      deletions: 1_900,
      avgPrSize: 135,
      approvalsTotal: 150,
      changesRequestedTotal: 12,
      commentsTotal: 45,
      reviewsTotal: 207,
      uniquePrsApproved: 142,
      uniquePrsReviewed: 180,
      avgApprovalsPerDay: 5.0,
      avgApprovalsPerWeekday: 6.82,
      avgReviewsPerDay: 6.9,
      approvalRatePct: 72.5,
      series: days.map((date, idx) => ({
        key: date,
        label: date.slice(5),
        opened: 2 + idx,
        merged: 1 + idx,
        approvals: 4 + idx,
        changesRequested: 1,
        comments: 2,
        reviews: 7 + idx,
      })),
      repos: [
        { repo: "acme/api", opened: 42, merged: 36, open: 5, closed: 1, approvals: 120, changesRequested: 10, comments: 30, reviews: 160, additions: 4200, deletions: 1200 },
      ],
      recentOpened: [
        { number: 2208, repo: "acme/api", title: "Enforce dedicated SAT", state: "OPEN", createdAt: "2026-11-17T16:20:40Z", additions: 235, deletions: 19 },
      ],
      recentReviewed: [
        { number: 2207, repo: "acme/api", title: "Add rate limiting", prState: "MERGED", reviewState: "APPROVED", submittedAt: "2026-11-17T16:14:11Z" },
      ],
      efficiency: {
        costPerPr: 194.52 / 60,
        tokensPerPr: 890_200_000 / 60,
        promptsPerPr: 290 / 60,
        sessionsPerPr: 42 / 60,
      },
    },
  };
}

describe("DeepStatsScreen TUI rendering", () => {
  const tabs: Array<{ tab: ViewTab; expectedText: string }> = [
    { tab: "overview", expectedText: "GITHUB VELOCITY" },
    { tab: "tokens", expectedText: "TOKEN USAGE OVER TIME" },
    { tab: "models", expectedText: "MODEL USAGE OVER TIME" },
    { tab: "github", expectedText: "PRs OPENED VS APPROVALS OVER TIME" },
    { tab: "tools", expectedText: "TOOL CALLS OVER TIME" },
    { tab: "mcp", expectedText: "MCP CALLS OVER TIME" },
    { tab: "activity", expectedText: "24-HOUR RHYTHM" },
    { tab: "all", expectedText: "COST & TOKENS" },
  ];

  for (const { tab, expectedText } of tabs) {
    it(`renders ${tab} tab cleanly without layout errors`, async () => {
      const theme = createMockTheme();
      const mockStats = createMockStats();
      const mockContext = {
        theme,
        keymap: {
          layer: () => {},
          dispatch: () => {},
          shortcuts: () => [],
          commands: () => [],
          pending: () => [],
          active: () => [],
          mode: { current: () => "base", push: () => () => {} },
        },
      };

      const setup = await testRender(
        () => (
          <DeepStatsScreen
            context={mockContext as any}
            projectName="auth"
            hasProjectScope={true}
            initialTab={tab}
            fetchStats={async () => mockStats}
            onClose={() => {}}
          />
        ),
        { width: 120, height: 55 },
      );

      try {
        const frame = await setup.waitForFrame((f) => f.includes(expectedText));
        expect(frame).toContain("opencode / deep stats");
        expect(frame).toContain(expectedText);
        expect(frame).toContain("esc back");
        // Verify bottom row has no horizontal scrollbar track
        const lines = frame.split("\n");
        const secondLastLine = lines[lines.length - 3] ?? "";
        expect(secondLastLine).not.toContain("████████████████████");
      } finally {
        await setup.dispose();
      }
    });
  }

  it("loads async stats once without re-triggering an infinite fetch loop", async () => {
    const theme = createMockTheme();
    const mockStats = createMockStats();
    let calls = 0;
    const mockContext = {
      theme,
      keymap: {
        layer: () => {},
        dispatch: () => {},
        shortcuts: () => [],
        commands: () => [],
        pending: () => [],
        active: () => [],
        mode: { current: () => "base", push: () => () => {} },
      },
    };

    const setup = await testRender(
      () => (
        <DeepStatsScreen
          context={mockContext as any}
          projectName="api"
          hasProjectScope={true}
          initialTab="overview"
          fetchStats={async () => {
            calls += 1;
            await Bun.sleep(25);
            return mockStats;
          }}
          onClose={() => {}}
        />
      ),
      { width: 120, height: 52 },
    );

    try {
      await Bun.sleep(120);
      await setup.renderOnce();
      const frame = setup.captureCharFrame();
      expect(calls).toBe(1);
      expect(frame).toContain("GITHUB VELOCITY");
      expect(frame).not.toContain("Gathering deep usage stats");
    } finally {
      await setup.dispose();
    }
  });

  it("precompiled dist/tui.js contains Solid compiled helpers and valid plugin export", async () => {
    const fs = await import("node:fs");
    const built = fs.readFileSync(new URL("../dist/tui.js", import.meta.url), "utf8");
    expect(built).toContain("createComponent");
    expect(built).toContain("deep-stats");
    expect(built).not.toContain("solid-js/dist/server.js");
  });

  it("handles narrow terminal widths cleanly", async () => {
    const theme = createMockTheme();
    const mockStats = createMockStats();
    const mockContext = {
      theme,
      keymap: {
        layer: () => {},
        dispatch: () => {},
        shortcuts: () => [],
        commands: () => [],
        pending: () => [],
        active: () => [],
        mode: { current: () => "base", push: () => () => {} },
      },
    };

    const setup = await testRender(
      () => (
        <DeepStatsScreen
          context={mockContext as any}
          projectName="auth"
          hasProjectScope={true}
          initialTab="overview"
          fetchStats={async () => mockStats}
          onClose={() => {}}
        />
      ),
      { width: 64, height: 32 },
    );

    try {
      const frame = await setup.waitForFrame((f) => f.includes("TOKENS"));
      expect(frame).toContain("opencode / deep stats");
      expect(frame).toContain("7D   30D   90D   YTD   ALL");
      expect(frame).toContain("esc");
    } finally {
      await setup.dispose();
    }
  });
});
