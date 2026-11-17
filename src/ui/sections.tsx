/** @jsxImportSource @opentui/solid */
import { RGBA, TextAttributes } from "@opentui/core";
import type { ResolvedTheme } from "@opencode/theme/tui";
import { For, Show, createMemo } from "solid-js";
import {
  barBlocks,
  compactNumber,
  formatDurationMs,
  formatHours,
  formatInt,
  formatPct,
  formatRate,
  formatUsd,
  mixColor,
  truncate,
} from "../format.ts";
import type {
  ChartMetric,
  DeepStatsPayload,
  HeatmapMetric,
} from "../types.ts";
import {
  HeatmapGrid,
  KeyValueRow,
  OpenCodeLogo,
  PixelHero,
  SectionPanel,
  SparkStrip,
  StackedBar,
  StatTile,
  TableRowLine,
  compactSigned,
  formatShortModel,
  getSeriesPalette,
} from "./components.tsx";

export function OverviewSection(props: {
  stats: DeepStatsPayload;
  width: number;
  height: number;
  heatmapMetric: HeatmapMetric;
  theme: () => ResolvedTheme;
}) {
  const s = () => props.stats;
  const palette = createMemo(() => getSeriesPalette(props.theme()));
  const wide = () => props.width >= 82;
  const showLogo = () => props.height >= 28 && props.width >= 36;
  const fromDay = () => s().activity[0]?.date ?? new Date(s().meta.from).toISOString().slice(0, 10);
  const toDay = () =>
    s().activity[s().activity.length - 1]?.date ?? new Date(s().meta.to).toISOString().slice(0, 10);

  const heroTokens = () => compactNumber(s().summary.tokens.total);

  return (
    <box flexDirection="column" alignItems="center" width="100%" gap={2}>
      <Show when={showLogo()}>
        <OpenCodeLogo theme={props.theme} compact={props.width < 46} />
      </Show>

      <PixelHero
        valueText={heroTokens()}
        label={`TOKENS · ${formatUsd(s().summary.cost)} SPENT`}
        maxWidth={props.width}
        theme={props.theme}
      />

      <HeatmapGrid
        activity={s().activity}
        fromDay={fromDay()}
        toDay={toDay()}
        metric={props.heatmapMetric}
        maxWidth={props.width}
        theme={props.theme}
      />

      {/* Primary KPI Strip */}
      <box
        flexDirection="row"
        flexWrap="wrap"
        justifyContent="space-around"
        width="100%"
        gap={2}
      >
        <StatTile
          value={`${s().summary.bestStreak}d`}
          label="best streak"
          sublabel={s().summary.currentStreak > 0 ? `${s().summary.currentStreak}d current` : undefined}
          theme={props.theme}
        />
        <StatTile
          value={`${s().summary.activeDays}/${s().meta.daysCount}`}
          label="active days"
          theme={props.theme}
        />
        <StatTile
          value={compactNumber(s().summary.sessions)}
          label="sessions"
          sublabel={s().summary.subagents > 0 ? `+${compactNumber(s().summary.subagents)} sub` : undefined}
          theme={props.theme}
        />
        <StatTile
          value={formatUsd(s().summary.cost)}
          label="total cost"
          sublabel={`${formatUsd(s().summary.costPerDay)}/day`}
          color={palette()[2]}
          theme={props.theme}
        />
        <StatTile
          value={
            s().github.status === "ok"
              ? `${formatRate(s().github.avgPrsPerDay)}/d`
              : s().github.status === "loading"
                ? "…"
                : "-"
          }
          label="PRs opened"
          sublabel={
            s().github.status === "ok"
              ? `${s().github.openedTotal} (${formatRate(s().github.avgPrsPerWeekday)}/wkd)`
              : undefined
          }
          color={props.theme().text.feedback.info.base}
          theme={props.theme}
        />
        <StatTile
          value={
            s().github.status === "ok"
              ? `${formatRate(s().github.avgApprovalsPerDay)}/d`
              : s().github.status === "loading"
                ? "…"
                : "-"
          }
          label="PR approvals"
          sublabel={
            s().github.status === "ok"
              ? `${s().github.approvalsTotal} (${formatRate(s().github.avgApprovalsPerWeekday)}/wkd)`
              : undefined
          }
          color={props.theme().text.feedback.success.base}
          theme={props.theme}
        />
      </box>

      {/* Two-Column Summary Cards: Cost & Tokens + GitHub PR Velocity */}
      <box
        flexDirection={wide() ? "row" : "column"}
        width="100%"
        gap={2}
      >
        <SectionPanel
          title="COST & TOKENS"
          subtitle={`${formatPct(s().summary.cacheHitPct)} cached`}
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "50%" : "100%"}
        >
          <KeyValueRow
            label="cost"
            value={formatUsd(s().summary.cost)}
            secondary={`${formatUsd(s().summary.costPerActiveDay)}/act`}
            theme={props.theme}
          />
          <KeyValueRow label="input" value={compactNumber(s().summary.tokens.input)} theme={props.theme} />
          <KeyValueRow label="output" value={compactNumber(s().summary.tokens.output)} theme={props.theme} />
          <KeyValueRow label="reasoning" value={compactNumber(s().summary.tokens.reasoning)} theme={props.theme} />
          <KeyValueRow label="cache read" value={compactNumber(s().summary.tokens.cacheRead)} theme={props.theme} />
          <KeyValueRow label="cache write" value={compactNumber(s().summary.tokens.cacheWrite)} theme={props.theme} />
          <KeyValueRow
            label="prompts · steps"
            value={`${formatInt(s().summary.prompts)} · ${compactNumber(s().summary.steps)}`}
            secondary={`${formatRate(s().outcomes.avgStepsPerPrompt, 1)} st/p`}
            theme={props.theme}
          />
          <Show
            when={s().summary.codeDiff.files > 0 || s().summary.codeDiff.additions > 0 || s().summary.codeDiff.deletions > 0}
            fallback={
              <KeyValueRow
                label="tool reliability"
                value={
                  s().summary.tools.succeeded + s().summary.tools.failed > 0
                    ? formatPct(
                        (s().summary.tools.succeeded /
                          (s().summary.tools.succeeded + s().summary.tools.failed)) *
                          100,
                      )
                    : "-"
                }
                secondary={`${compactNumber(s().summary.tools.calls)} calls`}
                theme={props.theme}
              />
            }
          >
            <KeyValueRow
              label="code diff"
              value={compactSigned(s().summary.codeDiff.additions, s().summary.codeDiff.deletions)}
              secondary={`${formatInt(s().summary.codeDiff.files)} files`}
              theme={props.theme}
            />
          </Show>
        </SectionPanel>

        <SectionPanel
          title="GITHUB VELOCITY"
          subtitle={
            s().github.login
              ? `@${s().github.login}${s().github.repoFilter ? ` · ${s().github.repoFilter}` : ""}`
              : s().github.status
          }
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "50%" : "100%"}
        >
          <Show
            when={s().github.status === "ok"}
            fallback={
              <text fg={props.theme().text.muted}>
                {s().github.status === "loading"
                  ? "Fetching PRs & approvals via GitHub GraphQL…"
                  : s().github.message ?? "GitHub stats unavailable"}
              </text>
            }
          >
            <KeyValueRow
              label="opened PRs / day"
              value={`${formatRate(s().github.avgPrsPerDay)} / day`}
              secondary={`${formatRate(s().github.avgPrsPerWeekday)} / wkd`}
              valueColor={props.theme().text.feedback.info.base}
              theme={props.theme}
            />
            <KeyValueRow
              label="PR approvals / day"
              value={`${formatRate(s().github.avgApprovalsPerDay)} / day`}
              secondary={`${formatRate(s().github.avgApprovalsPerWeekday)} / wkd`}
              valueColor={props.theme().text.feedback.success.base}
              theme={props.theme}
            />
            <KeyValueRow
              label="opened total"
              value={formatInt(s().github.openedTotal)}
              secondary={`${s().github.mergedTotal} merged · ${s().github.openTotal} open`}
              theme={props.theme}
            />
            <KeyValueRow
              label="approvals total"
              value={formatInt(s().github.approvalsTotal)}
              secondary={`${s().github.uniquePrsApproved} PRs approved`}
              theme={props.theme}
            />
            <KeyValueRow
              label="reviews total"
              value={formatInt(s().github.reviewsTotal)}
              secondary={`${formatPct(s().github.approvalRatePct)} approval`}
              theme={props.theme}
            />
            <KeyValueRow
              label="merge rate · median"
              value={`${formatPct(s().github.mergeRatePct)} · ${formatHours(s().github.medianMergeHours)}`}
              theme={props.theme}
            />
            <KeyValueRow
              label="PR code diff"
              value={compactSigned(s().github.additions, s().github.deletions)}
              secondary={`avg ${compactNumber(s().github.avgPrSize)}/PR`}
              theme={props.theme}
            />
            <KeyValueRow
              label="cost per opened PR"
              value={s().github.efficiency.costPerPr !== undefined ? formatUsd(s().github.efficiency.costPerPr!) : "-"}
              secondary={
                s().github.efficiency.tokensPerPr !== undefined
                  ? `${compactNumber(s().github.efficiency.tokensPerPr!)} tok/PR`
                  : undefined
              }
              theme={props.theme}
            />
          </Show>
        </SectionPanel>
      </box>

      {/* Top Models & Top Tools Quick Snapshots */}
      <box flexDirection={wide() ? "row" : "column"} width="100%" gap={2}>
        <SectionPanel
          title="TOP MODELS"
          subtitle={`${s().models.length} active · [3] details`}
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "50%" : "100%"}
        >
          <Show when={s().models.length > 0} fallback={<text fg={props.theme().text.muted}>No model steps</text>}>
            <For each={s().models.slice(0, 5)}>
              {(m, idx) => {
                const nameW = () => Math.max(14, (wide() ? Math.floor(props.width / 2) : props.width) - 30);
                return (
                  <TableRowLine
                    theme={props.theme}
                    cells={[
                      { text: "■", color: palette()[idx() % palette().length] },
                      { text: formatShortModel(m.key), width: nameW(), color: props.theme().text.base },
                      { text: compactNumber(m.tokens.total), width: 7, align: "right", color: props.theme().text.muted },
                      { text: formatUsd(m.cost), width: 8, align: "right", bold: true },
                    ]}
                  />
                );
              }}
            </For>
          </Show>
        </SectionPanel>

        <SectionPanel
          title="TOP TOOLS"
          subtitle={`${compactNumber(s().summary.tools.calls)} calls · [5] details`}
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "50%" : "100%"}
        >
          <Show when={s().tools.length > 0} fallback={<text fg={props.theme().text.muted}>No tool calls</text>}>
            <For each={s().tools.slice(0, 5)}>
              {(tool) => {
                const nameW = () => Math.max(12, (wide() ? Math.floor(props.width / 2) : props.width) - 30);
                return (
                  <TableRowLine
                    theme={props.theme}
                    cells={[
                      {
                        text: tool.name,
                        width: nameW(),
                        color: tool.isMcp ? props.theme().hue?.accent?.[200] ?? props.theme().text.base : props.theme().text.base,
                      },
                      { text: compactNumber(tool.calls), width: 7, align: "right" },
                      {
                        text: formatPct(tool.errorPct),
                        width: 6,
                        align: "right",
                        color: tool.errorPct >= 5 ? props.theme().text.feedback.error.base : props.theme().text.muted,
                      },
                      { text: formatDurationMs(tool.p50Ms), width: 6, align: "right", color: props.theme().text.muted },
                    ]}
                  />
                );
              }}
            </For>
          </Show>
        </SectionPanel>
      </box>
    </box>
  );
}

