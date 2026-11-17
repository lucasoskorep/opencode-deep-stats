// @bun
// src/tui.tsx
import { createComponent as _$createComponent4 } from "@opentui/solid";
import { memo as _$memo4 } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
import { createSignal as createSignal2 } from "solid-js";

// src/db.ts
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// src/format.ts
import { RGBA } from "@opentui/core";
function compactNumber(value) {
  if (!Number.isFinite(value) || value === 0)
    return "0";
  const abs = Math.abs(value);
  if (abs < 1000)
    return Math.round(value).toString();
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}
function formatInt(value) {
  if (!Number.isFinite(value))
    return "0";
  return Math.round(value).toLocaleString("en-US");
}
function formatRate(value, decimals = 2) {
  if (!Number.isFinite(value))
    return "0";
  if (value >= 100)
    return value.toFixed(1);
  if (value >= 10)
    return value.toFixed(Math.min(1, decimals));
  return value.toFixed(decimals);
}
function formatUsd(cost) {
  if (!Number.isFinite(cost) || cost <= 0)
    return "$0.00";
  if (cost >= 1e4) {
    return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(cost)}`;
  }
  if (cost >= 1000)
    return `$${cost.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (cost >= 0.01)
    return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(4)}`;
}
function formatPct(pct) {
  if (!Number.isFinite(pct))
    return "0.0%";
  return `${pct.toFixed(1)}%`;
}
function formatDurationMs(ms) {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0)
    return "-";
  if (ms < 1000)
    return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60)
    return `${sec.toFixed(sec >= 10 ? 1 : 2)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  if (min < 60)
    return remSec > 0 ? `${min}m${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h${remMin}m` : `${hr}h`;
}
function formatHours(hours) {
  if (hours === undefined || !Number.isFinite(hours) || hours < 0)
    return "-";
  if (hours < 1)
    return `${Math.round(hours * 60)}m`;
  if (hours < 48)
    return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
function abbreviatePath(p) {
  const home = process.env.HOME;
  if (home && p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  return p;
}
function truncate(str, maxLen) {
  if (maxLen <= 0)
    return "";
  if (str.length <= maxLen)
    return str;
  if (maxLen <= 1)
    return str.slice(0, maxLen);
  return str.slice(0, maxLen - 1) + "\u2026";
}
function mixColor(a, b, amount) {
  const t = Math.max(0, Math.min(1, amount));
  const r = a.r + (b.r - a.r) * t;
  const g = a.g + (b.g - a.g) * t;
  const bl = a.b + (b.b - a.b) * t;
  return RGBA.fromInts(Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255));
}
function rangeLabel(range) {
  switch (range) {
    case "7d":
      return "7D";
    case "30d":
      return "30D";
    case "90d":
      return "90D";
    case "ytd":
      return "YTD";
    case "all":
      return "ALL";
  }
}
function formatDateRange(from, to) {
  try {
    const start = new Date(from);
    const end = new Date(Math.max(from, to - 1));
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).formatRange(start, end);
  } catch {
    return `${new Date(from).toISOString().slice(0, 10)} \u2013 ${new Date(to).toISOString().slice(0, 10)}`;
  }
}
function createDayFormatter(timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  }
}
function createHourFormatter(timezone) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false
    });
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "2-digit",
      hour12: false
    });
  }
}
function formatDayInTz(ms, fmt) {
  const parts = fmt.formatToParts(ms);
  let y = "1970";
  let m = "01";
  let d = "01";
  for (const p of parts) {
    if (p.type === "year")
      y = p.value;
    else if (p.type === "month")
      m = p.value;
    else if (p.type === "day")
      d = p.value;
  }
  return `${y}-${m}-${d}`;
}
function formatHourInTz(ms, fmt) {
  const h = Number.parseInt(fmt.format(ms), 10);
  if (!Number.isFinite(h))
    return 0;
  return h === 24 ? 0 : h % 24;
}
function weekdayFromDayStr(day) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return (dt.getUTCDay() + 6) % 7;
}
function addDaysToDayStr(day, delta) {
  const [y, m, d] = day.split("-").map(Number);
  const ms = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta);
  return new Date(ms).toISOString().slice(0, 10);
}
function enumerateDays(fromDay, toDay) {
  const result = [];
  let cur = fromDay;
  let guard = 0;
  while (cur <= toDay && guard < 4000) {
    result.push(cur);
    cur = addDaysToDayStr(cur, 1);
    guard += 1;
  }
  return result;
}
function weekMondayOf(day) {
  const wd = weekdayFromDayStr(day);
  return addDaysToDayStr(day, -wd);
}
function computeRangeBounds(range, nowMs, timezone, earliestDay) {
  const dayFmt = createDayFormatter(timezone);
  const toDay = formatDayInTz(nowMs, dayFmt);
  let fromDay;
  switch (range) {
    case "7d":
      fromDay = addDaysToDayStr(toDay, -6);
      break;
    case "30d":
      fromDay = addDaysToDayStr(toDay, -29);
      break;
    case "90d":
      fromDay = addDaysToDayStr(toDay, -89);
      break;
    case "ytd":
      fromDay = `${toDay.slice(0, 4)}-01-01`;
      break;
    case "all":
      fromDay = earliestDay && earliestDay <= toDay ? earliestDay : `${toDay.slice(0, 4)}-01-01`;
      break;
  }
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const from = Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1) - 14 * 3600000;
  const to = nowMs + 1;
  return { from, to, fromDay, toDay };
}
function selectHeatmapValue(day, metric) {
  switch (metric) {
    case "steps":
      return day.steps;
    case "tokens":
      return day.tokens;
    case "cost":
      return day.cost;
    case "github":
      return day.prsOpened + day.approvals;
  }
}
function buildActivityGrid(activity, fromDay, toDay, maxWeeks, metric) {
  const toUtcDayIndex = (dayStr) => {
    const [y, m, d] = dayStr.split("-").map(Number);
    return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86400000);
  };
  const startIdx = toUtcDayIndex(fromDay);
  const endIdx = toUtcDayIndex(toDay);
  const firstMondayIdx = startIdx - (new Date(startIdx * 86400000).getUTCDay() + 6) % 7;
  const totalWeeks = endIdx < startIdx ? 0 : Math.floor((endIdx - firstMondayIdx) / 7) + 1;
  const shownWeeks = Math.min(totalWeeks, 53, Math.max(1, Math.floor(maxWeeks)));
  const gridStartMonday = firstMondayIdx + Math.max(0, totalWeeks - shownWeeks) * 7;
  const valueByDate = new Map;
  for (const row of activity) {
    const v = selectHeatmapValue(row, metric);
    if (v > 0)
      valueByDate.set(row.date, v);
  }
  const nonZeroSorted = [...new Set(valueByDate.values())].sort((a, b) => a - b);
  const weeks = Array.from({ length: shownWeeks }, (_, weekIdx) => Array.from({ length: 7 }, (_, dow) => {
    const idx = gridStartMonday + weekIdx * 7 + dow;
    const date = new Date(idx * 86400000).toISOString().slice(0, 10);
    if (idx < startIdx || idx > endIdx) {
      return { date, value: 0, level: -1 };
    }
    const value = valueByDate.get(date) ?? 0;
    if (value <= 0 || nonZeroSorted.length === 0) {
      return { date, value: 0, level: 0 };
    }
    const rank = nonZeroSorted.indexOf(value);
    const level = Math.max(1, Math.min(4, Math.ceil((rank + 1) / nonZeroSorted.length * 4)));
    return { date, value, level };
  }));
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const rawMonths = weeks.map((_, weekIdx) => {
    const midDay = Math.min(endIdx, Math.max(startIdx, gridStartMonday + weekIdx * 7 + 3));
    return {
      week: weekIdx,
      label: monthFmt.format(midDay * 86400000)
    };
  }).filter((m, idx, arr) => idx === 0 || m.label !== arr[idx - 1].label);
  const months = rawMonths.map((m, idx) => ({
    ...m,
    span: (rawMonths[idx + 1]?.week ?? shownWeeks) - m.week
  }));
  return {
    weeks,
    months,
    clipped: shownWeeks < totalWeeks
  };
}
function sparkline(values) {
  const glyphs = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];
  if (values.length === 0)
    return "";
  const max = Math.max(...values);
  if (max <= 0)
    return "\u2581".repeat(values.length);
  return values.map((v) => {
    if (v <= 0)
      return " ";
    const idx = Math.min(glyphs.length - 1, Math.max(0, Math.round(v / max * (glyphs.length - 1))));
    return glyphs[idx];
  }).join("");
}
function barBlocks(fraction, width) {
  if (width <= 0)
    return "";
  const clamped = Math.max(0, Math.min(1, fraction));
  const full = Math.round(clamped * width);
  const empty = Math.max(0, width - full);
  return "\u2588".repeat(full) + "\u2591".repeat(empty);
}
var PIXEL_FONT = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ".": ["0", "0", "0", "0", "1"],
  ",": ["0", "0", "0", "1", "1"],
  $: ["010", "111", "110", "011", "111"],
  "/": ["001", "001", "010", "100", "100"],
  K: ["101", "110", "100", "110", "101"],
  M: ["10001", "11011", "10101", "10001", "10001"],
  B: ["110", "101", "110", "101", "110"],
  T: ["111", "010", "010", "010", "010"]
};
function renderPixelLines(text, maxWidth) {
  const chars = Array.from(text.toUpperCase()).map((ch) => PIXEL_FONT[ch]);
  if (chars.some((c) => !c))
    return;
  const glyphs = chars;
  const totalWidth = glyphs.reduce((sum, g) => sum + (g[0]?.length ?? 0) * 2 + 2, -2);
  if (totalWidth > maxWidth)
    return;
  return [0, 1, 2, 3, 4].map((row) => glyphs.map((g) => (g[row] ?? "").replaceAll("1", "\u2588\u2588").replaceAll("0", "  ")).join("  "));
}
var OPENCODE_LOGO = {
  left: [
    "                   ",
    "\u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2584",
    "\u2588__\u2588 \u2588__\u2588 \u2588^^^ \u2588__\u2588",
    "\u2580\u2580\u2580\u2580 \u2588\u2580\u2580\u2580 \u2580\u2580\u2580\u2580 \u2580~~\u2580"
  ],
  right: [
    "             \u2584     ",
    "\u2588\u2580\u2580\u2580 \u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2588 \u2588\u2580\u2580\u2588",
    "\u2588___ \u2588__\u2588 \u2588__\u2588 \u2588^^^",
    "\u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580 \u2580\u2580\u2580\u2580"
  ]
};

// src/db.ts
var BUILTIN_TOOLS = new Set([
  "read",
  "edit",
  "write",
  "patch",
  "apply_patch",
  "glob",
  "grep",
  "shell",
  "bash",
  "execute",
  "subagent",
  "task",
  "question",
  "skill",
  "get_skill",
  "skill_mcp",
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
  "list_jobs",
  "list_mcp_resources",
  "read_mcp_resource",
  "lsp",
  "lsp_diagnostics",
  "lsp_hover",
  "lsp_definition",
  "lsp_references",
  "lsp_goto_definition",
  "lsp_find_references",
  "lsp_rename",
  "lsp_document_symbols",
  "lsp_workspace_symbols",
  "lsp_prepare_rename",
  "lsp_code_actions",
  "background_output",
  "background_cancel",
  "background_list",
  "call_omo_agent",
  "look_at",
  "codesearch",
  "batch",
  "invalid",
  "deep_stats"
]);
function isMcpToolName(name) {
  if (BUILTIN_TOOLS.has(name))
    return false;
  if (!name || name.includes(" "))
    return false;
  return name.includes("_") || name.includes("-") || name.includes(".");
}
function extractMcpServer(name) {
  if (name.startsWith("mcp__")) {
    const rest = name.slice(5);
    const sep = rest.indexOf("__");
    return sep > 0 ? rest.slice(0, sep) : rest || "mcp";
  }
  if (name.startsWith("grep_app_"))
    return "grep_app";
  const idx = name.indexOf("_");
  if (idx > 0)
    return name.slice(0, idx);
  const dot = name.indexOf(".");
  if (dot > 0)
    return name.slice(0, dot);
  return "other";
}
var WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var HIST_SCALE = 6;
var HIST_MAX_BUCKET = 126;
function toHistBucket(ms) {
  if (!Number.isFinite(ms) || ms <= 1)
    return 0;
  return Math.min(HIST_MAX_BUCKET, Math.max(0, Math.floor(Math.log2(ms) * HIST_SCALE)));
}
function histBucketMidpointMs(bucket) {
  if (bucket <= 0)
    return 1;
  return Math.pow(2, (bucket + 0.5) / HIST_SCALE);
}
function serializeHist(map) {
  if (map.size === 0)
    return "[]";
  return JSON.stringify([...map.entries()].sort((a, b) => a[0] - b[0]));
}
function mergeSerializedHist(target, raw) {
  if (!raw || raw === "[]")
    return;
  try {
    const entries = JSON.parse(raw);
    for (const [b, c] of entries) {
      target.set(b, (target.get(b) ?? 0) + c);
    }
  } catch {}
}
function quantileFromHist(hist, q) {
  let total = 0;
  for (const count of hist.values())
    total += count;
  if (total === 0)
    return;
  const target = Math.max(1, Math.ceil(total * q));
  const sorted = [...hist.entries()].sort((a, b) => a[0] - b[0]);
  let acc = 0;
  for (const [bucket, count] of sorted) {
    acc += count;
    if (acc >= target) {
      return histBucketMidpointMs(bucket);
    }
  }
  return;
}
var cachedOpencodeDbPath;
function resolveDefaultOpencodeDbPath() {
  if (cachedOpencodeDbPath)
    return cachedOpencodeDbPath;
  const envDb = process.env.OPENCODE_DB;
  const dataHome = process.env.XDG_DATA_HOME || join(process.env.HOME || "", ".local", "share");
  if (envDb && envDb !== ":memory:") {
    cachedOpencodeDbPath = envDb.startsWith("/") ? envDb : join(dataHome, "opencode", envDb);
    return cachedOpencodeDbPath;
  }
  try {
    const proc = Bun.spawnSync(["opencode", "debug", "paths", "db"], {
      stdout: "pipe",
      stderr: "pipe"
    });
    if (proc.exitCode === 0) {
      const out = proc.stdout.toString().trim();
      if (out && out !== ":memory:") {
        cachedOpencodeDbPath = out;
        return out;
      }
    }
  } catch {}
  cachedOpencodeDbPath = join(dataHome, "opencode", "opencode.db");
  return cachedOpencodeDbPath;
}
function resolveDefaultCacheDbPath() {
  const cacheHome = process.env.XDG_CACHE_HOME || join(process.env.HOME || "", ".cache");
  return join(cacheHome, "opencode", "deep-stats-rollup.v1.db");
}
function initCacheSchema(cache) {
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

class DeepStatsStore {
  opencodeDbPath;
  cacheDbPath;
  cacheDb;
  backfillRunning = false;
  backfillPromise;
  onBackfillProgress;
  constructor(options) {
    this.opencodeDbPath = options?.opencodeDbPath ?? resolveDefaultOpencodeDbPath();
    this.cacheDbPath = options?.cacheDbPath ?? resolveDefaultCacheDbPath();
    this.onBackfillProgress = options?.onBackfillProgress;
  }
  openSource() {
    return new Database(this.opencodeDbPath, { readonly: true });
  }
  getCache() {
    if (this.cacheDb)
      return this.cacheDb;
    if (this.cacheDbPath !== ":memory:") {
      mkdirSync(dirname(this.cacheDbPath), { recursive: true });
    }
    this.cacheDb = new Database(this.cacheDbPath);
    initCacheSchema(this.cacheDb);
    return this.cacheDb;
  }
  close() {
    if (this.cacheDb) {
      this.cacheDb.close();
      this.cacheDb = undefined;
    }
  }
  scanHoursIntoCache(source, cache, fromMs, toMs) {
    const startHour = Math.floor(fromMs / 3600000);
    const endHour = Math.floor(toMs / 3600000);
    const rangeStartMs = startHour * 3600000;
    const rangeEndMs = (endHour + 1) * 3600000;
    const hourMetaRows = source.query(`SELECT CAST(time_created / 3600000 AS INTEGER) as h, COUNT(*) as cnt, MAX(time_updated) as max_u
         FROM session_message
         WHERE time_created >= ? AND time_created < ?
         GROUP BY h`).all(rangeStartMs, rangeEndMs);
    const msgRows = source.query(`SELECT
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
         WHERE m.time_created >= ? AND m.time_created < ? AND m.type IN ('assistant', 'user')`).all(rangeStartMs, rangeEndMs);
    const toolRows = source.query(`SELECT
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
           AND json_extract(j.value, '$.type') = 'tool'`).all(rangeStartMs, rangeEndMs);
    const modelMap = new Map;
    const userMap = new Map;
    const toolMap = new Map;
    for (const row of msgRows) {
      const hourId = Math.floor(row.time_created / 3600000);
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
          ttft_hist: new Map
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
        if (dur >= 0 && dur < 3600000) {
          acc.dur_sum += dur;
          acc.dur_cnt += 1;
        }
      }
      if (row.mt_first && row.mt_first >= tCreated) {
        const ttft = row.mt_first - tCreated;
        if (ttft >= 0 && ttft < 600000) {
          acc.ttft_sum += ttft;
          acc.ttft_cnt += 1;
          const b = toHistBucket(ttft);
          acc.ttft_hist.set(b, (acc.ttft_hist.get(b) ?? 0) + 1);
        }
        if (row.mt_comp && row.mt_comp > row.mt_first && outp + reas > 0) {
          const streamDur = row.mt_comp - row.mt_first;
          if (streamDur > 0 && streamDur < 3600000) {
            acc.stream_tok += outp + reas;
            acc.stream_ms_sum += streamDur;
          }
        }
      }
    }
    for (const row of toolRows) {
      const hourId = Math.floor(row.time_created / 3600000);
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
          dur_hist: new Map
        };
        toolMap.set(tKey, acc);
      }
      acc.calls += 1;
      if (row.status === "completed")
        acc.succeeded += 1;
      else if (row.status === "error")
        acc.failed += 1;
      else
        acc.unfinished += 1;
      const tStart = row.tt_ran ?? row.tt_created;
      if (tStart && row.tt_comp && row.tt_comp >= tStart) {
        const dur = row.tt_comp - tStart;
        if (dur >= 0 && dur < 3600000) {
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
    const metaByHour = new Map(hourMetaRows.map((r) => [r.h, r]));
    const tx = cache.transaction(() => {
      delModel.run(startHour, endHour);
      delUser.run(startHour, endHour);
      delTool.run(startHour, endHour);
      delHour.run(startHour, endHour);
      for (let h = startHour;h <= endHour; h += 1) {
        const meta = metaByHour.get(h);
        insHour.run(h, meta?.cnt ?? 0, meta?.max_u ?? 0);
      }
      for (const acc of modelMap.values()) {
        insModel.run(acc.hour_id, acc.project_id, acc.provider_id, acc.model_id, acc.variant, acc.agent, acc.finish, acc.steps, acc.inp, acc.outp, acc.reas, acc.cache_read, acc.cache_write, acc.cost, acc.dur_sum, acc.dur_cnt, acc.ttft_sum, acc.ttft_cnt, acc.stream_tok, acc.stream_ms_sum, serializeHist(acc.ttft_hist));
      }
      for (const acc of userMap.values()) {
        insUser.run(acc.hour_id, acc.project_id, acc.is_subagent, acc.prompts, acc.prompt_chars);
      }
      for (const acc of toolMap.values()) {
        insTool.run(acc.hour_id, acc.project_id, acc.tool_name, acc.calls, acc.succeeded, acc.failed, acc.unfinished, acc.dur_sum, acc.dur_cnt, serializeHist(acc.dur_hist));
      }
    });
    tx();
  }
  syncRecentAndNeeded(source, cache, reqFromMs, reqToMs, forceRefresh) {
    const bounds = source.query("SELECT MIN(time_created) as min_t, MAX(time_created) as max_t FROM session_message").get();
    if (!bounds.min_t || !bounds.max_t) {
      return { historyComplete: true, cachedHours: 0, totalHours: 0 };
    }
    const nowMs = Date.now();
    const recentWindowMs = 48 * 3600000;
    const recentCutoffHour = Math.floor((nowMs - recentWindowMs) / 3600000);
    const recentCutoffMs = recentCutoffHour * 3600000;
    if (forceRefresh) {
      cache.exec("DELETE FROM hour_status; DELETE FROM agg_model; DELETE FROM agg_user; DELETE FROM agg_tool; DELETE FROM meta;");
    }
    const recentMeta = source.query(`SELECT CAST(time_created / 3600000 AS INTEGER) as h, COUNT(*) as cnt, MAX(time_updated) as max_u
         FROM session_message
         WHERE time_created >= ?
         GROUP BY h`).all(recentCutoffMs);
    const currentHour = Math.floor(Math.max(nowMs, bounds.max_t) / 3600000);
    const existingRecent = new Map(cache.query("SELECT hour_id, row_count, max_updated FROM hour_status WHERE hour_id >= ?").all(recentCutoffHour).map((r) => [r.hour_id, { row_count: r.row_count, max_updated: r.max_updated }]));
    const recentByHour = new Map(recentMeta.map((r) => [r.h, r]));
    const dirtyRecentHours = [];
    for (let h = recentCutoffHour;h <= currentHour; h += 1) {
      const src = recentByHour.get(h);
      const cached = existingRecent.get(h);
      const srcCnt = src?.cnt ?? 0;
      const srcMaxU = src?.max_u ?? 0;
      if (!cached || cached.row_count !== srcCnt || cached.max_updated !== srcMaxU) {
        dirtyRecentHours.push(h);
      }
    }
    if (dirtyRecentHours.length > 0) {
      let spanStart = dirtyRecentHours[0];
      let spanPrev = spanStart;
      for (let i = 1;i <= dirtyRecentHours.length; i += 1) {
        const cur = dirtyRecentHours[i];
        if (cur !== undefined && cur === spanPrev + 1) {
          spanPrev = cur;
          continue;
        }
        this.scanHoursIntoCache(source, cache, spanStart * 3600000, spanPrev * 3600000);
        if (cur !== undefined) {
          spanStart = cur;
          spanPrev = cur;
        }
      }
    }
    const minHour = Math.floor(bounds.min_t / 3600000);
    const maxHour = currentHour;
    const totalHours = Math.max(0, maxHour - minHour + 1);
    const syncCapFromMs = Math.max(bounds.min_t, nowMs - 35 * 86400000, reqFromMs);
    const syncStartHour = Math.max(minHour, Math.floor(syncCapFromMs / 3600000));
    const syncEndHour = Math.min(maxHour, Math.floor(reqToMs / 3600000));
    this.fillMissingHourRange(source, cache, syncStartHour, syncEndHour);
    const reqStartHour = Math.max(minHour, Math.floor(reqFromMs / 3600000));
    const cachedReqCountRow = cache.query("SELECT COUNT(*) as n FROM hour_status WHERE hour_id >= ? AND hour_id <= ?").get(reqStartHour, maxHour);
    const neededReqHours = Math.max(0, maxHour - reqStartHour + 1);
    const historyComplete = cachedReqCountRow.n >= neededReqHours;
    if (!historyComplete && !this.backfillRunning) {
      this.startBackgroundBackfill(minHour, maxHour);
    }
    const totalCachedRow = cache.query("SELECT COUNT(*) as n FROM hour_status WHERE hour_id >= ? AND hour_id <= ?").get(minHour, maxHour);
    return {
      historyComplete,
      cachedHours: Math.min(totalHours, totalCachedRow.n),
      totalHours
    };
  }
  fillMissingHourRange(source, cache, startHour, endHour) {
    if (endHour < startHour)
      return;
    const presentRows = cache.query("SELECT hour_id FROM hour_status WHERE hour_id >= ? AND hour_id <= ?").all(startHour, endHour);
    const present = new Set(presentRows.map((r) => r.hour_id));
    const missing = [];
    for (let h = startHour;h <= endHour; h += 1) {
      if (!present.has(h))
        missing.push(h);
    }
    if (missing.length === 0)
      return;
    const maxSpan = 168;
    let i = 0;
    while (i < missing.length) {
      const chunkStart = missing[i];
      let chunkEnd = chunkStart;
      while (i + 1 < missing.length && missing[i + 1] === chunkEnd + 1 && chunkEnd - chunkStart + 1 < maxSpan) {
        i += 1;
        chunkEnd = missing[i];
      }
      this.scanHoursIntoCache(source, cache, chunkStart * 3600000, chunkEnd * 3600000);
      i += 1;
    }
  }
  startBackgroundBackfill(minHour, maxHour) {
    if (this.backfillPromise)
      return this.backfillPromise;
    if (!existsSync(this.opencodeDbPath))
      return Promise.resolve();
    this.backfillRunning = true;
    this.backfillPromise = (async () => {
      try {
        const source = this.openSource();
        const cache = this.getCache();
        try {
          let lo = minHour;
          let hi = maxHour;
          if (lo === undefined || hi === undefined) {
            const bounds = source.query("SELECT MIN(time_created) as min_t, MAX(time_created) as max_t FROM session_message").get();
            if (!bounds.min_t || !bounds.max_t)
              return;
            lo = Math.floor(bounds.min_t / 3600000);
            hi = Math.floor(bounds.max_t / 3600000);
          }
          const present = new Set(cache.query("SELECT hour_id FROM hour_status WHERE hour_id >= ? AND hour_id <= ?").all(lo, hi).map((r) => r.hour_id));
          let cursor = hi;
          while (cursor >= lo) {
            const chunkStart = Math.max(lo, cursor - 167);
            let anyMissing = false;
            for (let h = chunkStart;h <= cursor; h += 1) {
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
      } catch {} finally {
        this.backfillRunning = false;
        this.backfillPromise = undefined;
      }
    })();
    return this.backfillPromise;
  }
  getEarliestDay(timezone) {
    if (!existsSync(this.opencodeDbPath))
      return;
    const source = this.openSource();
    try {
      const row = source.query("SELECT MIN(time_created) as min_t FROM session_v2").get();
      if (!row?.min_t)
        return;
      return formatDayInTz(row.min_t, createDayFormatter(timezone));
    } finally {
      source.close();
    }
  }
  queryLocalStats(query) {
    const nowMs = Date.now();
    const earliestDay = query.range === "all" ? this.getEarliestDay(query.timezone) : undefined;
    const { from, to, fromDay, toDay } = computeRangeBounds(query.range, nowMs, query.timezone, earliestDay);
    const allDays = enumerateDays(fromDay, toDay);
    const daysCount = Math.max(1, allDays.length);
    const weekdaysCount = Math.max(1, allDays.filter((d) => weekdayFromDayStr(d) < 5).length);
    const bucketGranularity = daysCount <= 45 ? "day" : "week";
    const dayFmt = createDayFormatter(query.timezone);
    const hourFmt = createHourFormatter(query.timezone);
    const dayBucketMap = new Map;
    const orderedBuckets = [];
    const bucketSeen = new Map;
    for (const day of allDays) {
      if (bucketGranularity === "day") {
        const b = {
          key: day,
          label: day.slice(5),
          startDate: day,
          endDate: day,
          days: 1
        };
        dayBucketMap.set(day, b);
        orderedBuckets.push(b);
      } else {
        const mon = weekMondayOf(day);
        let b = bucketSeen.get(mon);
        if (!b) {
          b = {
            key: mon,
            label: mon.slice(5),
            startDate: day,
            endDate: day,
            days: 0
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
        historyStatus: "complete",
        cachedHours: 0,
        totalHours: 0,
        dbAvailable: false,
        dbError: `Database not found at ${this.opencodeDbPath}`
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
        tools: { calls: 0, succeeded: 0, failed: 0, unfinished: 0 }
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
        reviews: 0
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
        prompts: 0
      })),
      modelSeries: {
        topModels: [],
        buckets: orderedBuckets.map((b) => ({
          key: b.key,
          label: b.label,
          totalCost: 0,
          totalTokens: 0,
          totalSteps: 0,
          byModel: {}
        }))
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
          byTool: {}
        }))
      },
      mcp: {
        totalCalls: 0,
        succeeded: 0,
        failed: 0,
        unfinished: 0,
        errorPct: 0,
        shareOfAllToolsPct: 0,
        servers: [],
        topServers: [],
        buckets: orderedBuckets.map((b) => ({
          key: b.key,
          label: b.label,
          totalCalls: 0,
          succeeded: 0,
          failed: 0,
          unfinished: 0,
          errorPct: 0,
          byServer: {}
        }))
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
        approvals: 0
      })),
      projects: [],
      topSessions: [],
      outcomes: {
        finishes: {},
        sessionOutcomes: {},
        parentsWithSubagents: 0,
        avgSubagentsPerParent: 0,
        avgStepsPerPrompt: 0,
        avgSessionDurationMs: 0
      },
      dayBucketMap,
      allDays
    });
    if (!existsSync(this.opencodeDbPath)) {
      return emptyResult();
    }
    const source = this.openSource();
    const cache = this.getCache();
    try {
      const syncInfo = this.syncRecentAndNeeded(source, cache, from, to, Boolean(query.refresh));
      const projectRows = source.query("SELECT id, worktree, name FROM project").all();
      const projectById = new Map;
      for (const p of projectRows) {
        const fallbackName = p.worktree === "/" ? "global" : p.worktree.split("/").filter(Boolean).pop() || p.id;
        projectById.set(p.id, {
          id: p.id,
          worktree: p.worktree,
          name: p.name || fallbackName
        });
      }
      const projectLabel = query.projectID ? projectById.get(query.projectID)?.name ?? query.projectID : "all projects";
      const sessionRows = source.query(`SELECT id, project_id, parent_id, title, summary_additions, summary_deletions, summary_files,
                  cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
                  time_created, time_updated, time_idle, idle_outcome
           FROM session_v2
           WHERE time_created >= ? AND time_created <= ?
             ${query.projectID ? "AND project_id = ?" : ""}`).all(...query.projectID ? [from, to, query.projectID] : [from, to]);
      const activityByDay = new Map;
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
          reviews: 0
        });
      }
      let rootSessions = 0;
      let subagentSessions = 0;
      let diffAdditions = 0;
      let diffDeletions = 0;
      let diffFiles = 0;
      let durationSum = 0;
      let durationCount = 0;
      const sessionOutcomes = {};
      const childrenPerParent = new Map;
      const projectAgg = new Map;
      const ensureProjectAgg = (pid) => {
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
            deletions: 0
          };
          projectAgg.set(pid, p);
        }
        return p;
      };
      const sessionCostEntries = [];
      for (const s of sessionRows) {
        const day = formatDayInTz(s.time_created, dayFmt);
        if (day < fromDay || day > toDay)
          continue;
        const act = activityByDay.get(day);
        if (s.parent_id) {
          subagentSessions += 1;
          if (act)
            act.subagents += 1;
          childrenPerParent.set(s.parent_id, (childrenPerParent.get(s.parent_id) ?? 0) + 1);
        } else {
          rootSessions += 1;
          if (act)
            act.sessions += 1;
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
        if (!s.parent_id && durMs > 0 && durMs < 14 * 86400000) {
          durationSum += durMs;
          durationCount += 1;
        }
        const pAgg = ensureProjectAgg(s.project_id || "global");
        if (s.parent_id)
          pAgg.subagents += 1;
        else
          pAgg.sessions += 1;
        pAgg.additions += adds;
        pAgg.deletions += dels;
        if (!s.parent_id) {
          const sTok = Number(s.tokens_input) + Number(s.tokens_output) + Number(s.tokens_reasoning) + Number(s.tokens_cache_read) + Number(s.tokens_cache_write);
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
            deletions: dels
          });
        }
      }
      for (const entry of sessionCostEntries) {
        entry.subagents = childrenPerParent.get(entry.id) ?? 0;
      }
      sessionCostEntries.sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
      const topSessions = sessionCostEntries.slice(0, 12);
      if (topSessions.length > 0) {
        const placeholders = topSessions.map(() => "?").join(",");
        const stepRows = source.query(`SELECT session_id, COUNT(*) as steps
             FROM session_message
             WHERE type = 'assistant' AND session_id IN (${placeholders})
             GROUP BY session_id`).all(...topSessions.map((t) => t.id));
        const stepMap = new Map(stepRows.map((r) => [r.session_id, r.steps]));
        for (const t of topSessions) {
          t.steps = stepMap.get(t.id) ?? 0;
        }
      }
      const fromHour = Math.floor(from / 3600000);
      const toHour = Math.floor(to / 3600000);
      const projFilterSql = query.projectID ? "AND project_id = ?" : "";
      const projParams = query.projectID ? [fromHour, toHour, query.projectID] : [fromHour, toHour];
      const modelRollups = cache.query(`SELECT * FROM agg_model WHERE hour_id >= ? AND hour_id <= ? ${projFilterSql}`).all(...projParams);
      const userRollups = cache.query(`SELECT * FROM agg_user WHERE hour_id >= ? AND hour_id <= ? ${projFilterSql}`).all(...projParams);
      const toolRollups = cache.query(`SELECT * FROM agg_tool WHERE hour_id >= ? AND hour_id <= ? ${projFilterSql}`).all(...projParams);
      const tokenSeriesMap = new Map;
      const modelSeriesMap = new Map;
      const toolSeriesMap = new Map;
      const mcpSeriesMap = new Map;
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
          prompts: 0
        });
        modelSeriesMap.set(b.key, {
          key: b.key,
          label: b.label,
          totalCost: 0,
          totalTokens: 0,
          totalSteps: 0,
          byModel: {}
        });
        toolSeriesMap.set(b.key, {
          key: b.key,
          label: b.label,
          totalCalls: 0,
          succeeded: 0,
          failed: 0,
          unfinished: 0,
          errorPct: 0,
          byTool: {}
        });
        mcpSeriesMap.set(b.key, {
          key: b.key,
          label: b.label,
          totalCalls: 0,
          succeeded: 0,
          failed: 0,
          unfinished: 0,
          errorPct: 0,
          byServer: {}
        });
      }
      const hourly = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        prompts: 0,
        steps: 0,
        tokens: 0,
        cost: 0
      }));
      const weekday = WEEKDAY_LABELS.map((label, wd) => ({
        weekday: wd,
        label,
        prompts: 0,
        steps: 0,
        tokens: 0,
        cost: 0,
        prsOpened: 0,
        approvals: 0
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
      const finishes = {};
      const modelAggMap = new Map;
      const agentAggMap = new Map;
      for (const r of userRollups) {
        const ts = r.hour_id * 3600000 + 1800000;
        const day = formatDayInTz(ts, dayFmt);
        if (day < fromDay || day > toDay)
          continue;
        const hr = formatHourInTz(ts, hourFmt);
        const wd = weekdayFromDayStr(day);
        const act = activityByDay.get(day);
        if (r.is_subagent) {
          subagentPrompts += r.prompts;
          if (act)
            act.subagentPrompts += r.prompts;
        } else {
          totalPrompts += r.prompts;
          if (act)
            act.prompts += r.prompts;
          hourly[hr].prompts += r.prompts;
          weekday[wd].prompts += r.prompts;
          const bMeta = dayBucketMap.get(day);
          const tb = bMeta ? tokenSeriesMap.get(bMeta.key) : undefined;
          if (tb)
            tb.prompts += r.prompts;
          const pAgg = ensureProjectAgg(r.project_id);
          pAgg.prompts += r.prompts;
        }
      }
      for (const r of modelRollups) {
        const ts = r.hour_id * 3600000 + 1800000;
        const day = formatDayInTz(ts, dayFmt);
        if (day < fromDay || day > toDay)
          continue;
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
        hourly[hr].steps += r.steps;
        hourly[hr].tokens += rowTok;
        hourly[hr].cost += r.cost;
        weekday[wd].steps += r.steps;
        weekday[wd].tokens += rowTok;
        weekday[wd].cost += r.cost;
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
        const modelKey = query.includeVariants && r.variant ? `${r.provider_id}/${r.model_id}#${r.variant}` : `${r.provider_id}/${r.model_id}`;
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
            ttftHist: new Map
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
      for (const tb of tokenSeriesMap.values()) {
        const denom = tb.input + tb.cacheRead + tb.cacheWrite;
        tb.cacheHitPct = denom > 0 ? tb.cacheRead / denom * 100 : 0;
      }
      const toolAggMap = new Map;
      const mcpServerMap = new Map;
      let toolCalls = 0;
      let toolSucceeded = 0;
      let toolFailed = 0;
      let toolUnfinished = 0;
      let mcpTotalCalls = 0;
      let mcpSucceeded = 0;
      let mcpFailed = 0;
      let mcpUnfinished = 0;
      for (const r of toolRollups) {
        const ts = r.hour_id * 3600000 + 1800000;
        const day = formatDayInTz(ts, dayFmt);
        if (day < fromDay || day > toDay)
          continue;
        toolCalls += r.calls;
        toolSucceeded += r.succeeded;
        toolFailed += r.failed;
        toolUnfinished += r.unfinished;
        const isMcp = isMcpToolName(r.tool_name);
        const mcpServer = isMcp ? extractMcpServer(r.tool_name) : undefined;
        let tAgg = toolAggMap.get(r.tool_name);
        if (!tAgg) {
          tAgg = {
            name: r.tool_name,
            isMcp,
            mcpServer,
            calls: 0,
            succeeded: 0,
            failed: 0,
            unfinished: 0,
            durSum: 0,
            durCnt: 0,
            durHist: new Map
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
        if (isMcp && mcpServer) {
          mcpTotalCalls += r.calls;
          mcpSucceeded += r.succeeded;
          mcpFailed += r.failed;
          mcpUnfinished += r.unfinished;
          let sAgg = mcpServerMap.get(mcpServer);
          if (!sAgg) {
            sAgg = {
              server: mcpServer,
              tools: new Set,
              calls: 0,
              succeeded: 0,
              failed: 0,
              unfinished: 0,
              durSum: 0,
              durCnt: 0,
              durHist: new Map
            };
            mcpServerMap.set(mcpServer, sAgg);
          }
          sAgg.tools.add(r.tool_name);
          sAgg.calls += r.calls;
          sAgg.succeeded += r.succeeded;
          sAgg.failed += r.failed;
          sAgg.unfinished += r.unfinished;
          sAgg.durSum += r.dur_sum;
          sAgg.durCnt += r.dur_cnt;
          mergeSerializedHist(sAgg.durHist, r.dur_hist);
          const msb = bMeta ? mcpSeriesMap.get(bMeta.key) : undefined;
          if (msb) {
            msb.totalCalls += r.calls;
            msb.succeeded += r.succeeded;
            msb.failed += r.failed;
            msb.unfinished += r.unfinished;
            msb.byServer[mcpServer] = (msb.byServer[mcpServer] ?? 0) + r.calls;
          }
        }
      }
      for (const tsb of toolSeriesMap.values()) {
        const finished = tsb.succeeded + tsb.failed;
        tsb.errorPct = finished > 0 ? tsb.failed / finished * 100 : 0;
      }
      for (const msb of mcpSeriesMap.values()) {
        const finished = msb.succeeded + msb.failed;
        msb.errorPct = finished > 0 ? msb.failed / finished * 100 : 0;
      }
      const activity = allDays.map((d) => activityByDay.get(d));
      let activeDays = 0;
      let bestStreak = 0;
      let curStreak = 0;
      for (const row of activity) {
        if (row.steps > 0 || row.prompts > 0) {
          activeDays += 1;
          curStreak += 1;
          if (curStreak > bestStreak)
            bestStreak = curStreak;
        } else {
          curStreak = 0;
        }
      }
      let currentStreak = 0;
      for (let i = activity.length - 1;i >= 0; i -= 1) {
        const row = activity[i];
        if (row.steps > 0 || row.prompts > 0) {
          currentStreak += 1;
        } else if (i === activity.length - 1) {
          continue;
        } else {
          break;
        }
      }
      const models = [...modelAggMap.values()].map((m) => {
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
            total
          },
          cost: m.cost,
          costPer1M: total > 0 ? m.cost / total * 1e6 : 0,
          cacheHitPct: cacheDenom > 0 ? m.cacheRead / cacheDenom * 100 : 0,
          avgStepMs: m.durCnt > 0 ? m.durSum / m.durCnt : undefined,
          ttftP50Ms: quantileFromHist(m.ttftHist, 0.5),
          ttftAvgMs: m.ttftCnt > 0 ? m.ttftSum / m.ttftCnt : undefined,
          tpsAvg: m.streamMsSum > 0 ? m.streamTok / (m.streamMsSum / 1000) : undefined
        };
      }).sort((a, b) => b.cost - a.cost || b.tokens.total - a.tokens.total || b.steps - a.steps);
      const topModels = models.slice(0, 5).map((m) => m.key);
      const agents = [...agentAggMap.values()].map((a) => ({
        agent: a.agent,
        steps: a.steps,
        tokens: a.tokens,
        cost: a.cost,
        sharePct: totalSteps > 0 ? a.steps / totalSteps * 100 : 0,
        avgStepMs: a.durCnt > 0 ? a.durSum / a.durCnt : undefined
      })).sort((a, b) => b.steps - a.steps);
      const tools = [...toolAggMap.values()].map((t) => {
        const finished = t.succeeded + t.failed;
        return {
          name: t.name,
          isMcp: t.isMcp,
          mcpServer: t.mcpServer,
          calls: t.calls,
          succeeded: t.succeeded,
          failed: t.failed,
          unfinished: t.unfinished,
          errorPct: finished > 0 ? t.failed / finished * 100 : 0,
          p50Ms: quantileFromHist(t.durHist, 0.5),
          p95Ms: quantileFromHist(t.durHist, 0.95),
          avgMs: t.durCnt > 0 ? t.durSum / t.durCnt : undefined
        };
      }).sort((a, b) => b.calls - a.calls);
      const topTools = tools.slice(0, 5).map((t) => t.name);
      const mcpServers = [...mcpServerMap.values()].map((s) => {
        const finished = s.succeeded + s.failed;
        return {
          server: s.server,
          toolsCount: s.tools.size,
          calls: s.calls,
          succeeded: s.succeeded,
          failed: s.failed,
          unfinished: s.unfinished,
          errorPct: finished > 0 ? s.failed / finished * 100 : 0,
          sharePct: mcpTotalCalls > 0 ? s.calls / mcpTotalCalls * 100 : 0,
          p50Ms: quantileFromHist(s.durHist, 0.5),
          p95Ms: quantileFromHist(s.durHist, 0.95),
          avgMs: s.durCnt > 0 ? s.durSum / s.durCnt : undefined
        };
      }).sort((a, b) => b.calls - a.calls);
      const topMcpServers = mcpServers.slice(0, 5).map((s) => s.server);
      const mcpFinished = mcpSucceeded + mcpFailed;
      const projects = [...projectAgg.values()].filter((p) => p.sessions > 0 || p.steps > 0 || p.tokens > 0).sort((a, b) => b.cost - a.cost || b.tokens - a.tokens || b.sessions - a.sessions);
      const totalTokens = totalIn + totalOut + totalReas + totalCR + totalCW;
      const cacheDenom = totalIn + totalCR + totalCW;
      const parentsWithSubagents = childrenPerParent.size;
      const avgSubagentsPerParent = parentsWithSubagents > 0 ? subagentSessions / parentsWithSubagents : 0;
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
          dbAvailable: true
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
            total: totalTokens
          },
          tokensPerDay: totalTokens / daysCount,
          tokensPerActiveDay: totalTokens / activeDivisor,
          cacheHitPct: cacheDenom > 0 ? totalCR / cacheDenom * 100 : 0,
          codeDiff: {
            additions: diffAdditions,
            deletions: diffDeletions,
            files: diffFiles
          },
          tools: {
            calls: toolCalls,
            succeeded: toolSucceeded,
            failed: toolFailed,
            unfinished: toolUnfinished
          }
        },
        activity,
        tokenSeries: orderedBuckets.map((b) => tokenSeriesMap.get(b.key)),
        modelSeries: {
          topModels,
          buckets: orderedBuckets.map((b) => modelSeriesMap.get(b.key))
        },
        models,
        toolSeries: {
          topTools,
          buckets: orderedBuckets.map((b) => toolSeriesMap.get(b.key))
        },
        mcp: {
          totalCalls: mcpTotalCalls,
          succeeded: mcpSucceeded,
          failed: mcpFailed,
          unfinished: mcpUnfinished,
          errorPct: mcpFinished > 0 ? mcpFailed / mcpFinished * 100 : 0,
          shareOfAllToolsPct: toolCalls > 0 ? mcpTotalCalls / toolCalls * 100 : 0,
          servers: mcpServers,
          topServers: topMcpServers,
          buckets: orderedBuckets.map((b) => mcpSeriesMap.get(b.key))
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
          avgSessionDurationMs: durationCount > 0 ? durationSum / durationCount : 0
        },
        dayBucketMap,
        allDays
      };
    } finally {
      source.close();
    }
  }
}

