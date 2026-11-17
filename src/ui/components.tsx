/** @jsxImportSource @opentui/solid */
import { RGBA, TextAttributes } from "@opentui/core";
import type { ResolvedTheme } from "@opencode/theme/tui";
import { For, Show, createMemo, type Accessor, type JSX } from "solid-js";
import {
  OPENCODE_LOGO,
  buildActivityGrid,
  compactNumber,
  mixColor,
  renderPixelLines,
  sparkline,
  truncate,
} from "../format.ts";
import type { ActivityDay, HeatmapMetric } from "../types.ts";

export function getSeriesPalette(theme: ResolvedTheme): RGBA[] {
  const out: RGBA[] = [];
  for (const scale of theme.categorical ?? []) {
    const color = scale?.[200] ?? scale?.[300] ?? scale?.[100];
    if (color) out.push(color);
  }
  const fallbacks = [
    theme.hue?.interactive?.[200],
    theme.hue?.accent?.[200],
    theme.text.feedback.success.base,
    theme.text.feedback.info.base,
    theme.text.feedback.warning.base,
    theme.text.feedback.error.base,
  ];
  for (const fb of fallbacks) {
    if (fb && out.length < 6) out.push(fb);
  }
  if (out.length === 0) out.push(theme.text.base);
  return out;
}

function renderLogoLine(
  line: string,
  fg: RGBA,
  background: RGBA,
  bold: boolean,
): JSX.Element[] {
  const shadow = mixColor(background, fg, 0.25);
  const attrs = bold ? TextAttributes.BOLD : undefined;
  const elements: JSX.Element[] = [];
  let i = 0;

  while (i < line.length) {
    const rest = line.slice(i);
    const markerIdx = rest.search(/[_^~]/);
    if (markerIdx === -1) {
      elements.push(
        <text fg={fg} attributes={attrs} selectable={false}>
          {rest}
        </text>,
      );
      break;
    }
    if (markerIdx > 0) {
      elements.push(
        <text fg={fg} attributes={attrs} selectable={false}>
          {rest.slice(0, markerIdx)}
        </text>,
      );
    }
    const ch = rest[markerIdx];
    if (ch === "_") {
      elements.push(
        <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
          {" "}
        </text>,
      );
    } else if (ch === "^") {
      elements.push(
        <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
          ▀
        </text>,
      );
    } else {
      elements.push(
        <text fg={shadow} attributes={attrs} selectable={false}>
          ▀
        </text>,
      );
    }
    i += markerIdx + 1;
  }
  return elements;
}

export function OpenCodeLogo(props: { theme: () => ResolvedTheme; compact?: boolean }) {
  return (
    <box flexDirection="column" alignItems="center" flexShrink={0}>
      <For each={props.compact ? OPENCODE_LOGO.left.slice(1) : OPENCODE_LOGO.left}>
        {(leftLine, idx) => {
          const rightLine = () =>
            props.compact ? OPENCODE_LOGO.right[idx() + 1] ?? "" : OPENCODE_LOGO.right[idx()] ?? "";
          return (
            <box flexDirection="row" gap={1}>
              <box flexDirection="row">
                {renderLogoLine(leftLine, props.theme().text.muted, props.theme().background.base, false)}
              </box>
              <box flexDirection="row">
                {renderLogoLine(rightLine(), props.theme().text.base, props.theme().background.base, true)}
              </box>
            </box>
          );
        }}
      </For>
    </box>
  );
}

export function PixelHero(props: {
  valueText: string;
  label: string;
  maxWidth: number;
  theme: () => ResolvedTheme;
}) {
  const lines = createMemo(() => renderPixelLines(props.valueText, props.maxWidth));
  return (
    <box flexDirection="column" alignItems="center" gap={1}>
      <Show
        when={lines()}
        fallback={
          <text fg={props.theme().text.base} attributes={TextAttributes.BOLD}>
            {props.valueText}
          </text>
        }
      >
        {(pixelRows: Accessor<string[]>) => (
          <box flexDirection="column" alignItems="center">
            <For each={pixelRows()}>
              {(row) => (
                <text fg={props.theme().text.base} selectable={false}>
                  {row}
                </text>
              )}
            </For>
          </box>
        )}
      </Show>
      <text fg={props.theme().text.muted}>{props.label}</text>
    </box>
  );
}

