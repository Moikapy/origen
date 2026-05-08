/**
 * Benchmark: Origen package build time and size
 *
 * Primary metric: build_ms (time to produce dist/)
 * Secondary metrics: dist_size_kb, index_js_kb
 */

import { execSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
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

function countDtsFiles(dir: string): number {
  let count = 0;
  const files = readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filePath = join(dir, file.name);
    if (file.isDirectory()) {
      count += countDtsFiles(filePath);
    } else if (file.name.endsWith('.d.ts')) {
      count++;
    }
  }
  return count;
}

// Clean build
execSync('rm -rf dist', { stdio: 'pipe' });

// Measure build time
const start = performance.now();
execSync('pnpm build', { stdio: 'pipe' });
const buildMs = performance.now() - start;

// Measure output size
const distBytes = getDirSize('dist');
const distKb = distBytes / 1024;

// Measure key files
const indexJs = existsSync('dist/index.js') ? statSync('dist/index.js').size / 1024 : 0;
const soulJs = existsSync('dist/soul.js') ? statSync('dist/soul.js').size / 1024 : 0;
const modelsJs = existsSync('dist/models.js') ? statSync('dist/models.js').size / 1024 : 0;
const adapterJs = existsSync('dist/adapter.js') ? statSync('dist/adapter.js').size / 1024 : 0;

// Count chunks
const chunks = readdirSync('dist').filter(f => f.startsWith('chunk-') && f.endsWith('.js'));
const chunkKb = chunks.reduce((sum, f) => sum + statSync(join('dist', f)).size / 1024, 0);

// Count .d.ts files
const dtsFiles = countDtsFiles('dist');

console.log('=== Origen Build & Size Baseline ===\n');
console.log(`Build time: ${buildMs.toFixed(0)}ms`);
console.log(`Total dist/: ${distKb.toFixed(1)}KB`);
console.log(`  index.js: ${indexJs.toFixed(1)}KB`);
console.log(`  soul.js: ${soulJs.toFixed(1)}KB`);
console.log(`  models.js: ${modelsJs.toFixed(1)}KB`);
console.log(`  adapter.js: ${adapterJs.toFixed(1)}KB`);
console.log(`  chunks (shared): ${chunkKb.toFixed(1)}KB (${chunks.length} files)`);
console.log(`  .d.ts files: ${dtsFiles}`);
console.log(`\nMETRIC build_ms=${buildMs.toFixed(0)}`);
console.log(`METRIC dist_size_kb=${distKb.toFixed(1)}`);
console.log(`METRIC index_js_kb=${indexJs.toFixed(1)}`);