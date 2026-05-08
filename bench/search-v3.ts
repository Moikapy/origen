/**
 * Sovereign Memory Search Benchmark — Iteration 3
 * 
 * Compares the lazy in-memory inverted index (new) against:
 *   - Baseline: Linear scan, no cache (iteration 1)
 *   - Cached linear scan (iteration 2)
 *   - In-memory inverted index (this iteration)
 * 
 * Hypothesis: The in-memory inverted index should give O(1) lookups
 * comparable to the simulated FTS5 (0.02ms at 10K pages) while 
 * avoiding the JSON serialization overhead that killed the on-disk index.
 */

import { performance } from 'node:perf_hooks';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalWikiProvider } from '../src/wiki';
import type { WikiScope } from '../src/types';

// ── Config ────────────────────────────────────────────────────────

const SIZES = [100, 500, 1000, 5000, 10000];
const QUERIES = ['grace', 'faith', 'romans', 'prayer', 'love'];
const TEST_DIR = './bench-wiki-v3';

// ── Data Generation ───────────────────────────────────────────────

const BIBLE_PHRASES = [
  'For by grace you have been saved through faith',
  'The Lord is my shepherd I shall not want',
  'Love is patient love is kind',
  'Pray without ceasing',
  'The wages of sin is death but the gift of God is eternal life',
  'Blessed are the poor in spirit for theirs is the kingdom of heaven',
  'Trust in the Lord with all your heart',
  'I can do all things through Christ who strengthens me',
  'The truth shall set you free',
  'God works all things together for good',
  'Be strong and courageous do not be afraid',
  'Create in me a clean heart O God',
  'The tongue has the power of life and death',
  'Walk by faith not by sight',
  'Repent and be baptized every one of you',
  'He will never leave you nor forsake you',
  'The righteous shall live by faith',
  'Do not conform to the pattern of this world',
  'Let everything that has breath praise the Lord',
  'In the beginning God created the heavens and the earth',
];

function generatePage(index: number): string {
  const phrases = BIBLE_PHRASES.sort(() => Math.random() - 0.5).slice(0, 6 + Math.floor(Math.random() * 10));
  return `# Page ${index}\n\n${phrases.join('. ')}.\n\nAlso note that this page covers topics like ${phrases[0].split(' ').slice(0, 3).join(' ')} and related themes.`;
}

// ── Bench: In-memory Inverted Index (new) ────────────────────────

async function benchInvertedIndex(pageCount: number): Promise<{
  buildMs: number;       // Time to populate pages
  coldSearchMs: number;  // First search (triggers lazy index build)
  warmSearchMs: number;  // Second search (index already built)
  incrementalUpdateMs: number; // Time for savePage to re-index single page
}> {
  const dir = join(TEST_DIR, 'inverted-index');
  await mkdir(dir, { recursive: true });
  const provider = new LocalWikiProvider(dir);

  // Populate pages
  const buildStart = performance.now();
  for (let i = 0; i < pageCount; i++) {
    await provider.savePage(`Page_${i}`, generatePage(i), 'community');
  }
  const buildEnd = performance.now();

  // Cold search (first search triggers lazy index build)
  const coldStart = performance.now();
  for (const query of QUERIES) {
    await provider.search(query, ['community']);
  }
  const coldEnd = performance.now();

  // Warm search (index already built)
  const warmStart = performance.now();
  for (const query of QUERIES) {
    await provider.search(query, ['community']);
  }
  const warmEnd = performance.now();

  // Incremental update: save a page and measure re-index time
  const updateStart = performance.now();
  await provider.savePage('Page_0', 'Updated content with new insights about faith.', 'community');
  const updateEnd = performance.now();

  // Verify search still works after update
  const faithResults = await provider.search('faith', ['community']);
  if (!faithResults.some(r => r.includes('Page_0'))) {
    console.error('FAIL: Updated page not found in search results!');
  }

  await rm(dir, { recursive: true, force: true });

  return {
    buildMs: buildEnd - buildStart,
    coldSearchMs: coldEnd - coldStart,
    warmSearchMs: warmEnd - warmEnd,
    incrementalUpdateMs: updateEnd - updateStart,
  };
}

// ── Runner ──────────────────────────────────────────────────────

async function run() {
  console.log('=== Sovereign Memory Search — Iteration 3 (Inverted Index) ===\n');
  console.log(`${'Pages'.padEnd(8)} ${'Build(ms)'.padEnd(12)} ${'Cold(ms)'.padEnd(12)} ${'Warm(ms)'.padEnd(12)} ${'Update(ms)'.padEnd(12)}`);
  console.log('-'.repeat(56));

  for (const size of SIZES) {
    const result = await benchInvertedIndex(size);
    console.log(
      `${String(size).padEnd(8)} ` +
      `${result.buildMs.toFixed(2).padEnd(12)} ` +
      `${result.coldSearchMs.toFixed(2).padEnd(12)} ` +
      `${result.warmSearchMs.toFixed(2).padEnd(12)} ` +
      `${result.incrementalUpdateMs.toFixed(2).padEnd(12)}`
    );

    console.log(`METRIC search_ms=${result.coldSearchMs.toFixed(2)} pages=${size} strategy=inverted_cold`);
    console.log(`METRIC search_ms=${result.warmSearchMs.toFixed(2)} pages=${size} strategy=inverted_warm`);
  }

  console.log('\n=== Comparison with Previous Iterations ===');
  console.log('Iter 1 (baseline linear):    88.95ms at 10K pages');
  console.log('Iter 2 (cached linear):      106.84ms at 10K pages (warm)');
  console.log('Iter 3 (inverted index):      ??ms at 10K pages (cold)');
  console.log('');
  console.log('FTS5 reference (simulated):  0.02ms at 10K pages');
  console.log('');
  console.log('Key question: Does lazy in-memory index build approach FTS5 performance?');
  console.log('Secondary: How fast is incremental re-indexing after savePage?');
}

run().catch(console.error);