export function HeatmapGrid(props: {
  activity: ActivityDay[];
  fromDay: string;
  toDay: string;
  metric: HeatmapMetric;
  maxWidth: number;
  theme: () => ResolvedTheme;
}) {
  const grid = createMemo(() =>
    buildActivityGrid(
      props.activity,
      props.fromDay,
      props.toDay,
      Math.max(4, Math.floor((props.maxWidth - 4) / 2)),
      props.metric,
    ),
  );

  const ramp = createMemo(() => {
    const t = props.theme();
    const base = t.background.base;
    const accent =
      props.metric === "github"
        ? t.text.feedback.success.base
        : props.metric === "cost"
          ? t.text.feedback.warning.base
          : props.metric === "tokens"
            ? t.hue?.interactive?.[200] ?? t.categorical?.[1]?.[200] ?? t.text.base
            : t.categorical?.[0]?.[200] ?? t.hue?.interactive?.[200] ?? t.text.base;
    return [t.text.muted, ...[0.3, 0.5, 0.75, 1].map((a) => mixColor(base, accent, a))];
  });

  const monthHeader = createMemo(() => {
    const months = grid().months;
    return (
      "    " +
      months
        .map((m) => (m.label.length <= m.span * 2 ? m.label : "").padEnd(m.span * 2))
        .join("")
    );
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

  return (
    <box flexDirection="column" alignItems="center">
      <text fg={props.theme().text.muted} selectable={false}>
        {monthHeader()}
      </text>
      <For each={["M", "T", "W", "T", "F", "S", "S"]}>
        {(dayLabel, rowIdx) => (
          <box flexDirection="row" height={1}>
            <text fg={props.theme().text.muted} selectable={false}>
              {dayLabel + "   "}
            </text>
            <For each={grid().weeks}>
              {(week) => {
                const cell = () => week[rowIdx()] ?? { level: -1, date: "", value: 0 };
                const glyph = () => (cell().level < 0 ? "  " : cell().level === 0 ? "· " : "■ ");
                const color = () => ramp()[Math.max(0, cell().level)] ?? props.theme().text.muted;
                return (
                  <text fg={color()} selectable={false}>
                    {glyph()}
                  </text>
                );
              }}
            </For>
          </box>
        )}
      </For>
      <box flexDirection="row" gap={2} marginTop={1}>
        <text fg={props.theme().text.muted} selectable={false}>
          {grid().clipped ? `last ${grid().weeks.length}w` : `${grid().weeks.length}w`} · {metricLabel()}
        </text>
        <box flexDirection="row" gap={0}>
          <text fg={props.theme().text.muted} selectable={false}>
            {"less "}
          </text>
          <For each={[0, 1, 2, 3, 4]}>
            {(lvl) => (
              <text fg={ramp()[lvl] ?? props.theme().text.muted} selectable={false}>
                {lvl === 0 ? "· " : "■ "}
              </text>
            )}
          </For>
          <text fg={props.theme().text.muted} selectable={false}>
            {"more"}
          </text>
        </box>
      </box>
    </box>
  );
}

export function SectionPanel(props: {
  title: string;
  subtitle?: string;
  theme: () => ResolvedTheme;
  width?: number | `${number}%`;
  flexGrow?: number;
  children: JSX.Element;
}) {
  return (
    <box
      flexDirection="column"
      backgroundColor={props.theme().background.raised.base}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      width={props.width}
      flexGrow={props.flexGrow}
      gap={1}
    >
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <text fg={props.theme().text.base} attributes={TextAttributes.BOLD}>
          {props.title}
        </text>
        <Show when={props.subtitle}>
          <text fg={props.theme().text.muted}>{props.subtitle}</text>
        </Show>
      </box>
      <box flexDirection="column" width="100%">
        {props.children}
      </box>
    </box>
  );
}

export function StatTile(props: {
  value: string;
  label: string;
  sublabel?: string;
  color?: RGBA;
  theme: () => ResolvedTheme;
}) {
  return (
    <box flexDirection="column" alignItems="center" minWidth={10}>
      <text fg={props.color ?? props.theme().text.base} attributes={TextAttributes.BOLD}>
        {props.value}
      </text>
      <text fg={props.theme().text.muted}>{props.label}</text>
      <Show when={props.sublabel}>
        <text fg={props.theme().text.muted}>{props.sublabel}</text>
      </Show>
    </box>
  );
}

export function KeyValueRow(props: {
  label: string;
  value: string;
  secondary?: string;
  valueColor?: RGBA;
  theme: () => ResolvedTheme;
}) {
  return (
    <box flexDirection="row" justifyContent="space-between" width="100%" height={1}>
      <text fg={props.theme().text.muted}>{props.label}</text>
      <box flexDirection="row" gap={1}>
        <Show when={props.secondary}>
          <text fg={props.theme().text.muted}>{props.secondary}</text>
        </Show>
        <text fg={props.valueColor ?? props.theme().text.base} attributes={TextAttributes.BOLD}>
          {props.value}
        </text>
      </box>
    </box>
  );
}

export function StackedBar(props: {
  segments: Array<{ value: number; color: RGBA }>;
  total: number;
  width: number;
  emptyColor: RGBA;
}) {
  const cells = createMemo(() => {
    const w = Math.max(1, Math.floor(props.width));
    if (props.total <= 0) {
      return [{ text: "░".repeat(w), color: props.emptyColor }];
    }
    const items = props.segments.filter((s) => s.value > 0);
    if (items.length === 0) {
      return [{ text: "░".repeat(w), color: props.emptyColor }];
    }
    let used = 0;
    const chunks: Array<{ text: string; color: RGBA }> = [];
    for (let i = 0; i < items.length; i += 1) {
      const seg = items[i]!;
      const raw = (seg.value / props.total) * w;
      let len = Math.round(raw);
      if (len === 0 && seg.value > 0 && used < w) len = 1;
      if (used + len > w) len = w - used;
      if (len > 0) {
        chunks.push({ text: "█".repeat(len), color: seg.color });
        used += len;
      }
    }
    if (used < w) {
      chunks.push({ text: "░".repeat(w - used), color: props.emptyColor });
    }
    return chunks;
  });

  return (
    <box flexDirection="row" height={1} flexShrink={0}>
      <For each={cells()}>
        {(chunk) => (
          <text fg={chunk.color} selectable={false}>
            {chunk.text}
          </text>
        )}
      </For>
    </box>
  );
}

export function SparkStrip(props: {
  label: string;
  values: number[];
  summaryText: string;
  color: RGBA;
  maxBars?: number;
  theme: () => ResolvedTheme;
}) {
  const line = createMemo(() => {
    const cap = Math.max(8, props.maxBars ?? 48);
    const vals = props.values;
    if (vals.length <= cap) return sparkline(vals);
    // Downsample evenly into `cap` buckets by sum/avg
    const out: number[] = [];
    for (let i = 0; i < cap; i += 1) {
      const start = Math.floor((i * vals.length) / cap);
      const end = Math.max(start + 1, Math.floor(((i + 1) * vals.length) / cap));
      let sum = 0;
      for (let j = start; j < end; j += 1) sum += vals[j] ?? 0;
      out.push(sum / (end - start));
    }
    return sparkline(out);
  });

  return (
    <box flexDirection="row" justifyContent="space-between" width="100%" height={1} gap={2}>
      <box flexDirection="row" gap={2}>
        <text fg={props.theme().text.muted}>{props.label.padEnd(11)}</text>
        <text fg={props.color} selectable={false}>
          {line()}
        </text>
      </box>
      <text fg={props.theme().text.base}>{props.summaryText}</text>
    </box>
  );
}

export function TableRowLine(props: {
  cells: Array<{ text: string; width?: number; align?: "left" | "right"; color?: RGBA; bold?: boolean }>;
  gap?: number;
  theme: () => ResolvedTheme;
}) {
  return (
    <box flexDirection="row" width="100%" height={1} gap={props.gap ?? 1}>
      <For each={props.cells}>
        {(cell) => {
          const formatted = () => {
            if (!cell.width) return cell.text;
            const t = truncate(cell.text, cell.width);
            return cell.align === "right" ? t.padStart(cell.width) : t.padEnd(cell.width);
          };
          return (
            <text
              fg={cell.color ?? props.theme().text.base}
              attributes={cell.bold ? TextAttributes.BOLD : undefined}
              selectable={false}
            >
              {formatted()}
            </text>
          );
        }}
      </For>
    </box>
  );
}

export function formatShortModel(key: string): string {
  const slash = key.indexOf("/");
  if (slash === -1) return key;
  const prov = key.slice(0, slash);
  const rest = key.slice(slash + 1);
  // Shorten ultra-long bedrock prefixes for compact legends while keeping clarity
  if (prov === "amazon-bedrock") {
    return rest.replace(/^(us|global)\.(anthropic|openai)\./, "");
  }
  return rest;
}

export function compactSigned(additions: number, deletions: number): string {
  return `+${compactNumber(additions)} / -${compactNumber(deletions)}`;
}
