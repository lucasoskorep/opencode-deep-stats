import { Rpc } from "@opencode/plugin/rpc";

export const DeepStatsRpc = Rpc.define({
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
          githubMode: { type: "string", enum: ["sync", "cache-only", "skip"] },
        },
        required: ["range", "timezone", "includeVariants"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        additionalProperties: true,
      },
    },
  },
  events: {
    updated: {
      schema: {
        type: "object",
        properties: {
          reason: { type: "string" },
          at: { type: "number" },
        },
        required: ["reason", "at"],
        additionalProperties: false,
      },
    },
  },
});
