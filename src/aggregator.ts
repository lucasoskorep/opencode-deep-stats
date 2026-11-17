import { DeepStatsStore, type DbPaths } from "./db.ts";
import {
  buildGitHubStats,
  detectGithubRepoFromDir,
  GitHubStatsClient,
  type CachedGitHubData,
} from "./github.ts";
import type { DeepStatsPayload, DeepStatsQuery } from "./types.ts";

export class DeepStatsAggregator {
  readonly store: DeepStatsStore;
  readonly github: GitHubStatsClient;
  private onUpdated?: () => void;

  constructor(options?: Partial<DbPaths> & { githubCachePath?: string; onUpdated?: () => void }) {
    this.onUpdated = options?.onUpdated;
    this.store = new DeepStatsStore({
      opencodeDbPath: options?.opencodeDbPath,
      cacheDbPath: options?.cacheDbPath,
      onBackfillProgress: () => this.onUpdated?.(),
    });
    this.github = new GitHubStatsClient({
      cachePath: options?.githubCachePath,
    });
  }

  close(): void {
    this.store.close();
  }

  warmBackground(): void {
    void this.store.startBackgroundBackfill();
  }

  async getStats(
    query: DeepStatsQuery & {
      projectDirectory?: string;
      githubMode?: "sync" | "cache-only" | "skip";
    },
  ): Promise<DeepStatsPayload> {
    const local = this.store.queryLocalStats(query);
    const fromDay = local.allDays[0] ?? new Date().toISOString().slice(0, 10);
    const toDay = local.allDays[local.allDays.length - 1] ?? fromDay;

    const repoFilter =
      query.githubRepo ??
      (query.projectID && query.projectDirectory
        ? detectGithubRepoFromDir(query.projectDirectory)
        : undefined);

    const activityByDay = new Map(local.activity.map((row) => [row.date, row]));
    const buckets = local.tokenSeries.map((b) => ({ key: b.key, label: b.label }));

    let rawGh: CachedGitHubData | undefined;
    let ghStatus: DeepStatsPayload["github"]["status"] = "loading";
    let ghMsg: string | undefined;

    if (query.githubMode === "skip") {
      ghStatus = "unavailable";
      ghMsg = "GitHub stats skipped";
    } else if (query.githubMode === "cache-only") {
      const cachedRes = await this.github.fetchWindow(fromDay, toDay, { cacheOnly: true });
      if (cachedRes.data) {
        rawGh = cachedRes.data;
        ghStatus = "ok";
        if (cachedRes.stale) ghMsg = "Refreshing GitHub…";
      } else {
        ghStatus = "loading";
        ghMsg = "Fetching GitHub PRs & approvals…";
      }
    } else {
      const res = await this.github.fetchWindow(fromDay, toDay, {
        forceRefresh: Boolean(query.refresh),
      });
      if (res.data) {
        rawGh = res.data;
        ghStatus = "ok";
        if (res.stale) ghMsg = `Cached (${res.error ?? "offline"})`;
      } else {
        ghStatus = res.error?.includes("not logged in") || res.error?.includes("not found")
          ? "unavailable"
          : "error";
        ghMsg = res.error;
      }
    }

    const github = buildGitHubStats({
      raw: rawGh,
      status: ghStatus,
      message: ghMsg,
      fromDay,
      toDay,
      daysCount: local.meta.daysCount,
      weekdaysCount: local.meta.weekdaysCount,
      timezone: query.timezone,
      repoFilter,
      buckets,
      dayBucketMap: local.dayBucketMap,
      activityByDay,
      weekday: local.weekday,
      localTotals: {
        cost: local.summary.cost,
        tokens: local.summary.tokens.total,
        prompts: local.summary.prompts,
        sessions: local.summary.sessions,
      },
    });

    const { dayBucketMap: _discard1, allDays: _discard2, ...restLocal } = local;
    return {
      ...restLocal,
      github,
    };
  }
}
