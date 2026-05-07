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
  // pi-ai and pi-agent-core are external — the consumer provides them
  external: ["@mariozechner/pi-ai", "@mariozechner/pi-agent-core"],
});