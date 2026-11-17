import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  abbreviatePath,
  addDaysToDayStr,
  computeRangeBounds,
  createDayFormatter,
  createHourFormatter,
  enumerateDays,
  formatDayInTz,
  formatHourInTz,
  weekMondayOf,
  weekdayFromDayStr,
} from "./format.ts";
import type {
  ActivityDay,
  AgentUsageRow,
  DeepStatsPayload,
  DeepStatsQuery,
  HourlyBucket,
  ModelSeriesBucket,
  ModelUsageRow,
  ProjectUsageRow,
  StatsRangeKey,
  TimeSeriesBucket,
  ToolSeriesBucket,
  ToolUsageRow,
  TopSessionRow,
  WeekdayBucket,
} from "./types.ts";

const BUILTIN_TOOLS = new Set([
  "read",
  "edit",
  "write",
  "patch",
  "glob",
  "grep",
  "shell",
  "bash",
  "execute",
  "subagent",
  "task",
  "question",
  "skill",
  "todo",
  "todowrite",
  "todoread",
  "webfetch",
  "websearch",
  "image_generate",
  "experimental_image_generate",
  "artifact",
  "schedule",
  "list",
  "lsp",
]);

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const HIST_SCALE = 6; // 2^(b/6) => ~12.2% step width
const HIST_MAX_BUCKET = 126; // ~2.1M ms (~35 min)

function toHistBucket(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 1) return 0;
  return Math.min(HIST_MAX_BUCKET, Math.max(0, Math.floor(Math.log2(ms) * HIST_SCALE)));
}

function histBucketMidpointMs(bucket: number): number {
  if (bucket <= 0) return 1;
  return Math.pow(2, (bucket + 0.5) / HIST_SCALE);
}

type SparseHist = Array<[number, number]>;

function serializeHist(map: Map<number, number>): string {
  if (map.size === 0) return "[]";
  return JSON.stringify([...map.entries()].sort((a, b) => a[0] - b[0]));
}

function mergeSerializedHist(target: Map<number, number>, raw: string | null | undefined): void {
  if (!raw || raw === "[]") return;
  try {
    const entries = JSON.parse(raw) as SparseHist;
    for (const [b, c] of entries) {
      target.set(b, (target.get(b) ?? 0) + c);
    }
  } catch {
    // ignore corrupt histogram
  }
}

function quantileFromHist(hist: Map<number, number>, q: number): number | undefined {
  let total = 0;
  for (const count of hist.values()) total += count;
  if (total === 0) return undefined;
  const target = Math.max(1, Math.ceil(total * q));
  const sorted = [...hist.entries()].sort((a, b) => a[0] - b[0]);
  let acc = 0;
  for (const [bucket, count] of sorted) {
    acc += count;
    if (acc >= target) {
      return histBucketMidpointMs(bucket);
    }
  }
  return undefined;
}

export type DbPaths = {
  opencodeDbPath: string;
  cacheDbPath: string;
};

let cachedOpencodeDbPath: string | undefined;

