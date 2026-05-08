/**
 * Benchmark: DTS build optimization
 *
 * Test separate approaches to reduce DTS build time:
 * 1. Current: dts: true (full tsc-based DTS generation) — 7.3s
 * 2. dts: { resolve: false } — skip resolution, faster
 * 3. No sourcemaps — saves ~100KB in dist
 * 4. Build JS only (skip DTS) — for dev iteration
 */

import { execSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

function getDirSize(dir: string): number {
  let totalSize = 0;
  const files = readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filePath = join(dir, file.name);
    if (file.isDirectory()) {
      totalSize += getDirSize(filePath);
    } else {
      totalSize += statSync(filePath).size;
    }
  }
  return totalSize;
}

const configs = [
  {
    name: 'current (dts: true, sourcemap: true)',
    config: `import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts", models: "src/models.ts", soul: "src/soul.ts", adapter: "src/adapter.ts" },
  format: ["esm"], target: "es2022", dts: true, clean: true, sourcemap: true,
  external: ["@mariozechner/pi-ai", "@mariozechner/pi-agent-core", "typebox"],
});`,
  },
  {
    name: 'dts: true, no sourcemap',
    config: `import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts", models: "src/models.ts", soul: "src/soul.ts", adapter: "src/adapter.ts" },
  format: ["esm"], target: "es2022", dts: true, clean: true, sourcemap: false,
  external: ["@mariozechner/pi-ai", "@mariozechner/pi-agent-core", "typebox"],
});`,
  },
  {
    name: 'dts: { resolve: false }, sourcemap: true',
    config: `import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts", models: "src/models.ts", soul: "src/soul.ts", adapter: "src/adapter.ts" },
  format: ["esm"], target: "es2022", dts: { resolve: false }, clean: true, sourcemap: true,
  external: ["@mariozechner/pi-ai", "@mariozechner/pi-agent-core", "typebox"],
});`,
  },
  {
    name: 'dts: { resolve: false }, no sourcemap',
    config: `import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts", models: "src/models.ts", soul: "src/soul.ts", adapter: "src/adapter.ts" },
  format: ["esm"], target: "es2022", dts: { resolve: false }, clean: true, sourcemap: false,
  external: ["@mariozechner/pi-ai", "@mariozechner/pi-agent-core", "typebox"],
});`,
  },
  {
    name: 'no dts, no sourcemap (js-only)',
    config: `import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts", models: "src/models.ts", soul: "src/soul.ts", adapter: "src/adapter.ts" },
  format: ["esm"], target: "es2022", dts: false, clean: true, sourcemap: false,
  external: ["@mariozechner/pi-ai", "@mariozechner/pi-agent-core", "typebox"],
});`,
  },
];

const original = `import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts", models: "src/models.ts", soul: "src/soul.ts", adapter: "src/adapter.ts" },
  format: ["esm"], target: "es2022", dts: true, clean: true, sourcemap: true,
  external: ["@mariozechner/pi-ai", "@mariozechner/pi-agent-core", "typebox"],
});`;

console.log('=== DTS Build Optimization Comparison ===\n');

for (const { name, config } of configs) {
  // Write config
  writeFileSync('tsup.config.ts', config);
  
  // Clean dist
  rmSync('dist', { recursive: true, force: true });
  
  // Build and measure
  const start = performance.now();
  try {
    execSync('pnpm build', { stdio: 'pipe' });
    const buildMs = performance.now() - start;
    
    const distSizeKb = existsSync('dist') ? getDirSize('dist') / 1024 : 0;
    const indexJsKb = existsSync('dist/index.js') ? statSync('dist/index.js').size / 1024 : 0;
    const hasDts = readdirSync('dist', { recursive: true }).some((f: any) => String(f).endsWith('.d.ts'));
    
    console.log(`${name}:`);
    console.log(`  Build: ${buildMs.toFixed(0)}ms | Dist: ${distSizeKb.toFixed(1)}KB | index.js: ${indexJsKb.toFixed(1)}KB | .d.ts: ${hasDts ? 'yes' : 'no'}`);
  } catch (e) {
    const buildMs = performance.now() - start;
    console.log(`${name}: BUILD FAILED (${buildMs.toFixed(0)}ms)`);
  }
  console.log();
}

// Restore original config
writeFileSync('tsup.config.ts', original);

console.log('METRIC build_ms_comparison_done=true');