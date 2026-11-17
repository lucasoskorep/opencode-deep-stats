/** @jsxImportSource @opentui/solid */
import { type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import type { Context } from "@opencode/plugin/tui/context";
import type { ResolvedTheme } from "@opencode/theme/tui";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import { formatDateRange, rangeLabel } from "../format.ts";
import type {
  ChartMetric,
  DeepStatsPayload,
  HeatmapMetric,
  StatsRangeKey,
} from "../types.ts";
import {
  ActivitySection,
  GitHubSection,
  ModelsSection,
  OverviewSection,
  TokensSection,
} from "./sections.tsx";

export type ViewTab = "overview" | "tokens" | "models" | "github" | "activity" | "all";

const TABS: Array<{ id: ViewTab; key: string; label: string }> = [
  { id: "overview", key: "1", label: "Overview" },
  { id: "tokens", key: "2", label: "Tokens" },
  { id: "models", key: "3", label: "Models" },
  { id: "github", key: "4", label: "GitHub" },
  { id: "activity", key: "5", label: "Activity" },
  { id: "all", key: "0", label: "All" },
];

const RANGES: StatsRangeKey[] = ["7d", "30d", "90d", "ytd", "all"];
const HEATMAP_METRICS: HeatmapMetric[] = ["steps", "tokens", "cost", "github"];
const CHART_METRICS: ChartMetric[] = ["cost", "tokens", "steps"];

export type FetchStatsInput = {
  range: StatsRangeKey;
  projectOnly: boolean;
  includeVariants: boolean;
  refresh?: boolean;
  githubMode: "sync" | "cache-only" | "skip";
};

export function DeepStatsScreen(props: {
  context: Pick<Context, "theme" | "keymap">;
  projectName?: string;
  hasProjectScope: boolean;
  fetchStats: (input: FetchStatsInput) => Promise<DeepStatsPayload>;
  subscribeUpdates?: (onUpdate: () => void) => () => void;
  onClose: () => void;
  initialTab?: ViewTab;
  initialRange?: StatsRangeKey;
}) {
  const dims = useTerminalDimensions();
  const theme = (): ResolvedTheme => props.context.theme;

  const [tab, setTab] = createSignal<ViewTab>(props.initialTab ?? "overview");
  const [range, setRange] = createSignal<StatsRangeKey>(props.initialRange ?? "30d");
  const [projectOnly, setProjectOnly] = createSignal(false);
  const [heatmapMetric, setHeatmapMetric] = createSignal<HeatmapMetric>("steps");
  const [chartMetric, setChartMetric] = createSignal<ChartMetric>("cost");
  const [includeVariants, setIncludeVariants] = createSignal(false);

  const [stats, setStats] = createSignal<DeepStatsPayload | undefined>(undefined);
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [loading, setLoading] = createSignal(true);
  const [syncingGh, setSyncingGh] = createSignal(false);

  let scrollRef: ScrollBoxRenderable | undefined;
  let requestSeq = 0;

  const contentWidth = createMemo(() => Math.max(24, Math.min(116, dims().width - 6)));

  const load = async (forceRefresh = false) => {
    const seq = ++requestSeq;
    const inputBase = {
      range: range(),
      projectOnly: projectOnly() && props.hasProjectScope,
      includeVariants: includeVariants(),
      refresh: forceRefresh,
    };
    setError(undefined);
    if (!stats()) setLoading(true);

    try {
      const fast = await props.fetchStats({ ...inputBase, githubMode: "cache-only" });
      if (seq !== requestSeq) return;
      setStats(fast);
      setLoading(false);

      if (forceRefresh || fast.github.status === "loading") {
        setSyncingGh(true);
        try {
          const full = await props.fetchStats({ ...inputBase, githubMode: "sync" });
          if (seq !== requestSeq) return;
          setStats(full);
        } finally {
          if (seq === requestSeq) setSyncingGh(false);
        }
      }
    } catch (err) {
      if (seq !== requestSeq) return;
      setLoading(false);
      setSyncingGh(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  createEffect(() => {
    // Re-run whenever reactive query params change
    range();
    projectOnly();
    includeVariants();
    void load(false);
  });

  onMount(() => {
    if (!props.subscribeUpdates) return;
    const unsub = props.subscribeUpdates(() => {
      void load(false);
    });
    onCleanup(unsub);
  });

  const cycleRange = (dir: -1 | 1) => {
    const idx = RANGES.indexOf(range());
    const next = (idx + dir + RANGES.length) % RANGES.length;
    setRange(RANGES[next]!);
    scrollRef?.scrollTo(0);
  };

  const cycleTab = (dir: -1 | 1) => {
    const idx = TABS.findIndex((t) => t.id === tab());
    const next = (idx + dir + TABS.length) % TABS.length;
    setTab(TABS[next]!.id);
    scrollRef?.scrollTo(0);
  };

  const selectTab = (nextTab: ViewTab) => {
    setTab(nextTab);
    scrollRef?.scrollTo(0);
  };

  const cycleHeatmap = () => {
    const idx = HEATMAP_METRICS.indexOf(heatmapMetric());
    setHeatmapMetric(HEATMAP_METRICS[(idx + 1) % HEATMAP_METRICS.length]!);
  };

  const cycleChartMetric = () => {
    const idx = CHART_METRICS.indexOf(chartMetric());
    setChartMetric(CHART_METRICS[(idx + 1) % CHART_METRICS.length]!);
  };

  props.context.keymap.layer(() => ({
    commands: [
      { bind: "escape,q", title: "Close deep stats", run: props.onClose },
      { bind: "1", title: "Overview tab", run: () => selectTab("overview") },
      { bind: "2", title: "Tokens tab", run: () => selectTab("tokens") },
      { bind: "3", title: "Models tab", run: () => selectTab("models") },
      { bind: "4", title: "GitHub tab", run: () => selectTab("github") },
      { bind: "5", title: "Activity tab", run: () => selectTab("activity") },
      { bind: "0", title: "All sections tab", run: () => selectTab("all") },
      { bind: "tab", title: "Next tab", run: () => cycleTab(1) },
      { bind: "shift+tab", title: "Previous tab", run: () => cycleTab(-1) },
      { bind: "[,left", title: "Shorter time range", run: () => cycleRange(-1) },
      { bind: "],right,t", title: "Next time range", run: () => cycleRange(1) },
      {
        bind: "p",
        title: "Toggle project scope",
        run: () => {
          if (props.hasProjectScope) {
            setProjectOnly((v) => !v);
            scrollRef?.scrollTo(0);
          }
        },
      },
      { bind: "h", title: "Cycle heatmap metric", run: cycleHeatmap },
      { bind: "m", title: "Cycle model chart metric", run: cycleChartMetric },
      { bind: "v", title: "Toggle model variants", run: () => setIncludeVariants((v) => !v) },
      { bind: "r", title: "Refresh stats", run: () => void load(true) },
      { bind: "down,j", title: "Scroll down", run: () => scrollRef?.scrollBy(3, "step") },
      { bind: "up,k", title: "Scroll up", run: () => scrollRef?.scrollBy(-3, "step") },
      { bind: "pagedown,ctrl+d", title: "Page down", run: () => scrollRef?.scrollBy(0.5, "viewport") },
      { bind: "pageup,ctrl+u", title: "Page up", run: () => scrollRef?.scrollBy(-0.5, "viewport") },
      { bind: "home,g", title: "Scroll to top", run: () => scrollRef?.scrollTo(0) },
      { bind: "end,shift+g", title: "Scroll to bottom", run: () => scrollRef?.scrollBy(1, "content") },
    ],
  }));

  const statusText = () => {
    const cur = stats();
    if (syncingGh()) return "syncing GitHub…";
    if (cur?.meta.historyStatus === "partial") {
      const pct = cur.meta.totalHours > 0 ? Math.round((cur.meta.cachedHours / cur.meta.totalHours) * 100) : 0;
      return `indexing history ${pct}%`;
    }
    return undefined;
  };

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={theme().background.base}
    >
      {/* Top Header + Tabs */}
      <box flexDirection="column" alignItems="center" width="100%" paddingTop={1} flexShrink={0}>
        <box flexDirection="column" width={contentWidth()} gap={1}>
          {/* Title Row */}
          <box
            flexDirection={contentWidth() < 56 ? "column" : "row"}
            justifyContent="space-between"
            width="100%"
          >
            <box flexDirection="row" gap={2}>
              <text fg={theme().text.base} attributes={TextAttributes.BOLD}>
                opencode / deep stats
              </text>
              <Show when={statusText()}>
                {(st: Accessor<string>) => <text fg={theme().text.feedback.info.base}>● {st()}</text>}
              </Show>
            </box>
            <text fg={theme().text.muted}>
              {stats()
                ? `${formatDateRange(stats()!.meta.from, stats()!.meta.to)} · ${stats()!.meta.projectLabel}`
                : `${rangeLabel(range())} · ${projectOnly() ? props.projectName ?? "project" : "all projects"}`}
            </text>
          </box>

          {/* Tabs + Time Range Controls */}
          <box
            flexDirection={contentWidth() < 102 ? "column" : "row"}
            justifyContent="space-between"
            width="100%"
            gap={1}
          >
            <box flexDirection="row" flexWrap="wrap" gap={1} flexShrink={0}>
              <For each={TABS}>
                {(item) => {
                  const active = () => tab() === item.id;
                  return (
                    <box
                      paddingLeft={1}
                      paddingRight={1}
                      flexShrink={0}
                      backgroundColor={
                        active() ? theme().background.raised.high : theme().background.raised.base
                      }
                      onMouseUp={() => selectTab(item.id)}
                    >
                      <text
                        fg={
                          active()
                            ? theme().hue?.interactive?.[200] ?? theme().text.base
                            : theme().text.muted
                        }
                        attributes={active() ? TextAttributes.BOLD : undefined}
                        wrapMode="none"
                        selectable={false}
                      >
                        {`${item.key} ${item.label}`}
                      </text>
                    </box>
                  );
                }}
              </For>
            </box>

            <box flexDirection="row" gap={1} flexShrink={0}>
              <For each={RANGES}>
                {(r) => {
                  const active = () => range() === r;
                  return (
                    <box
                      paddingLeft={1}
                      paddingRight={1}
                      flexShrink={0}
                      backgroundColor={
                        active() ? theme().background.raised.high : theme().background.raised.base
                      }
                      onMouseUp={() => {
                        setRange(r);
                        scrollRef?.scrollTo(0);
                      }}
                    >
                      <text
                        fg={
                          active()
                            ? theme().hue?.accent?.[200] ?? theme().text.base
                            : theme().text.muted
                        }
                        attributes={active() ? TextAttributes.BOLD : undefined}
                        wrapMode="none"
                        selectable={false}
                      >
                        {rangeLabel(r)}
                      </text>
                    </box>
                  );
                }}
              </For>
              <Show when={props.hasProjectScope}>
                <box
                  paddingLeft={1}
                  paddingRight={1}
                  flexShrink={0}
                  backgroundColor={
                    projectOnly() ? theme().background.raised.high : theme().background.raised.base
                  }
                  onMouseUp={() => setProjectOnly((v) => !v)}
                >
                  <text
                    fg={
                      projectOnly()
                        ? theme().hue?.interactive?.[200] ?? theme().text.base
                        : theme().text.muted
                    }
                    attributes={projectOnly() ? TextAttributes.BOLD : undefined}
                    wrapMode="none"
                    selectable={false}
                  >
                    {projectOnly() ? "proj" : "all"}
                  </text>
                </box>
              </Show>
            </box>
          </box>
        </box>
      </box>

      {/* Main Scrollable Body */}
      <scrollbox
        ref={(el) => {
          scrollRef = el;
        }}
        flexGrow={1}
        minHeight={0}
        scrollX={false}
        scrollY={true}
        verticalScrollbarOptions={{ visible: true }}
        horizontalScrollbarOptions={{ visible: false }}
        contentOptions={{
          alignItems: "center",
          paddingTop: 1,
          paddingBottom: 2,
        }}
      >
        <box flexDirection="column" alignItems="center" width={contentWidth()} gap={2}>
          <Show
            when={!error()}
            fallback={
              <text fg={theme().text.feedback.error.base}>
                Could not load deep stats: {error()}
              </text>
            }
          >
            <Show
              when={!loading() && stats()}
              fallback={<text fg={theme().text.muted}>Gathering deep usage stats…</text>}
            >
              {(data: Accessor<DeepStatsPayload>) => (
                <Switch>
                  <Match when={tab() === "overview"}>
                    <OverviewSection
                      stats={data()}
                      width={contentWidth()}
                      height={dims().height}
                      heatmapMetric={heatmapMetric()}
                      theme={theme}
                    />
                  </Match>
                  <Match when={tab() === "tokens"}>
                    <TokensSection stats={data()} width={contentWidth()} theme={theme} />
                  </Match>
                  <Match when={tab() === "models"}>
                    <ModelsSection
                      stats={data()}
                      width={contentWidth()}
                      chartMetric={chartMetric()}
                      includeVariants={includeVariants()}
                      theme={theme}
                    />
                  </Match>
                  <Match when={tab() === "github"}>
                    <GitHubSection stats={data()} width={contentWidth()} theme={theme} />
                  </Match>
                  <Match when={tab() === "activity"}>
                    <ActivitySection stats={data()} width={contentWidth()} theme={theme} />
                  </Match>
                  <Match when={tab() === "all"}>
                    <box flexDirection="column" width="100%" gap={2}>
                      <OverviewSection
                        stats={data()}
                        width={contentWidth()}
                        height={dims().height}
                        heatmapMetric={heatmapMetric()}
                        theme={theme}
                      />
                      <TokensSection stats={data()} width={contentWidth()} theme={theme} />
                      <ModelsSection
                        stats={data()}
                        width={contentWidth()}
                        chartMetric={chartMetric()}
                        includeVariants={includeVariants()}
                        theme={theme}
                      />
                      <GitHubSection stats={data()} width={contentWidth()} theme={theme} />
                      <ActivitySection stats={data()} width={contentWidth()} theme={theme} />
                    </box>
                  </Match>
                </Switch>
              )}
            </Show>
          </Show>
        </box>
      </scrollbox>

      {/* Bottom Shortcut & Branding Bar */}
      <box
        flexDirection="column"
        alignItems="center"
        width="100%"
        backgroundColor={theme().background.raised.base}
        flexShrink={0}
      >
        <box
          flexDirection="row"
          justifyContent="space-between"
          width={contentWidth()}
          height={1}
        >
          <text fg={theme().text.muted} wrapMode="none" selectable={false}>
            {contentWidth() >= 98
              ? "1-5/0 view · [/]/t range · p scope · h heat · m metric · v var · r refresh · j/k scroll · esc back"
              : contentWidth() >= 66
                ? "1-5/0 view · t range · p scope · r refresh · j/k · esc back"
                : "1-5/0 · t range · r · esc"}
          </text>
          <Show when={contentWidth() >= 64}>
            <text fg={theme().text.base} selectable={false}>
              opencode.ai
            </text>
          </Show>
        </box>
      </box>
    </box>
  );
}
