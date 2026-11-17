import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeepStatsAggregator } from "../src/aggregator.ts";
import { buildActivityGrid, compactNumber, formatDurationMs, renderPixelLines } from "../src/format.ts";
import { buildGitHubStats, type CachedGitHubData } from "../src/github.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "opencode-deep-stats-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop()!;
    rmSync(d, { recursive: true, force: true });
  }
});

function createTestOpencodeDb(dbPath: string, nowMs: number) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE project (
      id TEXT PRIMARY KEY,
      worktree TEXT NOT NULL,
      vcs TEXT,
      name TEXT
    );
    CREATE TABLE session_v2 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT,
      summary_additions INTEGER,
      summary_deletions INTEGER,
      summary_files INTEGER,
      cost REAL DEFAULT 0 NOT NULL,
      tokens_input INTEGER DEFAULT 0 NOT NULL,
      tokens_output INTEGER DEFAULT 0 NOT NULL,
      tokens_reasoning INTEGER DEFAULT 0 NOT NULL,
      tokens_cache_read INTEGER DEFAULT 0 NOT NULL,
      tokens_cache_write INTEGER DEFAULT 0 NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_idle INTEGER,
      idle_outcome TEXT
    );
    CREATE TABLE session_message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      seq INTEGER NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX session_message_time_created_idx ON session_message (time_created);
  `);

  const day1 = nowMs - 3 * 86_400_000;
  const day2 = nowMs - 1 * 86_400_000;

  db.query("INSERT INTO project (id, worktree, vcs, name) VALUES (?, ?, ?, ?)").run(
    "proj_auth",
    "/Users/test/acme/api",
    "git",
    "api",
  );
  db.query("INSERT INTO project (id, worktree, vcs, name) VALUES (?, ?, ?, ?)").run(
    "proj_ui",
    "/Users/test/ui",
    "git",
    "ui",
  );

  // Root sessions & 1 subagent
  const insSess = db.query(`
    INSERT INTO session_v2 (
      id, project_id, parent_id, title, summary_additions, summary_deletions, summary_files,
      cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
      time_created, time_updated, time_idle, idle_outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insSess.run("ses_1", "proj_auth", null, "Fix JWT rotation", 120, 30, 4, 1.5, 10_000, 1_500, 500, 80_000, 0, day1, day1 + 60_000, day1 + 60_000, "succeeded");
  insSess.run("ses_1_sub", "proj_auth", "ses_1", "Explore tests", 0, 0, 0, 0.25, 2_000, 300, 100, 10_000, 0, day1 + 5_000, day1 + 20_000, day1 + 20_000, "succeeded");
  insSess.run("ses_2", "proj_ui", null, "Add chart panel", 80, 10, 2, 2.0, 15_000, 2_500, 1_000, 120_000, 5_000, day2, day2 + 120_000, day2 + 120_000, "succeeded");

  const insMsg = db.query(`
    INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // User prompts
  insMsg.run("m_u1", "ses_1", "user", 1, day1, day1, JSON.stringify({ text: "Fix JWT rotation bug" }));
  insMsg.run("m_u2", "ses_1_sub", "user", 1, day1 + 5_000, day1 + 5_000, JSON.stringify({ text: "Check tests" }));
  insMsg.run("m_u3", "ses_2", "user", 1, day2, day2, JSON.stringify({ text: "Add chart panel" }));

  // Assistant messages with tokens, latency, and tools
  insMsg.run(
    "m_a1",
    "ses_1",
    "assistant",
    2,
    day1 + 1_000,
    day1 + 4_000,
    JSON.stringify({
      agent: "build",
      model: { providerID: "google", id: "gemini-4-hydrogen", variant: "xhigh" },
      finish: "tool-calls",
      cost: 1.5,
      tokens: { input: 10_000, output: 1_500, reasoning: 500, cache: { read: 80_000, write: 0 } },
      time: { created: day1 + 1_000, firstToken: day1 + 2_000, completed: day1 + 4_000 },
      content: [
        {
          type: "tool",
          name: "read",
          time: { created: day1 + 3_000, ran: day1 + 3_001, completed: day1 + 3_020 },
          state: { status: "completed" },
        },
        {
          type: "tool",
          name: "jira_get_issue",
          time: { created: day1 + 3_100, ran: day1 + 3_105, completed: day1 + 3_505 },
          state: { status: "error" },
        },
      ],
    }),
  );

  insMsg.run(
    "m_a2",
    "ses_1_sub",
    "assistant",
    2,
    day1 + 6_000,
    day1 + 8_000,
    JSON.stringify({
      agent: "explore",
      model: { providerID: "google", id: "gemini-3.8-flash", variant: "high" },
      finish: "stop",
      cost: 0.25,
      tokens: { input: 2_000, output: 300, reasoning: 100, cache: { read: 10_000, write: 0 } },
      time: { created: day1 + 6_000, firstToken: day1 + 6_500, completed: day1 + 8_000 },
      content: [],
    }),
  );

  insMsg.run(
    "m_a3",
    "ses_2",
    "assistant",
    2,
    day2 + 1_000,
    day2 + 6_000,
    JSON.stringify({
      agent: "build",
      model: { providerID: "google", id: "gemini-4-hydrogen", variant: "medium" },
      finish: "stop",
      cost: 2.0,
      tokens: { input: 15_000, output: 2_500, reasoning: 1_000, cache: { read: 120_000, write: 5_000 } },
      time: { created: day2 + 1_000, firstToken: day2 + 2_500, completed: day2 + 6_000 },
      content: [
        {
          type: "tool",
          name: "shell",
          time: { created: day2 + 4_000, ran: day2 + 4_000, completed: day2 + 4_500 },
          state: { status: "completed" },
        },
      ],
    }),
  );

  db.close();
}

describe("format utilities", () => {
  it("formats compact numbers, durations, and pixel digits", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(1_500_000)).toBe("1.5M");
    expect(formatDurationMs(45)).toBe("45ms");
    expect(formatDurationMs(2_500)).toBe("2.50s");
    expect(formatDurationMs(125_000)).toBe("2m5s");

    const lines = renderPixelLines("1.5M", 120);
    expect(lines).toBeDefined();
    expect(lines!.length).toBe(5);
    expect(renderPixelLines("1.5M", 4)).toBeUndefined();
  });

  it("builds 53-week-style activity grid cleanly", () => {
    const grid = buildActivityGrid(
      [
        {
          date: "2026-11-16",
          steps: 10,
          prompts: 2,
          subagentPrompts: 0,
          sessions: 1,
          subagents: 0,
          tokens: 1000,
          inputTokens: 100,
          outputTokens: 50,
          reasoningTokens: 0,
          cacheReadTokens: 850,
          cacheWriteTokens: 0,
          cost: 0.5,
          prsOpened: 1,
          prsMerged: 1,
          approvals: 2,
          reviews: 3,
        },
      ],
      "2026-11-10",
      "2026-11-17",
      20,
      "steps",
    );
    expect(grid.weeks.length).toBe(2);
    expect(grid.clipped).toBe(false);
    const flat = grid.weeks.flat();
    const cell = flat.find((c) => c.date === "2026-11-16");
    expect(cell?.level).toBe(4);
  });
});

describe("DeepStatsAggregator & incremental SQLite rollup", () => {
  it("aggregates tokens, models over time, variants, tools, latency, and incremental updates", async () => {
    const dir = createTempDir();
    const dbPath = join(dir, "opencode.db");
    const cacheDbPath = join(dir, "rollup.db");
    const ghCachePath = join(dir, "gh.json");
    const now = Date.now();
    createTestOpencodeDb(dbPath, now);

    const agg = new DeepStatsAggregator({
      opencodeDbPath: dbPath,
      cacheDbPath,
      githubCachePath: ghCachePath,
    });

    const grouped = await agg.getStats({
      range: "7d",
      timezone: "UTC",
      includeVariants: false,
      githubMode: "skip",
    });

    expect(grouped.meta.dbAvailable).toBe(true);
    expect(grouped.summary.sessions).toBe(2);
    expect(grouped.summary.subagents).toBe(1);
    expect(grouped.summary.prompts).toBe(2);
    expect(grouped.summary.subagentPrompts).toBe(1);
    expect(grouped.summary.steps).toBe(3);
    expect(grouped.summary.cost).toBeCloseTo(3.75, 5);
    expect(grouped.summary.tokens.total).toBe(
      10_000 + 1_500 + 500 + 80_000 + 2_000 + 300 + 100 + 10_000 + 15_000 + 2_500 + 1_000 + 120_000 + 5_000,
    );
    expect(grouped.summary.codeDiff).toEqual({ additions: 200, deletions: 40, files: 6 });

    // Grouped models: hydrogen + flash
    expect(grouped.models.length).toBe(2);
    expect(grouped.models[0]!.key).toBe("google/gemini-4-hydrogen");
    expect(grouped.models[0]!.steps).toBe(2);
    expect(grouped.models[0]!.ttftP50Ms).toBeGreaterThan(800);
    expect(grouped.models[0]!.tpsAvg).toBeGreaterThan(500);

    // Split by variant
    const split = await agg.getStats({
      range: "7d",
      timezone: "UTC",
      includeVariants: true,
      githubMode: "skip",
    });
    expect(split.models.length).toBe(3);
    expect(split.models.map((m) => m.key)).toContain("google/gemini-4-hydrogen#xhigh");
    expect(split.models.map((m) => m.key)).toContain("google/gemini-4-hydrogen#medium");

    // Tools: read, shell, jira_get_issue (MCP)
    expect(grouped.tools.length).toBe(3);
    const jiraTool = grouped.tools.find((t) => t.name === "jira_get_issue");
    expect(jiraTool?.isMcp).toBe(true);
    expect(jiraTool?.errorPct).toBe(100);
    const readTool = grouped.tools.find((t) => t.name === "read");
    expect(readTool?.isMcp).toBe(false);
    expect(readTool?.errorPct).toBe(0);

    // Project scope filter
    const authOnly = await agg.getStats({
      range: "7d",
      projectID: "proj_auth",
      timezone: "UTC",
      includeVariants: false,
      githubMode: "skip",
    });
    expect(authOnly.summary.sessions).toBe(1);
    expect(authOnly.summary.subagents).toBe(1);
    expect(authOnly.summary.cost).toBeCloseTo(1.75, 5);

    // Incremental update detection: append a new message to source DB
    const src = new Database(dbPath);
    const tNew = now - 60_000;
    src
      .query(
        "INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "m_a4",
        "ses_2",
        "assistant",
        3,
        tNew,
        tNew,
        JSON.stringify({
          agent: "build",
          model: { providerID: "google", id: "gemini-4-hydrogen", variant: "medium" },
          finish: "stop",
          cost: 1.0,
          tokens: { input: 5_000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: tNew, firstToken: tNew + 500, completed: tNew + 1_500 },
          content: [],
        }),
      );
    src.close();

    const updated = await agg.getStats({
      range: "7d",
      timezone: "UTC",
      includeVariants: false,
      githubMode: "skip",
    });
    expect(updated.summary.steps).toBe(4);
    expect(updated.summary.cost).toBeCloseTo(4.75, 5);

    agg.close();
  });
});

describe("GitHub PR & Approval metrics", () => {
  it("computes average opened PRs and approvals per day, per weekday, and repo filter", () => {
    const raw: CachedGitHubData = {
      fetchedAt: Date.now(),
      login: "octocat",
      fromDay: "2026-11-08",
      toDay: "2026-11-17",
      authored: [
        {
          id: "pr1",
          number: 101,
          repo: "acme/api",
          title: "Add PAT scope",
          state: "MERGED",
          createdAt: "2026-11-10T15:00:00Z",
          mergedAt: "2026-11-10T21:00:00Z",
          closedAt: "2026-11-10T21:00:00Z",
          additions: 100,
          deletions: 20,
        },
        {
          id: "pr2",
          number: 102,
          repo: "acme/web",
          title: "Update UI",
          state: "OPEN",
          createdAt: "2026-11-12T15:00:00Z",
          mergedAt: null,
          closedAt: null,
          additions: 40,
          deletions: 10,
        },
        {
          id: "pr3",
          number: 103,
          repo: "acme/api",
          title: "Fix metrics",
          state: "MERGED",
          createdAt: "2026-11-16T15:00:00Z",
          mergedAt: "2026-11-16T17:00:00Z",
          closedAt: "2026-11-16T17:00:00Z",
          additions: 30,
          deletions: 5,
        },
      ],
      reviews: [
        {
          id: "r1",
          prNumber: 200,
          repo: "acme/api",
          prTitle: "Other PR 1",
          prState: "MERGED",
          reviewState: "APPROVED",
          submittedAt: "2026-11-10T18:00:00Z",
        },
        {
          id: "r2",
          prNumber: 201,
          repo: "acme/api",
          prTitle: "Other PR 2",
          prState: "OPEN",
          reviewState: "COMMENTED",
          submittedAt: "2026-11-11T18:00:00Z",
        },
        {
          id: "r3",
          prNumber: 202,
          repo: "acme/web",
          prTitle: "Other PR 3",
          prState: "MERGED",
          reviewState: "APPROVED",
          submittedAt: "2026-11-12T18:00:00Z",
        },
        {
          id: "r4",
          prNumber: 203,
          repo: "acme/api",
          prTitle: "Other PR 4",
          prState: "MERGED",
          reviewState: "APPROVED",
          submittedAt: "2026-11-16T18:00:00Z",
        },
      ],
    };

    const days = ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"];
    const buckets = days.map((d) => ({ key: d, label: d.slice(5) }));
    const dayBucketMap = new Map(buckets.map((b) => [b.key, b]));
    const activityByDay = new Map(
      days.map((d) => [d, { prsOpened: 0, prsMerged: 0, approvals: 0, reviews: 0 }]),
    );
    const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({
      weekday: i,
      label,
      prompts: 0,
      steps: 0,
      tokens: 0,
      cost: 0,
      prsOpened: 0,
      approvals: 0,
    }));

    const gh = buildGitHubStats({
      raw,
      status: "ok",
      fromDay: "2026-11-08",
      toDay: "2026-11-17",
      daysCount: 10,
      weekdaysCount: 7,
      timezone: "UTC",
      buckets,
      dayBucketMap,
      activityByDay,
      weekday,
      localTotals: { cost: 30, tokens: 3_000_000, prompts: 30, sessions: 6 },
    });

    expect(gh.openedTotal).toBe(3);
    expect(gh.mergedTotal).toBe(2);
    expect(gh.openTotal).toBe(1);
    expect(gh.avgPrsPerDay).toBeCloseTo(0.3, 5);
    expect(gh.avgPrsPerWeekday).toBeCloseTo(3 / 7, 5);
    expect(gh.approvalsTotal).toBe(3);
    expect(gh.commentsTotal).toBe(1);
    expect(gh.reviewsTotal).toBe(4);
    expect(gh.avgApprovalsPerDay).toBeCloseTo(0.3, 5);
    expect(gh.approvalRatePct).toBeCloseTo(75, 5);
    expect(gh.mergeRatePct).toBeCloseTo(100, 5);
    expect(gh.medianMergeHours).toBeCloseTo(6, 5);
    expect(gh.efficiency.costPerPr).toBeCloseTo(10, 5);
    expect(gh.repos.length).toBe(2);

    // Filtered by acme/api
    const authGh = buildGitHubStats({
      raw,
      status: "ok",
      fromDay: "2026-11-08",
      toDay: "2026-11-17",
      daysCount: 10,
      weekdaysCount: 7,
      timezone: "UTC",
      repoFilter: "acme/api",
      buckets,
      dayBucketMap,
      activityByDay: new Map(days.map((d) => [d, { prsOpened: 0, prsMerged: 0, approvals: 0, reviews: 0 }])),
      weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({
        weekday: i,
        label,
        prompts: 0,
        steps: 0,
        tokens: 0,
        cost: 0,
        prsOpened: 0,
        approvals: 0,
      })),
      localTotals: { cost: 30, tokens: 3_000_000, prompts: 30, sessions: 6 },
    });
    expect(authGh.openedTotal).toBe(2);
    expect(authGh.approvalsTotal).toBe(2);
  });
});
