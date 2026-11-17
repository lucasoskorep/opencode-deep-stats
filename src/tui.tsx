/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import type { Context } from "@opencode/plugin/tui/context";
import { createSignal } from "solid-js";
import { DeepStatsAggregator } from "./aggregator.ts";
import { DeepStatsRpc } from "./rpc.ts";
import type { DeepStatsPayload, StatsRangeKey } from "./types.ts";
import { DeepStatsScreen, type FetchStatsInput, type ViewTab } from "./ui/DeepStatsScreen.tsx";

const PLUGIN_ID = "opencode-deep-stats.tui";
const ROUTE_NAME = "deep-stats";

let fallbackAggregator: DeepStatsAggregator | undefined;

function getFallbackAggregator(): DeepStatsAggregator {
  if (!fallbackAggregator) {
    fallbackAggregator = new DeepStatsAggregator();
  }
  return fallbackAggregator;
}

function parseSlashArgs(input?: string): { tab?: ViewTab; range?: StatsRangeKey } {
  if (!input) return {};
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let tab: ViewTab | undefined;
  let range: StatsRangeKey | undefined;
  for (const tok of tokens) {
    if (tok === "7d" || tok === "30d" || tok === "90d" || tok === "ytd" || tok === "all") {
      range = tok;
    } else if (tok === "overview" || tok === "tokens" || tok === "models" || tok === "github" || tok === "activity") {
      tab = tok;
    } else if (tok === "pr" || tok === "prs") {
      tab = "github";
    } else if (tok === "tools" || tok === "hours") {
      tab = "activity";
    } else if (tok === "full") {
      tab = "all";
    }
  }
  return { tab, range };
}

export default Plugin.define({
  id: PLUGIN_ID,
  setup(context: Context) {
    if (context.options?.enabled === false) return;

    const [previousRoute, setPreviousRoute] = createSignal({ ...context.ui.router.current() });
    const slashName =
      typeof context.options?.slashName === "string" && context.options.slashName.trim()
        ? context.options.slashName.trim()
        : "deep-stats";
    const aliases = Array.isArray(context.options?.aliases)
      ? (context.options.aliases as unknown[]).filter((a): a is string => typeof a === "string")
      : ["dstats", "stats+"];

    let cachedProjectId: string | undefined;
    let cachedProjectName: string | undefined;
    let resolvedLocation = false;

    const resolveProject = async () => {
      if (resolvedLocation) {
        return { projectID: cachedProjectId, projectName: cachedProjectName };
      }
      resolvedLocation = true;
      try {
        const loc = context.location ?? context.data.location.default();
        const info = await context.client.location.get({ location: loc });
        if (info?.project?.id) {
          cachedProjectId = info.project.id;
          cachedProjectName =
            info.project.canonical.split("/").filter(Boolean).pop() ||
            info.directory.split("/").filter(Boolean).pop() ||
            info.project.id;
        }
      } catch {
        // Project filter optional
      }
      return { projectID: cachedProjectId, projectName: cachedProjectName };
    };

    const rpc = context.client.rpc(DeepStatsRpc);
    let rpcAvailable: boolean | undefined;

    const fetchStats = async (input: FetchStatsInput): Promise<DeepStatsPayload> => {
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
            githubMode: input.githubMode,
          });
          rpcAvailable = true;
          return result as unknown as DeepStatsPayload;
        } catch (err) {
          // If server plugin isn't loaded (e.g. TUI-only install via cli.json), fall back cleanly.
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes("404") ||
            msg.toLowerCase().includes("not found") ||
            msg.toLowerCase().includes("unknown rpc")
          ) {
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
        githubMode: input.githubMode,
      });
    };

    const subscribeUpdates = (onUpdate: () => void) => {
      if (rpcAvailable === false) return () => {};
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
      render: ({ data }: { data?: Record<string, any> }) => {
        const loc = context.location ?? context.data.location.default();
        const fallbackProjName = loc.directory.split("/").filter(Boolean).pop() || "current";
        return (
          <DeepStatsScreen
            context={context}
            projectName={cachedProjectName ?? fallbackProjName}
            hasProjectScope={Boolean(loc.directory && loc.directory !== "/")}
            fetchStats={fetchStats}
            subscribeUpdates={subscribeUpdates}
            initialTab={(data?.tab as ViewTab | undefined) ?? "overview"}
            initialRange={(data?.range as StatsRangeKey | undefined) ?? "30d"}
            onClose={() => context.ui.router.navigate(previousRoute())}
          />
        );
      },
    });

    const unregisterSlot = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          priority: 10,
          commands: [
            {
              id: "deep-stats.open",
              title: "Deep usage statistics",
              description:
                "Open deep analytics for tokens/models over time, tool latency, and GitHub PRs & approvals",
              group: "System",
              palette: true,
              suggested: true,
              slash: {
                name: slashName,
                aliases,
                arguments: true,
              },
              run: (input?: string) => {
                const current = context.ui.router.current();
                const parsed = parseSlashArgs(input);
                if (current.type === "plugin" && current.id === PLUGIN_ID && current.name === ROUTE_NAME) {
                  return;
                }
                setPreviousRoute({ ...current });
                context.ui.dialog.clear();
                context.ui.router.navigate({
                  type: "plugin",
                  name: ROUTE_NAME,
                  data: parsed,
                });
              },
            },
          ],
        }));
        return null;
      },
    });

    return () => {
      const current = context.ui.router.current();
      if (current.type === "plugin" && current.id === PLUGIN_ID && current.name === ROUTE_NAME) {
        context.ui.router.navigate({ type: "home" });
      }
      unregisterRoute();
      unregisterSlot();
    };
  },
});