export function TokensSection(props: {
  stats: DeepStatsPayload;
  width: number;
  theme: () => ResolvedTheme;
}) {
  const s = () => props.stats;
  const palette = createMemo(() => getSeriesPalette(props.theme()));
  const colCache = () => palette()[0] ?? props.theme().text.base;
  const colInput = () => palette()[1] ?? props.theme().text.base;
  const colOutput = () => palette()[2] ?? props.theme().text.base;
  const colReason = () => palette()[3] ?? props.theme().text.base;
  const colWrite = () => palette()[4] ?? props.theme().text.muted;

  const series = () => s().tokenSeries;
  const maxTokens = createMemo(() => Math.max(1, ...series().map((b) => b.total)));
  const maxCost = createMemo(() => Math.max(0.01, ...series().map((b) => b.cost)));

  const peakTok = createMemo(() => {
    let best = series()[0];
    for (const b of series()) if (!best || b.total > best.total) best = b;
    return best;
  });

  const peakCost = createMemo(() => {
    let best = series()[0];
    for (const b of series()) if (!best || b.cost > best.cost) best = b;
    return best;
  });

  const barWidth = () => Math.max(10, Math.min(44, props.width - 54));

  return (
    <box flexDirection="column" width="100%" gap={2}>
      {/* Token Composition & Cost Efficiency */}
      <SectionPanel
        title="TOKEN COMPOSITION & EFFICIENCY"
        subtitle={`${compactNumber(s().summary.tokens.total)} total · ${formatUsd(s().summary.cost)}`}
        theme={props.theme}
      >
        <StackedBar
          total={s().summary.tokens.total}
          width={Math.max(16, props.width - 8)}
          emptyColor={props.theme().background.raised.high}
          segments={[
            { value: s().summary.tokens.cacheRead, color: colCache() },
            { value: s().summary.tokens.input, color: colInput() },
            { value: s().summary.tokens.output, color: colOutput() },
            { value: s().summary.tokens.reasoning, color: colReason() },
            { value: s().summary.tokens.cacheWrite, color: colWrite() },
          ]}
        />
        <box flexDirection="row" flexWrap="wrap" gap={3} marginTop={1}>
          <box flexDirection="row" gap={1}>
            <text fg={colCache()}>■</text>
            <text fg={props.theme().text.base}>
              cache read {compactNumber(s().summary.tokens.cacheRead)} (
              {formatPct(
                s().summary.tokens.total > 0
                  ? (s().summary.tokens.cacheRead / s().summary.tokens.total) * 100
                  : 0,
              )}
              )
            </text>
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={colInput()}>■</text>
            <text fg={props.theme().text.base}>input {compactNumber(s().summary.tokens.input)}</text>
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={colOutput()}>■</text>
            <text fg={props.theme().text.base}>output {compactNumber(s().summary.tokens.output)}</text>
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={colReason()}>■</text>
            <text fg={props.theme().text.base}>reasoning {compactNumber(s().summary.tokens.reasoning)}</text>
          </box>
          <Show when={s().summary.tokens.cacheWrite > 0}>
            <box flexDirection="row" gap={1}>
              <text fg={colWrite()}>■</text>
              <text fg={props.theme().text.base}>cache write {compactNumber(s().summary.tokens.cacheWrite)}</text>
            </box>
          </Show>
        </box>

        <box flexDirection="row" flexWrap="wrap" justifyContent="space-between" gap={2} marginTop={1}>
          <StatTile value={compactNumber(s().summary.tokensPerDay)} label="tok / day" theme={props.theme} />
          <StatTile value={compactNumber(s().summary.tokensPerActiveDay)} label="tok / active day" theme={props.theme} />
          <StatTile value={formatPct(s().summary.cacheHitPct)} label="cache hit %" color={colCache()} theme={props.theme} />
          <StatTile
            value={
              s().summary.tokens.total > 0
                ? formatUsd((s().summary.cost / s().summary.tokens.total) * 1_000_000)
                : "$0"
            }
            label="blended / 1M"
            theme={props.theme}
          />
          <StatTile
            value={peakTok() ? `${peakTok()!.label} (${compactNumber(peakTok()!.total)})` : "-"}
            label="peak tokens"
            theme={props.theme}
          />
          <StatTile
            value={peakCost() ? `${peakCost()!.label} (${formatUsd(peakCost()!.cost)})` : "-"}
            label="peak spend"
            theme={props.theme}
          />
        </box>
      </SectionPanel>

      {/* Sparklines */}
      <SectionPanel
        title="TREND SPARKLINES"
        subtitle={`by ${s().meta.bucketGranularity}`}
        theme={props.theme}
      >
        <SparkStrip
          label="tokens"
          values={series().map((b) => b.total)}
          summaryText={`${compactNumber(s().summary.tokens.total)} total`}
          color={colInput()}
          maxBars={Math.max(12, props.width - 36)}
          theme={props.theme}
        />
        <SparkStrip
          label="cost ($)"
          values={series().map((b) => b.cost)}
          summaryText={`${formatUsd(s().summary.cost)} total`}
          color={colOutput()}
          maxBars={Math.max(12, props.width - 36)}
          theme={props.theme}
        />
        <SparkStrip
          label="out+reas"
          values={series().map((b) => b.output + b.reasoning)}
          summaryText={`${compactNumber(s().summary.tokens.output + s().summary.tokens.reasoning)} gen`}
          color={colReason()}
          maxBars={Math.max(12, props.width - 36)}
          theme={props.theme}
        />
      </SectionPanel>

      {/* Stacked Token Usage Over Time */}
      <SectionPanel
        title="TOKEN USAGE OVER TIME"
        subtitle={`per ${s().meta.bucketGranularity} · ${series().length} buckets`}
        theme={props.theme}
      >
        <TableRowLine
          theme={props.theme}
          cells={[
            { text: s().meta.bucketGranularity === "week" ? "week" : "date", width: 6, color: props.theme().text.muted },
            { text: "composition", width: barWidth(), color: props.theme().text.muted },
            { text: "total", width: 7, align: "right", color: props.theme().text.muted },
            { text: "in", width: 6, align: "right", color: props.theme().text.muted },
            { text: "out+r", width: 6, align: "right", color: props.theme().text.muted },
            { text: "cache", width: 6, align: "right", color: props.theme().text.muted },
            { text: "cost", width: 7, align: "right", color: props.theme().text.muted },
          ]}
        />
        <For each={[...series()].reverse().slice(0, 40)}>
          {(b) => {
            const emptyCol = () => mixColor(props.theme().background.raised.base, props.theme().text.muted, 0.2);
            return (
              <box flexDirection="row" width="100%" height={1} gap={1}>
                <text fg={props.theme().text.muted}>{b.label.padEnd(6)}</text>
                <StackedBar
                  total={maxTokens()}
                  width={barWidth()}
                  emptyColor={emptyCol()}
                  segments={[
                    { value: b.cacheRead, color: colCache() },
                    { value: b.input, color: colInput() },
                    { value: b.output, color: colOutput() },
                    { value: b.reasoning, color: colReason() },
                    { value: b.cacheWrite, color: colWrite() },
                  ]}
                />
                <text fg={props.theme().text.base} attributes={TextAttributes.BOLD}>
                  {compactNumber(b.total).padStart(7)}
                </text>
                <text fg={props.theme().text.muted}>{compactNumber(b.input).padStart(6)}</text>
                <text fg={props.theme().text.muted}>{compactNumber(b.output + b.reasoning).padStart(6)}</text>
                <text fg={colCache()}>{formatPct(b.cacheHitPct).padStart(6)}</text>
                <text fg={props.theme().text.base}>{formatUsd(b.cost).padStart(7)}</text>
              </box>
            );
          }}
        </For>
      </SectionPanel>
    </box>
  );
}

