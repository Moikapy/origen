import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    models: "src/models.ts",
    soul: "src/soul.ts",
    adapter: "src/adapter.ts",
  },
  format: ["esm"],
  target: "es2022",
  dts: true,
  clean: true,
  sourcemap: true,
  // External deps — the consumer provides these at runtime.
  // tsup DTS generation uses tsc which requires these in node_modules.
  // If DTS build fails on CI, set dts: false and ship hand-written .d.ts files.
  external: ["@mariozechner/pi-ai", "@mariozechner/pi-agent-core", "typebox"],
});