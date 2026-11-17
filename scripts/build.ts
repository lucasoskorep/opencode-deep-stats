import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin";

const result = await Bun.build({
  entrypoints: ["./src/tui.tsx"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  naming: "tui.js",
  plugins: [createSolidTransformPlugin()],
  external: [
    "@opencode/plugin",
    "@opencode/plugin/*",
    "@opencode/client",
    "@opencode/client/*",
    "@opencode/theme",
    "@opencode/theme/*",
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
    "solid-js/*",
    "bun:sqlite",
  ],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Built ${result.outputs.map((o) => o.path).join(", ")}`);