export function ModelsSection(props: {
  stats: DeepStatsPayload;
  width: number;
  chartMetric: ChartMetric;
  includeVariants: boolean;
  theme: () => ResolvedTheme;
}) {
  const s = () => props.stats;
  const palette = createMemo(() => getSeriesPalette(props.theme()));
  const topModels = () => s().modelSeries.topModels;
  const buckets = () => s().modelSeries.buckets;

  const bucketValue = (b: DeepStatsPayload["modelSeries"]["buckets"][number]) => {
    if (props.chartMetric === "cost") return b.totalCost;
    if (props.chartMetric === "tokens") return b.totalTokens;
    return b.totalSteps;
  };

  const modelValue = (entry: { cost: number; tokens: number; steps: number } | undefined) => {
    if (!entry) return 0;
    if (props.chartMetric === "cost") return entry.cost;
    if (props.chartMetric === "tokens") return entry.tokens;
    return entry.steps;
  };

  const maxBucketVal = createMemo(() => Math.max(0.0001, ...buckets().map(bucketValue)));
  const totalModelsCost = createMemo(() => Math.max(0.0001, s().summary.cost));
  const barWidth = () => Math.max(10, Math.min(48, props.width - 40));

  const formatMetricVal = (v: number) => {
    if (props.chartMetric === "cost") return formatUsd(v);
    return compactNumber(v);
  };

  const otherColor = () => props.theme().text.muted;

  return (
    <box flexDirection="column" width="100%" gap={2}>
      {/* Model Usage Over Time Stacked Timeline */}
      <SectionPanel
        title="MODEL USAGE OVER TIME"
        subtitle={`metric: ${props.chartMetric} ([m] switch) · per ${s().meta.bucketGranularity}`}
        theme={props.theme}
      >
        <box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={0} marginBottom={1}>
          <For each={topModels()}>
            {(modelKey, idx) => (
              <box flexDirection="row" gap={1}>
                <text fg={palette()[idx() % palette().length]}>■</text>
                <text fg={props.theme().text.base}>{formatShortModel(modelKey)}</text>
              </box>
            )}
          </For>
          <Show when={s().models.length > topModels().length}>
            <box flexDirection="row" gap={1}>
              <text fg={otherColor()}>■</text>
              <text fg={props.theme().text.muted}>other ({s().models.length - topModels().length})</text>
            </box>
          </Show>
        </box>

        <For each={[...buckets()].reverse().slice(0, 40)}>
          {(b) => {
            const totalVal = () => bucketValue(b);
            const topEntries = () => topModels().map((m, idx) => ({
              value: modelValue(b.byModel[m]),
              color: palette()[idx % palette().length]!,
            }));
            const topSum = () => topEntries().reduce((acc, e) => acc + e.value, 0);
            const otherVal = () => Math.max(0, totalVal() - topSum());

            const dominant = createMemo(() => {
              let bestName = "-";
              let bestVal = 0;
              for (const [k, v] of Object.entries(b.byModel)) {
                const mv = modelValue(v);
                if (mv > bestVal) {
                  bestVal = mv;
                  bestName = formatShortModel(k);
                }
              }
              return { name: bestName, pct: totalVal() > 0 ? (bestVal / totalVal()) * 100 : 0 };
            });

            const emptyCol = () => mixColor(props.theme().background.raised.base, props.theme().text.muted, 0.2);

            return (
              <box flexDirection="row" width="100%" height={1} gap={1}>
                <text fg={props.theme().text.muted}>{b.label.padEnd(6)}</text>
                <StackedBar
                  total={maxBucketVal()}
                  width={barWidth()}
                  emptyColor={emptyCol()}
                  segments={[...topEntries(), { value: otherVal(), color: otherColor() }]}
                />
                <text fg={props.theme().text.base} attributes={TextAttributes.BOLD}>
                  {formatMetricVal(totalVal()).padStart(8)}
                </text>
                <Show when={props.width >= 68}>
                  <text fg={props.theme().text.muted}>
                    {dominant().pct > 0 ? `${truncate(dominant().name, 16)} ${Math.round(dominant().pct)}%` : "-"}
                  </text>
                </Show>
              </box>
            );
          }}
        </For>
      </SectionPanel>

      {/* Full Model Performance & Cost Table */}
      <SectionPanel
        title="MODEL LEADERBOARD & LATENCY"
        subtitle={`${props.includeVariants ? "split by #variant" : "grouped"} ([v] toggle)`}
        theme={props.theme}
      >
        <Show when={s().models.length > 0} fallback={<text fg={props.theme().text.muted}>No model usage</text>}>
          <Show
            when={props.width >= 82}
            fallback={
              <For each={s().models}>
                {(m, idx) => (
                  <box flexDirection="column" marginBottom={1}>
                    <box flexDirection="row" gap={1}>
                      <text fg={palette()[idx() % palette().length]}>■</text>
                      <text fg={props.theme().text.base} attributes={TextAttributes.BOLD}>
                        {truncate(m.key, props.width - 8)}
                      </text>
                    </box>
                    <text fg={props.theme().text.muted}>
                      {"  "}
                      {compactNumber(m.tokens.total)} tok · {formatInt(m.steps)} steps · {formatUsd(m.cost)} ·{" "}
                      {formatPct(m.cacheHitPct)} cache · ttft {formatDurationMs(m.ttftP50Ms)} ·{" "}
                      {m.tpsAvg ? `${formatRate(m.tpsAvg, 1)} t/s` : "-"}
                    </text>
                  </box>
                )}
              </For>
            }
          >
            <TableRowLine
              theme={props.theme}
              cells={[
                { text: " ", width: 1 },
                { text: "model", width: Math.max(22, props.width - 70), color: props.theme().text.muted },
                { text: "share", width: 6, align: "right", color: props.theme().text.muted },
                { text: "tokens", width: 8, align: "right", color: props.theme().text.muted },
                { text: "steps", width: 7, align: "right", color: props.theme().text.muted },
                { text: "cost", width: 8, align: "right", color: props.theme().text.muted },
                { text: "cache", width: 6, align: "right", color: props.theme().text.muted },
                { text: "ttft", width: 7, align: "right", color: props.theme().text.muted },
                { text: "tok/s", width: 7, align: "right", color: props.theme().text.muted },
              ]}
            />
            <For each={s().models}>
              {(m, idx) => {
                const nameW = () => Math.max(22, props.width - 70);
                const share = () => (m.cost / totalModelsCost()) * 100;
                return (
                  <TableRowLine
                    theme={props.theme}
                    cells={[
                      { text: "■", width: 1, color: palette()[idx() % palette().length] },
                      { text: m.key, width: nameW() },
                      { text: formatPct(share()), width: 6, align: "right", color: props.theme().text.muted },
                      { text: compactNumber(m.tokens.total), width: 8, align: "right" },
                      { text: compactNumber(m.steps), width: 7, align: "right", color: props.theme().text.muted },
                      { text: formatUsd(m.cost), width: 8, align: "right", bold: true },
                      { text: formatPct(m.cacheHitPct), width: 6, align: "right", color: props.theme().text.muted },
                      { text: formatDurationMs(m.ttftP50Ms), width: 7, align: "right", color: props.theme().text.muted },
                      {
                        text: m.tpsAvg ? `${formatRate(m.tpsAvg, 1)}` : "-",
                        width: 7,
                        align: "right",
                        color: palette()[2],
                      },
                    ]}
                  />
                );
              }}
            </For>
          </Show>
        </Show>
      </SectionPanel>
    </box>
  );
}

