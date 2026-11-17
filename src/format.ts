import { RGBA } from "@opentui/core";
import type { ActivityDay, HeatmapMetric, StatsRangeKey } from "./types.ts";

export function compactNumber(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 1000) return Math.round(value).toString();
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-US");
}

export function formatRate(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(Math.min(1, decimals));
  return value.toFixed(decimals);
}

export function formatUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0.00";
  if (cost >= 10_000) {
    return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(cost)}`;
  }
  if (cost >= 1000) return `$${cost.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(4)}`;
}

export function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return "0.0%";
  return `${pct.toFixed(1)}%`;
}

export function formatDurationMs(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(sec >= 10 ? 1 : 2)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  if (min < 60) return remSec > 0 ? `${min}m${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h${remMin}m` : `${hr}h`;
}

export function formatHours(hours?: number): string {
  if (hours === undefined || !Number.isFinite(hours) || hours < 0) return "-";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function abbreviatePath(p: string): string {
  const home = process.env.HOME;
  if (home && p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  return p;
}

export function truncate(str: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (str.length <= maxLen) return str;
  if (maxLen <= 1) return str.slice(0, maxLen);
  return str.slice(0, maxLen - 1) + "…";
}

export function mixColor(a: RGBA, b: RGBA, amount: number): RGBA {
  const t = Math.max(0, Math.min(1, amount));
  const r = a.r + (b.r - a.r) * t;
  const g = a.g + (b.g - a.g) * t;
  const bl = a.b + (b.b - a.b) * t;
  return RGBA.fromInts(Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255));
}

export function rangeLabel(range: StatsRangeKey): string {
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

export function formatDateRange(from: number, to: number): string {
  try {
    const start = new Date(from);
    const end = new Date(Math.max(from, to - 1));
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).formatRange(start, end);
  } catch {
    return `${new Date(from).toISOString().slice(0, 10)} – ${new Date(to).toISOString().slice(0, 10)}`;
  }
}

export function createDayFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
}

export function createHourFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    });
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "2-digit",
      hour12: false,
    });
  }
}

export function formatDayInTz(ms: number, fmt: Intl.DateTimeFormat): string {
  const parts = fmt.formatToParts(ms);
  let y = "1970";
  let m = "01";
  let d = "01";
  for (const p of parts) {
    if (p.type === "year") y = p.value;
    else if (p.type === "month") m = p.value;
    else if (p.type === "day") d = p.value;
  }
  return `${y}-${m}-${d}`;
}

export function formatHourInTz(ms: number, fmt: Intl.DateTimeFormat): number {
  const h = Number.parseInt(fmt.format(ms), 10);
  if (!Number.isFinite(h)) return 0;
  return h === 24 ? 0 : h % 24;
}

export function weekdayFromDayStr(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  // Convert JS Sun=0..Sat=6 to Mon=0..Sun=6
  return (dt.getUTCDay() + 6) % 7;
}

export function addDaysToDayStr(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const ms = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta);
  return new Date(ms).toISOString().slice(0, 10);
}

export function enumerateDays(fromDay: string, toDay: string): string[] {
  const result: string[] = [];
  let cur = fromDay;
  let guard = 0;
  while (cur <= toDay && guard < 4000) {
    result.push(cur);
    cur = addDaysToDayStr(cur, 1);
    guard += 1;
  }
  return result;
}

export function weekMondayOf(day: string): string {
  const wd = weekdayFromDayStr(day);
  return addDaysToDayStr(day, -wd);
}

export function computeRangeBounds(
  range: StatsRangeKey,
  nowMs: number,
  timezone: string,
  earliestDay?: string,
): { from: number; to: number; fromDay: string; toDay: string } {
  const dayFmt = createDayFormatter(timezone);
  const toDay = formatDayInTz(nowMs, dayFmt);
  let fromDay: string;
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
  // Wide buffer in UTC so timezone offsets are captured cleanly; day strings do exact local filtering.
  const from = Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1) - 14 * 3600_000;
  const to = nowMs + 1;
  return { from, to, fromDay, toDay };
}

export type ActivityCell = {
  date: string;
  value: number;
  level: number; // -1 = out of range, 0 = none, 1..4 = quartiles
};

export type ActivityGrid = {
  weeks: ActivityCell[][];
  months: Array<{ week: number; label: string; span: number }>;
  clipped: boolean;
};

export function selectHeatmapValue(day: ActivityDay, metric: HeatmapMetric): number {
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

export function buildActivityGrid(
  activity: ActivityDay[],
  fromDay: string,
  toDay: string,
  maxWeeks: number,
  metric: HeatmapMetric,
): ActivityGrid {
  const toUtcDayIndex = (dayStr: string) => {
    const [y, m, d] = dayStr.split("-").map(Number);
    return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
  };

  const startIdx = toUtcDayIndex(fromDay);
  const endIdx = toUtcDayIndex(toDay);
  const firstMondayIdx = startIdx - ((new Date(startIdx * 86_400_000).getUTCDay() + 6) % 7);
  const totalWeeks = endIdx < startIdx ? 0 : Math.floor((endIdx - firstMondayIdx) / 7) + 1;
  const shownWeeks = Math.min(totalWeeks, 53, Math.max(1, Math.floor(maxWeeks)));
  const gridStartMonday = firstMondayIdx + Math.max(0, totalWeeks - shownWeeks) * 7;

  const valueByDate = new Map<string, number>();
  for (const row of activity) {
    const v = selectHeatmapValue(row, metric);
    if (v > 0) valueByDate.set(row.date, v);
  }

  const nonZeroSorted = [...new Set(valueByDate.values())].sort((a, b) => a - b);

  const weeks: ActivityCell[][] = Array.from({ length: shownWeeks }, (_, weekIdx) =>
    Array.from({ length: 7 }, (_, dow) => {
      const idx = gridStartMonday + weekIdx * 7 + dow;
      const date = new Date(idx * 86_400_000).toISOString().slice(0, 10);
      if (idx < startIdx || idx > endIdx) {
        return { date, value: 0, level: -1 };
      }
      const value = valueByDate.get(date) ?? 0;
      if (value <= 0 || nonZeroSorted.length === 0) {
        return { date, value: 0, level: 0 };
      }
      const rank = nonZeroSorted.indexOf(value);
      const level = Math.max(1, Math.min(4, Math.ceil(((rank + 1) / nonZeroSorted.length) * 4)));
      return { date, value, level };
    }),
  );

  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const rawMonths = weeks
    .map((_, weekIdx) => {
      const midDay = Math.min(endIdx, Math.max(startIdx, gridStartMonday + weekIdx * 7 + 3));
      return {
        week: weekIdx,
        label: monthFmt.format(midDay * 86_400_000),
      };
    })
    .filter((m, idx, arr) => idx === 0 || m.label !== arr[idx - 1]!.label);

  const months = rawMonths.map((m, idx) => ({
    ...m,
    span: (rawMonths[idx + 1]?.week ?? shownWeeks) - m.week,
  }));

  return {
    weeks,
    months,
    clipped: shownWeeks < totalWeeks,
  };
}

export function sparkline(values: number[]): string {
  const glyphs = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  if (values.length === 0) return "";
  const max = Math.max(...values);
  if (max <= 0) return "▁".repeat(values.length);
  return values
    .map((v) => {
      if (v <= 0) return " ";
      const idx = Math.min(glyphs.length - 1, Math.max(0, Math.round((v / max) * (glyphs.length - 1))));
      return glyphs[idx]!;
    })
    .join("");
}

export function barBlocks(fraction: number, width: number): string {
  if (width <= 0) return "";
  const clamped = Math.max(0, Math.min(1, fraction));
  const full = Math.round(clamped * width);
  const empty = Math.max(0, width - full);
  return "█".repeat(full) + "░".repeat(empty);
}

export const PIXEL_FONT: Record<string, string[]> = {
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
  "$": ["010", "111", "110", "011", "111"],
  "/": ["001", "001", "010", "100", "100"],
  K: ["101", "110", "100", "110", "101"],
  M: ["10001", "11011", "10101", "10001", "10001"],
  B: ["110", "101", "110", "101", "110"],
  T: ["111", "010", "010", "010", "010"],
};

export function renderPixelLines(text: string, maxWidth: number): string[] | undefined {
  const chars = Array.from(text.toUpperCase()).map((ch) => PIXEL_FONT[ch]);
  if (chars.some((c) => !c)) return undefined;
  const glyphs = chars as string[][];
  const totalWidth = glyphs.reduce((sum, g) => sum + (g[0]?.length ?? 0) * 2 + 2, -2);
  if (totalWidth > maxWidth) return undefined;
  return [0, 1, 2, 3, 4].map((row) =>
    glyphs
      .map((g) => (g[row] ?? "").replaceAll("1", "██").replaceAll("0", "  "))
      .join("  "),
  );
}

export const OPENCODE_LOGO = {
  left: [
    "                   ",
    "█▀▀█ █▀▀█ █▀▀█ █▀▀▄",
    "█__█ █__█ █^^^ █__█",
    "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀",
  ],
  right: [
    "             ▄     ",
    "█▀▀▀ █▀▀█ █▀▀█ █▀▀█",
    "█___ █__█ █__█ █^^^",
    "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀",
  ],
};