// src/github.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, writeFileSync } from "fs";
import { dirname as dirname2, join as join2 } from "path";
var CACHE_TTL_MS = 5 * 60000;
function resolveDefaultGitHubCachePath() {
  const cacheHome = process.env.XDG_CACHE_HOME || join2(process.env.HOME || "", ".cache");
  return join2(cacheHome, "opencode", "deep-stats-github.v1.json");
}
function detectGithubRepoFromDir(directory) {
  if (!directory || directory === "/" || !existsSync2(directory))
    return;
  try {
    const proc = Bun.spawnSync(["git", "-C", directory, "remote", "get-url", "origin"], {
      stdout: "pipe",
      stderr: "pipe"
    });
    if (proc.exitCode !== 0)
      return;
    const url = proc.stdout.toString().trim();
    const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i);
    return match?.[1];
  } catch {
    return;
  }
}
function findGhBinary() {
  const fromPath = Bun.which("gh");
  if (fromPath)
    return fromPath;
  for (const candidate of ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"]) {
    if (existsSync2(candidate))
      return candidate;
  }
  return;
}
function getGhToken() {
  const gh = findGhBinary();
  if (!gh) {
    return { error: "gh CLI not found in PATH" };
  }
  try {
    const proc = Bun.spawnSync([gh, "auth", "token"], {
      stdout: "pipe",
      stderr: "pipe"
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
async function runGraphql(token, query, variables) {
  const host = process.env.GH_HOST?.trim();
  const endpoint = host && host !== "github.com" ? `https://${host}/api/graphql` : "https://api.github.com/graphql";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "opencode-deep-stats"
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(25000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub GraphQL HTTP ${res.status}: ${text.slice(0, 180)}`);
  }
  const json = await res.json();
  if (json.errors?.length && !json.data) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Empty GitHub GraphQL response");
  }
  return json.data;
}
var AUTHORED_QUERY = `
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
var REVIEWED_QUERY = `
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
function dayMidpoint(startDay, endDay) {
  const s = Date.parse(`${startDay}T00:00:00Z`);
  const e = Date.parse(`${endDay}T00:00:00Z`);
  const mid = Math.floor((s + e) / 2 / 86400000) * 86400000;
  return new Date(mid).toISOString().slice(0, 10);
}
async function fetchAuthoredSlice(token, login, startDay, endDay, depth = 0) {
  const q = `is:pr author:${login} created:${startDay}..${endDay}`;
  const firstPage = await runGraphql(token, AUTHORED_QUERY, {
    q,
    cursor: null
  });
  if (firstPage.search.issueCount >= 950 && startDay < endDay && depth < 6) {
    const mid = dayMidpoint(startDay, endDay);
    if (mid > startDay && mid < endDay) {
      const [left, right] = await Promise.all([
        fetchAuthoredSlice(token, login, startDay, mid, depth + 1),
        fetchAuthoredSlice(token, login, addDaysToDayStr(mid, 1), endDay, depth + 1)
      ]);
      return [...left, ...right];
    }
  }
  const allNodes = [];
  for (const n of firstPage.search.nodes)
    if (n)
      allNodes.push(n);
  let cursor = firstPage.search.pageInfo.hasNextPage ? firstPage.search.pageInfo.endCursor : null;
  let pages = 1;
  while (cursor && pages < 10) {
    const nextPage = await runGraphql(token, AUTHORED_QUERY, {
      q,
      cursor
    });
    for (const n of nextPage.search.nodes)
      if (n)
        allNodes.push(n);
    cursor = nextPage.search.pageInfo.hasNextPage ? nextPage.search.pageInfo.endCursor : null;
    pages += 1;
  }
  return allNodes.filter((n) => Boolean(n.id && n.number && n.createdAt && n.repository?.nameWithOwner)).map((n) => ({
    id: n.id,
    number: n.number,
    repo: n.repository.nameWithOwner,
    title: n.title || `PR #${n.number}`,
    state: n.state || "OPEN",
    createdAt: n.createdAt,
    mergedAt: n.mergedAt ?? null,
    closedAt: n.closedAt ?? null,
    additions: Number(n.additions ?? 0),
    deletions: Number(n.deletions ?? 0)
  }));
}
async function fetchReviewedSlice(token, login, startDay, endDay, isUpperOpen, depth = 0) {
  const qualifier = isUpperOpen ? `updated:>=${startDay}` : `updated:${startDay}..${endDay}`;
  const q = `is:pr reviewed-by:${login} ${qualifier}`;
  const firstPage = await runGraphql(token, REVIEWED_QUERY, {
    q,
    cursor: null,
    login
  });
  if (firstPage.search.issueCount >= 950 && startDay < endDay && depth < 6) {
    const mid = dayMidpoint(startDay, endDay);
    if (mid > startDay && mid < endDay) {
      const [left, right] = await Promise.all([
        fetchReviewedSlice(token, login, startDay, mid, false, depth + 1),
        fetchReviewedSlice(token, login, addDaysToDayStr(mid, 1), endDay, isUpperOpen, depth + 1)
      ]);
      return [...left, ...right];
    }
  }
  const allNodes = [];
  for (const n of firstPage.search.nodes)
    if (n)
      allNodes.push(n);
  let cursor = firstPage.search.pageInfo.hasNextPage ? firstPage.search.pageInfo.endCursor : null;
  let pages = 1;
  while (cursor && pages < 10) {
    const nextPage = await runGraphql(token, REVIEWED_QUERY, {
      q,
      cursor,
      login
    });
    for (const n of nextPage.search.nodes)
      if (n)
        allNodes.push(n);
    cursor = nextPage.search.pageInfo.hasNextPage ? nextPage.search.pageInfo.endCursor : null;
    pages += 1;
  }
  const reviews = [];
  for (const pr of allNodes) {
    if (!pr.number || !pr.repository?.nameWithOwner)
      continue;
    for (const rev of pr.reviews?.nodes ?? []) {
      if (!rev?.id || !rev.submittedAt)
        continue;
      reviews.push({
        id: rev.id,
        prNumber: pr.number,
        repo: pr.repository.nameWithOwner,
        prTitle: pr.title || `PR #${pr.number}`,
        prState: pr.state || "OPEN",
        reviewState: rev.state,
        submittedAt: rev.submittedAt
      });
    }
  }
  return reviews;
}

class GitHubStatsClient {
  cachePath;
  memoryCache = [];
  diskLoaded = false;
  inflight = new Map;
  constructor(options) {
    this.cachePath = options?.cachePath ?? resolveDefaultGitHubCachePath();
  }
  loadDisk() {
    if (this.diskLoaded)
      return;
    this.diskLoaded = true;
    try {
      if (!existsSync2(this.cachePath))
        return;
      const parsed = JSON.parse(readFileSync(this.cachePath, "utf8"));
      if (Array.isArray(parsed.entries)) {
        this.memoryCache = parsed.entries;
      }
    } catch {
      this.memoryCache = [];
    }
  }
  saveDisk() {
    try {
      mkdirSync2(dirname2(this.cachePath), { recursive: true });
      writeFileSync(this.cachePath, JSON.stringify({ entries: this.memoryCache.slice(0, 6) }), "utf8");
    } catch {}
  }
  findCoveringCache(fromDay, toDay, maxAgeMs) {
    this.loadDisk();
    const now = Date.now();
    return this.memoryCache.find((entry) => now - entry.fetchedAt <= maxAgeMs && entry.fromDay <= fromDay && entry.toDay >= toDay);
  }
  upsertCache(entry) {
    this.loadDisk();
    const filtered = this.memoryCache.filter((e) => !(e.fromDay === entry.fromDay && e.toDay === entry.toDay && e.login === entry.login));
    this.memoryCache = [entry, ...filtered].slice(0, 6);
    this.saveDisk();
  }
  async fetchWindow(fromDay, toDay, options) {
    if (!options?.forceRefresh) {
      const fresh = this.findCoveringCache(fromDay, toDay, CACHE_TTL_MS);
      if (fresh)
        return { data: fresh };
    }
    if (options?.cacheOnly) {
      const stale = this.findCoveringCache(fromDay, toDay, Number.MAX_SAFE_INTEGER);
      if (stale)
        return { data: stale, stale: true };
      return {};
    }
    const auth = getGhToken();
    if (!auth.token) {
      const stale = this.findCoveringCache(fromDay, toDay, Number.MAX_SAFE_INTEGER);
      if (stale)
        return { data: stale, stale: true, error: auth.error };
      return { error: auth.error ?? "GitHub CLI unavailable" };
    }
    const token = auth.token;
    const key = `${fromDay}:${toDay}`;
    let promise = this.inflight.get(key);
    if (!promise) {
      promise = (async () => {
        const viewerRes = await runGraphql(token, "query { viewer { login } }");
        const login = viewerRes.viewer.login;
        const searchStart = addDaysToDayStr(fromDay, -1);
        const searchEnd = addDaysToDayStr(toDay, 1);
        const [authoredRaw, reviewedRaw] = await Promise.all([
          fetchAuthoredSlice(token, login, searchStart, searchEnd),
          fetchReviewedSlice(token, login, searchStart, searchEnd, true)
        ]);
        const authoredMap = new Map;
        for (const pr of authoredRaw) {
          authoredMap.set(`${pr.repo}#${pr.number}`, pr);
        }
        const reviewMap = new Map;
        for (const rev of reviewedRaw) {
          reviewMap.set(rev.id, rev);
        }
        const entry = {
          fetchedAt: Date.now(),
          login,
          fromDay,
          toDay,
          authored: [...authoredMap.values()],
          reviews: [...reviewMap.values()]
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
      if (stale)
        return { data: stale, stale: true, error: message };
      return { error: message };
    }
  }
}
function buildGitHubStats(params) {
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
    localTotals
  } = params;
  const seriesMap = new Map;
  for (const b of buckets) {
    seriesMap.set(b.key, {
      key: b.key,
      label: b.label,
      opened: 0,
      merged: 0,
      approvals: 0,
      changesRequested: 0,
      comments: 0,
      reviews: 0
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
      series: buckets.map((b) => seriesMap.get(b.key)),
      repos: [],
      recentOpened: [],
      recentReviewed: [],
      efficiency: {}
    };
  }
  const dayFmt = createDayFormatter(timezone);
  const targetRepo = repoFilter?.toLowerCase();
  const repoMap = new Map;
  const ensureRepo = (repo) => {
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
        deletions: 0
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
  const mergeHoursList = [];
  const activePrDays = new Set;
  const recentOpened = [];
  for (const pr of raw.authored) {
    if (targetRepo && pr.repo.toLowerCase() !== targetRepo)
      continue;
    const createdMs = Date.parse(pr.createdAt);
    if (!Number.isFinite(createdMs))
      continue;
    const day = formatDayInTz(createdMs, dayFmt);
    if (day < fromDay || day > toDay)
      continue;
    openedTotal += 1;
    activePrDays.add(day);
    additions += pr.additions;
    deletions += pr.deletions;
    if (pr.state === "MERGED")
      mergedTotal += 1;
    else if (pr.state === "OPEN")
      openTotal += 1;
    else
      closedTotal += 1;
    if (pr.mergedAt) {
      const mergedMs = Date.parse(pr.mergedAt);
      if (Number.isFinite(mergedMs) && mergedMs >= createdMs) {
        mergeHoursList.push((mergedMs - createdMs) / 3600000);
      }
    }
    const act = activityByDay.get(day);
    if (act) {
      act.prsOpened += 1;
      if (pr.state === "MERGED")
        act.prsMerged += 1;
    }
    const wd = weekdayFromDayStr(day);
    if (weekday[wd])
      weekday[wd].prsOpened += 1;
    const bMeta = dayBucketMap.get(day);
    const sb = bMeta ? seriesMap.get(bMeta.key) : undefined;
    if (sb) {
      sb.opened += 1;
      if (pr.state === "MERGED")
        sb.merged += 1;
    }
    const repoRow = ensureRepo(pr.repo);
    repoRow.opened += 1;
    if (pr.state === "MERGED")
      repoRow.merged += 1;
    else if (pr.state === "OPEN")
      repoRow.open += 1;
    else
      repoRow.closed += 1;
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
      deletions: pr.deletions
    });
  }
  let approvalsTotal = 0;
  let changesRequestedTotal = 0;
  let commentsTotal = 0;
  let reviewsTotal = 0;
  const approvedPrKeys = new Set;
  const reviewedPrKeys = new Set;
  const recentReviewed = [];
  for (const rev of raw.reviews) {
    if (targetRepo && rev.repo.toLowerCase() !== targetRepo)
      continue;
    const subMs = Date.parse(rev.submittedAt);
    if (!Number.isFinite(subMs))
      continue;
    const day = formatDayInTz(subMs, dayFmt);
    if (day < fromDay || day > toDay)
      continue;
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
      if (isApproval)
        act.approvals += 1;
    }
    const wd = weekdayFromDayStr(day);
    if (weekday[wd] && isApproval)
      weekday[wd].approvals += 1;
    const bMeta = dayBucketMap.get(day);
    const sb = bMeta ? seriesMap.get(bMeta.key) : undefined;
    if (sb) {
      sb.reviews += 1;
      if (isApproval)
        sb.approvals += 1;
      else if (isChangesReq)
        sb.changesRequested += 1;
      else if (isComment)
        sb.comments += 1;
    }
    const repoRow = ensureRepo(rev.repo);
    repoRow.reviews += 1;
    if (isApproval)
      repoRow.approvals += 1;
    else if (isChangesReq)
      repoRow.changesRequested += 1;
    else if (isComment)
      repoRow.comments += 1;
    recentReviewed.push({
      number: rev.prNumber,
      repo: rev.repo,
      title: rev.prTitle,
      prState: rev.prState,
      reviewState: rev.reviewState,
      submittedAt: rev.submittedAt
    });
  }
  recentOpened.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  recentReviewed.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  mergeHoursList.sort((a, b) => a - b);
  const medianMergeHours = mergeHoursList.length > 0 ? mergeHoursList[Math.floor(mergeHoursList.length / 2)] : undefined;
  const finalizedPrs = mergedTotal + closedTotal;
  const mergeRatePct = finalizedPrs > 0 ? mergedTotal / finalizedPrs * 100 : openedTotal > 0 ? 0 : 0;
  const repos = [...repoMap.values()].sort((a, b) => b.opened + b.approvals - (a.opened + a.approvals) || b.reviews - a.reviews);
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
    approvalRatePct: reviewsTotal > 0 ? approvalsTotal / reviewsTotal * 100 : 0,
    series: buckets.map((b) => seriesMap.get(b.key)),
    repos,
    recentOpened: recentOpened.slice(0, 12),
    recentReviewed: recentReviewed.slice(0, 12),
    efficiency: {
      costPerPr: openedTotal > 0 ? localTotals.cost / openedTotal : undefined,
      tokensPerPr: openedTotal > 0 ? localTotals.tokens / openedTotal : undefined,
      promptsPerPr: openedTotal > 0 ? localTotals.prompts / openedTotal : undefined,
      sessionsPerPr: openedTotal > 0 ? localTotals.sessions / openedTotal : undefined
    }
  };
}

// src/aggregator.ts
class DeepStatsAggregator {
  store;
  github;
  onUpdated;
  constructor(options) {
    this.onUpdated = options?.onUpdated;
    this.store = new DeepStatsStore({
      opencodeDbPath: options?.opencodeDbPath,
      cacheDbPath: options?.cacheDbPath,
      onBackfillProgress: () => this.onUpdated?.()
    });
    this.github = new GitHubStatsClient({
      cachePath: options?.githubCachePath
    });
  }
  close() {
    this.store.close();
  }
  warmBackground() {
    this.store.startBackgroundBackfill();
  }
  async getStats(query) {
    const local = this.store.queryLocalStats(query);
    const fromDay = local.allDays[0] ?? new Date().toISOString().slice(0, 10);
    const toDay = local.allDays[local.allDays.length - 1] ?? fromDay;
    const repoFilter = query.githubRepo ?? (query.projectID && query.projectDirectory ? detectGithubRepoFromDir(query.projectDirectory) : undefined);
    const activityByDay = new Map(local.activity.map((row) => [row.date, row]));
    const buckets = local.tokenSeries.map((b) => ({ key: b.key, label: b.label }));
    let rawGh;
    let ghStatus = "loading";
    let ghMsg;
    if (query.githubMode === "skip") {
      ghStatus = "unavailable";
      ghMsg = "GitHub stats skipped";
    } else if (query.githubMode === "cache-only") {
      const cachedRes = await this.github.fetchWindow(fromDay, toDay, { cacheOnly: true });
      if (cachedRes.data) {
        rawGh = cachedRes.data;
        ghStatus = "ok";
        if (cachedRes.stale)
          ghMsg = "Refreshing GitHub\u2026";
      } else {
        ghStatus = "loading";
        ghMsg = "Fetching GitHub PRs & approvals\u2026";
      }
    } else {
      const res = await this.github.fetchWindow(fromDay, toDay, {
        forceRefresh: Boolean(query.refresh)
      });
      if (res.data) {
        rawGh = res.data;
        ghStatus = "ok";
        if (res.stale)
          ghMsg = `Cached (${res.error ?? "offline"})`;
      } else {
        ghStatus = res.error?.includes("not logged in") || res.error?.includes("not found") ? "unavailable" : "error";
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
        sessions: local.summary.sessions
      }
    });
    const { dayBucketMap: _discard1, allDays: _discard2, ...restLocal } = local;
    return {
      ...restLocal,
      github
    };
  }
}

// src/rpc.ts
import { Rpc } from "@opencode/plugin/rpc";
var DeepStatsRpc = Rpc.define({
  id: "deep-stats",
  methods: {
    getStats: {
      input: {
        type: "object",
        properties: {
          range: { type: "string", enum: ["7d", "30d", "90d", "ytd", "all"] },
          projectID: { type: "string" },
          projectDirectory: { type: "string" },
          githubRepo: { type: "string" },
          timezone: { type: "string" },
          includeVariants: { type: "boolean" },
          refresh: { type: "boolean" },
          githubMode: { type: "string", enum: ["sync", "cache-only", "skip"] }
        },
        required: ["range", "timezone", "includeVariants"],
        additionalProperties: false
      },
      output: {
        type: "object",
        additionalProperties: true
      }
    }
  },
  events: {
    updated: {
      schema: {
        type: "object",
        properties: {
          reason: { type: "string" },
          at: { type: "number" }
        },
        required: ["reason", "at"],
        additionalProperties: false
      }
    }
  }
});

// src/ui/DeepStatsScreen.tsx
import { use as _$use } from "@opentui/solid";
import { effect as _$effect3 } from "@opentui/solid";
import { memo as _$memo3 } from "@opentui/solid";
import { insert as _$insert3 } from "@opentui/solid";
import { createComponent as _$createComponent3 } from "@opentui/solid";
import { createTextNode as _$createTextNode3 } from "@opentui/solid";
import { insertNode as _$insertNode3 } from "@opentui/solid";
import { setProp as _$setProp3 } from "@opentui/solid";
import { createElement as _$createElement3 } from "@opentui/solid";
import { TextAttributes as TextAttributes3 } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { For as For3, Match, Show as Show3, Switch, batch, createEffect, createMemo as createMemo3, createSignal, on, onCleanup, onMount } from "solid-js";

// src/ui/sections.tsx
import { createTextNode as _$createTextNode2 } from "@opentui/solid";
import { effect as _$effect2 } from "@opentui/solid";
import { insertNode as _$insertNode2 } from "@opentui/solid";
import { insert as _$insert2 } from "@opentui/solid";
import { memo as _$memo2 } from "@opentui/solid";
import { createComponent as _$createComponent2 } from "@opentui/solid";
import { setProp as _$setProp2 } from "@opentui/solid";
import { createElement as _$createElement2 } from "@opentui/solid";
import { TextAttributes as TextAttributes2 } from "@opentui/core";
import { For as For2, Show as Show2, createMemo as createMemo2 } from "solid-js";

// src/ui/components.tsx
import { effect as _$effect } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import { For, Show, createMemo } from "solid-js";
function getSeriesPalette(theme) {
  const out = [];
  for (const scale of theme.categorical ?? []) {
    const color = scale?.[200] ?? scale?.[300] ?? scale?.[100];
    if (color)
      out.push(color);
  }
  const fallbacks = [theme.hue?.interactive?.[200], theme.hue?.accent?.[200], theme.text.feedback.success.base, theme.text.feedback.info.base, theme.text.feedback.warning.base, theme.text.feedback.error.base];
  for (const fb of fallbacks) {
    if (fb && out.length < 6)
      out.push(fb);
  }
  if (out.length === 0)
    out.push(theme.text.base);
  return out;
}
function renderLogoLine(line, fg, background, bold) {
  const shadow = mixColor(background, fg, 0.25);
  const attrs = bold ? TextAttributes.BOLD : undefined;
  const elements = [];
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    const markerIdx = rest.search(/[_^~]/);
    if (markerIdx === -1) {
      elements.push((() => {
        var _el$ = _$createElement("text");
        _$setProp(_el$, "fg", fg);
        _$setProp(_el$, "attributes", attrs);
        _$setProp(_el$, "selectable", false);
        _$insert(_el$, rest);
        return _el$;
      })());
      break;
    }
    if (markerIdx > 0) {
      elements.push((() => {
        var _el$2 = _$createElement("text");
        _$setProp(_el$2, "fg", fg);
        _$setProp(_el$2, "attributes", attrs);
        _$setProp(_el$2, "selectable", false);
        _$insert(_el$2, () => rest.slice(0, markerIdx));
        return _el$2;
      })());
    }
    const ch = rest[markerIdx];
    if (ch === "_") {
      elements.push((() => {
        var _el$3 = _$createElement("text");
        _$insertNode(_el$3, _$createTextNode(` `));
        _$setProp(_el$3, "fg", fg);
        _$setProp(_el$3, "bg", shadow);
        _$setProp(_el$3, "attributes", attrs);
        _$setProp(_el$3, "selectable", false);
        return _el$3;
      })());
    } else if (ch === "^") {
      elements.push((() => {
        var _el$5 = _$createElement("text");
        _$insertNode(_el$5, _$createTextNode(`\u2580`));
        _$setProp(_el$5, "fg", fg);
        _$setProp(_el$5, "bg", shadow);
        _$setProp(_el$5, "attributes", attrs);
        _$setProp(_el$5, "selectable", false);
        return _el$5;
      })());
    } else {
      elements.push((() => {
        var _el$7 = _$createElement("text");
        _$insertNode(_el$7, _$createTextNode(`\u2580`));
        _$setProp(_el$7, "fg", shadow);
        _$setProp(_el$7, "attributes", attrs);
        _$setProp(_el$7, "selectable", false);
        return _el$7;
      })());
    }
    i += markerIdx + 1;
  }
  return elements;
}
function OpenCodeLogo(props) {
  return (() => {
    var _el$9 = _$createElement("box");
    _$setProp(_el$9, "flexDirection", "column");
    _$setProp(_el$9, "alignItems", "center");
    _$setProp(_el$9, "flexShrink", 0);
    _$insert(_el$9, _$createComponent(For, {
      get each() {
        return _$memo(() => !!props.compact)() ? OPENCODE_LOGO.left.slice(1) : OPENCODE_LOGO.left;
      },
      children: (leftLine, idx) => {
        const rightLine = () => props.compact ? OPENCODE_LOGO.right[idx() + 1] ?? "" : OPENCODE_LOGO.right[idx()] ?? "";
        return (() => {
          var _el$0 = _$createElement("box"), _el$1 = _$createElement("box"), _el$10 = _$createElement("box");
          _$insertNode(_el$0, _el$1);
          _$insertNode(_el$0, _el$10);
          _$setProp(_el$0, "flexDirection", "row");
          _$setProp(_el$0, "gap", 1);
          _$setProp(_el$1, "flexDirection", "row");
          _$insert(_el$1, () => renderLogoLine(leftLine, props.theme().text.muted, props.theme().background.base, false));
          _$setProp(_el$10, "flexDirection", "row");
          _$insert(_el$10, () => renderLogoLine(rightLine(), props.theme().text.base, props.theme().background.base, true));
          return _el$0;
        })();
      }
    }));
    return _el$9;
  })();
}
function PixelHero(props) {
  const lines = createMemo(() => renderPixelLines(props.valueText, props.maxWidth));
  return (() => {
    var _el$11 = _$createElement("box"), _el$12 = _$createElement("text");
    _$insertNode(_el$11, _el$12);
    _$setProp(_el$11, "flexDirection", "column");
    _$setProp(_el$11, "alignItems", "center");
    _$setProp(_el$11, "gap", 1);
    _$insert(_el$11, _$createComponent(Show, {
      get when() {
        return lines();
      },
      get fallback() {
        return (() => {
          var _el$13 = _$createElement("text");
          _$insert(_el$13, () => props.valueText);
          _$effect((_p$) => {
            var _v$ = props.theme().text.base, _v$2 = TextAttributes.BOLD;
            _v$ !== _p$.e && (_p$.e = _$setProp(_el$13, "fg", _v$, _p$.e));
            _v$2 !== _p$.t && (_p$.t = _$setProp(_el$13, "attributes", _v$2, _p$.t));
            return _p$;
          }, {
            e: undefined,
            t: undefined
          });
          return _el$13;
        })();
      },
      children: (pixelRows) => (() => {
        var _el$14 = _$createElement("box");
        _$setProp(_el$14, "flexDirection", "column");
        _$setProp(_el$14, "alignItems", "center");
        _$insert(_el$14, _$createComponent(For, {
          get each() {
            return pixelRows();
          },
          children: (row) => (() => {
            var _el$15 = _$createElement("text");
            _$setProp(_el$15, "selectable", false);
            _$insert(_el$15, row);
            _$effect((_$p) => _$setProp(_el$15, "fg", props.theme().text.base, _$p));
            return _el$15;
          })()
        }));
        return _el$14;
      })()
    }), _el$12);
    _$insert(_el$12, () => props.label);
    _$effect((_$p) => _$setProp(_el$12, "fg", props.theme().text.muted, _$p));
    return _el$11;
  })();
}
function HeatmapGrid(props) {
  const grid = createMemo(() => buildActivityGrid(props.activity, props.fromDay, props.toDay, Math.max(4, Math.floor((props.maxWidth - 4) / 2)), props.metric));
  const ramp = createMemo(() => {
    const t = props.theme();
    const base = t.background.base;
    const accent = props.metric === "github" ? t.text.feedback.success.base : props.metric === "cost" ? t.text.feedback.warning.base : props.metric === "tokens" ? t.hue?.interactive?.[200] ?? t.categorical?.[1]?.[200] ?? t.text.base : t.categorical?.[0]?.[200] ?? t.hue?.interactive?.[200] ?? t.text.base;
    return [t.text.muted, ...[0.3, 0.5, 0.75, 1].map((a) => mixColor(base, accent, a))];
  });
  const monthHeader = createMemo(() => {
    const months = grid().months;
    return "    " + months.map((m) => (m.label.length <= m.span * 2 ? m.label : "").padEnd(m.span * 2)).join("");
  });
  const metricLabel = () => {
    switch (props.metric) {
      case "steps":
        return "steps";
      case "tokens":
        return "tokens";
      case "cost":
        return "cost";
      case "github":
        return "PRs + approvals";
    }
  };
  return (() => {
    var _el$16 = _$createElement("box"), _el$17 = _$createElement("text"), _el$18 = _$createElement("box"), _el$19 = _$createElement("text"), _el$20 = _$createTextNode(` \xB7 `), _el$21 = _$createElement("box"), _el$22 = _$createElement("text"), _el$24 = _$createElement("text");
    _$insertNode(_el$16, _el$17);
    _$insertNode(_el$16, _el$18);
    _$setProp(_el$16, "flexDirection", "column");
    _$setProp(_el$16, "alignItems", "center");
    _$setProp(_el$17, "selectable", false);
    _$insert(_el$17, monthHeader);
    _$insert(_el$16, _$createComponent(For, {
      each: ["M", "T", "W", "T", "F", "S", "S"],
      children: (dayLabel, rowIdx) => (() => {
        var _el$26 = _$createElement("box"), _el$27 = _$createElement("text");
        _$insertNode(_el$26, _el$27);
        _$setProp(_el$26, "flexDirection", "row");
        _$setProp(_el$26, "height", 1);
        _$setProp(_el$27, "selectable", false);
        _$insert(_el$27, dayLabel + "   ");
        _$insert(_el$26, _$createComponent(For, {
          get each() {
            return grid().weeks;
          },
          children: (week) => {
            const cell = () => week[rowIdx()] ?? {
              level: -1,
              date: "",
              value: 0
            };
            const glyph = () => cell().level < 0 ? "  " : cell().level === 0 ? "\xB7 " : "\u25A0 ";
            const color = () => ramp()[Math.max(0, cell().level)] ?? props.theme().text.muted;
            return (() => {
              var _el$28 = _$createElement("text");
              _$setProp(_el$28, "selectable", false);
              _$insert(_el$28, glyph);
              _$effect((_$p) => _$setProp(_el$28, "fg", color(), _$p));
              return _el$28;
            })();
          }
        }), null);
        _$effect((_$p) => _$setProp(_el$27, "fg", props.theme().text.muted, _$p));
        return _el$26;
      })()
    }), _el$18);
    _$insertNode(_el$18, _el$19);
    _$insertNode(_el$18, _el$21);
    _$setProp(_el$18, "flexDirection", "row");
    _$setProp(_el$18, "gap", 2);
    _$setProp(_el$18, "marginTop", 1);
    _$insertNode(_el$19, _el$20);
    _$setProp(_el$19, "selectable", false);
    _$insert(_el$19, (() => {
      var _c$ = _$memo(() => !!grid().clipped);
      return () => _c$() ? `last ${grid().weeks.length}w` : `${grid().weeks.length}w`;
    })(), _el$20);
    _$insert(_el$19, metricLabel, null);
    _$insertNode(_el$21, _el$22);
    _$insertNode(_el$21, _el$24);
    _$setProp(_el$21, "flexDirection", "row");
    _$setProp(_el$21, "gap", 0);
    _$insertNode(_el$22, _$createTextNode(`less `));
    _$setProp(_el$22, "selectable", false);
    _$insert(_el$21, _$createComponent(For, {
      each: [0, 1, 2, 3, 4],
      children: (lvl) => (() => {
        var _el$29 = _$createElement("text");
        _$setProp(_el$29, "selectable", false);
        _$insert(_el$29, lvl === 0 ? "\xB7 " : "\u25A0 ");
        _$effect((_$p) => _$setProp(_el$29, "fg", ramp()[lvl] ?? props.theme().text.muted, _$p));
        return _el$29;
      })()
    }), _el$24);
    _$insertNode(_el$24, _$createTextNode(`more`));
    _$setProp(_el$24, "selectable", false);
    _$effect((_p$) => {
      var _v$3 = props.theme().text.muted, _v$4 = props.theme().text.muted, _v$5 = props.theme().text.muted, _v$6 = props.theme().text.muted;
      _v$3 !== _p$.e && (_p$.e = _$setProp(_el$17, "fg", _v$3, _p$.e));
      _v$4 !== _p$.t && (_p$.t = _$setProp(_el$19, "fg", _v$4, _p$.t));
      _v$5 !== _p$.a && (_p$.a = _$setProp(_el$22, "fg", _v$5, _p$.a));
      _v$6 !== _p$.o && (_p$.o = _$setProp(_el$24, "fg", _v$6, _p$.o));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$16;
  })();
}
function SectionPanel(props) {
  return (() => {
    var _el$30 = _$createElement("box"), _el$31 = _$createElement("box"), _el$32 = _$createElement("text"), _el$34 = _$createElement("box");
    _$insertNode(_el$30, _el$31);
    _$insertNode(_el$30, _el$34);
    _$setProp(_el$30, "flexDirection", "column");
    _$setProp(_el$30, "paddingLeft", 2);
    _$setProp(_el$30, "paddingRight", 2);
    _$setProp(_el$30, "paddingTop", 1);
    _$setProp(_el$30, "paddingBottom", 1);
    _$setProp(_el$30, "gap", 1);
    _$insertNode(_el$31, _el$32);
    _$setProp(_el$31, "flexDirection", "row");
    _$setProp(_el$31, "justifyContent", "space-between");
    _$setProp(_el$31, "width", "100%");
    _$insert(_el$32, () => props.title);
    _$insert(_el$31, _$createComponent(Show, {
      get when() {
        return props.subtitle;
      },
      get children() {
        var _el$33 = _$createElement("text");
        _$insert(_el$33, () => props.subtitle);
        _$effect((_$p) => _$setProp(_el$33, "fg", props.theme().text.muted, _$p));
        return _el$33;
      }
    }), null);
    _$setProp(_el$34, "flexDirection", "column");
    _$setProp(_el$34, "width", "100%");
    _$insert(_el$34, () => props.children);
    _$effect((_p$) => {
      var _v$7 = props.theme().background.raised.base, { width: _v$8, flexGrow: _v$9 } = props, _v$0 = props.theme().text.base, _v$1 = TextAttributes.BOLD;
      _v$7 !== _p$.e && (_p$.e = _$setProp(_el$30, "backgroundColor", _v$7, _p$.e));
      _v$8 !== _p$.t && (_p$.t = _$setProp(_el$30, "width", _v$8, _p$.t));
      _v$9 !== _p$.a && (_p$.a = _$setProp(_el$30, "flexGrow", _v$9, _p$.a));
      _v$0 !== _p$.o && (_p$.o = _$setProp(_el$32, "fg", _v$0, _p$.o));
      _v$1 !== _p$.i && (_p$.i = _$setProp(_el$32, "attributes", _v$1, _p$.i));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined
    });
    return _el$30;
  })();
}
function StatTile(props) {
  return (() => {
    var _el$35 = _$createElement("box"), _el$36 = _$createElement("text"), _el$37 = _$createElement("text");
    _$insertNode(_el$35, _el$36);
    _$insertNode(_el$35, _el$37);
    _$setProp(_el$35, "flexDirection", "column");
    _$setProp(_el$35, "alignItems", "center");
    _$setProp(_el$35, "minWidth", 10);
    _$insert(_el$36, () => props.value);
    _$insert(_el$37, () => props.label);
    _$insert(_el$35, _$createComponent(Show, {
      get when() {
        return props.sublabel;
      },
      get children() {
        var _el$38 = _$createElement("text");
        _$insert(_el$38, () => props.sublabel);
        _$effect((_$p) => _$setProp(_el$38, "fg", props.theme().text.muted, _$p));
        return _el$38;
      }
    }), null);
    _$effect((_p$) => {
      var _v$10 = props.color ?? props.theme().text.base, _v$11 = TextAttributes.BOLD, _v$12 = props.theme().text.muted;
      _v$10 !== _p$.e && (_p$.e = _$setProp(_el$36, "fg", _v$10, _p$.e));
      _v$11 !== _p$.t && (_p$.t = _$setProp(_el$36, "attributes", _v$11, _p$.t));
      _v$12 !== _p$.a && (_p$.a = _$setProp(_el$37, "fg", _v$12, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$35;
  })();
}
function KeyValueRow(props) {
  return (() => {
    var _el$39 = _$createElement("box"), _el$40 = _$createElement("text"), _el$41 = _$createElement("box"), _el$43 = _$createElement("text");
    _$insertNode(_el$39, _el$40);
    _$insertNode(_el$39, _el$41);
    _$setProp(_el$39, "flexDirection", "row");
    _$setProp(_el$39, "justifyContent", "space-between");
    _$setProp(_el$39, "width", "100%");
    _$setProp(_el$39, "height", 1);
    _$insert(_el$40, () => props.label);
    _$insertNode(_el$41, _el$43);
    _$setProp(_el$41, "flexDirection", "row");
    _$setProp(_el$41, "gap", 1);
    _$insert(_el$41, _$createComponent(Show, {
      get when() {
        return props.secondary;
      },
      get children() {
        var _el$42 = _$createElement("text");
        _$insert(_el$42, () => props.secondary);
        _$effect((_$p) => _$setProp(_el$42, "fg", props.theme().text.muted, _$p));
        return _el$42;
      }
    }), _el$43);
    _$insert(_el$43, () => props.value);
    _$effect((_p$) => {
      var _v$13 = props.theme().text.muted, _v$14 = props.valueColor ?? props.theme().text.base, _v$15 = TextAttributes.BOLD;
      _v$13 !== _p$.e && (_p$.e = _$setProp(_el$40, "fg", _v$13, _p$.e));
      _v$14 !== _p$.t && (_p$.t = _$setProp(_el$43, "fg", _v$14, _p$.t));
      _v$15 !== _p$.a && (_p$.a = _$setProp(_el$43, "attributes", _v$15, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$39;
  })();
}
function StackedBar(props) {
  const cells = createMemo(() => {
    const w = Math.max(1, Math.floor(props.width));
    if (props.total <= 0) {
      return [{
        text: "\u2591".repeat(w),
        color: props.emptyColor
      }];
    }
    const items = props.segments.filter((s) => s.value > 0);
    if (items.length === 0) {
      return [{
        text: "\u2591".repeat(w),
        color: props.emptyColor
      }];
    }
    let used = 0;
    const chunks = [];
    for (let i = 0;i < items.length; i += 1) {
      const seg = items[i];
      const raw = seg.value / props.total * w;
      let len = Math.round(raw);
      if (len === 0 && seg.value > 0 && used < w)
        len = 1;
      if (used + len > w)
        len = w - used;
      if (len > 0) {
        chunks.push({
          text: "\u2588".repeat(len),
          color: seg.color
        });
        used += len;
      }
    }
    if (used < w) {
      chunks.push({
        text: "\u2591".repeat(w - used),
        color: props.emptyColor
      });
    }
    return chunks;
  });
  return (() => {
    var _el$44 = _$createElement("box");
    _$setProp(_el$44, "flexDirection", "row");
    _$setProp(_el$44, "height", 1);
    _$setProp(_el$44, "flexShrink", 0);
    _$insert(_el$44, _$createComponent(For, {
      get each() {
        return cells();
      },
      children: (chunk) => (() => {
        var _el$45 = _$createElement("text");
        _$setProp(_el$45, "selectable", false);
        _$insert(_el$45, () => chunk.text);
        _$effect((_$p) => _$setProp(_el$45, "fg", chunk.color, _$p));
        return _el$45;
      })()
    }));
    return _el$44;
  })();
}
function SparkStrip(props) {
  const line = createMemo(() => {
    const cap = Math.max(8, props.maxBars ?? 48);
    const vals = props.values;
    if (vals.length <= cap)
      return sparkline(vals);
    const out = [];
    for (let i = 0;i < cap; i += 1) {
      const start = Math.floor(i * vals.length / cap);
      const end = Math.max(start + 1, Math.floor((i + 1) * vals.length / cap));
      let sum = 0;
      for (let j = start;j < end; j += 1)
        sum += vals[j] ?? 0;
      out.push(sum / (end - start));
    }
    return sparkline(out);
  });
  return (() => {
    var _el$46 = _$createElement("box"), _el$47 = _$createElement("box"), _el$48 = _$createElement("text"), _el$49 = _$createElement("text"), _el$50 = _$createElement("text");
    _$insertNode(_el$46, _el$47);
    _$insertNode(_el$46, _el$50);
    _$setProp(_el$46, "flexDirection", "row");
    _$setProp(_el$46, "justifyContent", "space-between");
    _$setProp(_el$46, "width", "100%");
    _$setProp(_el$46, "height", 1);
    _$setProp(_el$46, "gap", 2);
    _$insertNode(_el$47, _el$48);
    _$insertNode(_el$47, _el$49);
    _$setProp(_el$47, "flexDirection", "row");
    _$setProp(_el$47, "gap", 2);
    _$insert(_el$48, () => props.label.padEnd(11));
    _$setProp(_el$49, "selectable", false);
    _$insert(_el$49, line);
    _$insert(_el$50, () => props.summaryText);
    _$effect((_p$) => {
      var _v$16 = props.theme().text.muted, _v$17 = props.color, _v$18 = props.theme().text.base;
      _v$16 !== _p$.e && (_p$.e = _$setProp(_el$48, "fg", _v$16, _p$.e));
      _v$17 !== _p$.t && (_p$.t = _$setProp(_el$49, "fg", _v$17, _p$.t));
      _v$18 !== _p$.a && (_p$.a = _$setProp(_el$50, "fg", _v$18, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$46;
  })();
}
function TableRowLine(props) {
  return (() => {
    var _el$51 = _$createElement("box");
    _$setProp(_el$51, "flexDirection", "row");
    _$setProp(_el$51, "width", "100%");
    _$setProp(_el$51, "height", 1);
    _$insert(_el$51, _$createComponent(For, {
      get each() {
        return props.cells;
      },
      children: (cell) => {
        const formatted = () => {
          if (!cell.width)
            return cell.text;
          const t = truncate(cell.text, cell.width);
          return cell.align === "right" ? t.padStart(cell.width) : t.padEnd(cell.width);
        };
        return (() => {
          var _el$52 = _$createElement("text");
          _$setProp(_el$52, "selectable", false);
          _$insert(_el$52, formatted);
          _$effect((_p$) => {
            var _v$19 = cell.color ?? props.theme().text.base, _v$20 = cell.bold ? TextAttributes.BOLD : undefined;
            _v$19 !== _p$.e && (_p$.e = _$setProp(_el$52, "fg", _v$19, _p$.e));
            _v$20 !== _p$.t && (_p$.t = _$setProp(_el$52, "attributes", _v$20, _p$.t));
            return _p$;
          }, {
            e: undefined,
            t: undefined
          });
          return _el$52;
        })();
      }
    }));
    _$effect((_$p) => _$setProp(_el$51, "gap", props.gap ?? 1, _$p));
    return _el$51;
  })();
}
function formatShortModel(key) {
  const slash = key.indexOf("/");
  if (slash === -1)
    return key;
  const prov = key.slice(0, slash);
  const rest = key.slice(slash + 1);
  if (prov === "amazon-bedrock") {
    return rest.replace(/^(us|global)\.(anthropic|openai)\./, "");
  }
  return rest;
}
function compactSigned(additions, deletions) {
  return `+${compactNumber(additions)} / -${compactNumber(deletions)}`;
}

// src/ui/sections.tsx
function OverviewSection(props) {
  const s = () => props.stats;
  const palette = createMemo2(() => getSeriesPalette(props.theme()));
  const wide = () => props.width >= 82;
  const showLogo = () => props.height >= 28 && props.width >= 36;
  const fromDay = () => s().activity[0]?.date ?? new Date(s().meta.from).toISOString().slice(0, 10);
  const toDay = () => s().activity[s().activity.length - 1]?.date ?? new Date(s().meta.to).toISOString().slice(0, 10);
  const heroTokens = () => compactNumber(s().summary.tokens.total);
  return (() => {
    var _el$ = _$createElement2("box"), _el$2 = _$createElement2("box"), _el$3 = _$createElement2("box"), _el$4 = _$createElement2("box");
    _$insertNode2(_el$, _el$2);
    _$insertNode2(_el$, _el$3);
    _$insertNode2(_el$, _el$4);
    _$setProp2(_el$, "flexDirection", "column");
    _$setProp2(_el$, "alignItems", "center");
    _$setProp2(_el$, "width", "100%");
    _$setProp2(_el$, "gap", 2);
    _$insert2(_el$, _$createComponent2(Show2, {
      get when() {
        return showLogo();
      },
      get children() {
        return _$createComponent2(OpenCodeLogo, {
          get theme() {
            return props.theme;
          },
          get compact() {
            return props.width < 46;
          }
        });
      }
    }), _el$2);
    _$insert2(_el$, _$createComponent2(PixelHero, {
      get valueText() {
        return heroTokens();
      },
      get label() {
        return `TOKENS \xB7 ${formatUsd(s().summary.cost)} SPENT`;
      },
      get maxWidth() {
        return props.width;
      },
      get theme() {
        return props.theme;
      }
    }), _el$2);
    _$insert2(_el$, _$createComponent2(HeatmapGrid, {
      get activity() {
        return s().activity;
      },
      get fromDay() {
        return fromDay();
      },
      get toDay() {
        return toDay();
      },
      get metric() {
        return props.heatmapMetric;
      },
      get maxWidth() {
        return props.width;
      },
      get theme() {
        return props.theme;
      }
    }), _el$2);
    _$setProp2(_el$2, "flexDirection", "row");
    _$setProp2(_el$2, "flexWrap", "wrap");
    _$setProp2(_el$2, "justifyContent", "space-around");
    _$setProp2(_el$2, "width", "100%");
    _$setProp2(_el$2, "gap", 2);
    _$insert2(_el$2, _$createComponent2(StatTile, {
      get value() {
        return `${s().summary.bestStreak}d`;
      },
      label: "best streak",
      get sublabel() {
        return _$memo2(() => s().summary.currentStreak > 0)() ? `${s().summary.currentStreak}d current` : undefined;
      },
      get theme() {
        return props.theme;
      }
    }), null);
    _$insert2(_el$2, _$createComponent2(StatTile, {
      get value() {
        return `${s().summary.activeDays}/${s().meta.daysCount}`;
      },
      label: "active days",
      get theme() {
        return props.theme;
      }
    }), null);
    _$insert2(_el$2, _$createComponent2(StatTile, {
      get value() {
        return compactNumber(s().summary.sessions);
      },
      label: "sessions",
      get sublabel() {
        return _$memo2(() => s().summary.subagents > 0)() ? `+${compactNumber(s().summary.subagents)} sub` : undefined;
      },
      get theme() {
        return props.theme;
      }
    }), null);
    _$insert2(_el$2, _$createComponent2(StatTile, {
      get value() {
        return formatUsd(s().summary.cost);
      },
      label: "total cost",
      get sublabel() {
        return `${formatUsd(s().summary.costPerDay)}/day`;
      },
      get color() {
        return palette()[2];
      },
      get theme() {
        return props.theme;
      }
    }), null);
    _$insert2(_el$2, _$createComponent2(StatTile, {
      get value() {
        return _$memo2(() => s().github.status === "ok")() ? `${formatRate(s().github.avgPrsPerDay)}/d` : s().github.status === "loading" ? "\u2026" : "-";
      },
      label: "PRs opened",
      get sublabel() {
        return _$memo2(() => s().github.status === "ok")() ? `${s().github.openedTotal} (${formatRate(s().github.avgPrsPerWeekday)}/wkd)` : undefined;
      },
      get color() {
        return props.theme().text.feedback.info.base;
      },
      get theme() {
        return props.theme;
      }
    }), null);
    _$insert2(_el$2, _$createComponent2(StatTile, {
      get value() {
        return _$memo2(() => s().github.status === "ok")() ? `${formatRate(s().github.avgApprovalsPerDay)}/d` : s().github.status === "loading" ? "\u2026" : "-";
      },
      label: "PR approvals",
      get sublabel() {
        return _$memo2(() => s().github.status === "ok")() ? `${s().github.approvalsTotal} (${formatRate(s().github.avgApprovalsPerWeekday)}/wkd)` : undefined;
      },
      get color() {
        return props.theme().text.feedback.success.base;
      },
      get theme() {
        return props.theme;
      }
    }), null);
    _$setProp2(_el$3, "width", "100%");
    _$setProp2(_el$3, "gap", 2);
    _$insert2(_el$3, _$createComponent2(SectionPanel, {
      title: "COST & TOKENS",
      get subtitle() {
        return `${formatPct(s().summary.cacheHitPct)} cached`;
      },
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "50%" : "100%";
      },
      get children() {
        return [_$createComponent2(KeyValueRow, {
          label: "cost",
          get value() {
            return formatUsd(s().summary.cost);
          },
          get secondary() {
            return `${formatUsd(s().summary.costPerActiveDay)}/act`;
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "input",
          get value() {
            return compactNumber(s().summary.tokens.input);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "output",
          get value() {
            return compactNumber(s().summary.tokens.output);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "reasoning",
          get value() {
            return compactNumber(s().summary.tokens.reasoning);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "cache read",
          get value() {
            return compactNumber(s().summary.tokens.cacheRead);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "cache write",
          get value() {
            return compactNumber(s().summary.tokens.cacheWrite);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "prompts \xB7 steps",
          get value() {
            return `${formatInt(s().summary.prompts)} \xB7 ${compactNumber(s().summary.steps)}`;
          },
          get secondary() {
            return `${formatRate(s().outcomes.avgStepsPerPrompt, 1)} st/p`;
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(Show2, {
          get when() {
            return s().summary.codeDiff.files > 0 || s().summary.codeDiff.additions > 0 || s().summary.codeDiff.deletions > 0;
          },
          get fallback() {
            return _$createComponent2(KeyValueRow, {
              label: "tool reliability",
              get value() {
                return _$memo2(() => s().summary.tools.succeeded + s().summary.tools.failed > 0)() ? formatPct(s().summary.tools.succeeded / (s().summary.tools.succeeded + s().summary.tools.failed) * 100) : "-";
              },
              get secondary() {
                return `${compactNumber(s().summary.tools.calls)} calls`;
              },
              get theme() {
                return props.theme;
              }
            });
          },
          get children() {
            return _$createComponent2(KeyValueRow, {
              label: "code diff",
              get value() {
                return compactSigned(s().summary.codeDiff.additions, s().summary.codeDiff.deletions);
              },
              get secondary() {
                return `${formatInt(s().summary.codeDiff.files)} files`;
              },
              get theme() {
                return props.theme;
              }
            });
          }
        })];
      }
    }), null);
    _$insert2(_el$3, _$createComponent2(SectionPanel, {
      title: "GITHUB VELOCITY",
      get subtitle() {
        return _$memo2(() => !!s().github.login)() ? `@${s().github.login}${s().github.repoFilter ? ` \xB7 ${s().github.repoFilter}` : ""}` : s().github.status;
      },
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "50%" : "100%";
      },
      get children() {
        return _$createComponent2(Show2, {
          get when() {
            return s().github.status === "ok";
          },
          get fallback() {
            return (() => {
              var _el$5 = _$createElement2("text");
              _$insert2(_el$5, (() => {
                var _c$ = _$memo2(() => s().github.status === "loading");
                return () => _c$() ? "Fetching PRs & approvals via GitHub GraphQL\u2026" : s().github.message ?? "GitHub stats unavailable";
              })());
              _$effect2((_$p) => _$setProp2(_el$5, "fg", props.theme().text.muted, _$p));
              return _el$5;
            })();
          },
          get children() {
            return [_$createComponent2(KeyValueRow, {
              label: "opened PRs / day",
              get value() {
                return `${formatRate(s().github.avgPrsPerDay)} / day`;
              },
              get secondary() {
                return `${formatRate(s().github.avgPrsPerWeekday)} / wkd`;
              },
              get valueColor() {
                return props.theme().text.feedback.info.base;
              },
              get theme() {
                return props.theme;
              }
            }), _$createComponent2(KeyValueRow, {
              label: "PR approvals / day",
              get value() {
                return `${formatRate(s().github.avgApprovalsPerDay)} / day`;
              },
              get secondary() {
                return `${formatRate(s().github.avgApprovalsPerWeekday)} / wkd`;
              },
              get valueColor() {
                return props.theme().text.feedback.success.base;
              },
              get theme() {
                return props.theme;
              }
            }), _$createComponent2(KeyValueRow, {
              label: "opened total",
              get value() {
                return formatInt(s().github.openedTotal);
              },
              get secondary() {
                return `${s().github.mergedTotal} merged \xB7 ${s().github.openTotal} open`;
              },
              get theme() {
                return props.theme;
              }
            }), _$createComponent2(KeyValueRow, {
              label: "approvals total",
              get value() {
                return formatInt(s().github.approvalsTotal);
              },
              get secondary() {
                return `${s().github.uniquePrsApproved} PRs approved`;
              },
              get theme() {
                return props.theme;
              }
            }), _$createComponent2(KeyValueRow, {
              label: "reviews total",
              get value() {
                return formatInt(s().github.reviewsTotal);
              },
              get secondary() {
                return `${formatPct(s().github.approvalRatePct)} approval`;
              },
              get theme() {
                return props.theme;
              }
            }), _$createComponent2(KeyValueRow, {
              label: "merge rate \xB7 median",
              get value() {
                return `${formatPct(s().github.mergeRatePct)} \xB7 ${formatHours(s().github.medianMergeHours)}`;
              },
              get theme() {
                return props.theme;
              }
            }), _$createComponent2(KeyValueRow, {
              label: "PR code diff",
              get value() {
                return compactSigned(s().github.additions, s().github.deletions);
              },
              get secondary() {
                return `avg ${compactNumber(s().github.avgPrSize)}/PR`;
              },
              get theme() {
                return props.theme;
              }
            }), _$createComponent2(KeyValueRow, {
              label: "cost per opened PR",
              get value() {
                return _$memo2(() => s().github.efficiency.costPerPr !== undefined)() ? formatUsd(s().github.efficiency.costPerPr) : "-";
              },
              get secondary() {
                return _$memo2(() => s().github.efficiency.tokensPerPr !== undefined)() ? `${compactNumber(s().github.efficiency.tokensPerPr)} tok/PR` : undefined;
              },
              get theme() {
                return props.theme;
              }
            })];
          }
        });
      }
    }), null);
    _$setProp2(_el$4, "width", "100%");
    _$setProp2(_el$4, "gap", 2);
    _$insert2(_el$4, _$createComponent2(SectionPanel, {
      title: "TOP MODELS",
      get subtitle() {
        return `${s().models.length} active \xB7 [3] details`;
      },
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "50%" : "100%";
      },
      get children() {
        return _$createComponent2(Show2, {
          get when() {
            return s().models.length > 0;
          },
          get fallback() {
            return (() => {
              var _el$6 = _$createElement2("text");
              _$insertNode2(_el$6, _$createTextNode2(`No model steps`));
              _$effect2((_$p) => _$setProp2(_el$6, "fg", props.theme().text.muted, _$p));
              return _el$6;
            })();
          },
          get children() {
            return _$createComponent2(For2, {
              get each() {
                return s().models.slice(0, 5);
              },
              children: (m, idx) => {
                const nameW = () => Math.max(14, (wide() ? Math.floor(props.width / 2) : props.width) - 30);
                return _$createComponent2(TableRowLine, {
                  get theme() {
                    return props.theme;
                  },
                  get cells() {
                    return [{
                      text: "\u25A0",
                      color: palette()[idx() % palette().length]
                    }, {
                      text: formatShortModel(m.key),
                      width: nameW(),
                      color: props.theme().text.base
                    }, {
                      text: compactNumber(m.tokens.total),
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: formatUsd(m.cost),
                      width: 8,
                      align: "right",
                      bold: true
                    }];
                  }
                });
              }
            });
          }
        });
      }
    }), null);
    _$insert2(_el$4, _$createComponent2(SectionPanel, {
      title: "TOP TOOLS",
      get subtitle() {
        return `${compactNumber(s().summary.tools.calls)} calls \xB7 [5] details`;
      },
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "50%" : "100%";
      },
      get children() {
        return _$createComponent2(Show2, {
          get when() {
            return s().tools.length > 0;
          },
          get fallback() {
            return (() => {
              var _el$8 = _$createElement2("text");
              _$insertNode2(_el$8, _$createTextNode2(`No tool calls`));
              _$effect2((_$p) => _$setProp2(_el$8, "fg", props.theme().text.muted, _$p));
              return _el$8;
            })();
          },
          get children() {
            return _$createComponent2(For2, {
              get each() {
                return s().tools.slice(0, 5);
              },
              children: (tool) => {
                const nameW = () => Math.max(12, (wide() ? Math.floor(props.width / 2) : props.width) - 30);
                return _$createComponent2(TableRowLine, {
                  get theme() {
                    return props.theme;
                  },
                  get cells() {
                    return [{
                      text: tool.name,
                      width: nameW(),
                      color: tool.isMcp ? props.theme().hue?.accent?.[200] ?? props.theme().text.base : props.theme().text.base
                    }, {
                      text: compactNumber(tool.calls),
                      width: 7,
                      align: "right"
                    }, {
                      text: formatPct(tool.errorPct),
                      width: 6,
                      align: "right",
                      color: tool.errorPct >= 5 ? props.theme().text.feedback.error.base : props.theme().text.muted
                    }, {
                      text: formatDurationMs(tool.p50Ms),
                      width: 6,
                      align: "right",
                      color: props.theme().text.muted
                    }];
                  }
                });
              }
            });
          }
        });
      }
    }), null);
    _$effect2((_p$) => {
      var _v$ = wide() ? "row" : "column", _v$2 = wide() ? "row" : "column";
      _v$ !== _p$.e && (_p$.e = _$setProp2(_el$3, "flexDirection", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp2(_el$4, "flexDirection", _v$2, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
function TokensSection(props) {
  const s = () => props.stats;
  const palette = createMemo2(() => getSeriesPalette(props.theme()));
  const colCache = () => palette()[0] ?? props.theme().text.base;
  const colInput = () => palette()[1] ?? props.theme().text.base;
  const colOutput = () => palette()[2] ?? props.theme().text.base;
  const colReason = () => palette()[3] ?? props.theme().text.base;
  const colWrite = () => palette()[4] ?? props.theme().text.muted;
  const series = () => s().tokenSeries;
  const maxTokens = createMemo2(() => Math.max(1, ...series().map((b) => b.total)));
  const maxCost = createMemo2(() => Math.max(0.01, ...series().map((b) => b.cost)));
  const peakTok = createMemo2(() => {
    let best = series()[0];
    for (const b of series())
      if (!best || b.total > best.total)
        best = b;
    return best;
  });
  const peakCost = createMemo2(() => {
    let best = series()[0];
    for (const b of series())
      if (!best || b.cost > best.cost)
        best = b;
    return best;
  });
  const barWidth = () => Math.max(10, Math.min(44, props.width - 54));
  return (() => {
    var _el$0 = _$createElement2("box");
    _$setProp2(_el$0, "flexDirection", "column");
    _$setProp2(_el$0, "width", "100%");
    _$setProp2(_el$0, "gap", 2);
    _$insert2(_el$0, _$createComponent2(SectionPanel, {
      title: "TOKEN COMPOSITION & EFFICIENCY",
      get subtitle() {
        return `${compactNumber(s().summary.tokens.total)} total \xB7 ${formatUsd(s().summary.cost)}`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return [_$createComponent2(StackedBar, {
          get total() {
            return s().summary.tokens.total;
          },
          get width() {
            return Math.max(16, props.width - 8);
          },
          get emptyColor() {
            return props.theme().background.raised.high;
          },
          get segments() {
            return [{
              value: s().summary.tokens.cacheRead,
              color: colCache()
            }, {
              value: s().summary.tokens.input,
              color: colInput()
            }, {
              value: s().summary.tokens.output,
              color: colOutput()
            }, {
              value: s().summary.tokens.reasoning,
              color: colReason()
            }, {
              value: s().summary.tokens.cacheWrite,
              color: colWrite()
            }];
          }
        }), (() => {
          var _el$1 = _$createElement2("box"), _el$10 = _$createElement2("box"), _el$11 = _$createElement2("text"), _el$13 = _$createElement2("text"), _el$14 = _$createTextNode2(`cache read `), _el$15 = _$createTextNode2(` (`), _el$16 = _$createTextNode2(`)`), _el$17 = _$createElement2("box"), _el$18 = _$createElement2("text"), _el$20 = _$createElement2("text"), _el$21 = _$createTextNode2(`input `), _el$22 = _$createElement2("box"), _el$23 = _$createElement2("text"), _el$25 = _$createElement2("text"), _el$26 = _$createTextNode2(`output `), _el$27 = _$createElement2("box"), _el$28 = _$createElement2("text"), _el$30 = _$createElement2("text"), _el$31 = _$createTextNode2(`reasoning `);
          _$insertNode2(_el$1, _el$10);
          _$insertNode2(_el$1, _el$17);
          _$insertNode2(_el$1, _el$22);
          _$insertNode2(_el$1, _el$27);
          _$setProp2(_el$1, "flexDirection", "row");
          _$setProp2(_el$1, "flexWrap", "wrap");
          _$setProp2(_el$1, "gap", 3);
          _$setProp2(_el$1, "marginTop", 1);
          _$insertNode2(_el$10, _el$11);
          _$insertNode2(_el$10, _el$13);
          _$setProp2(_el$10, "flexDirection", "row");
          _$setProp2(_el$10, "gap", 1);
          _$insertNode2(_el$11, _$createTextNode2(`\u25A0`));
          _$insertNode2(_el$13, _el$14);
          _$insertNode2(_el$13, _el$15);
          _$insertNode2(_el$13, _el$16);
          _$insert2(_el$13, () => compactNumber(s().summary.tokens.cacheRead), _el$15);
          _$insert2(_el$13, () => formatPct(s().summary.tokens.total > 0 ? s().summary.tokens.cacheRead / s().summary.tokens.total * 100 : 0), _el$16);
          _$insertNode2(_el$17, _el$18);
          _$insertNode2(_el$17, _el$20);
          _$setProp2(_el$17, "flexDirection", "row");
          _$setProp2(_el$17, "gap", 1);
          _$insertNode2(_el$18, _$createTextNode2(`\u25A0`));
          _$insertNode2(_el$20, _el$21);
          _$insert2(_el$20, () => compactNumber(s().summary.tokens.input), null);
          _$insertNode2(_el$22, _el$23);
          _$insertNode2(_el$22, _el$25);
          _$setProp2(_el$22, "flexDirection", "row");
          _$setProp2(_el$22, "gap", 1);
          _$insertNode2(_el$23, _$createTextNode2(`\u25A0`));
          _$insertNode2(_el$25, _el$26);
          _$insert2(_el$25, () => compactNumber(s().summary.tokens.output), null);
          _$insertNode2(_el$27, _el$28);
          _$insertNode2(_el$27, _el$30);
          _$setProp2(_el$27, "flexDirection", "row");
          _$setProp2(_el$27, "gap", 1);
          _$insertNode2(_el$28, _$createTextNode2(`\u25A0`));
          _$insertNode2(_el$30, _el$31);
          _$insert2(_el$30, () => compactNumber(s().summary.tokens.reasoning), null);
          _$insert2(_el$1, _$createComponent2(Show2, {
            get when() {
              return s().summary.tokens.cacheWrite > 0;
            },
            get children() {
              var _el$32 = _$createElement2("box"), _el$33 = _$createElement2("text"), _el$35 = _$createElement2("text"), _el$36 = _$createTextNode2(`cache write `);
              _$insertNode2(_el$32, _el$33);
              _$insertNode2(_el$32, _el$35);
              _$setProp2(_el$32, "flexDirection", "row");
              _$setProp2(_el$32, "gap", 1);
              _$insertNode2(_el$33, _$createTextNode2(`\u25A0`));
              _$insertNode2(_el$35, _el$36);
              _$insert2(_el$35, () => compactNumber(s().summary.tokens.cacheWrite), null);
              _$effect2((_p$) => {
                var _v$3 = colWrite(), _v$4 = props.theme().text.base;
                _v$3 !== _p$.e && (_p$.e = _$setProp2(_el$33, "fg", _v$3, _p$.e));
                _v$4 !== _p$.t && (_p$.t = _$setProp2(_el$35, "fg", _v$4, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$32;
            }
          }), null);
          _$effect2((_p$) => {
            var _v$5 = colCache(), _v$6 = props.theme().text.base, _v$7 = colInput(), _v$8 = props.theme().text.base, _v$9 = colOutput(), _v$0 = props.theme().text.base, _v$1 = colReason(), _v$10 = props.theme().text.base;
            _v$5 !== _p$.e && (_p$.e = _$setProp2(_el$11, "fg", _v$5, _p$.e));
            _v$6 !== _p$.t && (_p$.t = _$setProp2(_el$13, "fg", _v$6, _p$.t));
            _v$7 !== _p$.a && (_p$.a = _$setProp2(_el$18, "fg", _v$7, _p$.a));
            _v$8 !== _p$.o && (_p$.o = _$setProp2(_el$20, "fg", _v$8, _p$.o));
            _v$9 !== _p$.i && (_p$.i = _$setProp2(_el$23, "fg", _v$9, _p$.i));
            _v$0 !== _p$.n && (_p$.n = _$setProp2(_el$25, "fg", _v$0, _p$.n));
            _v$1 !== _p$.s && (_p$.s = _$setProp2(_el$28, "fg", _v$1, _p$.s));
            _v$10 !== _p$.h && (_p$.h = _$setProp2(_el$30, "fg", _v$10, _p$.h));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined,
            o: undefined,
            i: undefined,
            n: undefined,
            s: undefined,
            h: undefined
          });
          return _el$1;
        })(), (() => {
          var _el$37 = _$createElement2("box");
          _$setProp2(_el$37, "flexDirection", "row");
          _$setProp2(_el$37, "flexWrap", "wrap");
          _$setProp2(_el$37, "justifyContent", "space-between");
          _$setProp2(_el$37, "gap", 2);
          _$setProp2(_el$37, "marginTop", 1);
          _$insert2(_el$37, _$createComponent2(StatTile, {
            get value() {
              return compactNumber(s().summary.tokensPerDay);
            },
            label: "tok / day",
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$37, _$createComponent2(StatTile, {
            get value() {
              return compactNumber(s().summary.tokensPerActiveDay);
            },
            label: "tok / active day",
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$37, _$createComponent2(StatTile, {
            get value() {
              return formatPct(s().summary.cacheHitPct);
            },
            label: "cache hit %",
            get color() {
              return colCache();
            },
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$37, _$createComponent2(StatTile, {
            get value() {
              return _$memo2(() => s().summary.tokens.total > 0)() ? formatUsd(s().summary.cost / s().summary.tokens.total * 1e6) : "$0";
            },
            label: "blended / 1M",
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$37, _$createComponent2(StatTile, {
            get value() {
              return _$memo2(() => !!peakTok())() ? `${peakTok().label} (${compactNumber(peakTok().total)})` : "-";
            },
            label: "peak tokens",
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$37, _$createComponent2(StatTile, {
            get value() {
              return _$memo2(() => !!peakCost())() ? `${peakCost().label} (${formatUsd(peakCost().cost)})` : "-";
            },
            label: "peak spend",
            get theme() {
              return props.theme;
            }
          }), null);
          return _el$37;
        })()];
      }
    }), null);
    _$insert2(_el$0, _$createComponent2(SectionPanel, {
      title: "TREND SPARKLINES",
      get subtitle() {
        return `by ${s().meta.bucketGranularity}`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return [_$createComponent2(SparkStrip, {
          label: "tokens",
          get values() {
            return series().map((b) => b.total);
          },
          get summaryText() {
            return `${compactNumber(s().summary.tokens.total)} total`;
          },
          get color() {
            return colInput();
          },
          get maxBars() {
            return Math.max(12, props.width - 36);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(SparkStrip, {
          label: "cost ($)",
          get values() {
            return series().map((b) => b.cost);
          },
          get summaryText() {
            return `${formatUsd(s().summary.cost)} total`;
          },
          get color() {
            return colOutput();
          },
          get maxBars() {
            return Math.max(12, props.width - 36);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(SparkStrip, {
          label: "out+reas",
          get values() {
            return series().map((b) => b.output + b.reasoning);
          },
          get summaryText() {
            return `${compactNumber(s().summary.tokens.output + s().summary.tokens.reasoning)} gen`;
          },
          get color() {
            return colReason();
          },
          get maxBars() {
            return Math.max(12, props.width - 36);
          },
          get theme() {
            return props.theme;
          }
        })];
      }
    }), null);
    _$insert2(_el$0, _$createComponent2(SectionPanel, {
      title: "TOKEN USAGE OVER TIME",
      get subtitle() {
        return `per ${s().meta.bucketGranularity} \xB7 ${series().length} buckets`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return [_$createComponent2(TableRowLine, {
          get theme() {
            return props.theme;
          },
          get cells() {
            return [{
              text: s().meta.bucketGranularity === "week" ? "week" : "date",
              width: 6,
              color: props.theme().text.muted
            }, {
              text: "composition",
              width: barWidth(),
              color: props.theme().text.muted
            }, {
              text: "total",
              width: 7,
              align: "right",
              color: props.theme().text.muted
            }, {
              text: "in",
              width: 6,
              align: "right",
              color: props.theme().text.muted
            }, {
              text: "out+r",
              width: 6,
              align: "right",
              color: props.theme().text.muted
            }, {
              text: "cache",
              width: 6,
              align: "right",
              color: props.theme().text.muted
            }, {
              text: "cost",
              width: 7,
              align: "right",
              color: props.theme().text.muted
            }];
          }
        }), _$createComponent2(For2, {
          get each() {
            return [...series()].reverse().slice(0, 40);
          },
          children: (b) => {
            const emptyCol = () => mixColor(props.theme().background.raised.base, props.theme().text.muted, 0.2);
            return (() => {
              var _el$38 = _$createElement2("box"), _el$39 = _$createElement2("text"), _el$40 = _$createElement2("text"), _el$41 = _$createElement2("text"), _el$42 = _$createElement2("text"), _el$43 = _$createElement2("text"), _el$44 = _$createElement2("text");
              _$insertNode2(_el$38, _el$39);
              _$insertNode2(_el$38, _el$40);
              _$insertNode2(_el$38, _el$41);
              _$insertNode2(_el$38, _el$42);
              _$insertNode2(_el$38, _el$43);
              _$insertNode2(_el$38, _el$44);
              _$setProp2(_el$38, "flexDirection", "row");
              _$setProp2(_el$38, "width", "100%");
              _$setProp2(_el$38, "height", 1);
              _$setProp2(_el$38, "gap", 1);
              _$insert2(_el$39, () => b.label.padEnd(6));
              _$insert2(_el$38, _$createComponent2(StackedBar, {
                get total() {
                  return maxTokens();
                },
                get width() {
                  return barWidth();
                },
                get emptyColor() {
                  return emptyCol();
                },
                get segments() {
                  return [{
                    value: b.cacheRead,
                    color: colCache()
                  }, {
                    value: b.input,
                    color: colInput()
                  }, {
                    value: b.output,
                    color: colOutput()
                  }, {
                    value: b.reasoning,
                    color: colReason()
                  }, {
                    value: b.cacheWrite,
                    color: colWrite()
                  }];
                }
              }), _el$40);
              _$insert2(_el$40, () => compactNumber(b.total).padStart(7));
              _$insert2(_el$41, () => compactNumber(b.input).padStart(6));
              _$insert2(_el$42, () => compactNumber(b.output + b.reasoning).padStart(6));
              _$insert2(_el$43, () => formatPct(b.cacheHitPct).padStart(6));
              _$insert2(_el$44, () => formatUsd(b.cost).padStart(7));
              _$effect2((_p$) => {
                var _v$11 = props.theme().text.muted, _v$12 = props.theme().text.base, _v$13 = TextAttributes2.BOLD, _v$14 = props.theme().text.muted, _v$15 = props.theme().text.muted, _v$16 = colCache(), _v$17 = props.theme().text.base;
                _v$11 !== _p$.e && (_p$.e = _$setProp2(_el$39, "fg", _v$11, _p$.e));
                _v$12 !== _p$.t && (_p$.t = _$setProp2(_el$40, "fg", _v$12, _p$.t));
                _v$13 !== _p$.a && (_p$.a = _$setProp2(_el$40, "attributes", _v$13, _p$.a));
                _v$14 !== _p$.o && (_p$.o = _$setProp2(_el$41, "fg", _v$14, _p$.o));
                _v$15 !== _p$.i && (_p$.i = _$setProp2(_el$42, "fg", _v$15, _p$.i));
                _v$16 !== _p$.n && (_p$.n = _$setProp2(_el$43, "fg", _v$16, _p$.n));
                _v$17 !== _p$.s && (_p$.s = _$setProp2(_el$44, "fg", _v$17, _p$.s));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined,
                o: undefined,
                i: undefined,
                n: undefined,
                s: undefined
              });
              return _el$38;
            })();
          }
        })];
      }
    }), null);
    return _el$0;
  })();
}
function ModelsSection(props) {
  const s = () => props.stats;
  const palette = createMemo2(() => getSeriesPalette(props.theme()));
  const topModels = () => s().modelSeries.topModels;
  const buckets = () => s().modelSeries.buckets;
  const bucketValue = (b) => {
    if (props.chartMetric === "cost")
      return b.totalCost;
    if (props.chartMetric === "tokens")
      return b.totalTokens;
    return b.totalSteps;
  };
  const modelValue = (entry) => {
    if (!entry)
      return 0;
    if (props.chartMetric === "cost")
      return entry.cost;
    if (props.chartMetric === "tokens")
      return entry.tokens;
    return entry.steps;
  };
  const maxBucketVal = createMemo2(() => Math.max(0.0001, ...buckets().map(bucketValue)));
  const totalModelsCost = createMemo2(() => Math.max(0.0001, s().summary.cost));
  const barWidth = () => Math.max(10, Math.min(48, props.width - 40));
  const formatMetricVal = (v) => {
    if (props.chartMetric === "cost")
      return formatUsd(v);
    return compactNumber(v);
  };
  const otherColor = () => props.theme().text.muted;
  return (() => {
    var _el$45 = _$createElement2("box");
    _$setProp2(_el$45, "flexDirection", "column");
    _$setProp2(_el$45, "width", "100%");
    _$setProp2(_el$45, "gap", 2);
    _$insert2(_el$45, _$createComponent2(SectionPanel, {
      title: "MODEL USAGE OVER TIME",
      get subtitle() {
        return `metric: ${props.chartMetric} ([m] switch) \xB7 per ${s().meta.bucketGranularity}`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return [(() => {
          var _el$46 = _$createElement2("box");
          _$setProp2(_el$46, "flexDirection", "row");
          _$setProp2(_el$46, "flexWrap", "wrap");
          _$setProp2(_el$46, "columnGap", 2);
          _$setProp2(_el$46, "rowGap", 0);
          _$setProp2(_el$46, "marginBottom", 1);
          _$insert2(_el$46, _$createComponent2(For2, {
            get each() {
              return topModels();
            },
            children: (modelKey, idx) => (() => {
              var _el$53 = _$createElement2("box"), _el$54 = _$createElement2("text"), _el$56 = _$createElement2("text");
              _$insertNode2(_el$53, _el$54);
              _$insertNode2(_el$53, _el$56);
              _$setProp2(_el$53, "flexDirection", "row");
              _$setProp2(_el$53, "gap", 1);
              _$insertNode2(_el$54, _$createTextNode2(`\u25A0`));
              _$insert2(_el$56, () => formatShortModel(modelKey));
              _$effect2((_p$) => {
                var _v$20 = palette()[idx() % palette().length], _v$21 = props.theme().text.base;
                _v$20 !== _p$.e && (_p$.e = _$setProp2(_el$54, "fg", _v$20, _p$.e));
                _v$21 !== _p$.t && (_p$.t = _$setProp2(_el$56, "fg", _v$21, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$53;
            })()
          }), null);
          _$insert2(_el$46, _$createComponent2(Show2, {
            get when() {
              return s().models.length > topModels().length;
            },
            get children() {
              var _el$47 = _$createElement2("box"), _el$48 = _$createElement2("text"), _el$50 = _$createElement2("text"), _el$51 = _$createTextNode2(`other (`), _el$52 = _$createTextNode2(`)`);
              _$insertNode2(_el$47, _el$48);
              _$insertNode2(_el$47, _el$50);
              _$setProp2(_el$47, "flexDirection", "row");
              _$setProp2(_el$47, "gap", 1);
              _$insertNode2(_el$48, _$createTextNode2(`\u25A0`));
              _$insertNode2(_el$50, _el$51);
              _$insertNode2(_el$50, _el$52);
              _$insert2(_el$50, () => s().models.length - topModels().length, _el$52);
              _$effect2((_p$) => {
                var _v$18 = otherColor(), _v$19 = props.theme().text.muted;
                _v$18 !== _p$.e && (_p$.e = _$setProp2(_el$48, "fg", _v$18, _p$.e));
                _v$19 !== _p$.t && (_p$.t = _$setProp2(_el$50, "fg", _v$19, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$47;
            }
          }), null);
          return _el$46;
        })(), _$createComponent2(For2, {
          get each() {
            return [...buckets()].reverse().slice(0, 40);
          },
          children: (b) => {
            const totalVal = () => bucketValue(b);
            const topEntries = () => topModels().map((m, idx) => ({
              value: modelValue(b.byModel[m]),
              color: palette()[idx % palette().length]
            }));
            const topSum = () => topEntries().reduce((acc, e) => acc + e.value, 0);
            const otherVal = () => Math.max(0, totalVal() - topSum());
            const dominant = createMemo2(() => {
              let bestName = "-";
              let bestVal = 0;
              for (const [k, v] of Object.entries(b.byModel)) {
                const mv = modelValue(v);
                if (mv > bestVal) {
                  bestVal = mv;
                  bestName = formatShortModel(k);
                }
              }
              return {
                name: bestName,
                pct: totalVal() > 0 ? bestVal / totalVal() * 100 : 0
              };
            });
            const emptyCol = () => mixColor(props.theme().background.raised.base, props.theme().text.muted, 0.2);
            return (() => {
              var _el$57 = _$createElement2("box"), _el$58 = _$createElement2("text"), _el$59 = _$createElement2("text");
              _$insertNode2(_el$57, _el$58);
              _$insertNode2(_el$57, _el$59);
              _$setProp2(_el$57, "flexDirection", "row");
              _$setProp2(_el$57, "width", "100%");
              _$setProp2(_el$57, "height", 1);
              _$setProp2(_el$57, "gap", 1);
              _$insert2(_el$58, () => b.label.padEnd(6));
              _$insert2(_el$57, _$createComponent2(StackedBar, {
                get total() {
                  return maxBucketVal();
                },
                get width() {
                  return barWidth();
                },
                get emptyColor() {
                  return emptyCol();
                },
                get segments() {
                  return [...topEntries(), {
                    value: otherVal(),
                    color: otherColor()
                  }];
                }
              }), _el$59);
              _$insert2(_el$59, () => formatMetricVal(totalVal()).padStart(8));
              _$insert2(_el$57, _$createComponent2(Show2, {
                get when() {
                  return props.width >= 68;
                },
                get children() {
                  var _el$60 = _$createElement2("text");
                  _$insert2(_el$60, (() => {
                    var _c$2 = _$memo2(() => dominant().pct > 0);
                    return () => _c$2() ? `${truncate(dominant().name, 16)} ${Math.round(dominant().pct)}%` : "-";
                  })());
                  _$effect2((_$p) => _$setProp2(_el$60, "fg", props.theme().text.muted, _$p));
                  return _el$60;
                }
              }), null);
              _$effect2((_p$) => {
                var _v$22 = props.theme().text.muted, _v$23 = props.theme().text.base, _v$24 = TextAttributes2.BOLD;
                _v$22 !== _p$.e && (_p$.e = _$setProp2(_el$58, "fg", _v$22, _p$.e));
                _v$23 !== _p$.t && (_p$.t = _$setProp2(_el$59, "fg", _v$23, _p$.t));
                _v$24 !== _p$.a && (_p$.a = _$setProp2(_el$59, "attributes", _v$24, _p$.a));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined
              });
              return _el$57;
            })();
          }
        })];
      }
    }), null);
    _$insert2(_el$45, _$createComponent2(SectionPanel, {
      title: "MODEL LEADERBOARD & LATENCY",
      get subtitle() {
        return `${props.includeVariants ? "split by #variant" : "grouped"} ([v] toggle)`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return _$createComponent2(Show2, {
          get when() {
            return s().models.length > 0;
          },
          get fallback() {
            return (() => {
              var _el$61 = _$createElement2("text");
              _$insertNode2(_el$61, _$createTextNode2(`No model usage`));
              _$effect2((_$p) => _$setProp2(_el$61, "fg", props.theme().text.muted, _$p));
              return _el$61;
            })();
          },
          get children() {
            return _$createComponent2(Show2, {
              get when() {
                return props.width >= 82;
              },
              get fallback() {
                return _$createComponent2(For2, {
                  get each() {
                    return s().models;
                  },
                  children: (m, idx) => (() => {
                    var _el$63 = _$createElement2("box"), _el$64 = _$createElement2("box"), _el$65 = _$createElement2("text"), _el$67 = _$createElement2("text"), _el$68 = _$createElement2("text"), _el$69 = _$createTextNode2(`  `), _el$70 = _$createTextNode2(` tok \xB7 `), _el$71 = _$createTextNode2(` steps \xB7 `), _el$72 = _$createTextNode2(` \xB7 `), _el$74 = _$createTextNode2(` cache \xB7 ttft `), _el$75 = _$createTextNode2(` \xB7 `);
                    _$insertNode2(_el$63, _el$64);
                    _$insertNode2(_el$63, _el$68);
                    _$setProp2(_el$63, "flexDirection", "column");
                    _$setProp2(_el$63, "marginBottom", 1);
                    _$insertNode2(_el$64, _el$65);
                    _$insertNode2(_el$64, _el$67);
                    _$setProp2(_el$64, "flexDirection", "row");
                    _$setProp2(_el$64, "gap", 1);
                    _$insertNode2(_el$65, _$createTextNode2(`\u25A0`));
                    _$insert2(_el$67, () => truncate(m.key, props.width - 8));
                    _$insertNode2(_el$68, _el$69);
                    _$insertNode2(_el$68, _el$70);
                    _$insertNode2(_el$68, _el$71);
                    _$insertNode2(_el$68, _el$72);
                    _$insertNode2(_el$68, _el$74);
                    _$insertNode2(_el$68, _el$75);
                    _$insert2(_el$68, () => compactNumber(m.tokens.total), _el$70);
                    _$insert2(_el$68, () => formatInt(m.steps), _el$71);
                    _$insert2(_el$68, () => formatUsd(m.cost), _el$72);
                    _$insert2(_el$68, () => formatPct(m.cacheHitPct), _el$74);
                    _$insert2(_el$68, () => formatDurationMs(m.ttftP50Ms), _el$75);
                    _$insert2(_el$68, (() => {
                      var _c$3 = _$memo2(() => !!m.tpsAvg);
                      return () => _c$3() ? `${formatRate(m.tpsAvg, 1)} t/s` : "-";
                    })(), null);
                    _$effect2((_p$) => {
                      var _v$25 = palette()[idx() % palette().length], _v$26 = props.theme().text.base, _v$27 = TextAttributes2.BOLD, _v$28 = props.theme().text.muted;
                      _v$25 !== _p$.e && (_p$.e = _$setProp2(_el$65, "fg", _v$25, _p$.e));
                      _v$26 !== _p$.t && (_p$.t = _$setProp2(_el$67, "fg", _v$26, _p$.t));
                      _v$27 !== _p$.a && (_p$.a = _$setProp2(_el$67, "attributes", _v$27, _p$.a));
                      _v$28 !== _p$.o && (_p$.o = _$setProp2(_el$68, "fg", _v$28, _p$.o));
                      return _p$;
                    }, {
                      e: undefined,
                      t: undefined,
                      a: undefined,
                      o: undefined
                    });
                    return _el$63;
                  })()
                });
              },
              get children() {
                return [_$createComponent2(TableRowLine, {
                  get theme() {
                    return props.theme;
                  },
                  get cells() {
                    return [{
                      text: " ",
                      width: 1
                    }, {
                      text: "model",
                      width: Math.max(22, props.width - 70),
                      color: props.theme().text.muted
                    }, {
                      text: "share",
                      width: 6,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "tokens",
                      width: 8,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "steps",
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "cost",
                      width: 8,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "cache",
                      width: 6,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "ttft",
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "tok/s",
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }];
                  }
                }), _$createComponent2(For2, {
                  get each() {
                    return s().models;
                  },
                  children: (m, idx) => {
                    const nameW = () => Math.max(22, props.width - 70);
                    const share = () => m.cost / totalModelsCost() * 100;
                    return _$createComponent2(TableRowLine, {
                      get theme() {
                        return props.theme;
                      },
                      get cells() {
                        return [{
                          text: "\u25A0",
                          width: 1,
                          color: palette()[idx() % palette().length]
                        }, {
                          text: m.key,
                          width: nameW()
                        }, {
                          text: formatPct(share()),
                          width: 6,
                          align: "right",
                          color: props.theme().text.muted
                        }, {
                          text: compactNumber(m.tokens.total),
                          width: 8,
                          align: "right"
                        }, {
                          text: compactNumber(m.steps),
                          width: 7,
                          align: "right",
                          color: props.theme().text.muted
                        }, {
                          text: formatUsd(m.cost),
                          width: 8,
                          align: "right",
                          bold: true
                        }, {
                          text: formatPct(m.cacheHitPct),
                          width: 6,
                          align: "right",
                          color: props.theme().text.muted
                        }, {
                          text: formatDurationMs(m.ttftP50Ms),
                          width: 7,
                          align: "right",
                          color: props.theme().text.muted
                        }, {
                          text: m.tpsAvg ? `${formatRate(m.tpsAvg, 1)}` : "-",
                          width: 7,
                          align: "right",
                          color: palette()[2]
                        }];
                      }
                    });
                  }
                })];
              }
            });
          }
        });
      }
    }), null);
    return _el$45;
  })();
}
function GitHubSection(props) {
  const s = () => props.stats;
  const gh = () => s().github;
  const colOpen = () => props.theme().text.feedback.info.base;
  const colAppr = () => props.theme().text.feedback.success.base;
  const colWarn = () => props.theme().text.feedback.warning.base;
  const maxActivity = createMemo2(() => Math.max(1, ...gh().series.map((b) => Math.max(b.opened, b.approvals))));
  const halfBarW = () => Math.max(6, Math.min(20, Math.floor((props.width - 42) / 2)));
  const wide = () => props.width >= 82;
  return (() => {
    var _el$77 = _$createElement2("box");
    _$setProp2(_el$77, "flexDirection", "column");
    _$setProp2(_el$77, "width", "100%");
    _$setProp2(_el$77, "gap", 2);
    _$insert2(_el$77, _$createComponent2(Show2, {
      get when() {
        return gh().status === "ok";
      },
      get fallback() {
        return _$createComponent2(SectionPanel, {
          title: "GITHUB PRs & APPROVALS",
          get subtitle() {
            return gh().status;
          },
          get theme() {
            return props.theme;
          },
          get children() {
            var _el$83 = _$createElement2("text");
            _$insert2(_el$83, (() => {
              var _c$4 = _$memo2(() => gh().status === "loading");
              return () => _c$4() ? "Fetching GitHub authored PRs & review approvals via GraphQL\u2026" : gh().message ?? "GitHub CLI not available or not authenticated (`gh auth login`).";
            })());
            _$effect2((_$p) => _$setProp2(_el$83, "fg", props.theme().text.muted, _$p));
            return _el$83;
          }
        });
      },
      get children() {
        return [_$createComponent2(SectionPanel, {
          title: "GITHUB PR & APPROVAL VELOCITY",
          get subtitle() {
            return `@${gh().login ?? ""}${gh().repoFilter ? ` \xB7 ${gh().repoFilter}` : " \xB7 all repos"}`;
          },
          get theme() {
            return props.theme;
          },
          get children() {
            return [(() => {
              var _el$78 = _$createElement2("box");
              _$setProp2(_el$78, "flexDirection", "row");
              _$setProp2(_el$78, "flexWrap", "wrap");
              _$setProp2(_el$78, "justifyContent", "space-around");
              _$setProp2(_el$78, "gap", 2);
              _$insert2(_el$78, _$createComponent2(StatTile, {
                get value() {
                  return formatRate(gh().avgPrsPerDay);
                },
                label: "opened PRs / day",
                get sublabel() {
                  return `${formatRate(gh().avgPrsPerWeekday)} / weekday`;
                },
                get color() {
                  return colOpen();
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$78, _$createComponent2(StatTile, {
                get value() {
                  return formatRate(gh().avgApprovalsPerDay);
                },
                label: "approvals / day",
                get sublabel() {
                  return `${formatRate(gh().avgApprovalsPerWeekday)} / weekday`;
                },
                get color() {
                  return colAppr();
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$78, _$createComponent2(StatTile, {
                get value() {
                  return formatInt(gh().openedTotal);
                },
                label: "PRs opened",
                get sublabel() {
                  return `${gh().mergedTotal}m \xB7 ${gh().openTotal}o \xB7 ${gh().closedTotal}c`;
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$78, _$createComponent2(StatTile, {
                get value() {
                  return formatInt(gh().approvalsTotal);
                },
                label: "approvals",
                get sublabel() {
                  return `${gh().uniquePrsApproved} unique PRs`;
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$78, _$createComponent2(StatTile, {
                get value() {
                  return formatPct(gh().mergeRatePct);
                },
                label: "merge rate",
                get sublabel() {
                  return `med ${formatHours(gh().medianMergeHours)}`;
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$78, _$createComponent2(StatTile, {
                get value() {
                  return formatPct(gh().approvalRatePct);
                },
                label: "approval rate",
                get sublabel() {
                  return `${gh().changesRequestedTotal} chg \xB7 ${gh().commentsTotal} cmt`;
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              return _el$78;
            })(), (() => {
              var _el$79 = _$createElement2("box"), _el$80 = _$createElement2("box"), _el$81 = _$createElement2("box");
              _$insertNode2(_el$79, _el$80);
              _$insertNode2(_el$79, _el$81);
              _$setProp2(_el$79, "gap", 2);
              _$setProp2(_el$79, "marginTop", 1);
              _$setProp2(_el$80, "flexGrow", 1);
              _$insert2(_el$80, _$createComponent2(KeyValueRow, {
                label: "avg PRs / active PR day",
                get value() {
                  return formatRate(gh().avgPrsPerActivePrDay);
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$80, _$createComponent2(KeyValueRow, {
                label: "total PR diff",
                get value() {
                  return compactSigned(gh().additions, gh().deletions);
                },
                get secondary() {
                  return `avg ${compactNumber(gh().avgPrSize)} lines`;
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$setProp2(_el$81, "flexGrow", 1);
              _$insert2(_el$81, _$createComponent2(KeyValueRow, {
                label: "AI spend / opened PR",
                get value() {
                  return _$memo2(() => gh().efficiency.costPerPr !== undefined)() ? formatUsd(gh().efficiency.costPerPr) : "-";
                },
                get secondary() {
                  return _$memo2(() => gh().efficiency.promptsPerPr !== undefined)() ? `${formatRate(gh().efficiency.promptsPerPr, 1)} prompts/PR` : undefined;
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$81, _$createComponent2(KeyValueRow, {
                label: "AI tokens / opened PR",
                get value() {
                  return _$memo2(() => gh().efficiency.tokensPerPr !== undefined)() ? compactNumber(gh().efficiency.tokensPerPr) : "-";
                },
                get secondary() {
                  return _$memo2(() => gh().efficiency.sessionsPerPr !== undefined)() ? `${formatRate(gh().efficiency.sessionsPerPr, 1)} sess/PR` : undefined;
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$effect2((_$p) => _$setProp2(_el$79, "flexDirection", wide() ? "row" : "column", _$p));
              return _el$79;
            })()];
          }
        }), _$createComponent2(SectionPanel, {
          title: "PRs OPENED VS APPROVALS OVER TIME",
          get subtitle() {
            return `per ${s().meta.bucketGranularity} \xB7 \u25A0 opened  \u25A0 approved`;
          },
          get theme() {
            return props.theme;
          },
          get children() {
            return _$createComponent2(For2, {
              get each() {
                return [...gh().series].reverse().slice(0, 40);
              },
              children: (b) => {
                const emptyCol = () => mixColor(props.theme().background.raised.base, props.theme().text.muted, 0.2);
                return (() => {
                  var _el$84 = _$createElement2("box"), _el$85 = _$createElement2("text"), _el$86 = _$createElement2("text"), _el$87 = _$createElement2("text"), _el$89 = _$createElement2("text");
                  _$insertNode2(_el$84, _el$85);
                  _$insertNode2(_el$84, _el$86);
                  _$insertNode2(_el$84, _el$87);
                  _$insertNode2(_el$84, _el$89);
                  _$setProp2(_el$84, "flexDirection", "row");
                  _$setProp2(_el$84, "width", "100%");
                  _$setProp2(_el$84, "height", 1);
                  _$setProp2(_el$84, "gap", 1);
                  _$insert2(_el$85, () => b.label.padEnd(6));
                  _$insert2(_el$84, _$createComponent2(StackedBar, {
                    get total() {
                      return maxActivity();
                    },
                    get width() {
                      return halfBarW();
                    },
                    get emptyColor() {
                      return emptyCol();
                    },
                    get segments() {
                      return [{
                        value: b.opened,
                        color: colOpen()
                      }];
                    }
                  }), _el$86);
                  _$insert2(_el$86, () => String(b.opened).padStart(3));
                  _$insertNode2(_el$87, _$createTextNode2(`\u2502`));
                  _$insert2(_el$84, _$createComponent2(StackedBar, {
                    get total() {
                      return maxActivity();
                    },
                    get width() {
                      return halfBarW();
                    },
                    get emptyColor() {
                      return emptyCol();
                    },
                    get segments() {
                      return [{
                        value: b.approvals,
                        color: colAppr()
                      }];
                    }
                  }), _el$89);
                  _$insert2(_el$89, () => String(b.approvals).padStart(3));
                  _$insert2(_el$84, _$createComponent2(Show2, {
                    get when() {
                      return props.width >= 68;
                    },
                    get children() {
                      var _el$90 = _$createElement2("text");
                      _$insert2(_el$90, (() => {
                        var _c$5 = _$memo2(() => !!(b.changesRequested > 0 || b.comments > 0));
                        return () => _c$5() ? `(${b.changesRequested}\u0394 ${b.comments}c)` : "";
                      })());
                      _$effect2((_$p) => _$setProp2(_el$90, "fg", props.theme().text.muted, _$p));
                      return _el$90;
                    }
                  }), null);
                  _$effect2((_p$) => {
                    var _v$29 = props.theme().text.muted, _v$30 = colOpen(), _v$31 = TextAttributes2.BOLD, _v$32 = props.theme().text.muted, _v$33 = colAppr(), _v$34 = TextAttributes2.BOLD;
                    _v$29 !== _p$.e && (_p$.e = _$setProp2(_el$85, "fg", _v$29, _p$.e));
                    _v$30 !== _p$.t && (_p$.t = _$setProp2(_el$86, "fg", _v$30, _p$.t));
                    _v$31 !== _p$.a && (_p$.a = _$setProp2(_el$86, "attributes", _v$31, _p$.a));
                    _v$32 !== _p$.o && (_p$.o = _$setProp2(_el$87, "fg", _v$32, _p$.o));
                    _v$33 !== _p$.i && (_p$.i = _$setProp2(_el$89, "fg", _v$33, _p$.i));
                    _v$34 !== _p$.n && (_p$.n = _$setProp2(_el$89, "attributes", _v$34, _p$.n));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined,
                    a: undefined,
                    o: undefined,
                    i: undefined,
                    n: undefined
                  });
                  return _el$84;
                })();
              }
            });
          }
        }), _$createComponent2(SectionPanel, {
          title: "TOP REPOSITORIES",
          get subtitle() {
            return `${gh().repos.length} repos`;
          },
          get theme() {
            return props.theme;
          },
          get children() {
            return _$createComponent2(Show2, {
              get when() {
                return gh().repos.length > 0;
              },
              get fallback() {
                return (() => {
                  var _el$91 = _$createElement2("text");
                  _$insertNode2(_el$91, _$createTextNode2(`No repository activity`));
                  _$effect2((_$p) => _$setProp2(_el$91, "fg", props.theme().text.muted, _$p));
                  return _el$91;
                })();
              },
              get children() {
                return [_$createComponent2(TableRowLine, {
                  get theme() {
                    return props.theme;
                  },
                  get cells() {
                    return [{
                      text: "repository",
                      width: Math.max(18, props.width - 54),
                      color: props.theme().text.muted
                    }, {
                      text: "opened",
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "merged",
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "appr",
                      width: 6,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "revs",
                      width: 6,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: "diff",
                      width: 14,
                      align: "right",
                      color: props.theme().text.muted
                    }];
                  }
                }), _$createComponent2(For2, {
                  get each() {
                    return gh().repos.slice(0, 12);
                  },
                  children: (r) => _$createComponent2(TableRowLine, {
                    get theme() {
                      return props.theme;
                    },
                    get cells() {
                      return [{
                        text: r.repo,
                        width: Math.max(18, props.width - 54)
                      }, {
                        text: formatInt(r.opened),
                        width: 7,
                        align: "right",
                        color: colOpen(),
                        bold: true
                      }, {
                        text: formatInt(r.merged),
                        width: 7,
                        align: "right",
                        color: props.theme().text.muted
                      }, {
                        text: formatInt(r.approvals),
                        width: 6,
                        align: "right",
                        color: colAppr(),
                        bold: true
                      }, {
                        text: formatInt(r.reviews),
                        width: 6,
                        align: "right",
                        color: props.theme().text.muted
                      }, {
                        text: r.opened > 0 ? compactSigned(r.additions, r.deletions) : "-",
                        width: 14,
                        align: "right",
                        color: props.theme().text.muted
                      }];
                    }
                  })
                })];
              }
            });
          }
        }), (() => {
          var _el$82 = _$createElement2("box");
          _$setProp2(_el$82, "width", "100%");
          _$setProp2(_el$82, "gap", 2);
          _$insert2(_el$82, _$createComponent2(SectionPanel, {
            title: "RECENT OPENED PRs",
            get theme() {
              return props.theme;
            },
            flexGrow: 1,
            get width() {
              return wide() ? "50%" : "100%";
            },
            get children() {
              return _$createComponent2(Show2, {
                get when() {
                  return gh().recentOpened.length > 0;
                },
                get fallback() {
                  return (() => {
                    var _el$93 = _$createElement2("text");
                    _$insertNode2(_el$93, _$createTextNode2(`None in range`));
                    _$effect2((_$p) => _$setProp2(_el$93, "fg", props.theme().text.muted, _$p));
                    return _el$93;
                  })();
                },
                get children() {
                  return _$createComponent2(For2, {
                    get each() {
                      return gh().recentOpened.slice(0, 8);
                    },
                    children: (pr) => {
                      const stColor = () => pr.state === "MERGED" ? props.theme().hue?.accent?.[200] ?? colAppr() : pr.state === "OPEN" ? colAppr() : props.theme().text.muted;
                      const titleW = () => Math.max(14, (wide() ? Math.floor(props.width / 2) : props.width) - 24);
                      return _$createComponent2(TableRowLine, {
                        get theme() {
                          return props.theme;
                        },
                        get cells() {
                          return [{
                            text: pr.state.slice(0, 4),
                            width: 4,
                            color: stColor(),
                            bold: true
                          }, {
                            text: `#${pr.number}`,
                            width: 6,
                            color: props.theme().text.muted
                          }, {
                            text: pr.title,
                            width: titleW()
                          }];
                        }
                      });
                    }
                  });
                }
              });
            }
          }), null);
          _$insert2(_el$82, _$createComponent2(SectionPanel, {
            title: "RECENT REVIEWS & APPROVALS",
            get theme() {
              return props.theme;
            },
            flexGrow: 1,
            get width() {
              return wide() ? "50%" : "100%";
            },
            get children() {
              return _$createComponent2(Show2, {
                get when() {
                  return gh().recentReviewed.length > 0;
                },
                get fallback() {
                  return (() => {
                    var _el$95 = _$createElement2("text");
                    _$insertNode2(_el$95, _$createTextNode2(`None in range`));
                    _$effect2((_$p) => _$setProp2(_el$95, "fg", props.theme().text.muted, _$p));
                    return _el$95;
                  })();
                },
                get children() {
                  return _$createComponent2(For2, {
                    get each() {
                      return gh().recentReviewed.slice(0, 8);
                    },
                    children: (rev) => {
                      const rvColor = () => rev.reviewState === "APPROVED" ? colAppr() : rev.reviewState === "CHANGES_REQUESTED" ? colWarn() : props.theme().text.muted;
                      const badge = () => rev.reviewState === "APPROVED" ? "APPR" : rev.reviewState === "CHANGES_REQUESTED" ? "CHNG" : "CMNT";
                      const titleW = () => Math.max(14, (wide() ? Math.floor(props.width / 2) : props.width) - 24);
                      return _$createComponent2(TableRowLine, {
                        get theme() {
                          return props.theme;
                        },
                        get cells() {
                          return [{
                            text: badge(),
                            width: 4,
                            color: rvColor(),
                            bold: true
                          }, {
                            text: `#${rev.number}`,
                            width: 6,
                            color: props.theme().text.muted
                          }, {
                            text: rev.title,
                            width: titleW()
                          }];
                        }
                      });
                    }
                  });
                }
              });
            }
          }), null);
          _$effect2((_$p) => _$setProp2(_el$82, "flexDirection", wide() ? "row" : "column", _$p));
          return _el$82;
        })()];
      }
    }));
    return _el$77;
  })();
}
function ToolsSection(props) {
  const s = () => props.stats;
  const palette = createMemo2(() => getSeriesPalette(props.theme()));
  const topTools = () => s().toolSeries.topTools;
  const buckets = () => s().toolSeries.buckets;
  const totalCalls = () => s().summary.tools.calls;
  const finishedCalls = () => s().summary.tools.succeeded + s().summary.tools.failed;
  const successRate = () => finishedCalls() > 0 ? s().summary.tools.succeeded / finishedCalls() * 100 : 100;
  const mcpTools = createMemo2(() => s().tools.filter((t) => t.isMcp));
  const mcpCalls = createMemo2(() => mcpTools().reduce((sum, t) => sum + t.calls, 0));
  const builtinCalls = createMemo2(() => Math.max(0, totalCalls() - mcpCalls()));
  const maxBucketCalls = createMemo2(() => Math.max(1, ...buckets().map((b) => b.totalCalls)));
  const maxToolCalls = createMemo2(() => Math.max(1, ...s().tools.map((t) => t.calls)));
  const barWidth = () => Math.max(10, Math.min(44, props.width - 44));
  const otherColor = () => props.theme().text.muted;
  const topToolCounts = createMemo2(() => {
    const byName = new Map(s().tools.map((t) => [t.name, t.calls]));
    return topTools().map((name, idx) => ({
      name,
      calls: byName.get(name) ?? 0,
      color: palette()[idx % palette().length]
    }));
  });
  const topSum = createMemo2(() => topToolCounts().reduce((acc, item) => acc + item.calls, 0));
  const otherTotalCalls = createMemo2(() => Math.max(0, totalCalls() - topSum()));
  return (() => {
    var _el$97 = _$createElement2("box");
    _$setProp2(_el$97, "flexDirection", "column");
    _$setProp2(_el$97, "width", "100%");
    _$setProp2(_el$97, "gap", 2);
    _$insert2(_el$97, _$createComponent2(SectionPanel, {
      title: "TOOL SUMMARY & MIX",
      get subtitle() {
        return `${s().tools.length} distinct tools \xB7 ${formatInt(totalCalls())} calls`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return [_$createComponent2(StackedBar, {
          get total() {
            return Math.max(1, totalCalls());
          },
          get width() {
            return Math.max(16, props.width - 8);
          },
          get emptyColor() {
            return props.theme().background.raised.high;
          },
          get segments() {
            return [...topToolCounts().map((item) => ({
              value: item.calls,
              color: item.color
            })), {
              value: otherTotalCalls(),
              color: otherColor()
            }];
          }
        }), (() => {
          var _el$98 = _$createElement2("box");
          _$setProp2(_el$98, "flexDirection", "row");
          _$setProp2(_el$98, "flexWrap", "wrap");
          _$setProp2(_el$98, "columnGap", 2);
          _$setProp2(_el$98, "rowGap", 0);
          _$setProp2(_el$98, "marginTop", 1);
          _$insert2(_el$98, _$createComponent2(For2, {
            get each() {
              return topToolCounts();
            },
            children: (item) => (() => {
              var _el$113 = _$createElement2("box"), _el$114 = _$createElement2("text"), _el$116 = _$createElement2("text"), _el$117 = _$createTextNode2(` `), _el$118 = _$createTextNode2(` (`), _el$119 = _$createTextNode2(`)`);
              _$insertNode2(_el$113, _el$114);
              _$insertNode2(_el$113, _el$116);
              _$setProp2(_el$113, "flexDirection", "row");
              _$setProp2(_el$113, "gap", 1);
              _$insertNode2(_el$114, _$createTextNode2(`\u25A0`));
              _$insertNode2(_el$116, _el$117);
              _$insertNode2(_el$116, _el$118);
              _$insertNode2(_el$116, _el$119);
              _$insert2(_el$116, () => item.name, _el$117);
              _$insert2(_el$116, () => compactNumber(item.calls), _el$118);
              _$insert2(_el$116, () => formatPct(totalCalls() > 0 ? item.calls / totalCalls() * 100 : 0), _el$119);
              _$effect2((_p$) => {
                var _v$39 = item.color, _v$40 = props.theme().text.base;
                _v$39 !== _p$.e && (_p$.e = _$setProp2(_el$114, "fg", _v$39, _p$.e));
                _v$40 !== _p$.t && (_p$.t = _$setProp2(_el$116, "fg", _v$40, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$113;
            })()
          }), null);
          _$insert2(_el$98, _$createComponent2(Show2, {
            get when() {
              return otherTotalCalls() > 0;
            },
            get children() {
              var _el$99 = _$createElement2("box"), _el$100 = _$createElement2("text"), _el$102 = _$createElement2("text"), _el$103 = _$createTextNode2(`other (`), _el$104 = _$createTextNode2(`) `);
              _$insertNode2(_el$99, _el$100);
              _$insertNode2(_el$99, _el$102);
              _$setProp2(_el$99, "flexDirection", "row");
              _$setProp2(_el$99, "gap", 1);
              _$insertNode2(_el$100, _$createTextNode2(`\u25A0`));
              _$insertNode2(_el$102, _el$103);
              _$insertNode2(_el$102, _el$104);
              _$insert2(_el$102, () => Math.max(0, s().tools.length - topTools().length), _el$104);
              _$insert2(_el$102, () => compactNumber(otherTotalCalls()), null);
              _$effect2((_p$) => {
                var _v$35 = otherColor(), _v$36 = props.theme().text.muted;
                _v$35 !== _p$.e && (_p$.e = _$setProp2(_el$100, "fg", _v$35, _p$.e));
                _v$36 !== _p$.t && (_p$.t = _$setProp2(_el$102, "fg", _v$36, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$99;
            }
          }), null);
          return _el$98;
        })(), (() => {
          var _el$105 = _$createElement2("box");
          _$setProp2(_el$105, "flexDirection", "row");
          _$setProp2(_el$105, "flexWrap", "wrap");
          _$setProp2(_el$105, "justifyContent", "space-between");
          _$setProp2(_el$105, "gap", 2);
          _$setProp2(_el$105, "marginTop", 1);
          _$insert2(_el$105, _$createComponent2(StatTile, {
            get value() {
              return compactNumber(totalCalls());
            },
            label: "total calls",
            get sublabel() {
              return `${compactNumber(totalCalls() / Math.max(1, s().summary.activeDays))}/act`;
            },
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$105, _$createComponent2(StatTile, {
            get value() {
              return compactNumber(totalCalls() / Math.max(1, s().meta.daysCount));
            },
            label: "calls / day",
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$105, _$createComponent2(StatTile, {
            get value() {
              return formatRate(totalCalls() / Math.max(1, s().summary.steps), 2);
            },
            label: "calls / step",
            get sublabel() {
              return `${formatRate(totalCalls() / Math.max(1, s().summary.prompts), 1)}/prompt`;
            },
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$105, _$createComponent2(StatTile, {
            get value() {
              return formatPct(successRate());
            },
            label: "success rate",
            get sublabel() {
              return `${formatInt(s().summary.tools.failed)} err \xB7 ${formatInt(s().summary.tools.unfinished)} unf`;
            },
            get color() {
              return props.theme().text.feedback.success.base;
            },
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$105, _$createComponent2(StatTile, {
            get value() {
              return compactNumber(builtinCalls());
            },
            label: "built-in",
            get sublabel() {
              return `${formatPct(totalCalls() > 0 ? builtinCalls() / totalCalls() * 100 : 0)}`;
            },
            get theme() {
              return props.theme;
            }
          }), null);
          _$insert2(_el$105, _$createComponent2(StatTile, {
            get value() {
              return compactNumber(mcpCalls());
            },
            label: "mcp / plugin",
            get sublabel() {
              return `${mcpTools().length} tools`;
            },
            get color() {
              return props.theme().hue?.accent?.[200] ?? palette()[4];
            },
            get theme() {
              return props.theme;
            }
          }), null);
          return _el$105;
        })()];
      }
    }), null);
    _$insert2(_el$97, _$createComponent2(SectionPanel, {
      title: "TOOL TREND SPARKLINES",
      get subtitle() {
        return `by ${s().meta.bucketGranularity}`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return [_$createComponent2(SparkStrip, {
          label: "tool calls",
          get values() {
            return buckets().map((b) => b.totalCalls);
          },
          get summaryText() {
            return `${formatInt(totalCalls())} calls`;
          },
          get color() {
            return palette()[0] ?? props.theme().text.base;
          },
          get maxBars() {
            return Math.max(12, props.width - 36);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(SparkStrip, {
          label: "tool errors",
          get values() {
            return buckets().map((b) => b.failed);
          },
          get summaryText() {
            return `${formatInt(s().summary.tools.failed)} errors`;
          },
          get color() {
            return props.theme().text.feedback.error.base;
          },
          get maxBars() {
            return Math.max(12, props.width - 36);
          },
          get theme() {
            return props.theme;
          }
        })];
      }
    }), null);
    _$insert2(_el$97, _$createComponent2(SectionPanel, {
      title: "TOOL CALLS OVER TIME",
      get subtitle() {
        return `per ${s().meta.bucketGranularity} \xB7 ${buckets().length} buckets`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return [(() => {
          var _el$106 = _$createElement2("box");
          _$setProp2(_el$106, "flexDirection", "row");
          _$setProp2(_el$106, "flexWrap", "wrap");
          _$setProp2(_el$106, "columnGap", 2);
          _$setProp2(_el$106, "rowGap", 0);
          _$setProp2(_el$106, "marginBottom", 1);
          _$insert2(_el$106, _$createComponent2(For2, {
            get each() {
              return topTools();
            },
            children: (toolName, idx) => (() => {
              var _el$120 = _$createElement2("box"), _el$121 = _$createElement2("text"), _el$123 = _$createElement2("text");
              _$insertNode2(_el$120, _el$121);
              _$insertNode2(_el$120, _el$123);
              _$setProp2(_el$120, "flexDirection", "row");
              _$setProp2(_el$120, "gap", 1);
              _$insertNode2(_el$121, _$createTextNode2(`\u25A0`));
              _$insert2(_el$123, toolName);
              _$effect2((_p$) => {
                var _v$41 = palette()[idx() % palette().length], _v$42 = props.theme().text.base;
                _v$41 !== _p$.e && (_p$.e = _$setProp2(_el$121, "fg", _v$41, _p$.e));
                _v$42 !== _p$.t && (_p$.t = _$setProp2(_el$123, "fg", _v$42, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$120;
            })()
          }), null);
          _$insert2(_el$106, _$createComponent2(Show2, {
            get when() {
              return s().tools.length > topTools().length;
            },
            get children() {
              var _el$107 = _$createElement2("box"), _el$108 = _$createElement2("text"), _el$110 = _$createElement2("text"), _el$111 = _$createTextNode2(`other (`), _el$112 = _$createTextNode2(`)`);
              _$insertNode2(_el$107, _el$108);
              _$insertNode2(_el$107, _el$110);
              _$setProp2(_el$107, "flexDirection", "row");
              _$setProp2(_el$107, "gap", 1);
              _$insertNode2(_el$108, _$createTextNode2(`\u25A0`));
              _$insertNode2(_el$110, _el$111);
              _$insertNode2(_el$110, _el$112);
              _$insert2(_el$110, () => s().tools.length - topTools().length, _el$112);
              _$effect2((_p$) => {
                var _v$37 = otherColor(), _v$38 = props.theme().text.muted;
                _v$37 !== _p$.e && (_p$.e = _$setProp2(_el$108, "fg", _v$37, _p$.e));
                _v$38 !== _p$.t && (_p$.t = _$setProp2(_el$110, "fg", _v$38, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$107;
            }
          }), null);
          return _el$106;
        })(), _$createComponent2(TableRowLine, {
          get theme() {
            return props.theme;
          },
          get cells() {
            return [{
              text: s().meta.bucketGranularity === "week" ? "week" : "date",
              width: 6,
              color: props.theme().text.muted
            }, {
              text: "tools",
              width: barWidth(),
              color: props.theme().text.muted
            }, {
              text: "calls",
              width: 7,
              align: "right",
              color: props.theme().text.muted
            }, {
              text: "err%",
              width: 6,
              align: "right",
              color: props.theme().text.muted
            }, ...props.width >= 72 ? [{
              text: "top tool",
              width: 16,
              color: props.theme().text.muted
            }] : []];
          }
        }), _$createComponent2(For2, {
          get each() {
            return [...buckets()].reverse().slice(0, 40);
          },
          children: (b) => {
            const topEntries = () => topTools().map((toolName, idx) => ({
              value: b.byTool[toolName] ?? 0,
              color: palette()[idx % palette().length]
            }));
            const sumTop = () => topEntries().reduce((acc, e) => acc + e.value, 0);
            const otherVal = () => Math.max(0, b.totalCalls - sumTop());
            const dominant = createMemo2(() => {
              let bestName = "-";
              let bestVal = 0;
              for (const [k, v] of Object.entries(b.byTool)) {
                if (v > bestVal) {
                  bestVal = v;
                  bestName = k;
                }
              }
              return {
                name: bestName,
                pct: b.totalCalls > 0 ? bestVal / b.totalCalls * 100 : 0
              };
            });
            const emptyCol = () => mixColor(props.theme().background.raised.base, props.theme().text.muted, 0.2);
            return (() => {
              var _el$124 = _$createElement2("box"), _el$125 = _$createElement2("text"), _el$126 = _$createElement2("text"), _el$127 = _$createElement2("text");
              _$insertNode2(_el$124, _el$125);
              _$insertNode2(_el$124, _el$126);
              _$insertNode2(_el$124, _el$127);
              _$setProp2(_el$124, "flexDirection", "row");
              _$setProp2(_el$124, "width", "100%");
              _$setProp2(_el$124, "height", 1);
              _$setProp2(_el$124, "gap", 1);
              _$insert2(_el$125, () => b.label.padEnd(6));
              _$insert2(_el$124, _$createComponent2(StackedBar, {
                get total() {
                  return maxBucketCalls();
                },
                get width() {
                  return barWidth();
                },
                get emptyColor() {
                  return emptyCol();
                },
                get segments() {
                  return [...topEntries(), {
                    value: otherVal(),
                    color: otherColor()
                  }];
                }
              }), _el$126);
              _$insert2(_el$126, () => compactNumber(b.totalCalls).padStart(7));
              _$insert2(_el$127, () => formatPct(b.errorPct).padStart(6));
              _$insert2(_el$124, _$createComponent2(Show2, {
                get when() {
                  return props.width >= 72;
                },
                get children() {
                  var _el$128 = _$createElement2("text");
                  _$insert2(_el$128, (() => {
                    var _c$6 = _$memo2(() => dominant().pct > 0);
                    return () => _c$6() ? `${truncate(dominant().name, 11)} ${Math.round(dominant().pct)}%` : "-";
                  })());
                  _$effect2((_$p) => _$setProp2(_el$128, "fg", props.theme().text.muted, _$p));
                  return _el$128;
                }
              }), null);
              _$effect2((_p$) => {
                var _v$43 = props.theme().text.muted, _v$44 = props.theme().text.base, _v$45 = TextAttributes2.BOLD, _v$46 = b.errorPct >= 5 ? props.theme().text.feedback.error.base : props.theme().text.muted;
                _v$43 !== _p$.e && (_p$.e = _$setProp2(_el$125, "fg", _v$43, _p$.e));
                _v$44 !== _p$.t && (_p$.t = _$setProp2(_el$126, "fg", _v$44, _p$.t));
                _v$45 !== _p$.a && (_p$.a = _$setProp2(_el$126, "attributes", _v$45, _p$.a));
                _v$46 !== _p$.o && (_p$.o = _$setProp2(_el$127, "fg", _v$46, _p$.o));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined,
                o: undefined
              });
              return _el$124;
            })();
          }
        })];
      }
    }), null);
    _$insert2(_el$97, _$createComponent2(SectionPanel, {
      title: "TOOL RELIABILITY & LATENCY",
      get subtitle() {
        return `${formatInt(totalCalls())} total calls`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return _$createComponent2(Show2, {
          get when() {
            return s().tools.length > 0;
          },
          get fallback() {
            return (() => {
              var _el$129 = _$createElement2("text");
              _$insertNode2(_el$129, _$createTextNode2(`No tool calls`));
              _$effect2((_$p) => _$setProp2(_el$129, "fg", props.theme().text.muted, _$p));
              return _el$129;
            })();
          },
          get children() {
            return [_$createComponent2(TableRowLine, {
              get theme() {
                return props.theme;
              },
              get cells() {
                return [{
                  text: "tool",
                  width: Math.max(14, props.width - 68),
                  color: props.theme().text.muted
                }, {
                  text: "share",
                  width: 6,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "calls",
                  width: 8,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "err",
                  width: 6,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "err%",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "p50",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "p95",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "avg",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }];
              }
            }), _$createComponent2(For2, {
              get each() {
                return s().tools.slice(0, 20);
              },
              children: (tool) => {
                const nameW = () => Math.max(14, props.width - 68);
                const share = () => totalCalls() > 0 ? tool.calls / totalCalls() * 100 : 0;
                return _$createComponent2(TableRowLine, {
                  get theme() {
                    return props.theme;
                  },
                  get cells() {
                    return [{
                      text: tool.name,
                      width: nameW(),
                      color: tool.isMcp ? props.theme().hue?.accent?.[200] ?? props.theme().text.base : props.theme().text.base
                    }, {
                      text: formatPct(share()),
                      width: 6,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: compactNumber(tool.calls),
                      width: 8,
                      align: "right",
                      bold: true
                    }, {
                      text: formatInt(tool.failed),
                      width: 6,
                      align: "right",
                      color: tool.failed > 0 ? props.theme().text.feedback.warning.base : props.theme().text.muted
                    }, {
                      text: formatPct(tool.errorPct),
                      width: 7,
                      align: "right",
                      color: tool.errorPct >= 5 ? props.theme().text.feedback.error.base : props.theme().text.muted
                    }, {
                      text: formatDurationMs(tool.p50Ms),
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: formatDurationMs(tool.p95Ms),
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: formatDurationMs(tool.avgMs),
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }];
                  }
                });
              }
            })];
          }
        });
      }
    }), null);
    return _el$97;
  })();
}
function McpSection(props) {
  const s = () => props.stats;
  const mcp = () => s().mcp;
  const palette = createMemo2(() => getSeriesPalette(props.theme()));
  const mcpTools = createMemo2(() => s().tools.filter((t) => t.isMcp));
  const topServers = () => mcp().topServers;
  const buckets = () => mcp().buckets;
  const totalMcp = () => mcp().totalCalls;
  const finishedMcp = () => mcp().succeeded + mcp().failed;
  const successRate = () => finishedMcp() > 0 ? mcp().succeeded / finishedMcp() * 100 : 100;
  const maxBucketCalls = createMemo2(() => Math.max(1, ...buckets().map((b) => b.totalCalls)));
  const maxToolCalls = createMemo2(() => Math.max(1, ...mcpTools().map((t) => t.calls)));
  const barWidth = () => Math.max(10, Math.min(44, props.width - 44));
  const otherColor = () => props.theme().text.muted;
  const topServerItems = createMemo2(() => {
    const byName = new Map(mcp().servers.map((srv) => [srv.server, srv.calls]));
    return topServers().map((name, idx) => ({
      name,
      calls: byName.get(name) ?? 0,
      color: palette()[idx % palette().length]
    }));
  });
  const topSum = createMemo2(() => topServerItems().reduce((acc, item) => acc + item.calls, 0));
  const otherCalls = createMemo2(() => Math.max(0, totalMcp() - topSum()));
  return (() => {
    var _el$131 = _$createElement2("box");
    _$setProp2(_el$131, "flexDirection", "column");
    _$setProp2(_el$131, "width", "100%");
    _$setProp2(_el$131, "gap", 2);
    _$insert2(_el$131, _$createComponent2(SectionPanel, {
      title: "MCP SUMMARY & SERVER MIX",
      get subtitle() {
        return `${mcp().servers.length} servers \xB7 ${mcpTools().length} tools \xB7 ${formatInt(totalMcp())} calls`;
      },
      get theme() {
        return props.theme;
      },
      get children() {
        return _$createComponent2(Show2, {
          get when() {
            return totalMcp() > 0;
          },
          get fallback() {
            return (() => {
              var _el$147 = _$createElement2("box"), _el$148 = _$createElement2("text"), _el$150 = _$createElement2("text");
              _$insertNode2(_el$147, _el$148);
              _$insertNode2(_el$147, _el$150);
              _$setProp2(_el$147, "flexDirection", "column");
              _$setProp2(_el$147, "gap", 1);
              _$insertNode2(_el$148, _$createTextNode2(`No direct MCP tool calls recorded in this time window.`));
              _$insertNode2(_el$150, _$createTextNode2(`Tip: Try [90D] / [YTD] / [ALL] for earlier direct MCP calls, or check [5] Tools for Code Mode \`execute\` calls.`));
              _$effect2((_p$) => {
                var _v$51 = props.theme().text.muted, _v$52 = props.theme().text.muted;
                _v$51 !== _p$.e && (_p$.e = _$setProp2(_el$148, "fg", _v$51, _p$.e));
                _v$52 !== _p$.t && (_p$.t = _$setProp2(_el$150, "fg", _v$52, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$147;
            })();
          },
          get children() {
            return [_$createComponent2(StackedBar, {
              get total() {
                return Math.max(1, totalMcp());
              },
              get width() {
                return Math.max(16, props.width - 8);
              },
              get emptyColor() {
                return props.theme().background.raised.high;
              },
              get segments() {
                return [...topServerItems().map((item) => ({
                  value: item.calls,
                  color: item.color
                })), {
                  value: otherCalls(),
                  color: otherColor()
                }];
              }
            }), (() => {
              var _el$132 = _$createElement2("box");
              _$setProp2(_el$132, "flexDirection", "row");
              _$setProp2(_el$132, "flexWrap", "wrap");
              _$setProp2(_el$132, "columnGap", 2);
              _$setProp2(_el$132, "rowGap", 0);
              _$setProp2(_el$132, "marginTop", 1);
              _$insert2(_el$132, _$createComponent2(For2, {
                get each() {
                  return topServerItems();
                },
                children: (item) => (() => {
                  var _el$152 = _$createElement2("box"), _el$153 = _$createElement2("text"), _el$155 = _$createElement2("text"), _el$156 = _$createTextNode2(` `), _el$157 = _$createTextNode2(` (`), _el$158 = _$createTextNode2(`)`);
                  _$insertNode2(_el$152, _el$153);
                  _$insertNode2(_el$152, _el$155);
                  _$setProp2(_el$152, "flexDirection", "row");
                  _$setProp2(_el$152, "gap", 1);
                  _$insertNode2(_el$153, _$createTextNode2(`\u25A0`));
                  _$insertNode2(_el$155, _el$156);
                  _$insertNode2(_el$155, _el$157);
                  _$insertNode2(_el$155, _el$158);
                  _$insert2(_el$155, () => item.name, _el$156);
                  _$insert2(_el$155, () => compactNumber(item.calls), _el$157);
                  _$insert2(_el$155, () => formatPct(totalMcp() > 0 ? item.calls / totalMcp() * 100 : 0), _el$158);
                  _$effect2((_p$) => {
                    var _v$53 = item.color, _v$54 = props.theme().text.base;
                    _v$53 !== _p$.e && (_p$.e = _$setProp2(_el$153, "fg", _v$53, _p$.e));
                    _v$54 !== _p$.t && (_p$.t = _$setProp2(_el$155, "fg", _v$54, _p$.t));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$152;
                })()
              }), null);
              _$insert2(_el$132, _$createComponent2(Show2, {
                get when() {
                  return otherCalls() > 0;
                },
                get children() {
                  var _el$133 = _$createElement2("box"), _el$134 = _$createElement2("text"), _el$136 = _$createElement2("text"), _el$137 = _$createTextNode2(`other (`), _el$138 = _$createTextNode2(`) `);
                  _$insertNode2(_el$133, _el$134);
                  _$insertNode2(_el$133, _el$136);
                  _$setProp2(_el$133, "flexDirection", "row");
                  _$setProp2(_el$133, "gap", 1);
                  _$insertNode2(_el$134, _$createTextNode2(`\u25A0`));
                  _$insertNode2(_el$136, _el$137);
                  _$insertNode2(_el$136, _el$138);
                  _$insert2(_el$136, () => Math.max(0, mcp().servers.length - topServers().length), _el$138);
                  _$insert2(_el$136, () => compactNumber(otherCalls()), null);
                  _$effect2((_p$) => {
                    var _v$47 = otherColor(), _v$48 = props.theme().text.muted;
                    _v$47 !== _p$.e && (_p$.e = _$setProp2(_el$134, "fg", _v$47, _p$.e));
                    _v$48 !== _p$.t && (_p$.t = _$setProp2(_el$136, "fg", _v$48, _p$.t));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$133;
                }
              }), null);
              return _el$132;
            })(), (() => {
              var _el$139 = _$createElement2("box");
              _$setProp2(_el$139, "flexDirection", "row");
              _$setProp2(_el$139, "flexWrap", "wrap");
              _$setProp2(_el$139, "justifyContent", "space-between");
              _$setProp2(_el$139, "gap", 2);
              _$setProp2(_el$139, "marginTop", 1);
              _$insert2(_el$139, _$createComponent2(StatTile, {
                get value() {
                  return compactNumber(totalMcp());
                },
                label: "mcp calls",
                get sublabel() {
                  return `${compactNumber(totalMcp() / Math.max(1, s().summary.activeDays))}/act`;
                },
                get color() {
                  return props.theme().hue?.accent?.[200] ?? palette()[4];
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$139, _$createComponent2(StatTile, {
                get value() {
                  return formatRate(totalMcp() / Math.max(1, s().meta.daysCount), 1);
                },
                label: "mcp / day",
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$139, _$createComponent2(StatTile, {
                get value() {
                  return formatPct(mcp().shareOfAllToolsPct);
                },
                label: "% of all tools",
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$139, _$createComponent2(StatTile, {
                get value() {
                  return formatPct(successRate());
                },
                label: "success rate",
                get sublabel() {
                  return `${formatInt(mcp().failed)} err \xB7 ${formatInt(mcp().unfinished)} unf`;
                },
                get color() {
                  return props.theme().text.feedback.success.base;
                },
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$139, _$createComponent2(StatTile, {
                get value() {
                  return formatInt(mcp().servers.length);
                },
                label: "mcp servers",
                get theme() {
                  return props.theme;
                }
              }), null);
              _$insert2(_el$139, _$createComponent2(StatTile, {
                get value() {
                  return formatInt(mcpTools().length);
                },
                label: "mcp tools",
                get theme() {
                  return props.theme;
                }
              }), null);
              return _el$139;
            })()];
          }
        });
      }
    }), null);
    _$insert2(_el$131, _$createComponent2(Show2, {
      get when() {
        return totalMcp() > 0;
      },
      get children() {
        return [_$createComponent2(SectionPanel, {
          title: "MCP TREND SPARKLINES",
          get subtitle() {
            return `by ${s().meta.bucketGranularity}`;
          },
          get theme() {
            return props.theme;
          },
          get children() {
            return [_$createComponent2(SparkStrip, {
              label: "mcp calls",
              get values() {
                return buckets().map((b) => b.totalCalls);
              },
              get summaryText() {
                return `${formatInt(totalMcp())} calls`;
              },
              get color() {
                return palette()[1] ?? props.theme().text.base;
              },
              get maxBars() {
                return Math.max(12, props.width - 36);
              },
              get theme() {
                return props.theme;
              }
            }), _$createComponent2(SparkStrip, {
              label: "mcp errors",
              get values() {
                return buckets().map((b) => b.failed);
              },
              get summaryText() {
                return `${formatInt(mcp().failed)} errors`;
              },
              get color() {
                return props.theme().text.feedback.error.base;
              },
              get maxBars() {
                return Math.max(12, props.width - 36);
              },
              get theme() {
                return props.theme;
              }
            })];
          }
        }), _$createComponent2(SectionPanel, {
          title: "MCP CALLS OVER TIME",
          get subtitle() {
            return `per ${s().meta.bucketGranularity} \xB7 ${buckets().length} buckets`;
          },
          get theme() {
            return props.theme;
          },
          get children() {
            return [(() => {
              var _el$140 = _$createElement2("box");
              _$setProp2(_el$140, "flexDirection", "row");
              _$setProp2(_el$140, "flexWrap", "wrap");
              _$setProp2(_el$140, "columnGap", 2);
              _$setProp2(_el$140, "rowGap", 0);
              _$setProp2(_el$140, "marginBottom", 1);
              _$insert2(_el$140, _$createComponent2(For2, {
                get each() {
                  return topServers();
                },
                children: (srv, idx) => (() => {
                  var _el$159 = _$createElement2("box"), _el$160 = _$createElement2("text"), _el$162 = _$createElement2("text");
                  _$insertNode2(_el$159, _el$160);
                  _$insertNode2(_el$159, _el$162);
                  _$setProp2(_el$159, "flexDirection", "row");
                  _$setProp2(_el$159, "gap", 1);
                  _$insertNode2(_el$160, _$createTextNode2(`\u25A0`));
                  _$insert2(_el$162, srv);
                  _$effect2((_p$) => {
                    var _v$55 = palette()[idx() % palette().length], _v$56 = props.theme().text.base;
                    _v$55 !== _p$.e && (_p$.e = _$setProp2(_el$160, "fg", _v$55, _p$.e));
                    _v$56 !== _p$.t && (_p$.t = _$setProp2(_el$162, "fg", _v$56, _p$.t));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$159;
                })()
              }), null);
              _$insert2(_el$140, _$createComponent2(Show2, {
                get when() {
                  return mcp().servers.length > topServers().length;
                },
                get children() {
                  var _el$141 = _$createElement2("box"), _el$142 = _$createElement2("text"), _el$144 = _$createElement2("text"), _el$145 = _$createTextNode2(`other (`), _el$146 = _$createTextNode2(`)`);
                  _$insertNode2(_el$141, _el$142);
                  _$insertNode2(_el$141, _el$144);
                  _$setProp2(_el$141, "flexDirection", "row");
                  _$setProp2(_el$141, "gap", 1);
                  _$insertNode2(_el$142, _$createTextNode2(`\u25A0`));
                  _$insertNode2(_el$144, _el$145);
                  _$insertNode2(_el$144, _el$146);
                  _$insert2(_el$144, () => mcp().servers.length - topServers().length, _el$146);
                  _$effect2((_p$) => {
                    var _v$49 = otherColor(), _v$50 = props.theme().text.muted;
                    _v$49 !== _p$.e && (_p$.e = _$setProp2(_el$142, "fg", _v$49, _p$.e));
                    _v$50 !== _p$.t && (_p$.t = _$setProp2(_el$144, "fg", _v$50, _p$.t));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$141;
                }
              }), null);
              return _el$140;
            })(), _$createComponent2(TableRowLine, {
              get theme() {
                return props.theme;
              },
              get cells() {
                return [{
                  text: s().meta.bucketGranularity === "week" ? "week" : "date",
                  width: 6,
                  color: props.theme().text.muted
                }, {
                  text: "servers",
                  width: barWidth(),
                  color: props.theme().text.muted
                }, {
                  text: "calls",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "err%",
                  width: 6,
                  align: "right",
                  color: props.theme().text.muted
                }, ...props.width >= 72 ? [{
                  text: "top server",
                  width: 16,
                  color: props.theme().text.muted
                }] : []];
              }
            }), _$createComponent2(For2, {
              get each() {
                return [...buckets()].reverse().slice(0, 40);
              },
              children: (b) => {
                const topEntries = () => topServers().map((srv, idx) => ({
                  value: b.byServer[srv] ?? 0,
                  color: palette()[idx % palette().length]
                }));
                const sumTop = () => topEntries().reduce((acc, e) => acc + e.value, 0);
                const otherVal = () => Math.max(0, b.totalCalls - sumTop());
                const dominant = createMemo2(() => {
                  let bestName = "-";
                  let bestVal = 0;
                  for (const [k, v] of Object.entries(b.byServer)) {
                    if (v > bestVal) {
                      bestVal = v;
                      bestName = k;
                    }
                  }
                  return {
                    name: bestName,
                    pct: b.totalCalls > 0 ? bestVal / b.totalCalls * 100 : 0
                  };
                });
                const emptyCol = () => mixColor(props.theme().background.raised.base, props.theme().text.muted, 0.2);
                return (() => {
                  var _el$163 = _$createElement2("box"), _el$164 = _$createElement2("text"), _el$165 = _$createElement2("text"), _el$166 = _$createElement2("text");
                  _$insertNode2(_el$163, _el$164);
                  _$insertNode2(_el$163, _el$165);
                  _$insertNode2(_el$163, _el$166);
                  _$setProp2(_el$163, "flexDirection", "row");
                  _$setProp2(_el$163, "width", "100%");
                  _$setProp2(_el$163, "height", 1);
                  _$setProp2(_el$163, "gap", 1);
                  _$insert2(_el$164, () => b.label.padEnd(6));
                  _$insert2(_el$163, _$createComponent2(StackedBar, {
                    get total() {
                      return maxBucketCalls();
                    },
                    get width() {
                      return barWidth();
                    },
                    get emptyColor() {
                      return emptyCol();
                    },
                    get segments() {
                      return [...topEntries(), {
                        value: otherVal(),
                        color: otherColor()
                      }];
                    }
                  }), _el$165);
                  _$insert2(_el$165, () => compactNumber(b.totalCalls).padStart(7));
                  _$insert2(_el$166, () => formatPct(b.errorPct).padStart(6));
                  _$insert2(_el$163, _$createComponent2(Show2, {
                    get when() {
                      return props.width >= 72;
                    },
                    get children() {
                      var _el$167 = _$createElement2("text");
                      _$insert2(_el$167, (() => {
                        var _c$7 = _$memo2(() => dominant().pct > 0);
                        return () => _c$7() ? `${truncate(dominant().name, 11)} ${Math.round(dominant().pct)}%` : "-";
                      })());
                      _$effect2((_$p) => _$setProp2(_el$167, "fg", props.theme().text.muted, _$p));
                      return _el$167;
                    }
                  }), null);
                  _$effect2((_p$) => {
                    var _v$57 = props.theme().text.muted, _v$58 = props.theme().text.base, _v$59 = TextAttributes2.BOLD, _v$60 = b.errorPct >= 5 ? props.theme().text.feedback.error.base : props.theme().text.muted;
                    _v$57 !== _p$.e && (_p$.e = _$setProp2(_el$164, "fg", _v$57, _p$.e));
                    _v$58 !== _p$.t && (_p$.t = _$setProp2(_el$165, "fg", _v$58, _p$.t));
                    _v$59 !== _p$.a && (_p$.a = _$setProp2(_el$165, "attributes", _v$59, _p$.a));
                    _v$60 !== _p$.o && (_p$.o = _$setProp2(_el$166, "fg", _v$60, _p$.o));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined,
                    a: undefined,
                    o: undefined
                  });
                  return _el$163;
                })();
              }
            })];
          }
        }), _$createComponent2(SectionPanel, {
          title: "MCP SERVERS",
          get subtitle() {
            return `${mcp().servers.length} servers`;
          },
          get theme() {
            return props.theme;
          },
          get children() {
            return [_$createComponent2(TableRowLine, {
              get theme() {
                return props.theme;
              },
              get cells() {
                return [{
                  text: "server",
                  width: Math.max(14, props.width - 68),
                  color: props.theme().text.muted
                }, {
                  text: "tools",
                  width: 5,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "share",
                  width: 6,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "calls",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "err%",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "p50",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "p95",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: "avg",
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }];
              }
            }), _$createComponent2(For2, {
              get each() {
                return mcp().servers;
              },
              children: (srv, idx) => {
                const nameW = () => Math.max(14, props.width - 68);
                return _$createComponent2(TableRowLine, {
                  get theme() {
                    return props.theme;
                  },
                  get cells() {
                    return [{
                      text: srv.server,
                      width: nameW(),
                      color: palette()[idx() % palette().length],
                      bold: true
                    }, {
                      text: formatInt(srv.toolsCount),
                      width: 5,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: formatPct(srv.sharePct),
                      width: 6,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: compactNumber(srv.calls),
                      width: 7,
                      align: "right",
                      bold: true
                    }, {
                      text: formatPct(srv.errorPct),
                      width: 7,
                      align: "right",
                      color: srv.errorPct >= 5 ? props.theme().text.feedback.error.base : props.theme().text.muted
                    }, {
                      text: formatDurationMs(srv.p50Ms),
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: formatDurationMs(srv.p95Ms),
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }, {
                      text: formatDurationMs(srv.avgMs),
                      width: 7,
                      align: "right",
                      color: props.theme().text.muted
                    }];
                  }
                });
              }
            })];
          }
        }), _$createComponent2(SectionPanel, {
          title: "TOP MCP TOOLS",
          get subtitle() {
            return `${mcpTools().length} tools \xB7 ${formatInt(totalMcp())} calls`;
          },
          get theme() {
            return props.theme;
          },
          get children() {
            return _$createComponent2(For2, {
              get each() {
                return mcpTools().slice(0, 20);
              },
              children: (tool) => {
                const nameW = () => Math.max(18, props.width - 54);
                return (() => {
                  var _el$168 = _$createElement2("box"), _el$169 = _$createElement2("text"), _el$170 = _$createElement2("text"), _el$171 = _$createElement2("text"), _el$172 = _$createElement2("text"), _el$173 = _$createElement2("text"), _el$174 = _$createElement2("text");
                  _$insertNode2(_el$168, _el$169);
                  _$insertNode2(_el$168, _el$170);
                  _$insertNode2(_el$168, _el$171);
                  _$insertNode2(_el$168, _el$172);
                  _$insertNode2(_el$168, _el$173);
                  _$insertNode2(_el$168, _el$174);
                  _$setProp2(_el$168, "flexDirection", "row");
                  _$setProp2(_el$168, "width", "100%");
                  _$setProp2(_el$168, "height", 1);
                  _$setProp2(_el$168, "gap", 1);
                  _$insert2(_el$169, () => truncate(tool.name, nameW()).padEnd(nameW()));
                  _$insert2(_el$170, () => barBlocks(tool.calls / maxToolCalls(), 12));
                  _$insert2(_el$171, () => compactNumber(tool.calls).padStart(7));
                  _$insert2(_el$172, () => formatPct(tool.errorPct).padStart(6));
                  _$insert2(_el$173, () => formatDurationMs(tool.p50Ms).padStart(7));
                  _$insert2(_el$174, () => formatDurationMs(tool.p95Ms).padStart(7));
                  _$effect2((_p$) => {
                    var _v$61 = props.theme().hue?.accent?.[200] ?? props.theme().text.base, _v$62 = palette()[1], _v$63 = props.theme().text.base, _v$64 = tool.errorPct >= 5 ? props.theme().text.feedback.error.base : props.theme().text.muted, _v$65 = props.theme().text.muted, _v$66 = props.theme().text.muted;
                    _v$61 !== _p$.e && (_p$.e = _$setProp2(_el$169, "fg", _v$61, _p$.e));
                    _v$62 !== _p$.t && (_p$.t = _$setProp2(_el$170, "fg", _v$62, _p$.t));
                    _v$63 !== _p$.a && (_p$.a = _$setProp2(_el$171, "fg", _v$63, _p$.a));
                    _v$64 !== _p$.o && (_p$.o = _$setProp2(_el$172, "fg", _v$64, _p$.o));
                    _v$65 !== _p$.i && (_p$.i = _$setProp2(_el$173, "fg", _v$65, _p$.i));
                    _v$66 !== _p$.n && (_p$.n = _$setProp2(_el$174, "fg", _v$66, _p$.n));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined,
                    a: undefined,
                    o: undefined,
                    i: undefined,
                    n: undefined
                  });
                  return _el$168;
                })();
              }
            });
          }
        })];
      }
    }), null);
    return _el$131;
  })();
}
function ActivitySection(props) {
  const s = () => props.stats;
  const palette = createMemo2(() => getSeriesPalette(props.theme()));
  const wide = () => props.width >= 82;
  const maxHourSteps = createMemo2(() => Math.max(1, ...s().hourly.map((h) => h.steps)));
  const maxWeekdaySteps = createMemo2(() => Math.max(1, ...s().weekday.map((w) => w.steps)));
  const peakHour = createMemo2(() => {
    let best = s().hourly[0];
    for (const h of s().hourly)
      if (!best || h.steps > best.steps)
        best = h;
    return best;
  });
  return (() => {
    var _el$175 = _$createElement2("box"), _el$176 = _$createElement2("box"), _el$177 = _$createElement2("box"), _el$178 = _$createElement2("box");
    _$insertNode2(_el$175, _el$176);
    _$insertNode2(_el$175, _el$177);
    _$insertNode2(_el$175, _el$178);
    _$setProp2(_el$175, "flexDirection", "column");
    _$setProp2(_el$175, "width", "100%");
    _$setProp2(_el$175, "gap", 2);
    _$setProp2(_el$176, "width", "100%");
    _$setProp2(_el$176, "gap", 2);
    _$insert2(_el$176, _$createComponent2(SectionPanel, {
      title: "24-HOUR RHYTHM",
      get subtitle() {
        return _$memo2(() => !!peakHour())() ? `peak ${String(peakHour().hour).padStart(2, "0")}:00` : undefined;
      },
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "55%" : "100%";
      },
      get children() {
        return _$createComponent2(For2, {
          get each() {
            return Array.from({
              length: 12
            }, (_, i) => i);
          },
          children: (i) => {
            const am = () => s().hourly[i];
            const pm = () => s().hourly[i + 12];
            const bw = () => Math.max(4, Math.min(10, Math.floor((props.width - 54) / 4)));
            return (() => {
              var _el$179 = _$createElement2("box"), _el$180 = _$createElement2("box"), _el$181 = _$createElement2("text"), _el$182 = _$createElement2("text"), _el$183 = _$createElement2("text"), _el$184 = _$createElement2("box"), _el$185 = _$createElement2("text"), _el$186 = _$createElement2("text"), _el$187 = _$createElement2("text");
              _$insertNode2(_el$179, _el$180);
              _$insertNode2(_el$179, _el$184);
              _$setProp2(_el$179, "flexDirection", "row");
              _$setProp2(_el$179, "justifyContent", "space-between");
              _$setProp2(_el$179, "width", "100%");
              _$setProp2(_el$179, "height", 1);
              _$setProp2(_el$179, "gap", 1);
              _$insertNode2(_el$180, _el$181);
              _$insertNode2(_el$180, _el$182);
              _$insertNode2(_el$180, _el$183);
              _$setProp2(_el$180, "flexDirection", "row");
              _$setProp2(_el$180, "gap", 1);
              _$insert2(_el$181, () => String(am().hour).padStart(2, "0"));
              _$insert2(_el$182, () => barBlocks(am().steps / maxHourSteps(), bw()));
              _$insert2(_el$183, () => compactNumber(am().steps).padStart(5));
              _$insertNode2(_el$184, _el$185);
              _$insertNode2(_el$184, _el$186);
              _$insertNode2(_el$184, _el$187);
              _$setProp2(_el$184, "flexDirection", "row");
              _$setProp2(_el$184, "gap", 1);
              _$insert2(_el$185, () => String(pm().hour).padStart(2, "0"));
              _$insert2(_el$186, () => barBlocks(pm().steps / maxHourSteps(), bw()));
              _$insert2(_el$187, () => compactNumber(pm().steps).padStart(5));
              _$effect2((_p$) => {
                var _v$70 = props.theme().text.muted, _v$71 = palette()[0], _v$72 = props.theme().text.base, _v$73 = props.theme().text.muted, _v$74 = palette()[1], _v$75 = props.theme().text.base;
                _v$70 !== _p$.e && (_p$.e = _$setProp2(_el$181, "fg", _v$70, _p$.e));
                _v$71 !== _p$.t && (_p$.t = _$setProp2(_el$182, "fg", _v$71, _p$.t));
                _v$72 !== _p$.a && (_p$.a = _$setProp2(_el$183, "fg", _v$72, _p$.a));
                _v$73 !== _p$.o && (_p$.o = _$setProp2(_el$185, "fg", _v$73, _p$.o));
                _v$74 !== _p$.i && (_p$.i = _$setProp2(_el$186, "fg", _v$74, _p$.i));
                _v$75 !== _p$.n && (_p$.n = _$setProp2(_el$187, "fg", _v$75, _p$.n));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined,
                o: undefined,
                i: undefined,
                n: undefined
              });
              return _el$179;
            })();
          }
        });
      }
    }), null);
    _$insert2(_el$176, _$createComponent2(SectionPanel, {
      title: "DAY OF WEEK",
      subtitle: "steps \xB7 cost \xB7 PRs/appr",
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "45%" : "100%";
      },
      get children() {
        return _$createComponent2(For2, {
          get each() {
            return s().weekday;
          },
          children: (wd) => {
            const bw = () => Math.max(6, Math.min(14, (wide() ? Math.floor(props.width * 0.4) : props.width) - 34));
            return (() => {
              var _el$188 = _$createElement2("box"), _el$189 = _$createElement2("box"), _el$190 = _$createElement2("text"), _el$191 = _$createElement2("text"), _el$192 = _$createElement2("box"), _el$193 = _$createElement2("text");
              _$insertNode2(_el$188, _el$189);
              _$insertNode2(_el$188, _el$192);
              _$setProp2(_el$188, "flexDirection", "row");
              _$setProp2(_el$188, "justifyContent", "space-between");
              _$setProp2(_el$188, "width", "100%");
              _$setProp2(_el$188, "height", 1);
              _$setProp2(_el$188, "gap", 1);
              _$insertNode2(_el$189, _el$190);
              _$insertNode2(_el$189, _el$191);
              _$setProp2(_el$189, "flexDirection", "row");
              _$setProp2(_el$189, "gap", 1);
              _$insert2(_el$190, () => wd.label);
              _$insert2(_el$191, () => barBlocks(wd.steps / maxWeekdaySteps(), bw()));
              _$insertNode2(_el$192, _el$193);
              _$setProp2(_el$192, "flexDirection", "row");
              _$setProp2(_el$192, "gap", 1);
              _$insert2(_el$193, () => formatUsd(wd.cost).padStart(7));
              _$insert2(_el$192, _$createComponent2(Show2, {
                get when() {
                  return s().github.status === "ok";
                },
                get children() {
                  return [(() => {
                    var _el$194 = _$createElement2("text");
                    _$insert2(_el$194, () => `${wd.prsOpened}p`.padStart(4));
                    _$effect2((_$p) => _$setProp2(_el$194, "fg", props.theme().text.feedback.info.base, _$p));
                    return _el$194;
                  })(), (() => {
                    var _el$195 = _$createElement2("text");
                    _$insert2(_el$195, () => `${wd.approvals}a`.padStart(4));
                    _$effect2((_$p) => _$setProp2(_el$195, "fg", props.theme().text.feedback.success.base, _$p));
                    return _el$195;
                  })()];
                }
              }), null);
              _$effect2((_p$) => {
                var _v$76 = props.theme().text.muted, _v$77 = palette()[0], _v$78 = props.theme().text.base;
                _v$76 !== _p$.e && (_p$.e = _$setProp2(_el$190, "fg", _v$76, _p$.e));
                _v$77 !== _p$.t && (_p$.t = _$setProp2(_el$191, "fg", _v$77, _p$.t));
                _v$78 !== _p$.a && (_p$.a = _$setProp2(_el$193, "fg", _v$78, _p$.a));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined
              });
              return _el$188;
            })();
          }
        });
      }
    }), null);
    _$setProp2(_el$177, "width", "100%");
    _$setProp2(_el$177, "gap", 2);
    _$insert2(_el$177, _$createComponent2(SectionPanel, {
      title: "AGENTS",
      get subtitle() {
        return `${s().agents.length} agents`;
      },
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "50%" : "100%";
      },
      get children() {
        return _$createComponent2(For2, {
          get each() {
            return s().agents.slice(0, 8);
          },
          children: (ag, idx) => _$createComponent2(TableRowLine, {
            get theme() {
              return props.theme;
            },
            get cells() {
              return [{
                text: "\u25A0",
                width: 1,
                color: palette()[idx() % palette().length]
              }, {
                text: ag.agent,
                width: 12
              }, {
                text: formatPct(ag.sharePct),
                width: 6,
                align: "right",
                color: props.theme().text.muted
              }, {
                text: compactNumber(ag.steps),
                width: 7,
                align: "right"
              }, {
                text: formatUsd(ag.cost),
                width: 8,
                align: "right",
                bold: true
              }, {
                text: formatDurationMs(ag.avgStepMs),
                width: 7,
                align: "right",
                color: props.theme().text.muted
              }];
            }
          })
        });
      }
    }), null);
    _$insert2(_el$177, _$createComponent2(SectionPanel, {
      title: "EXECUTION & SUBAGENTS",
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "50%" : "100%";
      },
      get children() {
        return [_$createComponent2(KeyValueRow, {
          label: "avg steps / prompt",
          get value() {
            return formatRate(s().outcomes.avgStepsPerPrompt, 1);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "avg session duration",
          get value() {
            return formatDurationMs(s().outcomes.avgSessionDurationMs);
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "parents w/ subagents",
          get value() {
            return formatInt(s().outcomes.parentsWithSubagents);
          },
          get secondary() {
            return `avg ${formatRate(s().outcomes.avgSubagentsPerParent, 1)} sub/parent`;
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "tool success rate",
          get value() {
            return _$memo2(() => s().summary.tools.succeeded + s().summary.tools.failed > 0)() ? formatPct(s().summary.tools.succeeded / (s().summary.tools.succeeded + s().summary.tools.failed) * 100) : "-";
          },
          get secondary() {
            return `${formatInt(s().summary.tools.failed)} err \xB7 ${formatInt(s().summary.tools.unfinished)} unf`;
          },
          get theme() {
            return props.theme;
          }
        }), _$createComponent2(KeyValueRow, {
          label: "step finishes",
          get value() {
            return Object.entries(s().outcomes.finishes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k === "tool-calls" ? "tools" : k === "error" ? "err" : k}:${compactNumber(v)}`).join(" \xB7 ");
          },
          get theme() {
            return props.theme;
          }
        })];
      }
    }), null);
    _$setProp2(_el$178, "width", "100%");
    _$setProp2(_el$178, "gap", 2);
    _$insert2(_el$178, _$createComponent2(SectionPanel, {
      title: "TOP PROJECTS",
      get subtitle() {
        return `${s().projects.length} active`;
      },
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "45%" : "100%";
      },
      get children() {
        return _$createComponent2(For2, {
          get each() {
            return s().projects.slice(0, 10);
          },
          children: (p) => {
            const nameW = () => Math.max(12, (wide() ? Math.floor(props.width * 0.45) : props.width) - 28);
            return _$createComponent2(TableRowLine, {
              get theme() {
                return props.theme;
              },
              get cells() {
                return [{
                  text: p.name,
                  width: nameW()
                }, {
                  text: `${p.sessions}s`,
                  width: 5,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: compactNumber(p.tokens),
                  width: 7,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: formatUsd(p.cost),
                  width: 8,
                  align: "right",
                  bold: true
                }];
              }
            });
          }
        });
      }
    }), null);
    _$insert2(_el$178, _$createComponent2(SectionPanel, {
      title: "HEAVIEST SESSIONS",
      subtitle: "top by cost",
      get theme() {
        return props.theme;
      },
      flexGrow: 1,
      get width() {
        return wide() ? "55%" : "100%";
      },
      get children() {
        return _$createComponent2(For2, {
          get each() {
            return s().topSessions.slice(0, 10);
          },
          children: (sess) => {
            const titleW = () => Math.max(14, (wide() ? Math.floor(props.width * 0.55) : props.width) - 34);
            return _$createComponent2(TableRowLine, {
              get theme() {
                return props.theme;
              },
              get cells() {
                return [{
                  text: sess.title,
                  width: titleW()
                }, {
                  text: sess.projectName,
                  width: 10,
                  color: props.theme().text.muted
                }, {
                  text: `${sess.steps}st`,
                  width: 5,
                  align: "right",
                  color: props.theme().text.muted
                }, {
                  text: formatUsd(sess.cost),
                  width: 8,
                  align: "right",
                  bold: true
                }];
              }
            });
          }
        });
      }
    }), null);
    _$effect2((_p$) => {
      var _v$67 = wide() ? "row" : "column", _v$68 = wide() ? "row" : "column", _v$69 = wide() ? "row" : "column";
      _v$67 !== _p$.e && (_p$.e = _$setProp2(_el$176, "flexDirection", _v$67, _p$.e));
      _v$68 !== _p$.t && (_p$.t = _$setProp2(_el$177, "flexDirection", _v$68, _p$.t));
      _v$69 !== _p$.a && (_p$.a = _$setProp2(_el$178, "flexDirection", _v$69, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$175;
  })();
}

// src/ui/DeepStatsScreen.tsx
var TABS = [{
  id: "overview",
  key: "1",
  label: "Overview"
}, {
  id: "tokens",
  key: "2",
  label: "Tokens"
}, {
  id: "models",
  key: "3",
  label: "Models"
}, {
  id: "github",
  key: "4",
  label: "GitHub"
}, {
  id: "tools",
  key: "5",
  label: "Tools"
}, {
  id: "mcp",
  key: "6",
  label: "MCP"
}, {
  id: "activity",
  key: "7",
  label: "Activity"
}, {
  id: "all",
  key: "0",
  label: "All"
}];
var RANGES = ["7d", "30d", "90d", "ytd", "all"];
var HEATMAP_METRICS = ["steps", "tokens", "cost", "github"];
var CHART_METRICS = ["cost", "tokens", "steps"];
function DeepStatsScreen(props) {
  const dims = useTerminalDimensions();
  const theme = () => props.context.theme;
  const [tab, setTab] = createSignal(props.initialTab ?? "overview");
  const [range, setRange] = createSignal(props.initialRange ?? "30d");
  const [projectOnly, setProjectOnly] = createSignal(false);
  const [heatmapMetric, setHeatmapMetric] = createSignal("steps");
  const [chartMetric, setChartMetric] = createSignal("cost");
  const [includeVariants, setIncludeVariants] = createSignal(false);
  const [stats, setStats] = createSignal(undefined);
  const [error, setError] = createSignal(undefined);
  const [loading, setLoading] = createSignal(true);
  const [syncingGh, setSyncingGh] = createSignal(false);
  let scrollRef;
  let requestSeq = 0;
  const contentWidth = createMemo3(() => Math.max(24, Math.min(122, dims().width - 6)));
  const load = async (forceRefresh = false) => {
    const seq = ++requestSeq;
    const inputBase = {
      range: range(),
      projectOnly: projectOnly() && props.hasProjectScope,
      includeVariants: includeVariants(),
      refresh: forceRefresh
    };
    setError(undefined);
    if (!stats())
      setLoading(true);
    try {
      const fast = await props.fetchStats({
        ...inputBase,
        githubMode: "cache-only"
      });
      if (seq !== requestSeq)
        return;
      batch(() => {
        setStats(fast);
        setLoading(false);
      });
      if (forceRefresh || fast.github.status === "loading") {
        setSyncingGh(true);
        try {
          const full = await props.fetchStats({
            ...inputBase,
            githubMode: "sync"
          });
          if (seq !== requestSeq)
            return;
          setStats(full);
        } finally {
          if (seq === requestSeq)
            setSyncingGh(false);
        }
      }
    } catch (err) {
      if (seq !== requestSeq)
        return;
      batch(() => {
        setLoading(false);
        setSyncingGh(false);
        setError(err instanceof Error ? err.message : String(err));
      });
    }
  };
  createEffect(on([range, projectOnly, includeVariants], () => {
    load(false);
  }));
  onMount(() => {
    if (!props.subscribeUpdates)
      return;
    let timer;
    const unsub = props.subscribeUpdates(() => {
      if (stats()?.meta.historyStatus !== "partial")
        return;
      if (timer)
        clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        load(false);
      }, 400);
    });
    onCleanup(() => {
      if (timer)
        clearTimeout(timer);
      unsub();
    });
  });
  const cycleRange = (dir) => {
    const idx = RANGES.indexOf(range());
    const next = (idx + dir + RANGES.length) % RANGES.length;
    setRange(RANGES[next]);
    scrollRef?.scrollTo(0);
  };
  const cycleTab = (dir) => {
    const idx = TABS.findIndex((t) => t.id === tab());
    const next = (idx + dir + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    scrollRef?.scrollTo(0);
  };
  const selectTab = (nextTab) => {
    setTab(nextTab);
    scrollRef?.scrollTo(0);
  };
  const cycleHeatmap = () => {
    const idx = HEATMAP_METRICS.indexOf(heatmapMetric());
    setHeatmapMetric(HEATMAP_METRICS[(idx + 1) % HEATMAP_METRICS.length]);
  };
  const cycleChartMetric = () => {
    const idx = CHART_METRICS.indexOf(chartMetric());
    setChartMetric(CHART_METRICS[(idx + 1) % CHART_METRICS.length]);
  };
  props.context.keymap.layer(() => ({
    commands: [{
      bind: "escape,q",
      title: "Close deep stats",
      run: props.onClose
    }, {
      bind: "1",
      title: "Overview tab",
      run: () => selectTab("overview")
    }, {
      bind: "2",
      title: "Tokens tab",
      run: () => selectTab("tokens")
    }, {
      bind: "3",
      title: "Models tab",
      run: () => selectTab("models")
    }, {
      bind: "4",
      title: "GitHub tab",
      run: () => selectTab("github")
    }, {
      bind: "5",
      title: "Tools tab",
      run: () => selectTab("tools")
    }, {
      bind: "6",
      title: "MCP tab",
      run: () => selectTab("mcp")
    }, {
      bind: "7",
      title: "Activity tab",
      run: () => selectTab("activity")
    }, {
      bind: "0",
      title: "All sections tab",
      run: () => selectTab("all")
    }, {
      bind: "tab",
      title: "Next tab",
      run: () => cycleTab(1)
    }, {
      bind: "shift+tab",
      title: "Previous tab",
      run: () => cycleTab(-1)
    }, {
      bind: "[,left",
      title: "Shorter time range",
      run: () => cycleRange(-1)
    }, {
      bind: "],right,t",
      title: "Next time range",
      run: () => cycleRange(1)
    }, {
      bind: "p",
      title: "Toggle project scope",
      run: () => {
        if (props.hasProjectScope) {
          setProjectOnly((v) => !v);
          scrollRef?.scrollTo(0);
        }
      }
    }, {
      bind: "h",
      title: "Cycle heatmap metric",
      run: cycleHeatmap
    }, {
      bind: "m",
      title: "Cycle model chart metric",
      run: cycleChartMetric
    }, {
      bind: "v",
      title: "Toggle model variants",
      run: () => setIncludeVariants((v) => !v)
    }, {
      bind: "r",
      title: "Refresh stats",
      run: () => void load(true)
    }, {
      bind: "down,j",
      title: "Scroll down",
      run: () => scrollRef?.scrollBy(3, "step")
    }, {
      bind: "up,k",
      title: "Scroll up",
      run: () => scrollRef?.scrollBy(-3, "step")
    }, {
      bind: "pagedown,ctrl+d",
      title: "Page down",
      run: () => scrollRef?.scrollBy(0.5, "viewport")
    }, {
      bind: "pageup,ctrl+u",
      title: "Page up",
      run: () => scrollRef?.scrollBy(-0.5, "viewport")
    }, {
      bind: "home,g",
      title: "Scroll to top",
      run: () => scrollRef?.scrollTo(0)
    }, {
      bind: "end,shift+g",
      title: "Scroll to bottom",
      run: () => scrollRef?.scrollBy(1, "content")
    }]
  }));
  const statusText = () => {
    const cur = stats();
    if (syncingGh())
      return "syncing GitHub\u2026";
    if (cur?.meta.historyStatus === "partial") {
      const pct = cur.meta.totalHours > 0 ? Math.round(cur.meta.cachedHours / cur.meta.totalHours * 100) : 0;
      return `indexing history ${pct}%`;
    }
    return;
  };
  return (() => {
    var _el$ = _$createElement3("box"), _el$2 = _$createElement3("box"), _el$3 = _$createElement3("box"), _el$4 = _$createElement3("box"), _el$5 = _$createElement3("box"), _el$6 = _$createElement3("text"), _el$8 = _$createElement3("text"), _el$9 = _$createElement3("box"), _el$0 = _$createElement3("box"), _el$1 = _$createElement3("box"), _el$12 = _$createElement3("scrollbox"), _el$13 = _$createElement3("box"), _el$14 = _$createElement3("box"), _el$15 = _$createElement3("box"), _el$16 = _$createElement3("text");
    _$insertNode3(_el$, _el$2);
    _$insertNode3(_el$, _el$12);
    _$insertNode3(_el$, _el$14);
    _$setProp3(_el$, "width", "100%");
    _$setProp3(_el$, "height", "100%");
    _$setProp3(_el$, "flexDirection", "column");
    _$insertNode3(_el$2, _el$3);
    _$setProp3(_el$2, "flexDirection", "column");
    _$setProp3(_el$2, "alignItems", "center");
    _$setProp3(_el$2, "width", "100%");
    _$setProp3(_el$2, "paddingTop", 1);
    _$setProp3(_el$2, "flexShrink", 0);
    _$insertNode3(_el$3, _el$4);
    _$insertNode3(_el$3, _el$9);
    _$setProp3(_el$3, "flexDirection", "column");
    _$setProp3(_el$3, "gap", 1);
    _$insertNode3(_el$4, _el$5);
    _$insertNode3(_el$4, _el$8);
    _$setProp3(_el$4, "justifyContent", "space-between");
    _$setProp3(_el$4, "width", "100%");
    _$insertNode3(_el$5, _el$6);
    _$setProp3(_el$5, "flexDirection", "row");
    _$setProp3(_el$5, "gap", 2);
    _$insertNode3(_el$6, _$createTextNode3(`opencode / deep stats`));
    _$insert3(_el$5, _$createComponent3(Show3, {
      get when() {
        return statusText();
      },
      children: (st) => (() => {
        var _el$19 = _$createElement3("text"), _el$20 = _$createTextNode3(`\u25CF `);
        _$insertNode3(_el$19, _el$20);
        _$insert3(_el$19, st, null);
        _$effect3((_$p) => _$setProp3(_el$19, "fg", theme().text.feedback.info.base, _$p));
        return _el$19;
      })()
    }), null);
    _$insert3(_el$8, (() => {
      var _c$ = _$memo3(() => !!stats());
      return () => _c$() ? `${formatDateRange(stats().meta.from, stats().meta.to)} \xB7 ${stats().meta.projectLabel}` : `${rangeLabel(range())} \xB7 ${projectOnly() ? props.projectName ?? "project" : "all projects"}`;
    })());
    _$insertNode3(_el$9, _el$0);
    _$insertNode3(_el$9, _el$1);
    _$setProp3(_el$9, "justifyContent", "space-between");
    _$setProp3(_el$9, "width", "100%");
    _$setProp3(_el$9, "gap", 1);
    _$setProp3(_el$0, "flexDirection", "row");
    _$setProp3(_el$0, "flexWrap", "wrap");
    _$setProp3(_el$0, "gap", 1);
    _$setProp3(_el$0, "flexShrink", 0);
    _$insert3(_el$0, _$createComponent3(For3, {
      each: TABS,
      children: (item) => {
        const active = () => tab() === item.id;
        return (() => {
          var _el$21 = _$createElement3("box"), _el$22 = _$createElement3("text");
          _$insertNode3(_el$21, _el$22);
          _$setProp3(_el$21, "paddingLeft", 1);
          _$setProp3(_el$21, "paddingRight", 1);
          _$setProp3(_el$21, "flexShrink", 0);
          _$setProp3(_el$21, "onMouseUp", () => selectTab(item.id));
          _$setProp3(_el$22, "wrapMode", "none");
          _$setProp3(_el$22, "selectable", false);
          _$insert3(_el$22, () => `${item.key} ${item.label}`);
          _$effect3((_p$) => {
            var _v$13 = active() ? theme().background.raised.high : theme().background.raised.base, _v$14 = active() ? theme().hue?.interactive?.[200] ?? theme().text.base : theme().text.muted, _v$15 = active() ? TextAttributes3.BOLD : undefined;
            _v$13 !== _p$.e && (_p$.e = _$setProp3(_el$21, "backgroundColor", _v$13, _p$.e));
            _v$14 !== _p$.t && (_p$.t = _$setProp3(_el$22, "fg", _v$14, _p$.t));
            _v$15 !== _p$.a && (_p$.a = _$setProp3(_el$22, "attributes", _v$15, _p$.a));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined
          });
          return _el$21;
        })();
      }
    }));
    _$setProp3(_el$1, "flexDirection", "row");
    _$setProp3(_el$1, "gap", 1);
    _$setProp3(_el$1, "flexShrink", 0);
    _$insert3(_el$1, _$createComponent3(For3, {
      each: RANGES,
      children: (r) => {
        const active = () => range() === r;
        return (() => {
          var _el$23 = _$createElement3("box"), _el$24 = _$createElement3("text");
          _$insertNode3(_el$23, _el$24);
          _$setProp3(_el$23, "paddingLeft", 1);
          _$setProp3(_el$23, "paddingRight", 1);
          _$setProp3(_el$23, "flexShrink", 0);
          _$setProp3(_el$23, "onMouseUp", () => {
            setRange(r);
            scrollRef?.scrollTo(0);
          });
          _$setProp3(_el$24, "wrapMode", "none");
          _$setProp3(_el$24, "selectable", false);
          _$insert3(_el$24, () => rangeLabel(r));
          _$effect3((_p$) => {
            var _v$16 = active() ? theme().background.raised.high : theme().background.raised.base, _v$17 = active() ? theme().hue?.accent?.[200] ?? theme().text.base : theme().text.muted, _v$18 = active() ? TextAttributes3.BOLD : undefined;
            _v$16 !== _p$.e && (_p$.e = _$setProp3(_el$23, "backgroundColor", _v$16, _p$.e));
            _v$17 !== _p$.t && (_p$.t = _$setProp3(_el$24, "fg", _v$17, _p$.t));
            _v$18 !== _p$.a && (_p$.a = _$setProp3(_el$24, "attributes", _v$18, _p$.a));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined
          });
          return _el$23;
        })();
      }
    }), null);
    _$insert3(_el$1, _$createComponent3(Show3, {
      get when() {
        return props.hasProjectScope;
      },
      get children() {
        var _el$10 = _$createElement3("box"), _el$11 = _$createElement3("text");
        _$insertNode3(_el$10, _el$11);
        _$setProp3(_el$10, "paddingLeft", 1);
        _$setProp3(_el$10, "paddingRight", 1);
        _$setProp3(_el$10, "flexShrink", 0);
        _$setProp3(_el$10, "onMouseUp", () => setProjectOnly((v) => !v));
        _$setProp3(_el$11, "wrapMode", "none");
        _$setProp3(_el$11, "selectable", false);
        _$insert3(_el$11, () => projectOnly() ? "proj" : "all");
        _$effect3((_p$) => {
          var _v$ = projectOnly() ? theme().background.raised.high : theme().background.raised.base, _v$2 = projectOnly() ? theme().hue?.interactive?.[200] ?? theme().text.base : theme().text.muted, _v$3 = projectOnly() ? TextAttributes3.BOLD : undefined;
          _v$ !== _p$.e && (_p$.e = _$setProp3(_el$10, "backgroundColor", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp3(_el$11, "fg", _v$2, _p$.t));
          _v$3 !== _p$.a && (_p$.a = _$setProp3(_el$11, "attributes", _v$3, _p$.a));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$10;
      }
    }), null);
    _$insertNode3(_el$12, _el$13);
    _$use((el) => {
      scrollRef = el;
    }, _el$12);
    _$setProp3(_el$12, "flexGrow", 1);
    _$setProp3(_el$12, "minHeight", 0);
    _$setProp3(_el$12, "scrollX", false);
    _$setProp3(_el$12, "scrollY", true);
    _$setProp3(_el$12, "verticalScrollbarOptions", {
      visible: true
    });
    _$setProp3(_el$12, "horizontalScrollbarOptions", {
      visible: false
    });
    _$setProp3(_el$12, "contentOptions", {
      alignItems: "center",
      paddingTop: 1,
      paddingBottom: 2
    });
    _$setProp3(_el$13, "flexDirection", "column");
    _$setProp3(_el$13, "alignItems", "center");
    _$setProp3(_el$13, "gap", 2);
    _$insert3(_el$13, _$createComponent3(Show3, {
      get when() {
        return !error();
      },
      get fallback() {
        return (() => {
          var _el$25 = _$createElement3("text"), _el$26 = _$createTextNode3(`Could not load deep stats: `);
          _$insertNode3(_el$25, _el$26);
          _$insert3(_el$25, error, null);
          _$effect3((_$p) => _$setProp3(_el$25, "fg", theme().text.feedback.error.base, _$p));
          return _el$25;
        })();
      },
      get children() {
        return _$createComponent3(Show3, {
          get when() {
            return _$memo3(() => !!!loading())() && stats();
          },
          get fallback() {
            return (() => {
              var _el$27 = _$createElement3("text");
              _$insertNode3(_el$27, _$createTextNode3(`Gathering deep usage stats\u2026`));
              _$effect3((_$p) => _$setProp3(_el$27, "fg", theme().text.muted, _$p));
              return _el$27;
            })();
          },
          children: (data) => _$createComponent3(Switch, {
            get children() {
              return [_$createComponent3(Match, {
                get when() {
                  return tab() === "overview";
                },
                get children() {
                  return _$createComponent3(OverviewSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    get height() {
                      return dims().height;
                    },
                    get heatmapMetric() {
                      return heatmapMetric();
                    },
                    theme
                  });
                }
              }), _$createComponent3(Match, {
                get when() {
                  return tab() === "tokens";
                },
                get children() {
                  return _$createComponent3(TokensSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  });
                }
              }), _$createComponent3(Match, {
                get when() {
                  return tab() === "models";
                },
                get children() {
                  return _$createComponent3(ModelsSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    get chartMetric() {
                      return chartMetric();
                    },
                    get includeVariants() {
                      return includeVariants();
                    },
                    theme
                  });
                }
              }), _$createComponent3(Match, {
                get when() {
                  return tab() === "github";
                },
                get children() {
                  return _$createComponent3(GitHubSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  });
                }
              }), _$createComponent3(Match, {
                get when() {
                  return tab() === "tools";
                },
                get children() {
                  return _$createComponent3(ToolsSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  });
                }
              }), _$createComponent3(Match, {
                get when() {
                  return tab() === "mcp";
                },
                get children() {
                  return _$createComponent3(McpSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  });
                }
              }), _$createComponent3(Match, {
                get when() {
                  return tab() === "activity";
                },
                get children() {
                  return _$createComponent3(ActivitySection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  });
                }
              }), _$createComponent3(Match, {
                get when() {
                  return tab() === "all";
                },
                get children() {
                  var _el$29 = _$createElement3("box");
                  _$setProp3(_el$29, "flexDirection", "column");
                  _$setProp3(_el$29, "width", "100%");
                  _$setProp3(_el$29, "gap", 2);
                  _$insert3(_el$29, _$createComponent3(OverviewSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    get height() {
                      return dims().height;
                    },
                    get heatmapMetric() {
                      return heatmapMetric();
                    },
                    theme
                  }), null);
                  _$insert3(_el$29, _$createComponent3(TokensSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  }), null);
                  _$insert3(_el$29, _$createComponent3(ModelsSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    get chartMetric() {
                      return chartMetric();
                    },
                    get includeVariants() {
                      return includeVariants();
                    },
                    theme
                  }), null);
                  _$insert3(_el$29, _$createComponent3(GitHubSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  }), null);
                  _$insert3(_el$29, _$createComponent3(ToolsSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  }), null);
                  _$insert3(_el$29, _$createComponent3(McpSection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  }), null);
                  _$insert3(_el$29, _$createComponent3(ActivitySection, {
                    get stats() {
                      return data();
                    },
                    get width() {
                      return contentWidth();
                    },
                    theme
                  }), null);
                  return _el$29;
                }
              })];
            }
          })
        });
      }
    }));
    _$insertNode3(_el$14, _el$15);
    _$setProp3(_el$14, "flexDirection", "column");
    _$setProp3(_el$14, "alignItems", "center");
    _$setProp3(_el$14, "width", "100%");
    _$setProp3(_el$14, "flexShrink", 0);
    _$insertNode3(_el$15, _el$16);
    _$setProp3(_el$15, "flexDirection", "row");
    _$setProp3(_el$15, "justifyContent", "space-between");
    _$setProp3(_el$15, "height", 1);
    _$setProp3(_el$16, "wrapMode", "none");
    _$setProp3(_el$16, "selectable", false);
    _$insert3(_el$16, (() => {
      var _c$2 = _$memo3(() => contentWidth() >= 98);
      return () => _c$2() ? "1-7/0 view \xB7 [/]/t range \xB7 p scope \xB7 h heat \xB7 m metric \xB7 v var \xB7 r refresh \xB7 j/k scroll \xB7 esc back" : contentWidth() >= 66 ? "1-7/0 view \xB7 t range \xB7 p scope \xB7 r refresh \xB7 j/k \xB7 esc back" : "1-7/0 \xB7 t range \xB7 r \xB7 esc";
    })());
    _$insert3(_el$15, _$createComponent3(Show3, {
      get when() {
        return contentWidth() >= 64;
      },
      get children() {
        var _el$17 = _$createElement3("text");
        _$insertNode3(_el$17, _$createTextNode3(`opencode.ai`));
        _$setProp3(_el$17, "selectable", false);
        _$effect3((_$p) => _$setProp3(_el$17, "fg", theme().text.base, _$p));
        return _el$17;
      }
    }), null);
    _$effect3((_p$) => {
      var _v$4 = theme().background.base, _v$5 = contentWidth(), _v$6 = contentWidth() < 56 ? "column" : "row", _v$7 = theme().text.base, _v$8 = TextAttributes3.BOLD, _v$9 = theme().text.muted, _v$0 = contentWidth() < 118 ? "column" : "row", _v$1 = contentWidth(), _v$10 = theme().background.raised.base, _v$11 = contentWidth(), _v$12 = theme().text.muted;
      _v$4 !== _p$.e && (_p$.e = _$setProp3(_el$, "backgroundColor", _v$4, _p$.e));
      _v$5 !== _p$.t && (_p$.t = _$setProp3(_el$3, "width", _v$5, _p$.t));
      _v$6 !== _p$.a && (_p$.a = _$setProp3(_el$4, "flexDirection", _v$6, _p$.a));
      _v$7 !== _p$.o && (_p$.o = _$setProp3(_el$6, "fg", _v$7, _p$.o));
      _v$8 !== _p$.i && (_p$.i = _$setProp3(_el$6, "attributes", _v$8, _p$.i));
      _v$9 !== _p$.n && (_p$.n = _$setProp3(_el$8, "fg", _v$9, _p$.n));
      _v$0 !== _p$.s && (_p$.s = _$setProp3(_el$9, "flexDirection", _v$0, _p$.s));
      _v$1 !== _p$.h && (_p$.h = _$setProp3(_el$13, "width", _v$1, _p$.h));
      _v$10 !== _p$.r && (_p$.r = _$setProp3(_el$14, "backgroundColor", _v$10, _p$.r));
      _v$11 !== _p$.d && (_p$.d = _$setProp3(_el$15, "width", _v$11, _p$.d));
      _v$12 !== _p$.l && (_p$.l = _$setProp3(_el$16, "fg", _v$12, _p$.l));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined,
      h: undefined,
      r: undefined,
      d: undefined,
      l: undefined
    });
    return _el$;
  })();
}

// src/tui.tsx
var PLUGIN_ID = "opencode-deep-stats.tui";
var ROUTE_NAME = "deep-stats";
var fallbackAggregator;
function getFallbackAggregator() {
  if (!fallbackAggregator) {
    fallbackAggregator = new DeepStatsAggregator;
  }
  return fallbackAggregator;
}
function parseSlashArgs(input) {
  if (!input)
    return {};
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let tab;
  let range;
  for (const tok of tokens) {
    if (tok === "7d" || tok === "30d" || tok === "90d" || tok === "ytd" || tok === "all") {
      range = tok;
    } else if (tok === "overview" || tok === "tokens" || tok === "models" || tok === "github" || tok === "tools" || tok === "mcp" || tok === "activity") {
      tab = tok;
    } else if (tok === "pr" || tok === "prs") {
      tab = "github";
    } else if (tok === "hours") {
      tab = "activity";
    } else if (tok === "full") {
      tab = "all";
    }
  }
  return {
    tab,
    range
  };
}
var tui_default = Plugin.define({
  id: PLUGIN_ID,
  setup(context) {
    if (context.options?.enabled === false)
      return;
    const [previousRoute, setPreviousRoute] = createSignal2({
      ...context.ui.router.current()
    });
    const slashName = typeof context.options?.slashName === "string" && context.options.slashName.trim() ? context.options.slashName.trim() : "deep-stats";
    const aliases = Array.isArray(context.options?.aliases) ? context.options.aliases.filter((a) => typeof a === "string") : ["dstats", "stats+"];
    let cachedProjectId;
    let cachedProjectName;
    let resolvedLocation = false;
    const resolveProject = async () => {
      if (resolvedLocation) {
        return {
          projectID: cachedProjectId,
          projectName: cachedProjectName
        };
      }
      resolvedLocation = true;
      try {
        const loc = context.location ?? context.data.location.default();
        const info = await context.client.location.get({
          location: loc
        });
        if (info?.project?.id) {
          cachedProjectId = info.project.id;
          cachedProjectName = info.project.canonical.split("/").filter(Boolean).pop() || info.directory.split("/").filter(Boolean).pop() || info.project.id;
        }
      } catch {}
      return {
        projectID: cachedProjectId,
        projectName: cachedProjectName
      };
    };
    const rpc = context.client.rpc(DeepStatsRpc);
    let rpcAvailable;
    const fetchStats = async (input) => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const loc = context.location ?? context.data.location.default();
      const proj = await resolveProject();
      const projectID = input.projectOnly ? proj.projectID : undefined;
      if (rpcAvailable !== false) {
        try {
          const result = await rpc.getStats({
            range: input.range,
            projectID,
            projectDirectory: loc.directory,
            timezone,
            includeVariants: input.includeVariants,
            refresh: input.refresh ?? false,
            githubMode: input.githubMode
          });
          rpcAvailable = true;
          return result;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("404") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("unknown rpc")) {
            rpcAvailable = false;
          } else if (rpcAvailable === true) {
            throw err;
          } else {
            rpcAvailable = false;
          }
        }
      }
      return getFallbackAggregator().getStats({
        range: input.range,
        projectID,
        projectDirectory: loc.directory,
        timezone,
        includeVariants: input.includeVariants,
        refresh: input.refresh,
        githubMode: input.githubMode
      });
    };
    const subscribeUpdates = (onUpdate) => {
      if (rpcAvailable === false)
        return () => {};
      try {
        return rpc.events.on("updated", () => {
          onUpdate();
        });
      } catch {
        return () => {};
      }
    };
    const unregisterRoute = context.ui.router.register({
      name: ROUTE_NAME,
      render: ({
        data
      }) => {
        const loc = context.location ?? context.data.location.default();
        const fallbackProjName = loc.directory.split("/").filter(Boolean).pop() || "current";
        return _$createComponent4(DeepStatsScreen, {
          context,
          projectName: cachedProjectName ?? fallbackProjName,
          get hasProjectScope() {
            return Boolean(loc.directory && loc.directory !== "/");
          },
          fetchStats,
          subscribeUpdates,
          get initialTab() {
            return data?.tab ?? "overview";
          },
          get initialRange() {
            return data?.range ?? "30d";
          },
          onClose: () => context.ui.router.navigate(previousRoute())
        });
      }
    });
    const unregisterSlot = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          priority: 10,
          commands: [{
            id: "deep-stats.open",
            title: "Deep usage statistics",
            description: "Open deep analytics for tokens/models over time, tool latency, and GitHub PRs & approvals",
            group: "System",
            palette: true,
            suggested: true,
            slash: {
              name: slashName,
              aliases,
              arguments: true
            },
            run: (input) => {
              const current = context.ui.router.current();
              const parsed = parseSlashArgs(input);
              if (current.type === "plugin" && current.id === PLUGIN_ID && current.name === ROUTE_NAME) {
                return;
              }
              setPreviousRoute({
                ...current
              });
              context.ui.dialog.clear();
              context.ui.router.navigate({
                type: "plugin",
                name: ROUTE_NAME,
                data: parsed
              });
            }
          }]
        }));
        return null;
      }
    });
    return () => {
      const current = context.ui.router.current();
      if (current.type === "plugin" && current.id === PLUGIN_ID && current.name === ROUTE_NAME) {
        context.ui.router.navigate({
          type: "home"
        });
      }
      unregisterRoute();
      unregisterSlot();
    };
  }
});
export {
  tui_default as default
};