export function GitHubSection(props: {
  stats: DeepStatsPayload;
  width: number;
  theme: () => ResolvedTheme;
}) {
  const s = () => props.stats;
  const gh = () => s().github;
  const colOpen = () => props.theme().text.feedback.info.base;
  const colAppr = () => props.theme().text.feedback.success.base;
  const colWarn = () => props.theme().text.feedback.warning.base;

  const maxActivity = createMemo(() =>
    Math.max(1, ...gh().series.map((b) => Math.max(b.opened, b.approvals))),
  );
  const halfBarW = () => Math.max(6, Math.min(20, Math.floor((props.width - 42) / 2)));
  const wide = () => props.width >= 82;

  return (
    <box flexDirection="column" width="100%" gap={2}>
      <Show
        when={gh().status === "ok"}
        fallback={
          <SectionPanel title="GITHUB PRs & APPROVALS" subtitle={gh().status} theme={props.theme}>
            <text fg={props.theme().text.muted}>
              {gh().status === "loading"
                ? "Fetching GitHub authored PRs & review approvals via GraphQL…"
                : gh().message ?? "GitHub CLI not available or not authenticated (`gh auth login`)."}
            </text>
          </SectionPanel>
        }
      >
        {/* KPI Strip */}
        <SectionPanel
          title="GITHUB PR & APPROVAL VELOCITY"
          subtitle={`@${gh().login ?? ""}${gh().repoFilter ? ` · ${gh().repoFilter}` : " · all repos"}`}
          theme={props.theme}
        >
          <box flexDirection="row" flexWrap="wrap" justifyContent="space-around" gap={2}>
            <StatTile
              value={formatRate(gh().avgPrsPerDay)}
              label="opened PRs / day"
              sublabel={`${formatRate(gh().avgPrsPerWeekday)} / weekday`}
              color={colOpen()}
              theme={props.theme}
            />
            <StatTile
              value={formatRate(gh().avgApprovalsPerDay)}
              label="approvals / day"
              sublabel={`${formatRate(gh().avgApprovalsPerWeekday)} / weekday`}
              color={colAppr()}
              theme={props.theme}
            />
            <StatTile
              value={formatInt(gh().openedTotal)}
              label="PRs opened"
              sublabel={`${gh().mergedTotal}m · ${gh().openTotal}o · ${gh().closedTotal}c`}
              theme={props.theme}
            />
            <StatTile
              value={formatInt(gh().approvalsTotal)}
              label="approvals"
              sublabel={`${gh().uniquePrsApproved} unique PRs`}
              theme={props.theme}
            />
            <StatTile
              value={formatPct(gh().mergeRatePct)}
              label="merge rate"
              sublabel={`med ${formatHours(gh().medianMergeHours)}`}
              theme={props.theme}
            />
            <StatTile
              value={formatPct(gh().approvalRatePct)}
              label="approval rate"
              sublabel={`${gh().changesRequestedTotal} chg · ${gh().commentsTotal} cmt`}
              theme={props.theme}
            />
          </box>

          <box flexDirection={wide() ? "row" : "column"} gap={2} marginTop={1}>
            <box flexGrow={1}>
              <KeyValueRow
                label="avg PRs / active PR day"
                value={formatRate(gh().avgPrsPerActivePrDay)}
                theme={props.theme}
              />
              <KeyValueRow
                label="total PR diff"
                value={compactSigned(gh().additions, gh().deletions)}
                secondary={`avg ${compactNumber(gh().avgPrSize)} lines`}
                theme={props.theme}
              />
            </box>
            <box flexGrow={1}>
              <KeyValueRow
                label="AI spend / opened PR"
                value={gh().efficiency.costPerPr !== undefined ? formatUsd(gh().efficiency.costPerPr!) : "-"}
                secondary={
                  gh().efficiency.promptsPerPr !== undefined
                    ? `${formatRate(gh().efficiency.promptsPerPr!, 1)} prompts/PR`
                    : undefined
                }
                theme={props.theme}
              />
              <KeyValueRow
                label="AI tokens / opened PR"
                value={
                  gh().efficiency.tokensPerPr !== undefined ? compactNumber(gh().efficiency.tokensPerPr!) : "-"
                }
                secondary={
                  gh().efficiency.sessionsPerPr !== undefined
                    ? `${formatRate(gh().efficiency.sessionsPerPr!, 1)} sess/PR`
                    : undefined
                }
                theme={props.theme}
              />
            </box>
          </box>
        </SectionPanel>

        {/* PRs Opened vs Approvals Over Time */}
        <SectionPanel
          title="PRs OPENED VS APPROVALS OVER TIME"
          subtitle={`per ${s().meta.bucketGranularity} · ■ opened  ■ approved`}
          theme={props.theme}
        >
          <For each={[...gh().series].reverse().slice(0, 40)}>
            {(b) => {
              const emptyCol = () => mixColor(props.theme().background.raised.base, props.theme().text.muted, 0.2);
              return (
                <box flexDirection="row" width="100%" height={1} gap={1}>
                  <text fg={props.theme().text.muted}>{b.label.padEnd(6)}</text>
                  <StackedBar
                    total={maxActivity()}
                    width={halfBarW()}
                    emptyColor={emptyCol()}
                    segments={[{ value: b.opened, color: colOpen() }]}
                  />
                  <text fg={colOpen()} attributes={TextAttributes.BOLD}>
                    {String(b.opened).padStart(3)}
                  </text>
                  <text fg={props.theme().text.muted}>│</text>
                  <StackedBar
                    total={maxActivity()}
                    width={halfBarW()}
                    emptyColor={emptyCol()}
                    segments={[{ value: b.approvals, color: colAppr() }]}
                  />
                  <text fg={colAppr()} attributes={TextAttributes.BOLD}>
                    {String(b.approvals).padStart(3)}
                  </text>
                  <Show when={props.width >= 68}>
                    <text fg={props.theme().text.muted}>
                      {b.changesRequested > 0 || b.comments > 0
                        ? `(${b.changesRequested}Δ ${b.comments}c)`
                        : ""}
                    </text>
                  </Show>
                </box>
              );
            }}
          </For>
        </SectionPanel>

        {/* Top Repositories */}
        <SectionPanel title="TOP REPOSITORIES" subtitle={`${gh().repos.length} repos`} theme={props.theme}>
          <Show when={gh().repos.length > 0} fallback={<text fg={props.theme().text.muted}>No repository activity</text>}>
            <TableRowLine
              theme={props.theme}
              cells={[
                { text: "repository", width: Math.max(18, props.width - 54), color: props.theme().text.muted },
                { text: "opened", width: 7, align: "right", color: props.theme().text.muted },
                { text: "merged", width: 7, align: "right", color: props.theme().text.muted },
                { text: "appr", width: 6, align: "right", color: props.theme().text.muted },
                { text: "revs", width: 6, align: "right", color: props.theme().text.muted },
                { text: "diff", width: 14, align: "right", color: props.theme().text.muted },
              ]}
            />
            <For each={gh().repos.slice(0, 12)}>
              {(r) => (
                <TableRowLine
                  theme={props.theme}
                  cells={[
                    { text: r.repo, width: Math.max(18, props.width - 54) },
                    { text: formatInt(r.opened), width: 7, align: "right", color: colOpen(), bold: true },
                    { text: formatInt(r.merged), width: 7, align: "right", color: props.theme().text.muted },
                    { text: formatInt(r.approvals), width: 6, align: "right", color: colAppr(), bold: true },
                    { text: formatInt(r.reviews), width: 6, align: "right", color: props.theme().text.muted },
                    {
                      text: r.opened > 0 ? compactSigned(r.additions, r.deletions) : "-",
                      width: 14,
                      align: "right",
                      color: props.theme().text.muted,
                    },
                  ]}
                />
              )}
            </For>
          </Show>
        </SectionPanel>

        {/* Recent Opened & Reviewed */}
        <box flexDirection={wide() ? "row" : "column"} width="100%" gap={2}>
          <SectionPanel
            title="RECENT OPENED PRs"
            theme={props.theme}
            flexGrow={1}
            width={wide() ? "50%" : "100%"}
          >
            <Show when={gh().recentOpened.length > 0} fallback={<text fg={props.theme().text.muted}>None in range</text>}>
              <For each={gh().recentOpened.slice(0, 8)}>
                {(pr) => {
                  const stColor = () =>
                    pr.state === "MERGED"
                      ? props.theme().hue?.accent?.[200] ?? colAppr()
                      : pr.state === "OPEN"
                        ? colAppr()
                        : props.theme().text.muted;
                  const titleW = () => Math.max(14, (wide() ? Math.floor(props.width / 2) : props.width) - 24);
                  return (
                    <TableRowLine
                      theme={props.theme}
                      cells={[
                        { text: pr.state.slice(0, 4), width: 4, color: stColor(), bold: true },
                        { text: `#${pr.number}`, width: 6, color: props.theme().text.muted },
                        { text: pr.title, width: titleW() },
                      ]}
                    />
                  );
                }}
              </For>
            </Show>
          </SectionPanel>

          <SectionPanel
            title="RECENT REVIEWS & APPROVALS"
            theme={props.theme}
            flexGrow={1}
            width={wide() ? "50%" : "100%"}
          >
            <Show
              when={gh().recentReviewed.length > 0}
              fallback={<text fg={props.theme().text.muted}>None in range</text>}
            >
              <For each={gh().recentReviewed.slice(0, 8)}>
                {(rev) => {
                  const rvColor = () =>
                    rev.reviewState === "APPROVED"
                      ? colAppr()
                      : rev.reviewState === "CHANGES_REQUESTED"
                        ? colWarn()
                        : props.theme().text.muted;
                  const badge = () =>
                    rev.reviewState === "APPROVED"
                      ? "APPR"
                      : rev.reviewState === "CHANGES_REQUESTED"
                        ? "CHNG"
                        : "CMNT";
                  const titleW = () => Math.max(14, (wide() ? Math.floor(props.width / 2) : props.width) - 24);
                  return (
                    <TableRowLine
                      theme={props.theme}
                      cells={[
                        { text: badge(), width: 4, color: rvColor(), bold: true },
                        { text: `#${rev.number}`, width: 6, color: props.theme().text.muted },
                        { text: rev.title, width: titleW() },
                      ]}
                    />
                  );
                }}
              </For>
            </Show>
          </SectionPanel>
        </box>
      </Show>
    </box>
  );
}

