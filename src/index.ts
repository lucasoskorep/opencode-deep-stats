import { Plugin } from "@opencode/plugin";
import { DeepStatsAggregator } from "./aggregator.ts";
import { DeepStatsRpc } from "./rpc.ts";
import type { StatsRangeKey } from "./types.ts";

type Emitter = (reason: string) => void;
const emitters = new Set<Emitter>();

let sharedAggregator: DeepStatsAggregator | undefined;

function getAggregator(): DeepStatsAggregator {
  if (!sharedAggregator) {
    sharedAggregator = new DeepStatsAggregator({
      onUpdated: () => {
        for (const emit of emitters) emit("history-backfill");
      },
    });
    sharedAggregator.warmBackground();
  }
  return sharedAggregator;
}

export default Plugin.define({
  id: "opencode-deep-stats",
  async setup(ctx) {
    if (ctx.options?.enabled === false) return;

    const aggregator = getAggregator();
    let emitUpdated: Emitter | undefined;

    const rpcRegistration = await ctx.rpc
      .register(DeepStatsRpc, {
        getStats: async (rawInput) => {
          const input = (rawInput ?? {}) as {
            range?: StatsRangeKey;
            projectID?: string;
            projectDirectory?: string;
            githubRepo?: string;
            timezone?: string;
            includeVariants?: boolean;
            refresh?: boolean;
            githubMode?: "sync" | "cache-only" | "skip";
          };

          const payload = await aggregator.getStats({
            range: input.range ?? "30d",
            projectID: input.projectID,
            projectDirectory: input.projectDirectory ?? ctx.location.directory,
            githubRepo: input.githubRepo,
            timezone: input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            includeVariants: input.includeVariants ?? false,
            refresh: input.refresh ?? false,
            githubMode: input.githubMode ?? "sync",
          });

          return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
        },
      })
      .catch(() => undefined);

    if (rpcRegistration) {
      emitUpdated = (reason: string) => {
        void rpcRegistration.events.emit("updated", { reason, at: Date.now() }).catch(() => {});
      };
      emitters.add(emitUpdated);
    }

    const toolRegistration = await ctx.tool
      .transform((editor) => {
        editor.add({
          name: "deep_stats",
          description:
            "Compute deep OpenCode usage analytics (tokens/cost/models over time, tool latency, hourly activity, and GitHub PRs opened & approvals per day).",
          input: {
            type: "object",
            properties: {
              range: {
                type: "string",
                enum: ["7d", "30d", "90d", "ytd", "all"],
                description: "Time window (default: 30d)",
              },
              currentProjectOnly: {
                type: "boolean",
                description: "Restrict stats to the current project",
              },
              includeVariants: {
                type: "boolean",
                description: "Split models by variant (e.g. #xhigh)",
              },
              includeGithub: {
                type: "boolean",
                description: "Include GitHub PRs opened & approvals via gh CLI (default: true)",
              },
            },
            additionalProperties: false,
          },
          execute: async (rawInput) => {
            const input = (rawInput ?? {}) as {
              range?: StatsRangeKey;
              currentProjectOnly?: boolean;
              includeVariants?: boolean;
              includeGithub?: boolean;
            };
            const stats = await aggregator.getStats({
              range: input.range ?? "30d",
              projectID: input.currentProjectOnly ? ctx.location.project.id : undefined,
              projectDirectory: ctx.location.directory,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              includeVariants: input.includeVariants ?? false,
              githubMode: input.includeGithub === false ? "skip" : "sync",
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(stats, null, 2),
                },
              ],
            };
          },
        });
      })
      .catch(() => undefined);

    return async () => {
      if (emitUpdated) emitters.delete(emitUpdated);
      await rpcRegistration?.dispose().catch(() => {});
      await toolRegistration?.dispose().catch(() => {});
    };
  },
});
