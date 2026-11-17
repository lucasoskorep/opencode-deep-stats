import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  addDaysToDayStr,
  createDayFormatter,
  formatDayInTz,
  weekdayFromDayStr,
} from "./format.ts";
import type {
  GitHubPrSummary,
  GitHubRepoRow,
  GitHubReviewSummary,
  GitHubSeriesBucket,
  GitHubStats,
  WeekdayBucket,
} from "./types.ts";

export type RawAuthoredPr = {
  id: string;
  number: number;
  repo: string;
  title: string;
  state: "OPEN" | "MERGED" | "CLOSED" | string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
};

export type RawReviewItem = {
  id: string;
  prNumber: number;
  repo: string;
  prTitle: string;
  prState: string;
  reviewState: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING" | string;
  submittedAt: string;
};

export type CachedGitHubData = {
  fetchedAt: number;
  login: string;
  fromDay: string;
  toDay: string;
  authored: RawAuthoredPr[];
  reviews: RawReviewItem[];
};

const CACHE_TTL_MS = 5 * 60_000;

export function resolveDefaultGitHubCachePath(): string {
  const cacheHome = process.env.XDG_CACHE_HOME || join(process.env.HOME || "", ".cache");
  return join(cacheHome, "opencode", "deep-stats-github.v1.json");
}