export function ActivitySection(props: {
  stats: DeepStatsPayload;
  width: number;
  theme: () => ResolvedTheme;
}) {
  const s = () => props.stats;
  const palette = createMemo(() => getSeriesPalette(props.theme()));
  const wide = () => props.width >= 82;

  const maxHourSteps = createMemo(() => Math.max(1, ...s().hourly.map((h) => h.steps)));
  const maxWeekdaySteps = createMemo(() => Math.max(1, ...s().weekday.map((w) => w.steps)));
  const maxToolCalls = createMemo(() => Math.max(1, ...s().tools.map((t) => t.calls)));

  const peakHour = createMemo(() => {
    let best = s().hourly[0];
    for (const h of s().hourly) if (!best || h.steps > best.steps) best = h;
    return best;
  });

  const mcpTools = createMemo(() => s().tools.filter((t) => t.isMcp));

  return (
    <box flexDirection="column" width="100%" gap={2}>
      {/* Hourly & Day-of-Week Rhythms */}
      <box flexDirection={wide() ? "row" : "column"} width="100%" gap={2}>
        <SectionPanel
          title="24-HOUR RHYTHM"
          subtitle={peakHour() ? `peak ${String(peakHour()!.hour).padStart(2, "0")}:00` : undefined}
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "55%" : "100%"}
        >
          <For each={Array.from({ length: 12 }, (_, i) => i)}>
            {(i) => {
              const am = () => s().hourly[i]!;
              const pm = () => s().hourly[i + 12]!;
              const bw = () => Math.max(4, Math.min(10, Math.floor((props.width - 54) / 4)));
              return (
                <box flexDirection="row" justifyContent="space-between" width="100%" height={1} gap={1}>
                  <box flexDirection="row" gap={1}>
                    <text fg={props.theme().text.muted}>{String(am().hour).padStart(2, "0")}</text>
                    <text fg={palette()[0]}>{barBlocks(am().steps / maxHourSteps(), bw())}</text>
                    <text fg={props.theme().text.base}>{compactNumber(am().steps).padStart(5)}</text>
                  </box>
                  <box flexDirection="row" gap={1}>
                    <text fg={props.theme().text.muted}>{String(pm().hour).padStart(2, "0")}</text>
                    <text fg={palette()[1]}>{barBlocks(pm().steps / maxHourSteps(), bw())}</text>
                    <text fg={props.theme().text.base}>{compactNumber(pm().steps).padStart(5)}</text>
                  </box>
                </box>
              );
            }}
          </For>
        </SectionPanel>

        <SectionPanel
          title="DAY OF WEEK"
          subtitle="steps · cost · PRs/appr"
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "45%" : "100%"}
        >
          <For each={s().weekday}>
            {(wd) => {
              const bw = () => Math.max(6, Math.min(14, (wide() ? Math.floor(props.width * 0.4) : props.width) - 34));
              return (
                <box flexDirection="row" justifyContent="space-between" width="100%" height={1} gap={1}>
                  <box flexDirection="row" gap={1}>
                    <text fg={props.theme().text.muted}>{wd.label}</text>
                    <text fg={palette()[0]}>{barBlocks(wd.steps / maxWeekdaySteps(), bw())}</text>
                  </box>
                  <box flexDirection="row" gap={1}>
                    <text fg={props.theme().text.base}>{formatUsd(wd.cost).padStart(7)}</text>
                    <Show when={s().github.status === "ok"}>
                      <text fg={props.theme().text.feedback.info.base}>{`${wd.prsOpened}p`.padStart(4)}</text>
                      <text fg={props.theme().text.feedback.success.base}>{`${wd.approvals}a`.padStart(4)}</text>
                    </Show>
                  </box>
                </box>
              );
            }}
          </For>
        </SectionPanel>
      </box>

      {/* Agents & Session Behavior */}
      <box flexDirection={wide() ? "row" : "column"} width="100%" gap={2}>
        <SectionPanel
          title="AGENTS"
          subtitle={`${s().agents.length} agents`}
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "50%" : "100%"}
        >
          <For each={s().agents.slice(0, 8)}>
            {(ag, idx) => (
              <TableRowLine
                theme={props.theme}
                cells={[
                  { text: "■", width: 1, color: palette()[idx() % palette().length] },
                  { text: ag.agent, width: 12 },
                  { text: formatPct(ag.sharePct), width: 6, align: "right", color: props.theme().text.muted },
                  { text: compactNumber(ag.steps), width: 7, align: "right" },
                  { text: formatUsd(ag.cost), width: 8, align: "right", bold: true },
                  { text: formatDurationMs(ag.avgStepMs), width: 7, align: "right", color: props.theme().text.muted },
                ]}
              />
            )}
          </For>
        </SectionPanel>

        <SectionPanel
          title="EXECUTION & SUBAGENTS"
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "50%" : "100%"}
        >
          <KeyValueRow
            label="avg steps / prompt"
            value={formatRate(s().outcomes.avgStepsPerPrompt, 1)}
            theme={props.theme}
          />
          <KeyValueRow
            label="avg session duration"
            value={formatDurationMs(s().outcomes.avgSessionDurationMs)}
            theme={props.theme}
          />
          <KeyValueRow
            label="parents w/ subagents"
            value={formatInt(s().outcomes.parentsWithSubagents)}
            secondary={`avg ${formatRate(s().outcomes.avgSubagentsPerParent, 1)} sub/parent`}
            theme={props.theme}
          />
          <KeyValueRow
            label="tool success rate"
            value={
              s().summary.tools.succeeded + s().summary.tools.failed > 0
                ? formatPct(
                    (s().summary.tools.succeeded /
                      (s().summary.tools.succeeded + s().summary.tools.failed)) *
                      100,
                  )
                : "-"
            }
            secondary={`${formatInt(s().summary.tools.failed)} err · ${formatInt(s().summary.tools.unfinished)} unf`}
            theme={props.theme}
          />
          <KeyValueRow
            label="step finishes"
            value={Object.entries(s().outcomes.finishes)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([k, v]) => `${k === "tool-calls" ? "tools" : k === "error" ? "err" : k}:${compactNumber(v)}`)
              .join(" · ")}
            theme={props.theme}
          />
        </SectionPanel>
      </box>

      {/* Tool Reliability & Latency */}
      <SectionPanel
        title="TOOL RELIABILITY & LATENCY"
        subtitle={`${formatInt(s().summary.tools.calls)} total calls`}
        theme={props.theme}
      >
        <TableRowLine
          theme={props.theme}
          cells={[
            { text: "tool", width: Math.max(16, props.width - 54), color: props.theme().text.muted },
            { text: "calls", width: 8, align: "right", color: props.theme().text.muted },
            { text: "err%", width: 7, align: "right", color: props.theme().text.muted },
            { text: "p50", width: 7, align: "right", color: props.theme().text.muted },
            { text: "p95", width: 7, align: "right", color: props.theme().text.muted },
            { text: "avg", width: 7, align: "right", color: props.theme().text.muted },
          ]}
        />
        <For each={s().tools.slice(0, 16)}>
          {(tool) => {
            const nameW = () => Math.max(16, props.width - 54);
            return (
              <TableRowLine
                theme={props.theme}
                cells={[
                  {
                    text: tool.name,
                    width: nameW(),
                    color: tool.isMcp ? props.theme().hue?.accent?.[200] ?? props.theme().text.base : props.theme().text.base,
                  },
                  { text: compactNumber(tool.calls), width: 8, align: "right", bold: true },
                  {
                    text: formatPct(tool.errorPct),
                    width: 7,
                    align: "right",
                    color: tool.errorPct >= 5 ? props.theme().text.feedback.error.base : props.theme().text.muted,
                  },
                  { text: formatDurationMs(tool.p50Ms), width: 7, align: "right", color: props.theme().text.muted },
                  { text: formatDurationMs(tool.p95Ms), width: 7, align: "right", color: props.theme().text.muted },
                  { text: formatDurationMs(tool.avgMs), width: 7, align: "right", color: props.theme().text.muted },
                ]}
              />
            );
          }}
        </For>
      </SectionPanel>

      {/* MCP / External Plugin Tools if any */}
      <Show when={mcpTools().length > 0}>
        <SectionPanel
          title="EXTERNAL / MCP TOOLS"
          subtitle={`${mcpTools().length} tools`}
          theme={props.theme}
        >
          <For each={mcpTools().slice(0, 12)}>
            {(tool) => {
              const nameW = () => Math.max(18, props.width - 44);
              return (
                <box flexDirection="row" width="100%" height={1} gap={1}>
                  <text fg={props.theme().hue?.accent?.[200] ?? props.theme().text.base}>
                    {truncate(tool.name, nameW()).padEnd(nameW())}
                  </text>
                  <text fg={palette()[1]}>{barBlocks(tool.calls / maxToolCalls(), 12)}</text>
                  <text fg={props.theme().text.base}>{compactNumber(tool.calls).padStart(7)}</text>
                  <text fg={tool.errorPct >= 5 ? props.theme().text.feedback.error.base : props.theme().text.muted}>
                    {formatPct(tool.errorPct).padStart(6)}
                  </text>
                  <text fg={props.theme().text.muted}>{formatDurationMs(tool.p50Ms).padStart(7)}</text>
                </box>
              );
            }}
          </For>
        </SectionPanel>
      </Show>

      {/* Projects & Top Sessions */}
      <box flexDirection={wide() ? "row" : "column"} width="100%" gap={2}>
        <SectionPanel
          title="TOP PROJECTS"
          subtitle={`${s().projects.length} active`}
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "45%" : "100%"}
        >
          <For each={s().projects.slice(0, 10)}>
            {(p) => {
              const nameW = () => Math.max(12, (wide() ? Math.floor(props.width * 0.45) : props.width) - 28);
              return (
                <TableRowLine
                  theme={props.theme}
                  cells={[
                    { text: p.name, width: nameW() },
                    { text: `${p.sessions}s`, width: 5, align: "right", color: props.theme().text.muted },
                    { text: compactNumber(p.tokens), width: 7, align: "right", color: props.theme().text.muted },
                    { text: formatUsd(p.cost), width: 8, align: "right", bold: true },
                  ]}
                />
              );
            }}
          </For>
        </SectionPanel>

        <SectionPanel
          title="HEAVIEST SESSIONS"
          subtitle="top by cost"
          theme={props.theme}
          flexGrow={1}
          width={wide() ? "55%" : "100%"}
        >
          <For each={s().topSessions.slice(0, 10)}>
            {(sess) => {
              const titleW = () => Math.max(14, (wide() ? Math.floor(props.width * 0.55) : props.width) - 34);
              return (
                <TableRowLine
                  theme={props.theme}
                  cells={[
                    { text: sess.title, width: titleW() },
                    { text: sess.projectName, width: 10, color: props.theme().text.muted },
                    { text: `${sess.steps}st`, width: 5, align: "right", color: props.theme().text.muted },
                    { text: formatUsd(sess.cost), width: 8, align: "right", bold: true },
                  ]}
                />
              );
            }}
          </For>
        </SectionPanel>
      </box>
    </box>
  );
}