export function resolveDefaultOpencodeDbPath(): string {
  if (cachedOpencodeDbPath) return cachedOpencodeDbPath;
  const envDb = process.env.OPENCODE_DB;
  const dataHome = process.env.XDG_DATA_HOME || join(process.env.HOME || "", ".local", "share");
  if (envDb && envDb !== ":memory:") {
    cachedOpencodeDbPath = envDb.startsWith("/") ? envDb : join(dataHome, "opencode", envDb);
    return cachedOpencodeDbPath;
  }
  try {
    const proc = Bun.spawnSync(["opencode", "debug", "paths", "db"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode === 0) {
      const out = proc.stdout.toString().trim();
      if (out && out !== ":memory:") {
        cachedOpencodeDbPath = out;
        return out;
      }
    }
  } catch {
    // fall back to standard XDG location
  }
  cachedOpencodeDbPath = join(dataHome, "opencode", "opencode.db");
  return cachedOpencodeDbPath;
}

export function resolveDefaultCacheDbPath(): string {
  const cacheHome = process.env.XDG_CACHE_HOME || join(process.env.HOME || "", ".cache");
  return join(cacheHome, "opencode", "deep-stats-rollup.v1.db");
}

function initCacheSchema(cache: Database): void {
  cache.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hour_status (
      hour_id INTEGER PRIMARY KEY,
      row_count INTEGER NOT NULL,
      max_updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agg_model (
      hour_id INTEGER NOT NULL,
      project_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      agent TEXT NOT NULL,
      finish TEXT NOT NULL,
      steps INTEGER NOT NULL,
      inp INTEGER NOT NULL,
      outp INTEGER NOT NULL,
      reas INTEGER NOT NULL,
      cache_read INTEGER NOT NULL,
      cache_write INTEGER NOT NULL,
      cost REAL NOT NULL,
      dur_sum REAL NOT NULL,
      dur_cnt INTEGER NOT NULL,
      ttft_sum REAL NOT NULL,
      ttft_cnt INTEGER NOT NULL,
      stream_tok INTEGER NOT NULL,
      stream_ms_sum REAL NOT NULL,
      ttft_hist TEXT NOT NULL,
      PRIMARY KEY (hour_id, project_id, provider_id, model_id, variant, agent, finish)
    );
    CREATE INDEX IF NOT EXISTS agg_model_hour_idx ON agg_model (hour_id);
    CREATE TABLE IF NOT EXISTS agg_user (
      hour_id INTEGER NOT NULL,
      project_id TEXT NOT NULL,
      is_subagent INTEGER NOT NULL,
      prompts INTEGER NOT NULL,
      prompt_chars INTEGER NOT NULL,
      PRIMARY KEY (hour_id, project_id, is_subagent)
    );
    CREATE INDEX IF NOT EXISTS agg_user_hour_idx ON agg_user (hour_id);
    CREATE TABLE IF NOT EXISTS agg_tool (
      hour_id INTEGER NOT NULL,
      project_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      calls INTEGER NOT NULL,
      succeeded INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      unfinished INTEGER NOT NULL,
      dur_sum REAL NOT NULL,
      dur_cnt INTEGER NOT NULL,
      dur_hist TEXT NOT NULL,
      PRIMARY KEY (hour_id, project_id, tool_name)
    );
    CREATE INDEX IF NOT EXISTS agg_tool_hour_idx ON agg_tool (hour_id);
  `);
}

type MsgExtractRow = {
  id: string;
  session_id: string;
  type: string;
  time_created: number;
  time_updated: number;
  project_id: string | null;
  parent_id: string | null;
  agent: string | null;
  provider_id: string | null;
  model_id: string | null;
  variant: string | null;
  finish: string | null;
  cost: number | null;
  t_in: number | null;
  t_out: number | null;
  t_reas: number | null;
  t_cr: number | null;
  t_cw: number | null;
  mt_created: number | null;
  mt_first: number | null;
  mt_comp: number | null;
  user_len: number | null;
};

type ToolExtractRow = {
  time_created: number;
  project_id: string | null;
  tool_name: string | null;
  status: string | null;
  tt_created: number | null;
  tt_ran: number | null;
  tt_comp: number | null;
};

type HourMetaRow = {
  h: number;
  cnt: number;
  max_u: number;
};

export class DeepStatsStore {
  private readonly opencodeDbPath: string;
  private readonly cacheDbPath: string;
  private cacheDb: Database | undefined;
  private backfillRunning = false;
  private backfillPromise: Promise<void> | undefined;
  private onBackfillProgress?: () => void;

  constructor(options?: Partial<DbPaths> & { onBackfillProgress?: () => void }) {
    this.opencodeDbPath = options?.opencodeDbPath ?? resolveDefaultOpencodeDbPath();
    this.cacheDbPath = options?.cacheDbPath ?? resolveDefaultCacheDbPath();
    this.onBackfillProgress = options?.onBackfillProgress;
  }

  private openSource(): Database {
    return new Database(this.opencodeDbPath, { readonly: true });
  }

  private getCache(): Database {
    if (this.cacheDb) return this.cacheDb;
    if (this.cacheDbPath !== ":memory:") {
      mkdirSync(dirname(this.cacheDbPath), { recursive: true });
    }
    this.cacheDb = new Database(this.cacheDbPath);
    initCacheSchema(this.cacheDb);
    return this.cacheDb;
  }

  close(): void {
    if (this.cacheDb) {
      this.cacheDb.close();
      this.cacheDb = undefined;
    }
  }

  private scanHoursIntoCache(source: Database, cache: Database, fromMs: number, toMs: number): void {
    const startHour = Math.floor(fromMs / 3_600_000);
    const endHour = Math.floor(toMs / 3_600_000);
    const rangeStartMs = startHour * 3_600_000;
    const rangeEndMs = (endHour + 1) * 3_600_000;

    const hourMetaRows = source
      .query(
        `SELECT CAST(time_created / 3600000 AS INTEGER) as h, COUNT(*) as cnt, MAX(time_updated) as max_u
         FROM session_message
         WHERE time_created >= ? AND time_created < ?
         GROUP BY h`,
      )
      .all(rangeStartMs, rangeEndMs) as HourMetaRow[];

    const msgRows = source
      .query(
        `SELECT
          m.id, m.session_id, m.type, m.time_created, m.time_updated,
          s.project_id, s.parent_id,
          json_extract(m.data, '$.agent') as agent,
          json_extract(m.data, '$.model.providerID') as provider_id,
          json_extract(m.data, '$.model.id') as model_id,
          json_extract(m.data, '$.model.variant') as variant,
          json_extract(m.data, '$.finish') as finish,
          json_extract(m.data, '$.cost') as cost,
          json_extract(m.data, '$.tokens.input') as t_in,
          json_extract(m.data, '$.tokens.output') as t_out,
          json_extract(m.data, '$.tokens.reasoning') as t_reas,
          json_extract(m.data, '$.tokens.cache.read') as t_cr,
          json_extract(m.data, '$.tokens.cache.write') as t_cw,
          json_extract(m.data, '$.time.created') as mt_created,
          json_extract(m.data, '$.time.firstToken') as mt_first,
          json_extract(m.data, '$.time.completed') as mt_comp,
          CASE WHEN m.type = 'user' THEN length(COALESCE(json_extract(m.data, '$.text'), '')) ELSE 0 END as user_len
         FROM session_message m
         LEFT JOIN session_v2 s ON s.id = m.session_id
         WHERE m.time_created >= ? AND m.time_created < ? AND m.type IN ('assistant', 'user')`,
      )
      .all(rangeStartMs, rangeEndMs) as MsgExtractRow[];

    const toolRows = source
      .query(
        `SELECT
          m.time_created,
          s.project_id,
          json_extract(j.value, '$.name') as tool_name,
          json_extract(j.value, '$.state.status') as status,
          json_extract(j.value, '$.time.created') as tt_created,
          json_extract(j.value, '$.time.ran') as tt_ran,
          json_extract(j.value, '$.time.completed') as tt_comp
         FROM session_message m
         LEFT JOIN session_v2 s ON s.id = m.session_id
         JOIN json_each(m.data, '$.content') j
         WHERE m.time_created >= ? AND m.time_created < ?
           AND m.type = 'assistant'
           AND json_extract(j.value, '$.type') = 'tool'`,
      )
      .all(rangeStartMs, rangeEndMs) as ToolExtractRow[];

    type ModelAcc = {
      hour_id: number;
      project_id: string;
      provider_id: string;
      model_id: string;
      variant: string;
      agent: string;
      finish: string;
      steps: number;
      inp: number;
      outp: number;
      reas: number;
      cache_read: number;
      cache_write: number;
      cost: number;
      dur_sum: number;
      dur_cnt: number;
      ttft_sum: number;
      ttft_cnt: number;
      stream_tok: number;
      stream_ms_sum: number;
      ttft_hist: Map<number, number>;
    };

    type UserAcc = {
      hour_id: number;
      project_id: string;
      is_subagent: number;
      prompts: number;
      prompt_chars: number;
    };

    type ToolAcc = {
      hour_id: number;
      project_id: string;
      tool_name: string;
      calls: number;
      succeeded: number;
      failed: number;
      unfinished: number;
      dur_sum: number;
      dur_cnt: number;
      dur_hist: Map<number, number>;
    };

    const modelMap = new Map<string, ModelAcc>();
    const userMap = new Map<string, UserAcc>();
    const toolMap = new Map<string, ToolAcc>();

    for (const row of msgRows) {
      const hourId = Math.floor(row.time_created / 3_600_000);
      const projectId = row.project_id || "global";

      if (row.type === "user") {
        const isSub = row.parent_id ? 1 : 0;
        const uKey = `${hourId}|${projectId}|${isSub}`;
        let acc = userMap.get(uKey);
        if (!acc) {
          acc = { hour_id: hourId, project_id: projectId, is_subagent: isSub, prompts: 0, prompt_chars: 0 };
          userMap.set(uKey, acc);
        }
        acc.prompts += 1;
        acc.prompt_chars += Number(row.user_len ?? 0);
        continue;
      }

      const providerId = row.provider_id || "unknown";
      const modelId = row.model_id || "unknown";
      const variant = row.variant || "";
      const agent = row.agent || "unknown";
      const finish = row.finish || "unknown";

      const mKey = `${hourId}|${projectId}|${providerId}|${modelId}|${variant}|${agent}|${finish}`;
      let acc = modelMap.get(mKey);
      if (!acc) {
        acc = {
          hour_id: hourId,
          project_id: projectId,
          provider_id: providerId,
          model_id: modelId,
          variant,
          agent,
          finish,
          steps: 0,
          inp: 0,
          outp: 0,
          reas: 0,
          cache_read: 0,
          cache_write: 0,
          cost: 0,
          dur_sum: 0,
          dur_cnt: 0,
          ttft_sum: 0,
          ttft_cnt: 0,
          stream_tok: 0,
          stream_ms_sum: 0,
          ttft_hist: new Map(),
        };
        modelMap.set(mKey, acc);
      }

      acc.steps += 1;
      const inp = Number(row.t_in ?? 0);
      const outp = Number(row.t_out ?? 0);
      const reas = Number(row.t_reas ?? 0);
      const cr = Number(row.t_cr ?? 0);
      const cw = Number(row.t_cw ?? 0);
      acc.inp += inp;
      acc.outp += outp;
      acc.reas += reas;
      acc.cache_read += cr;
      acc.cache_write += cw;
      acc.cost += Number(row.cost ?? 0);

      const tCreated = row.mt_created ?? row.time_created;
      if (row.mt_comp && row.mt_comp >= tCreated) {
        const dur = row.mt_comp - tCreated;
        if (dur >= 0 && dur < 3_600_000) {
          acc.dur_sum += dur;
          acc.dur_cnt += 1;
        }
      }
      if (row.mt_first && row.mt_first >= tCreated) {
        const ttft = row.mt_first - tCreated;
        if (ttft >= 0 && ttft < 600_000) {
          acc.ttft_sum += ttft;
          acc.ttft_cnt += 1;
          const b = toHistBucket(ttft);
          acc.ttft_hist.set(b, (acc.ttft_hist.get(b) ?? 0) + 1);
        }
        if (row.mt_comp && row.mt_comp > row.mt_first && outp + reas > 0) {
          const streamDur = row.mt_comp - row.mt_first;
          if (streamDur > 0 && streamDur < 3_600_000) {
            acc.stream_tok += outp + reas;
            acc.stream_ms_sum += streamDur;
          }
        }
      }
    }

    for (const row of toolRows) {
      const hourId = Math.floor(row.time_created / 3_600_000);
      const projectId = row.project_id || "global";
      const toolName = (row.tool_name || "unknown").trim() || "unknown";
      const tKey = `${hourId}|${projectId}|${toolName}`;
      let acc = toolMap.get(tKey);
      if (!acc) {
        acc = {
          hour_id: hourId,
          project_id: projectId,
          tool_name: toolName,
          calls: 0,
          succeeded: 0,
          failed: 0,
          unfinished: 0,
          dur_sum: 0,
          dur_cnt: 0,
          dur_hist: new Map(),
        };
        toolMap.set(tKey, acc);
      }
      acc.calls += 1;
      if (row.status === "completed") acc.succeeded += 1;
      else if (row.status === "error") acc.failed += 1;
      else acc.unfinished += 1;

      const tStart = row.tt_ran ?? row.tt_created;
      if (tStart && row.tt_comp && row.tt_comp >= tStart) {
        const dur = row.tt_comp - tStart;
        if (dur >= 0 && dur < 3_600_000) {
          acc.dur_sum += dur;
          acc.dur_cnt += 1;
          const b = toHistBucket(dur);
          acc.dur_hist.set(b, (acc.dur_hist.get(b) ?? 0) + 1);
        }
      }
    }

    const delModel = cache.query("DELETE FROM agg_model WHERE hour_id >= ? AND hour_id <= ?");
    const delUser = cache.query("DELETE FROM agg_user WHERE hour_id >= ? AND hour_id <= ?");
    const delTool = cache.query("DELETE FROM agg_tool WHERE hour_id >= ? AND hour_id <= ?");
    const delHour = cache.query("DELETE FROM hour_status WHERE hour_id >= ? AND hour_id <= ?");
    const insHour = cache.query("INSERT OR REPLACE INTO hour_status (hour_id, row_count, max_updated) VALUES (?, ?, ?)");
    const insModel = cache.query(`
      INSERT INTO agg_model (
        hour_id, project_id, provider_id, model_id, variant, agent, finish,
        steps, inp, outp, reas, cache_read, cache_write, cost,
        dur_sum, dur_cnt, ttft_sum, ttft_cnt, stream_tok, stream_ms_sum, ttft_hist
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insUser = cache.query(`
      INSERT INTO agg_user (hour_id, project_id, is_subagent, prompts, prompt_chars)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insTool = cache.query(`
      INSERT INTO agg_tool (
        hour_id, project_id, tool_name, calls, succeeded, failed, unfinished, dur_sum, dur_cnt, dur_hist
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const metaByHour = new Map<number, HourMetaRow>(hourMetaRows.map((r) => [r.h, r]));

    const tx = cache.transaction(() => {
      delModel.run(startHour, endHour);
      delUser.run(startHour, endHour);
      delTool.run(startHour, endHour);
      delHour.run(startHour, endHour);

      for (let h = startHour; h <= endHour; h += 1) {
        const meta = metaByHour.get(h);
        insHour.run(h, meta?.cnt ?? 0, meta?.max_u ?? 0);
      }
      for (const acc of modelMap.values()) {
        insModel.run(
          acc.hour_id,
          acc.project_id,
          acc.provider_id,
          acc.model_id,
          acc.variant,
          acc.agent,
          acc.finish,
          acc.steps,
          acc.inp,
          acc.outp,
          acc.reas,
          acc.cache_read,
          acc.cache_write,
          acc.cost,
          acc.dur_sum,
          acc.dur_cnt,
          acc.ttft_sum,
          acc.ttft_cnt,
          acc.stream_tok,
          acc.stream_ms_sum,
          serializeHist(acc.ttft_hist),
        );
      }
      for (const acc of userMap.values()) {
        insUser.run(acc.hour_id, acc.project_id, acc.is_subagent, acc.prompts, acc.prompt_chars);
      }
      for (const acc of toolMap.values()) {
        insTool.run(
          acc.hour_id,
          acc.project_id,
          acc.tool_name,
          acc.calls,
          acc.succeeded,
          acc.failed,
          acc.unfinished,
          acc.dur_sum,
          acc.dur_cnt,
          serializeHist(acc.dur_hist),
        );
      }
    });
    tx();
  }

  private syncRecentAndNeeded(
    source: Database,
    cache: Database,
    reqFromMs: number,
    reqToMs: number,
    forceRefresh: boolean,
  ): { historyComplete: boolean; cachedHours: number; totalHours: number } {
    const bounds = source
      .query("SELECT MIN(time_created) as min_t, MAX(time_created) as max_t FROM session_message")
      .get() as { min_t: number | null; max_t: number | null };

    if (!bounds.min_t || !bounds.max_t) {
      return { historyComplete: true, cachedHours: 0, totalHours: 0 };
    }

    const nowMs = Date.now();
    const recentWindowMs = 48 * 3_600_000;
    const recentCutoffHour = Math.floor((nowMs - recentWindowMs) / 3_600_000);
    const recentCutoffMs = recentCutoffHour * 3_600_000;

    if (forceRefresh) {
      cache.exec("DELETE FROM hour_status; DELETE FROM agg_model; DELETE FROM agg_user; DELETE FROM agg_tool; DELETE FROM meta;");
    }

    // 1. Check recent 48h hours quickly (~28ms) and re-scan only changed hours
    const recentMeta = source
      .query(
        `SELECT CAST(time_created / 3600000 AS INTEGER) as h, COUNT(*) as cnt, MAX(time_updated) as max_u
         FROM session_message
         WHERE time_created >= ?
         GROUP BY h`,
      )
      .all(recentCutoffMs) as HourMetaRow[];

    const currentHour = Math.floor(Math.max(nowMs, bounds.max_t) / 3_600_000);
    const existingRecent = new Map<number, { row_count: number; max_updated: number }>(
      (
        cache
          .query("SELECT hour_id, row_count, max_updated FROM hour_status WHERE hour_id >= ?")
          .all(recentCutoffHour) as Array<{ hour_id: number; row_count: number; max_updated: number }>
      ).map((r) => [r.hour_id, { row_count: r.row_count, max_updated: r.max_updated }]),
    );

    const recentByHour = new Map<number, HourMetaRow>(recentMeta.map((r) => [r.h, r]));
    const dirtyRecentHours: number[] = [];
    for (let h = recentCutoffHour; h <= currentHour; h += 1) {
      const src = recentByHour.get(h);
      const cached = existingRecent.get(h);
      const srcCnt = src?.cnt ?? 0;
      const srcMaxU = src?.max_u ?? 0;
      if (!cached || cached.row_count !== srcCnt || cached.max_updated !== srcMaxU) {
        dirtyRecentHours.push(h);
      }
    }

    if (dirtyRecentHours.length > 0) {
      // Group contiguous hours into spans
      let spanStart = dirtyRecentHours[0]!;
      let spanPrev = spanStart;
      for (let i = 1; i <= dirtyRecentHours.length; i += 1) {
        const cur = dirtyRecentHours[i];
        if (cur !== undefined && cur === spanPrev + 1) {
          spanPrev = cur;
          continue;
        }
        this.scanHoursIntoCache(source, cache, spanStart * 3_600_000, spanPrev * 3_600_000);
        if (cur !== undefined) {
          spanStart = cur;
          spanPrev = cur;
        }
      }
    }

    // 2. Check requested historical window (ensure immediate coverage for up to 35 days synchronously)
    const minHour = Math.floor(bounds.min_t / 3_600_000);
    const maxHour = currentHour;
    const totalHours = Math.max(0, maxHour - minHour + 1);

    const syncCapFromMs = Math.max(bounds.min_t, nowMs - 35 * 86_400_000, reqFromMs);
    const syncStartHour = Math.max(minHour, Math.floor(syncCapFromMs / 3_600_000));
    const syncEndHour = Math.min(maxHour, Math.floor(reqToMs / 3_600_000));

    this.fillMissingHourRange(source, cache, syncStartHour, syncEndHour);

    // Count how many hours in [reqFromHour, maxHour] are cached
    const reqStartHour = Math.max(minHour, Math.floor(reqFromMs / 3_600_000));
    const cachedReqCountRow = cache
      .query("SELECT COUNT(*) as n FROM hour_status WHERE hour_id >= ? AND hour_id <= ?")
      .get(reqStartHour, maxHour) as { n: number };
    const neededReqHours = Math.max(0, maxHour - reqStartHour + 1);
    const historyComplete = cachedReqCountRow.n >= neededReqHours;

    if (!historyComplete && !this.backfillRunning) {
      this.startBackgroundBackfill(minHour, maxHour);
    }

    const totalCachedRow = cache
      .query("SELECT COUNT(*) as n FROM hour_status WHERE hour_id >= ? AND hour_id <= ?")
      .get(minHour, maxHour) as { n: number };

    return {
      historyComplete,
      cachedHours: Math.min(totalHours, totalCachedRow.n),
      totalHours,
    };
  }

  private fillMissingHourRange(source: Database, cache: Database, startHour: number, endHour: number): void {
    if (endHour < startHour) return;
    const presentRows = cache
      .query("SELECT hour_id FROM hour_status WHERE hour_id >= ? AND hour_id <= ?")
      .all(startHour, endHour) as Array<{ hour_id: number }>;
    const present = new Set(presentRows.map((r) => r.hour_id));

    const missing: number[] = [];
    for (let h = startHour; h <= endHour; h += 1) {
      if (!present.has(h)) missing.push(h);
    }
    if (missing.length === 0) return;

    // Scan in chunks of at most 168 hours (7 days)
    const maxSpan = 168;
    let i = 0;
    while (i < missing.length) {
      const chunkStart = missing[i]!;
      let chunkEnd = chunkStart;
      while (
        i + 1 < missing.length &&
        missing[i + 1]! === chunkEnd + 1 &&
        chunkEnd - chunkStart + 1 < maxSpan
      ) {
        i += 1;
        chunkEnd = missing[i]!;
      }
      this.scanHoursIntoCache(source, cache, chunkStart * 3_600_000, chunkEnd * 3_600_000);
      i += 1;
    }
  }

  startBackgroundBackfill(minHour?: number, maxHour?: number): Promise<void> {
    if (this.backfillPromise) return this.backfillPromise;
    if (!existsSync(this.opencodeDbPath)) return Promise.resolve();

    this.backfillRunning = true;
    this.backfillPromise = (async () => {
      try {
        const source = this.openSource();
        const cache = this.getCache();
        try {
          let lo = minHour;
          let hi = maxHour;
          if (lo === undefined || hi === undefined) {
            const bounds = source
              .query("SELECT MIN(time_created) as min_t, MAX(time_created) as max_t FROM session_message")
              .get() as { min_t: number | null; max_t: number | null };
            if (!bounds.min_t || !bounds.max_t) return;
            lo = Math.floor(bounds.min_t / 3_600_000);
            hi = Math.floor(bounds.max_t / 3_600_000);
          }

          const present = new Set(
            (
              cache
                .query("SELECT hour_id FROM hour_status WHERE hour_id >= ? AND hour_id <= ?")
                .all(lo, hi) as Array<{ hour_id: number }>
            ).map((r) => r.hour_id),
          );

          // Walk backwards from hi -> lo in 7-day (168h) chunks
          let cursor = hi;
          while (cursor >= lo) {
            const chunkStart = Math.max(lo, cursor - 167);
            let anyMissing = false;
            for (let h = chunkStart; h <= cursor; h += 1) {
              if (!present.has(h)) {
                anyMissing = true;
                break;
              }
            }
            if (anyMissing) {
              this.fillMissingHourRange(source, cache, chunkStart, cursor);
              this.onBackfillProgress?.();
              await Bun.sleep(5);
            }
            cursor = chunkStart - 1;
          }
        } finally {
          source.close();
        }
      } catch {
        // non-fatal background warmup
      } finally {
        this.backfillRunning = false;
        this.backfillPromise = undefined;
      }
    })();

    return this.backfillPromise;
  }

  getEarliestDay(timezone: string): string | undefined {
    if (!existsSync(this.opencodeDbPath)) return undefined;
    const source = this.openSource();
    try {
      const row = source
        .query("SELECT MIN(time_created) as min_t FROM session_v2")
        .get() as { min_t: number | null };
      if (!row?.min_t) return undefined;
      return formatDayInTz(row.min_t, createDayFormatter(timezone));
    } finally {
      source.close();
    }
  }

  queryLocalStats(query: DeepStatsQuery): Omit<DeepStatsPayload, "github"> & {
    dayBucketMap: Map<string, { key: string; label: string; startDate: string; endDate: string; days: number }>;
    allDays: string[];
  } {
    const nowMs = Date.now();
    const earliestDay = query.range === "all" ? this.getEarliestDay(query.timezone) : undefined;
    const { from, to, fromDay, toDay } = computeRangeBounds(query.range, nowMs, query.timezone, earliestDay);
    const allDays = enumerateDays(fromDay, toDay);
    const daysCount = Math.max(1, allDays.length);
    const weekdaysCount = Math.max(
      1,
      allDays.filter((d) => weekdayFromDayStr(d) < 5).length,
    );
    const bucketGranularity: "day" | "week" = daysCount <= 45 ? "day" : "week";

    const dayFmt = createDayFormatter(query.timezone);
    const hourFmt = createHourFormatter(query.timezone);

    // Map each day to its series bucket key/label
    const dayBucketMap = new Map<
      string,
      { key: string; label: string; startDate: string; endDate: string; days: number }
    >();
    const orderedBuckets: Array<{ key: string; label: string; startDate: string; endDate: string; days: number }> = [];
    const bucketSeen = new Map<string, { key: string; label: string; startDate: string; endDate: string; days: number }>();

    for (const day of allDays) {
      if (bucketGranularity === "day") {
        const b = {
          key: day,
          label: day.slice(5), // MM-DD
          startDate: day,
          endDate: day,
          days: 1,
        };
        dayBucketMap.set(day, b);
        orderedBuckets.push(b);
      } else {
        const mon = weekMondayOf(day);
        let b = bucketSeen.get(mon);
        if (!b) {
          b = {
            key: mon,
            label: mon.slice(5), // MM-DD (week start)
            startDate: day,
            endDate: day,
            days: 0,
          };
          bucketSeen.set(mon, b);
          orderedBuckets.push(b);
        }
        b.endDate = day;
        b.days += 1;
        dayBucketMap.set(day, b);
      }
    }

    const emptyResult = () => ({
      meta: {
        range: query.range,
        from,
        to,
        daysCount,
        weekdaysCount,
        timezone: query.timezone,
        projectID: query.projectID,
        projectLabel: query.projectID ? query.projectID : "all projects",
        generatedAt: nowMs,
        bucketGranularity,
        historyStatus: "complete" as const,
        cachedHours: 0,
        totalHours: 0,
        dbAvailable: false,
        dbError: `Database not found at ${this.opencodeDbPath}`,
      },
      summary: {
        sessions: 0,
        subagents: 0,
        prompts: 0,
        subagentPrompts: 0,
        steps: 0,
        activeDays: 0,
        currentStreak: 0,
        bestStreak: 0,
        cost: 0,
        costPerDay: 0,
        costPerActiveDay: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        tokensPerDay: 0,
        tokensPerActiveDay: 0,
        cacheHitPct: 0,
        codeDiff: { additions: 0, deletions: 0, files: 0 },
        tools: { calls: 0, succeeded: 0, failed: 0, unfinished: 0 },
      },
      activity: allDays.map((date) => ({
        date,
        steps: 0,
        prompts: 0,
        subagentPrompts: 0,
        sessions: 0,
        subagents: 0,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cost: 0,
        prsOpened: 0,
        prsMerged: 0,
        approvals: 0,
        reviews: 0,
      })),
      tokenSeries: orderedBuckets.map((b) => ({
        ...b,
        input: 0,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
        cost: 0,
        cacheHitPct: 0,
        steps: 0,
        prompts: 0,
      })),
      modelSeries: {
        topModels: [],
        buckets: orderedBuckets.map((b) => ({
          key: b.key,
          label: b.label,
          totalCost: 0,
          totalTokens: 0,
          totalSteps: 0,
          byModel: {},
        })),
      },
      models: [],
      toolSeries: {
        topTools: [],
        buckets: orderedBuckets.map((b) => ({
          key: b.key,
          label: b.label,
          totalCalls: 0,
          succeeded: 0,
          failed: 0,
          unfinished: 0,
          errorPct: 0,
          byTool: {},
        })),
      },
      agents: [],
      tools: [],
      hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, prompts: 0, steps: 0, tokens: 0, cost: 0 })),
      weekday: WEEKDAY_LABELS.map((label, weekday) => ({
        weekday,
        label,
        prompts: 0,
        steps: 0,
        tokens: 0,
        cost: 0,
        prsOpened: 0,
        approvals: 0,
      })),
      projects: [],
      topSessions: [],
      outcomes: {
        finishes: {},
        sessionOutcomes: {},
        parentsWithSubagents: 0,
        avgSubagentsPerParent: 0,
        avgStepsPerPrompt: 0,
        avgSessionDurationMs: 0,
      },
      dayBucketMap,
      allDays,
    });

    if (!existsSync(this.opencodeDbPath)) {
      return emptyResult();
    }

    const source = this.openSource();
    const cache = this.getCache();

    try {
      const syncInfo = this.syncRecentAndNeeded(source, cache, from, to, Boolean(query.refresh));

      // Load project metadata
      const projectRows = source
        .query("SELECT id, worktree, name FROM project")
        .all() as Array<{ id: string; worktree: string; name: string | null }>;
      const projectById = new Map<string, { id: string; worktree: string; name: string }>();
      for (const p of projectRows) {
        const fallbackName = p.worktree === "/" ? "global" : p.worktree.split("/").filter(Boolean).pop() || p.id;
        projectById.set(p.id, {
          id: p.id,
          worktree: p.worktree,
          name: p.name || fallbackName,
        });
      }

      const projectLabel = query.projectID
        ? projectById.get(query.projectID)?.name ?? query.projectID
        : "all projects";

      // Query sessions directly from session_v2 (fast: ~35ms)
      const sessionRows = source
        .query(
          `SELECT id, project_id, parent_id, title, summary_additions, summary_deletions, summary_files,
                  cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
                  time_created, time_updated, time_idle, idle_outcome
           FROM session_v2
           WHERE time_created >= ? AND time_created <= ?
             ${query.projectID ? "AND project_id = ?" : ""}`,
        )
        .all(...(query.projectID ? [from, to, query.projectID] : [from, to])) as Array<{
        id: string;
        project_id: string;
        parent_id: string | null;
        title: string | null;
        summary_additions: number | null;
        summary_deletions: number | null;
        summary_files: number | null;
        cost: number;
        tokens_input: number;
        tokens_output: number;
        tokens_reasoning: number;
        tokens_cache_read: number;
        tokens_cache_write: number;
        time_created: number;
        time_updated: number;
        time_idle: number | null;
        idle_outcome: string | null;
      }>;

      const activityByDay = new Map<string, ActivityDay>();
      for (const date of allDays) {
        activityByDay.set(date, {
          date,
          steps: 0,
          prompts: 0,
          subagentPrompts: 0,
          sessions: 0,
          subagents: 0,
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cost: 0,
          prsOpened: 0,
          prsMerged: 0,
          approvals: 0,
          reviews: 0,
        });
      }

      let rootSessions = 0;
      let subagentSessions = 0;
      let diffAdditions = 0;
      let diffDeletions = 0;
      let diffFiles = 0;
      let durationSum = 0;
      let durationCount = 0;
      const sessionOutcomes: Record<string, number> = {};
      const childrenPerParent = new Map<string, number>();

      const projectAgg = new Map<
        string,
        {
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
        }
      >();

      const ensureProjectAgg = (pid: string) => {
        let p = projectAgg.get(pid);
        if (!p) {
          const meta = projectById.get(pid);
          p = {
            id: pid,
            name: meta?.name ?? pid,
            worktree: meta ? abbreviatePath(meta.worktree) : pid,
            sessions: 0,
            subagents: 0,
            prompts: 0,
            steps: 0,
            tokens: 0,
            cost: 0,
            additions: 0,
            deletions: 0,
          };
          projectAgg.set(pid, p);
        }
        return p;
      };

      const sessionCostEntries: Array<{
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
      }> = [];

      for (const s of sessionRows) {
        const day = formatDayInTz(s.time_created, dayFmt);
        if (day < fromDay || day > toDay) continue;

        const act = activityByDay.get(day);
        if (s.parent_id) {
          subagentSessions += 1;
          if (act) act.subagents += 1;
          childrenPerParent.set(s.parent_id, (childrenPerParent.get(s.parent_id) ?? 0) + 1);
        } else {
          rootSessions += 1;
          if (act) act.sessions += 1;
        }

        const adds = Number(s.summary_additions ?? 0);
        const dels = Number(s.summary_deletions ?? 0);
        const files = Number(s.summary_files ?? 0);
        diffAdditions += adds;
        diffDeletions += dels;
        diffFiles += files;

        const outcome = s.idle_outcome || "active/unknown";
        sessionOutcomes[outcome] = (sessionOutcomes[outcome] ?? 0) + 1;

        const endT = s.time_idle ?? s.time_updated;
        const durMs = Math.max(0, endT - s.time_created);
        if (!s.parent_id && durMs > 0 && durMs < 14 * 86_400_000) {
          durationSum += durMs;
          durationCount += 1;
        }

        const pAgg = ensureProjectAgg(s.project_id || "global");
        if (s.parent_id) pAgg.subagents += 1;
        else pAgg.sessions += 1;
        pAgg.additions += adds;
        pAgg.deletions += dels;

        if (!s.parent_id) {
          const sTok =
            Number(s.tokens_input) +
            Number(s.tokens_output) +
            Number(s.tokens_reasoning) +
            Number(s.tokens_cache_read) +
            Number(s.tokens_cache_write);
          sessionCostEntries.push({
            id: s.id,
            title: (s.title || "(untitled)").trim() || "(untitled)",
            projectName: pAgg.name,
            createdAt: s.time_created,
            durationMs: durMs,
            steps: 0,
            subagents: 0,
            tokens: sTok,
            cost: Number(s.cost ?? 0),
            additions: adds,
            deletions: dels,
          });
        }
      }

      for (const entry of sessionCostEntries) {
        entry.subagents = childrenPerParent.get(entry.id) ?? 0;
      }

      sessionCostEntries.sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
      const topSessions = sessionCostEntries.slice(0, 12);

      // Enrich topSessions with exact step counts from session_message
      if (topSessions.length > 0) {
        const placeholders = topSessions.map(() => "?").join(",");
        const stepRows = source
          .query(
            `SELECT session_id, COUNT(*) as steps
             FROM session_message
             WHERE type = 'assistant' AND session_id IN (${placeholders})
             GROUP BY session_id`,
          )
          .all(...topSessions.map((t) => t.id)) as Array<{ session_id: string; steps: number }>;
        const stepMap = new Map(stepRows.map((r) => [r.session_id, r.steps]));
        for (const t of topSessions) {
          t.steps = stepMap.get(t.id) ?? 0;
        }
      }

      // Query cached hourly rollups
      const fromHour = Math.floor(from / 3_600_000);
      const toHour = Math.floor(to / 3_600_000);
      const projFilterSql = query.projectID ? "AND project_id = ?" : "";
      const projParams = query.projectID ? [fromHour, toHour, query.projectID] : [fromHour, toHour];

      const modelRollups = cache
        .query(`SELECT * FROM agg_model WHERE hour_id >= ? AND hour_id <= ? ${projFilterSql}`)
        .all(...projParams) as Array<{
        hour_id: number;
        project_id: string;
        provider_id: string;
        model_id: string;
        variant: string;
        agent: string;
        finish: string;
        steps: number;
        inp: number;
        outp: number;
        reas: number;
        cache_read: number;
        cache_write: number;
        cost: number;
        dur_sum: number;
        dur_cnt: number;
        ttft_sum: number;
        ttft_cnt: number;
        stream_tok: number;
        stream_ms_sum: number;
        ttft_hist: string;
      }>;

      const userRollups = cache
        .query(`SELECT * FROM agg_user WHERE hour_id >= ? AND hour_id <= ? ${projFilterSql}`)
        .all(...projParams) as Array<{
        hour_id: number;
        project_id: string;
        is_subagent: number;
        prompts: number;
        prompt_chars: number;
      }>;

      const toolRollups = cache
        .query(`SELECT * FROM agg_tool WHERE hour_id >= ? AND hour_id <= ? ${projFilterSql}`)
        .all(...projParams) as Array<{
        hour_id: number;
        project_id: string;
        tool_name: string;
        calls: number;
        succeeded: number;
        failed: number;
        unfinished: number;
        dur_sum: number;
        dur_cnt: number;
        dur_hist: string;
      }>;

      const tokenSeriesMap = new Map<string, TimeSeriesBucket>();
      const modelSeriesMap = new Map<string, ModelSeriesBucket>();
      const toolSeriesMap = new Map<string, ToolSeriesBucket>();
      for (const b of orderedBuckets) {
        tokenSeriesMap.set(b.key, {
          ...b,
          input: 0,
          output: 0,
          reasoning: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
          cost: 0,
          cacheHitPct: 0,
          steps: 0,
          prompts: 0,
        });
        modelSeriesMap.set(b.key, {
          key: b.key,
          label: b.label,
          totalCost: 0,
          totalTokens: 0,
          totalSteps: 0,
          byModel: {},
        });
        toolSeriesMap.set(b.key, {
          key: b.key,
          label: b.label,
          totalCalls: 0,
          succeeded: 0,
          failed: 0,
          unfinished: 0,
          errorPct: 0,
          byTool: {},
        });
      }

      const hourly: HourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        prompts: 0,
        steps: 0,
        tokens: 0,
        cost: 0,
      }));
      const weekday: WeekdayBucket[] = WEEKDAY_LABELS.map((label, wd) => ({
        weekday: wd,
        label,
        prompts: 0,
        steps: 0,
        tokens: 0,
        cost: 0,
        prsOpened: 0,
        approvals: 0,
      }));

      let totalSteps = 0;
      let totalPrompts = 0;
      let subagentPrompts = 0;
      let totalCost = 0;
      let totalIn = 0;
      let totalOut = 0;
      let totalReas = 0;
      let totalCR = 0;
      let totalCW = 0;
      const finishes: Record<string, number> = {};

      type ModelAgg = {
        key: string;
        providerID: string;
        modelID: string;
        variant?: string;
        steps: number;
        input: number;
        output: number;
        reasoning: number;
        cacheRead: number;
        cacheWrite: number;
        cost: number;
        durSum: number;
        durCnt: number;
        ttftSum: number;
        ttftCnt: number;
        streamTok: number;
        streamMsSum: number;
        ttftHist: Map<number, number>;
      };
      const modelAggMap = new Map<string, ModelAgg>();

      type AgentAgg = {
        agent: string;
        steps: number;
        tokens: number;
        cost: number;
        durSum: number;
        durCnt: number;
      };
      const agentAggMap = new Map<string, AgentAgg>();

      for (const r of userRollups) {
        const ts = r.hour_id * 3_600_000 + 1_800_000;
        const day = formatDayInTz(ts, dayFmt);
        if (day < fromDay || day > toDay) continue;
        const hr = formatHourInTz(ts, hourFmt);
        const wd = weekdayFromDayStr(day);

        const act = activityByDay.get(day);
        if (r.is_subagent) {
          subagentPrompts += r.prompts;
          if (act) act.subagentPrompts += r.prompts;
        } else {
          totalPrompts += r.prompts;
          if (act) act.prompts += r.prompts;
          hourly[hr]!.prompts += r.prompts;
          weekday[wd]!.prompts += r.prompts;
          const bMeta = dayBucketMap.get(day);
          const tb = bMeta ? tokenSeriesMap.get(bMeta.key) : undefined;
          if (tb) tb.prompts += r.prompts;
          const pAgg = ensureProjectAgg(r.project_id);
          pAgg.prompts += r.prompts;
        }
      }

      for (const r of modelRollups) {
        const ts = r.hour_id * 3_600_000 + 1_800_000;
        const day = formatDayInTz(ts, dayFmt);
        if (day < fromDay || day > toDay) continue;
        const hr = formatHourInTz(ts, hourFmt);
        const wd = weekdayFromDayStr(day);

        const rowTok = r.inp + r.outp + r.reas + r.cache_read + r.cache_write;
        totalSteps += r.steps;
        totalCost += r.cost;
        totalIn += r.inp;
        totalOut += r.outp;
        totalReas += r.reas;
        totalCR += r.cache_read;
        totalCW += r.cache_write;

        finishes[r.finish] = (finishes[r.finish] ?? 0) + r.steps;

        const act = activityByDay.get(day);
        if (act) {
          act.steps += r.steps;
          act.tokens += rowTok;
          act.inputTokens += r.inp;
          act.outputTokens += r.outp;
          act.reasoningTokens += r.reas;
          act.cacheReadTokens += r.cache_read;
          act.cacheWriteTokens += r.cache_write;
          act.cost += r.cost;
        }

        hourly[hr]!.steps += r.steps;
        hourly[hr]!.tokens += rowTok;
        hourly[hr]!.cost += r.cost;

        weekday[wd]!.steps += r.steps;
        weekday[wd]!.tokens += rowTok;
        weekday[wd]!.cost += r.cost;

        const pAgg = ensureProjectAgg(r.project_id);
        pAgg.steps += r.steps;
        pAgg.tokens += rowTok;
        pAgg.cost += r.cost;

        const bMeta = dayBucketMap.get(day);
        const tb = bMeta ? tokenSeriesMap.get(bMeta.key) : undefined;
        if (tb) {
          tb.input += r.inp;
          tb.output += r.outp;
          tb.reasoning += r.reas;
          tb.cacheRead += r.cache_read;
          tb.cacheWrite += r.cache_write;
          tb.total += rowTok;
          tb.cost += r.cost;
          tb.steps += r.steps;
        }

        const modelKey = query.includeVariants && r.variant
          ? `${r.provider_id}/${r.model_id}#${r.variant}`
          : `${r.provider_id}/${r.model_id}`;

        let mAgg = modelAggMap.get(modelKey);
        if (!mAgg) {
          mAgg = {
            key: modelKey,
            providerID: r.provider_id,
            modelID: r.model_id,
            variant: query.includeVariants && r.variant ? r.variant : undefined,
            steps: 0,
            input: 0,
            output: 0,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
            cost: 0,
            durSum: 0,
            durCnt: 0,
            ttftSum: 0,
            ttftCnt: 0,
            streamTok: 0,
            streamMsSum: 0,
            ttftHist: new Map(),
          };
          modelAggMap.set(modelKey, mAgg);
        }
        mAgg.steps += r.steps;
        mAgg.input += r.inp;
        mAgg.output += r.outp;
        mAgg.reasoning += r.reas;
        mAgg.cacheRead += r.cache_read;
        mAgg.cacheWrite += r.cache_write;
        mAgg.cost += r.cost;
        mAgg.durSum += r.dur_sum;
        mAgg.durCnt += r.dur_cnt;
        mAgg.ttftSum += r.ttft_sum;
        mAgg.ttftCnt += r.ttft_cnt;
        mAgg.streamTok += r.stream_tok;
        mAgg.streamMsSum += r.stream_ms_sum;
        mergeSerializedHist(mAgg.ttftHist, r.ttft_hist);

        const mb = bMeta ? modelSeriesMap.get(bMeta.key) : undefined;
        if (mb) {
          mb.totalCost += r.cost;
          mb.totalTokens += rowTok;
          mb.totalSteps += r.steps;
          let bm = mb.byModel[modelKey];
          if (!bm) {
            bm = { cost: 0, tokens: 0, steps: 0 };
            mb.byModel[modelKey] = bm;
          }
          bm.cost += r.cost;
          bm.tokens += rowTok;
          bm.steps += r.steps;
        }

        let aAgg = agentAggMap.get(r.agent);
        if (!aAgg) {
          aAgg = { agent: r.agent, steps: 0, tokens: 0, cost: 0, durSum: 0, durCnt: 0 };
          agentAggMap.set(r.agent, aAgg);
        }
        aAgg.steps += r.steps;
        aAgg.tokens += rowTok;
        aAgg.cost += r.cost;
        aAgg.durSum += r.dur_sum;
        aAgg.durCnt += r.dur_cnt;
      }

      // Compute cacheHitPct per tokenSeries bucket
      for (const tb of tokenSeriesMap.values()) {
        const denom = tb.input + tb.cacheRead + tb.cacheWrite;
        tb.cacheHitPct = denom > 0 ? (tb.cacheRead / denom) * 100 : 0;
      }

      // Tool aggregations
      type ToolAgg = {
        name: string;
        isMcp: boolean;
        calls: number;
        succeeded: number;
        failed: number;
        unfinished: number;
        durSum: number;
        durCnt: number;
        durHist: Map<number, number>;
      };
      const toolAggMap = new Map<string, ToolAgg>();
      let toolCalls = 0;
      let toolSucceeded = 0;
      let toolFailed = 0;
      let toolUnfinished = 0;

      for (const r of toolRollups) {
        const ts = r.hour_id * 3_600_000 + 1_800_000;
        const day = formatDayInTz(ts, dayFmt);
        if (day < fromDay || day > toDay) continue;
        toolCalls += r.calls;
        toolSucceeded += r.succeeded;
        toolFailed += r.failed;
        toolUnfinished += r.unfinished;

        let tAgg = toolAggMap.get(r.tool_name);
        if (!tAgg) {
          tAgg = {
            name: r.tool_name,
            isMcp: !BUILTIN_TOOLS.has(r.tool_name),
            calls: 0,
            succeeded: 0,
            failed: 0,
            unfinished: 0,
            durSum: 0,
            durCnt: 0,
            durHist: new Map(),
          };
          toolAggMap.set(r.tool_name, tAgg);
        }
        tAgg.calls += r.calls;
        tAgg.succeeded += r.succeeded;
        tAgg.failed += r.failed;
        tAgg.unfinished += r.unfinished;
        tAgg.durSum += r.dur_sum;
        tAgg.durCnt += r.dur_cnt;
        mergeSerializedHist(tAgg.durHist, r.dur_hist);

        const bMeta = dayBucketMap.get(day);
        const tsb = bMeta ? toolSeriesMap.get(bMeta.key) : undefined;
        if (tsb) {
          tsb.totalCalls += r.calls;
          tsb.succeeded += r.succeeded;
          tsb.failed += r.failed;
          tsb.unfinished += r.unfinished;
          tsb.byTool[r.tool_name] = (tsb.byTool[r.tool_name] ?? 0) + r.calls;
        }
      }

      for (const tsb of toolSeriesMap.values()) {
        const finished = tsb.succeeded + tsb.failed;
        tsb.errorPct = finished > 0 ? (tsb.failed / finished) * 100 : 0;
      }

      // Streaks & active days from activityByDay
      const activity = allDays.map((d) => activityByDay.get(d)!);
      let activeDays = 0;
      let bestStreak = 0;
      let curStreak = 0;
      for (const row of activity) {
        if (row.steps > 0 || row.prompts > 0) {
          activeDays += 1;
          curStreak += 1;
          if (curStreak > bestStreak) bestStreak = curStreak;
        } else {
          curStreak = 0;
        }
      }
      // Compute active streak ending today (or yesterday if today has 0 yet)
      let currentStreak = 0;
      for (let i = activity.length - 1; i >= 0; i -= 1) {
        const row = activity[i]!;
        if (row.steps > 0 || row.prompts > 0) {
          currentStreak += 1;
        } else if (i === activity.length - 1) {
          // Today hasn't had activity yet; check yesterday
          continue;
        } else {
          break;
        }
      }

      // Models sorted by cost desc, then tokens desc
      const models: ModelUsageRow[] = [...modelAggMap.values()]
        .map((m) => {
          const total = m.input + m.output + m.reasoning + m.cacheRead + m.cacheWrite;
          const cacheDenom = m.input + m.cacheRead + m.cacheWrite;
          return {
            key: m.key,
            providerID: m.providerID,
            modelID: m.modelID,
            variant: m.variant,
            steps: m.steps,
            tokens: {
              input: m.input,
              output: m.output,
              reasoning: m.reasoning,
              cacheRead: m.cacheRead,
              cacheWrite: m.cacheWrite,
              total,
            },
            cost: m.cost,
            costPer1M: total > 0 ? (m.cost / total) * 1_000_000 : 0,
            cacheHitPct: cacheDenom > 0 ? (m.cacheRead / cacheDenom) * 100 : 0,
            avgStepMs: m.durCnt > 0 ? m.durSum / m.durCnt : undefined,
            ttftP50Ms: quantileFromHist(m.ttftHist, 0.5),
            ttftAvgMs: m.ttftCnt > 0 ? m.ttftSum / m.ttftCnt : undefined,
            tpsAvg: m.streamMsSum > 0 ? m.streamTok / (m.streamMsSum / 1000) : undefined,
          };
        })
        .sort((a, b) => b.cost - a.cost || b.tokens.total - a.tokens.total || b.steps - a.steps);

      const topModels = models.slice(0, 5).map((m) => m.key);

      const agents: AgentUsageRow[] = [...agentAggMap.values()]
        .map((a) => ({
          agent: a.agent,
          steps: a.steps,
          tokens: a.tokens,
          cost: a.cost,
          sharePct: totalSteps > 0 ? (a.steps / totalSteps) * 100 : 0,
          avgStepMs: a.durCnt > 0 ? a.durSum / a.durCnt : undefined,
        }))
        .sort((a, b) => b.steps - a.steps);

      const tools: ToolUsageRow[] = [...toolAggMap.values()]
        .map((t) => {
          const finished = t.succeeded + t.failed;
          return {
            name: t.name,
            isMcp: t.isMcp,
            calls: t.calls,
            succeeded: t.succeeded,
            failed: t.failed,
            unfinished: t.unfinished,
            errorPct: finished > 0 ? (t.failed / finished) * 100 : 0,
            p50Ms: quantileFromHist(t.durHist, 0.5),
            p95Ms: quantileFromHist(t.durHist, 0.95),
            avgMs: t.durCnt > 0 ? t.durSum / t.durCnt : undefined,
          };
        })
        .sort((a, b) => b.calls - a.calls);

      const topTools = tools.slice(0, 5).map((t) => t.name);

      const projects: ProjectUsageRow[] = [...projectAgg.values()]
        .filter((p) => p.sessions > 0 || p.steps > 0 || p.tokens > 0)
        .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens || b.sessions - a.sessions);

      const totalTokens = totalIn + totalOut + totalReas + totalCR + totalCW;
      const cacheDenom = totalIn + totalCR + totalCW;
      const parentsWithSubagents = childrenPerParent.size;
      const avgSubagentsPerParent =
        parentsWithSubagents > 0 ? subagentSessions / parentsWithSubagents : 0;

      const activeDivisor = Math.max(1, activeDays);

      return {
        meta: {
          range: query.range,
          from,
          to,
          daysCount,
          weekdaysCount,
          timezone: query.timezone,
          projectID: query.projectID,
          projectLabel,
          generatedAt: nowMs,
          bucketGranularity,
          historyStatus: syncInfo.historyComplete ? "complete" : "partial",
          cachedHours: syncInfo.cachedHours,
          totalHours: syncInfo.totalHours,
          dbAvailable: true,
        },
        summary: {
          sessions: rootSessions,
          subagents: subagentSessions,
          prompts: totalPrompts,
          subagentPrompts,
          steps: totalSteps,
          activeDays,
          currentStreak,
          bestStreak,
          cost: totalCost,
          costPerDay: totalCost / daysCount,
          costPerActiveDay: totalCost / activeDivisor,
          tokens: {
            input: totalIn,
            output: totalOut,
            reasoning: totalReas,
            cacheRead: totalCR,
            cacheWrite: totalCW,
            total: totalTokens,
          },
          tokensPerDay: totalTokens / daysCount,
          tokensPerActiveDay: totalTokens / activeDivisor,
          cacheHitPct: cacheDenom > 0 ? (totalCR / cacheDenom) * 100 : 0,
          codeDiff: {
            additions: diffAdditions,
            deletions: diffDeletions,
            files: diffFiles,
          },
          tools: {
            calls: toolCalls,
            succeeded: toolSucceeded,
            failed: toolFailed,
            unfinished: toolUnfinished,
          },
        },
        activity,
        tokenSeries: orderedBuckets.map((b) => tokenSeriesMap.get(b.key)!),
        modelSeries: {
          topModels,
          buckets: orderedBuckets.map((b) => modelSeriesMap.get(b.key)!),
        },
        models,
        toolSeries: {
          topTools,
          buckets: orderedBuckets.map((b) => toolSeriesMap.get(b.key)!),
        },
        agents,
        tools,
        hourly,
        weekday,
        projects,
        topSessions,
        outcomes: {
          finishes,
          sessionOutcomes,
          parentsWithSubagents,
          avgSubagentsPerParent,
          avgStepsPerPrompt: totalPrompts > 0 ? totalSteps / totalPrompts : 0,
          avgSessionDurationMs: durationCount > 0 ? durationSum / durationCount : 0,
        },
        dayBucketMap,
        allDays,
      };
    } finally {
      source.close();
    }
  }
}