export function detectGithubRepoFromDir(directory?: string): string | undefined {
  if (!directory || directory === "/" || !existsSync(directory)) return undefined;
  try {
    const proc = Bun.spawnSync(["git", "-C", directory, "remote", "get-url", "origin"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) return undefined;
    const url = proc.stdout.toString().trim();
    const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function findGhBinary(): string | undefined {
  const fromPath = Bun.which("gh");
  if (fromPath) return fromPath;
  for (const candidate of ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function getGhToken(): { token?: string; error?: string } {
  const gh = findGhBinary();
  if (!gh) {
    return { error: "gh CLI not found in PATH" };
  }
  try {
    const proc = Bun.spawnSync([gh, "auth", "token"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) {
      const stderr = proc.stderr.toString().trim();
      return { error: stderr || "gh auth not logged in (run `gh auth login`)" };
    }
    const token = proc.stdout.toString().trim();
    if (!token) {
      return { error: "gh auth returned empty token" };
    }
    return { token };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function runGraphql<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const host = process.env.GH_HOST?.trim();
  const endpoint =
    host && host !== "github.com" ? `https://${host}/api/graphql` : "https://api.github.com/graphql";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "opencode-deep-stats",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub GraphQL HTTP ${res.status}: ${text.slice(0, 180)}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length && !json.data) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Empty GitHub GraphQL response");
  }
  return json.data;
}

type SearchPageResult<Node> = {
  search: {
    issueCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<Node | null>;
  };
};

async function fetchSearchAllPages<Node>(
  token: string,
  searchQuery: string,
  graphqlDoc: string,
  variables?: Record<string, unknown>,
): Promise<{ issueCount: number; nodes: Node[] }> {
  const allNodes: Node[] = [];
  let cursor: string | null = null;
  let issueCount = 0;

  for (let page = 0; page < 10; page += 1) {
    const data: SearchPageResult<Node> = await runGraphql<SearchPageResult<Node>>(token, graphqlDoc, {
      ...variables,
      q: searchQuery,
      cursor,
    });
    issueCount = data.search.issueCount;
    for (const node of data.search.nodes) {
      if (node) allNodes.push(node);
    }
    if (!data.search.pageInfo.hasNextPage || !data.search.pageInfo.endCursor) {
      break;
    }
    cursor = data.search.pageInfo.endCursor;
  }

  return { issueCount, nodes: allNodes };
}

const AUTHORED_QUERY = `
query($q: String!, $cursor: String) {
  search(query: $q, type: ISSUE, first: 100, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        id
        number
        title
        state
        createdAt
        mergedAt
        closedAt
        additions
        deletions
        repository { nameWithOwner }
      }
    }
  }
}`;

const REVIEWED_QUERY = `
query($q: String!, $cursor: String, $login: String!) {
  search(query: $q, type: ISSUE, first: 100, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        id
        number
        title
        state
        repository { nameWithOwner }
        reviews(last: 50, author: $login) {
          nodes {
            id
            state
            submittedAt
          }
        }
      }
    }
  }
}`;

type GqlAuthoredNode = {
  id?: string;
  number?: number;
  title?: string;
  state?: string;
  createdAt?: string;
  mergedAt?: string | null;
  closedAt?: string | null;
  additions?: number;
  deletions?: number;
  repository?: { nameWithOwner: string };
};

type GqlReviewedNode = {
  id?: string;
  number?: number;
  title?: string;
  state?: string;
  repository?: { nameWithOwner: string };
  reviews?: {
    nodes: Array<{
      id: string;
      state: string;
      submittedAt: string | null;
    } | null>;
  };
};

function dayMidpoint(startDay: string, endDay: string): string {
  const s = Date.parse(`${startDay}T00:00:00Z`);
  const e = Date.parse(`${endDay}T00:00:00Z`);
  const mid = Math.floor((s + e) / 2 / 86_400_000) * 86_400_000;
  return new Date(mid).toISOString().slice(0, 10);
}

async function fetchAuthoredSlice(
  token: string,
  login: string,
  startDay: string,
  endDay: string,
  depth = 0,
): Promise<RawAuthoredPr[]> {
  const q = `is:pr author:${login} created:${startDay}..${endDay}`;
  const firstPage = await runGraphql<SearchPageResult<GqlAuthoredNode>>(token, AUTHORED_QUERY, {
    q,
    cursor: null,
  });

  if (firstPage.search.issueCount >= 950 && startDay < endDay && depth < 6) {
    const mid = dayMidpoint(startDay, endDay);
    if (mid > startDay && mid < endDay) {
      const [left, right] = await Promise.all([
        fetchAuthoredSlice(token, login, startDay, mid, depth + 1),
        fetchAuthoredSlice(token, login, addDaysToDayStr(mid, 1), endDay, depth + 1),
      ]);
      return [...left, ...right];
    }
  }

  const allNodes: GqlAuthoredNode[] = [];
  for (const n of firstPage.search.nodes) if (n) allNodes.push(n);
  let cursor = firstPage.search.pageInfo.hasNextPage ? firstPage.search.pageInfo.endCursor : null;
  let pages = 1;
  while (cursor && pages < 10) {
    const nextPage = await runGraphql<SearchPageResult<GqlAuthoredNode>>(token, AUTHORED_QUERY, {
      q,
      cursor,
    });
    for (const n of nextPage.search.nodes) if (n) allNodes.push(n);
    cursor = nextPage.search.pageInfo.hasNextPage ? nextPage.search.pageInfo.endCursor : null;
    pages += 1;
  }

  return allNodes
    .filter((n): n is Required<Pick<GqlAuthoredNode, "id" | "number" | "createdAt" | "repository">> & GqlAuthoredNode =>
      Boolean(n.id && n.number && n.createdAt && n.repository?.nameWithOwner),
    )
    .map((n) => ({
      id: n.id,
      number: n.number,
      repo: n.repository.nameWithOwner,
      title: n.title || `PR #${n.number}`,
      state: n.state || "OPEN",
      createdAt: n.createdAt,
      mergedAt: n.mergedAt ?? null,
      closedAt: n.closedAt ?? null,
      additions: Number(n.additions ?? 0),
      deletions: Number(n.deletions ?? 0),
    }));
}

async function fetchReviewedSlice(
  token: string,
  login: string,
  startDay: string,
  endDay: string,
  isUpperOpen: boolean,
  depth = 0,
): Promise<RawReviewItem[]> {
  const qualifier = isUpperOpen ? `updated:>=${startDay}` : `updated:${startDay}..${endDay}`;
  const q = `is:pr reviewed-by:${login} ${qualifier}`;
  const firstPage = await runGraphql<SearchPageResult<GqlReviewedNode>>(token, REVIEWED_QUERY, {
    q,
    cursor: null,
    login,
  });

  if (firstPage.search.issueCount >= 950 && startDay < endDay && depth < 6) {
    const mid = dayMidpoint(startDay, endDay);
    if (mid > startDay && mid < endDay) {
      const [left, right] = await Promise.all([
        fetchReviewedSlice(token, login, startDay, mid, false, depth + 1),
        fetchReviewedSlice(token, login, addDaysToDayStr(mid, 1), endDay, isUpperOpen, depth + 1),
      ]);
      return [...left, ...right];
    }
  }

  const allNodes: GqlReviewedNode[] = [];
  for (const n of firstPage.search.nodes) if (n) allNodes.push(n);
  let cursor = firstPage.search.pageInfo.hasNextPage ? firstPage.search.pageInfo.endCursor : null;
  let pages = 1;
  while (cursor && pages < 10) {
    const nextPage = await runGraphql<SearchPageResult<GqlReviewedNode>>(token, REVIEWED_QUERY, {
      q,
      cursor,
      login,
    });
    for (const n of nextPage.search.nodes) if (n) allNodes.push(n);
    cursor = nextPage.search.pageInfo.hasNextPage ? nextPage.search.pageInfo.endCursor : null;
    pages += 1;
  }

  const reviews: RawReviewItem[] = [];
  for (const pr of allNodes) {
    if (!pr.number || !pr.repository?.nameWithOwner) continue;
    for (const rev of pr.reviews?.nodes ?? []) {
      if (!rev?.id || !rev.submittedAt) continue;
      reviews.push({
        id: rev.id,
        prNumber: pr.number,
        repo: pr.repository.nameWithOwner,
        prTitle: pr.title || `PR #${pr.number}`,
        prState: pr.state || "OPEN",
        reviewState: rev.state,
        submittedAt: rev.submittedAt,
      });
    }
  }
  return reviews;
}

export class GitHubStatsClient {
  private readonly cachePath: string;
  private memoryCache: CachedGitHubData[] = [];
  private diskLoaded = false;
  private inflight = new Map<string, Promise<CachedGitHubData>>();

  constructor(options?: { cachePath?: string }) {
    this.cachePath = options?.cachePath ?? resolveDefaultGitHubCachePath();
  }

  private loadDisk(): void {
    if (this.diskLoaded) return;
    this.diskLoaded = true;
    try {
      if (!existsSync(this.cachePath)) return;
      const parsed = JSON.parse(readFileSync(this.cachePath, "utf8")) as { entries?: CachedGitHubData[] };
      if (Array.isArray(parsed.entries)) {
        this.memoryCache = parsed.entries;
      }
    } catch {
      this.memoryCache = [];
    }
  }

  private saveDisk(): void {
    try {
      mkdirSync(dirname(this.cachePath), { recursive: true });
      writeFileSync(
        this.cachePath,
        JSON.stringify({ entries: this.memoryCache.slice(0, 6) }),
        "utf8",
      );
    } catch {
      // non-fatal
    }
  }

  private findCoveringCache(fromDay: string, toDay: string, maxAgeMs: number): CachedGitHubData | undefined {
    this.loadDisk();
    const now = Date.now();
    return this.memoryCache.find(
      (entry) =>
        now - entry.fetchedAt <= maxAgeMs &&
        entry.fromDay <= fromDay &&
        entry.toDay >= toDay,
    );
  }

  private upsertCache(entry: CachedGitHubData): void {
    this.loadDisk();
    const filtered = this.memoryCache.filter(
      (e) => !(e.fromDay === entry.fromDay && e.toDay === entry.toDay && e.login === entry.login),
    );
    this.memoryCache = [entry, ...filtered].slice(0, 6);
    this.saveDisk();
  }

  async fetchWindow(
    fromDay: string,
    toDay: string,
    options?: { forceRefresh?: boolean; cacheOnly?: boolean },
  ): Promise<{ data?: CachedGitHubData; error?: string; stale?: boolean }> {
    if (!options?.forceRefresh) {
      const fresh = this.findCoveringCache(fromDay, toDay, CACHE_TTL_MS);
      if (fresh) return { data: fresh };
    }
    if (options?.cacheOnly) {
      const stale = this.findCoveringCache(fromDay, toDay, Number.MAX_SAFE_INTEGER);
      if (stale) return { data: stale, stale: true };
      return {};
    }

    const auth = getGhToken();
    if (!auth.token) {
      const stale = this.findCoveringCache(fromDay, toDay, Number.MAX_SAFE_INTEGER);
      if (stale) return { data: stale, stale: true, error: auth.error };
      return { error: auth.error ?? "GitHub CLI unavailable" };
    }
    const token = auth.token;
    const key = `${fromDay}:${toDay}`;

    let promise = this.inflight.get(key);
    if (!promise) {
      promise = (async () => {
        const viewerRes = await runGraphql<{ viewer: { login: string } }>(
          token,
          "query { viewer { login } }",
        );
        const login = viewerRes.viewer.login;
        const searchStart = addDaysToDayStr(fromDay, -1);
        const searchEnd = addDaysToDayStr(toDay, 1);

        const [authoredRaw, reviewedRaw] = await Promise.all([
          fetchAuthoredSlice(token, login, searchStart, searchEnd),
          fetchReviewedSlice(token, login, searchStart, searchEnd, true),
        ]);

        // Deduplicate by unique ID
        const authoredMap = new Map<string, RawAuthoredPr>();
        for (const pr of authoredRaw) {
          authoredMap.set(`${pr.repo}#${pr.number}`, pr);
        }
        const reviewMap = new Map<string, RawReviewItem>();
        for (const rev of reviewedRaw) {
          reviewMap.set(rev.id, rev);
        }

        const entry: CachedGitHubData = {
          fetchedAt: Date.now(),
          login,
          fromDay,
          toDay,
          authored: [...authoredMap.values()],
          reviews: [...reviewMap.values()],
        };
        this.upsertCache(entry);
        return entry;
      })();
      this.inflight.set(key, promise);
      promise.finally(() => {
        if (this.inflight.get(key) === promise) {
          this.inflight.delete(key);
        }
      });
    }

    try {
      const data = await promise;
      return { data };
    } catch (err) {
      const stale = this.findCoveringCache(fromDay, toDay, Number.MAX_SAFE_INTEGER);
      const message = err instanceof Error ? err.message : String(err);
      if (stale) return { data: stale, stale: true, error: message };
      return { error: message };
    }
  }
}

export function buildGitHubStats(params: {
  raw?: CachedGitHubData;
  status: GitHubStats["status"];
  message?: string;
  fromDay: string;
  toDay: string;
  daysCount: number;
  weekdaysCount: number;
  timezone: string;
  repoFilter?: string;
  buckets: Array<{ key: string; label: string }>;
  dayBucketMap: Map<string, { key: string; label: string }>;
  activityByDay: Map<
    string,
    { prsOpened: number; prsMerged: number; approvals: number; reviews: number }
  >;
  weekday: WeekdayBucket[];
  localTotals: { cost: number; tokens: number; prompts: number; sessions: number };
}): GitHubStats {
  const {
    raw,
    status,
    message,
    fromDay,
    toDay,
    daysCount,
    weekdaysCount,
    timezone,
    repoFilter,
    buckets,
    dayBucketMap,
    activityByDay,
    weekday,
    localTotals,
  } = params;

  const seriesMap = new Map<string, GitHubSeriesBucket>();
  for (const b of buckets) {
    seriesMap.set(b.key, {
      key: b.key,
      label: b.label,
      opened: 0,
      merged: 0,
      approvals: 0,
      changesRequested: 0,
      comments: 0,
      reviews: 0,
    });
  }

  if (!raw) {
    return {
      status,
      message,
      repoFilter,
      openedTotal: 0,
      mergedTotal: 0,
      openTotal: 0,
      closedTotal: 0,
      avgPrsPerDay: 0,
      avgPrsPerWeekday: 0,
      avgPrsPerActivePrDay: 0,
      mergeRatePct: 0,
      additions: 0,
      deletions: 0,
      avgPrSize: 0,
      approvalsTotal: 0,
      changesRequestedTotal: 0,
      commentsTotal: 0,
      reviewsTotal: 0,
      uniquePrsApproved: 0,
      uniquePrsReviewed: 0,
      avgApprovalsPerDay: 0,
      avgApprovalsPerWeekday: 0,
      avgReviewsPerDay: 0,
      approvalRatePct: 0,
      series: buckets.map((b) => seriesMap.get(b.key)!),
      repos: [],
      recentOpened: [],
      recentReviewed: [],
      efficiency: {},
    };
  }

  const dayFmt = createDayFormatter(timezone);
  const targetRepo = repoFilter?.toLowerCase();

  const repoMap = new Map<string, GitHubRepoRow>();
  const ensureRepo = (repo: string) => {
    let r = repoMap.get(repo);
    if (!r) {
      r = {
        repo,
        opened: 0,
        merged: 0,
        open: 0,
        closed: 0,
        approvals: 0,
        changesRequested: 0,
        comments: 0,
        reviews: 0,
        additions: 0,
        deletions: 0,
      };
      repoMap.set(repo, r);
    }
    return r;
  };

  let openedTotal = 0;
  let mergedTotal = 0;
  let openTotal = 0;
  let closedTotal = 0;
  let additions = 0;
  let deletions = 0;
  const mergeHoursList: number[] = [];
  const activePrDays = new Set<string>();
  const recentOpened: GitHubPrSummary[] = [];

  for (const pr of raw.authored) {
    if (targetRepo && pr.repo.toLowerCase() !== targetRepo) continue;
    const createdMs = Date.parse(pr.createdAt);
    if (!Number.isFinite(createdMs)) continue;
    const day = formatDayInTz(createdMs, dayFmt);
    if (day < fromDay || day > toDay) continue;

    openedTotal += 1;
    activePrDays.add(day);
    additions += pr.additions;
    deletions += pr.deletions;
    if (pr.state === "MERGED") mergedTotal += 1;
    else if (pr.state === "OPEN") openTotal += 1;
    else closedTotal += 1;

    if (pr.mergedAt) {
      const mergedMs = Date.parse(pr.mergedAt);
      if (Number.isFinite(mergedMs) && mergedMs >= createdMs) {
        mergeHoursList.push((mergedMs - createdMs) / 3_600_000);
      }
    }

    const act = activityByDay.get(day);
    if (act) {
      act.prsOpened += 1;
      if (pr.state === "MERGED") act.prsMerged += 1;
    }

    const wd = weekdayFromDayStr(day);
    if (weekday[wd]) weekday[wd]!.prsOpened += 1;

    const bMeta = dayBucketMap.get(day);
    const sb = bMeta ? seriesMap.get(bMeta.key) : undefined;
    if (sb) {
      sb.opened += 1;
      if (pr.state === "MERGED") sb.merged += 1;
    }

    const repoRow = ensureRepo(pr.repo);
    repoRow.opened += 1;
    if (pr.state === "MERGED") repoRow.merged += 1;
    else if (pr.state === "OPEN") repoRow.open += 1;
    else repoRow.closed += 1;
    repoRow.additions += pr.additions;
    repoRow.deletions += pr.deletions;

    recentOpened.push({
      number: pr.number,
      repo: pr.repo,
      title: pr.title,
      state: pr.state,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt ?? undefined,
      additions: pr.additions,
      deletions: pr.deletions,
    });
  }

  let approvalsTotal = 0;
  let changesRequestedTotal = 0;
  let commentsTotal = 0;
  let reviewsTotal = 0;
  const approvedPrKeys = new Set<string>();
  const reviewedPrKeys = new Set<string>();
  const recentReviewed: GitHubReviewSummary[] = [];

  for (const rev of raw.reviews) {
    if (targetRepo && rev.repo.toLowerCase() !== targetRepo) continue;
    const subMs = Date.parse(rev.submittedAt);
    if (!Number.isFinite(subMs)) continue;
    const day = formatDayInTz(subMs, dayFmt);
    if (day < fromDay || day > toDay) continue;

    reviewsTotal += 1;
    const prKey = `${rev.repo}#${rev.prNumber}`;
    reviewedPrKeys.add(prKey);

    const isApproval = rev.reviewState === "APPROVED";
    const isChangesReq = rev.reviewState === "CHANGES_REQUESTED";
    const isComment = rev.reviewState === "COMMENTED";

    if (isApproval) {
      approvalsTotal += 1;
      approvedPrKeys.add(prKey);
    } else if (isChangesReq) {
      changesRequestedTotal += 1;
    } else if (isComment) {
      commentsTotal += 1;
    }

    const act = activityByDay.get(day);
    if (act) {
      act.reviews += 1;
      if (isApproval) act.approvals += 1;
    }

    const wd = weekdayFromDayStr(day);
    if (weekday[wd] && isApproval) weekday[wd]!.approvals += 1;

    const bMeta = dayBucketMap.get(day);
    const sb = bMeta ? seriesMap.get(bMeta.key) : undefined;
    if (sb) {
      sb.reviews += 1;
      if (isApproval) sb.approvals += 1;
      else if (isChangesReq) sb.changesRequested += 1;
      else if (isComment) sb.comments += 1;
    }

    const repoRow = ensureRepo(rev.repo);
    repoRow.reviews += 1;
    if (isApproval) repoRow.approvals += 1;
    else if (isChangesReq) repoRow.changesRequested += 1;
    else if (isComment) repoRow.comments += 1;

    recentReviewed.push({
      number: rev.prNumber,
      repo: rev.repo,
      title: rev.prTitle,
      prState: rev.prState,
      reviewState: rev.reviewState,
      submittedAt: rev.submittedAt,
    });
  }

  recentOpened.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  recentReviewed.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));

  mergeHoursList.sort((a, b) => a - b);
  const medianMergeHours =
    mergeHoursList.length > 0
      ? mergeHoursList[Math.floor(mergeHoursList.length / 2)]
      : undefined;

  const finalizedPrs = mergedTotal + closedTotal;
  const mergeRatePct = finalizedPrs > 0 ? (mergedTotal / finalizedPrs) * 100 : openedTotal > 0 ? 0 : 0;

  const repos = [...repoMap.values()].sort(
    (a, b) => b.opened + b.approvals - (a.opened + a.approvals) || b.reviews - a.reviews,
  );

  return {
    status,
    message,
    login: raw.login,
    repoFilter,
    openedTotal,
    mergedTotal,
    openTotal,
    closedTotal,
    avgPrsPerDay: openedTotal / Math.max(1, daysCount),
    avgPrsPerWeekday: openedTotal / Math.max(1, weekdaysCount),
    avgPrsPerActivePrDay: activePrDays.size > 0 ? openedTotal / activePrDays.size : 0,
    mergeRatePct,
    medianMergeHours,
    additions,
    deletions,
    avgPrSize: openedTotal > 0 ? (additions + deletions) / openedTotal : 0,
    approvalsTotal,
    changesRequestedTotal,
    commentsTotal,
    reviewsTotal,
    uniquePrsApproved: approvedPrKeys.size,
    uniquePrsReviewed: reviewedPrKeys.size,
    avgApprovalsPerDay: approvalsTotal / Math.max(1, daysCount),
    avgApprovalsPerWeekday: approvalsTotal / Math.max(1, weekdaysCount),
    avgReviewsPerDay: reviewsTotal / Math.max(1, daysCount),
    approvalRatePct: reviewsTotal > 0 ? (approvalsTotal / reviewsTotal) * 100 : 0,
    series: buckets.map((b) => seriesMap.get(b.key)!),
    repos,
    recentOpened: recentOpened.slice(0, 12),
    recentReviewed: recentReviewed.slice(0, 12),
    efficiency: {
      costPerPr: openedTotal > 0 ? localTotals.cost / openedTotal : undefined,
      tokensPerPr: openedTotal > 0 ? localTotals.tokens / openedTotal : undefined,
      promptsPerPr: openedTotal > 0 ? localTotals.prompts / openedTotal : undefined,
      sessionsPerPr: openedTotal > 0 ? localTotals.sessions / openedTotal : undefined,
    },
  };
}
