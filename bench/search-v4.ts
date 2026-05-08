/**
 * Sovereign Memory Search Benchmark — Iteration 4
 * 
 * Tests the INCREMENTAL inverted index (new) vs previous approaches.
 * The key improvement: index is built incrementally on every savePage/getPage,
 * eliminating the 549ms cold-start penalty from iteration 3.
 */

import { performance } from 'node:perf_hooks';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalWikiProvider } from '../src/wiki';
import type { WikiScope } from '../src/types';

const SIZES = [100, 500, 1000, 5000, 10000];
const QUERIES = ['grace', 'faith', 'romans', 'prayer', 'love'];
const TEST_DIR = './bench-wiki-v4';

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

async function benchIncrementalIndex(pageCount: number): Promise<{
  populateMs: number;
  searchMs: number;
  incrementalUpdateMs: number;
}> {
  const dir = join(TEST_DIR, 'incremental');
  await mkdir(dir, { recursive: true });
  const provider = new LocalWikiProvider(dir);

  // Populate pages (each savePage increments the index)
  const populateStart = performance.now();
  for (let i = 0; i < pageCount; i++) {
    await provider.savePage(`Page_${i}`, generatePage(i), 'community');
  }
  const populateEnd = performance.now();

  // Search (index is already built incrementally — NO cold start)
  const searchStart = performance.now();
  for (const query of QUERIES) {
    await provider.search(query, ['community']);
  }
  const searchEnd = performance.now();

  // Incremental update
  const updateStart = performance.now();
  await provider.savePage('Page_0', 'Updated with new grace insights about faith.', 'community');
  const updateEnd = performance.now();

  // Verify search still works after update
  const faithResults = await provider.search('faith', ['community']);
  if (!faithResults.some(r => r.includes('Page_0'))) {
    console.error('FAIL: Updated page not found after incremental update!');
  }

  await rm(dir, { recursive: true, force: true });

  return {
    populateMs: populateEnd - populateStart,
    searchMs: searchEnd - searchStart,
    incrementalUpdateMs: updateEnd - updateStart,
  };
}

async function run() {
  console.log('=== Sovereign Memory Search — Iteration 4 (Incremental Index) ===\n');
  console.log(`${'Pages'.padEnd(8)} ${'Pop(ms)'.padEnd(10)} ${'Search(ms)'.padEnd(12)} ${'Update(ms)'.padEnd(12)} ${'vs Baseline'.padEnd(14)}`);
  console.log('-'.repeat(56));

  for (const size of SIZES) {
    const result = await benchIncrementalIndex(size);
    
    // Compare against baseline (iteration 1 linear scan)
    const baselineMs = size === 100 ? 1.79 : size === 500 ? 3.37 : size === 1000 ? 6.78 : size === 5000 ? 39.94 : 88.95;
    const speedup = baselineMs > 0 ? `${(baselineMs / result.searchMs).toFixed(1)}x` : 'N/A';
    
    console.log(
      `${String(size).padEnd(8)} ` +
      `${result.populateMs.toFixed(2).padEnd(10)} ` +
      `${result.searchMs.toFixed(2).padEnd(12)} ` +
      `${result.incrementalUpdateMs.toFixed(2).padEnd(12)} ` +
      `${speedup.padEnd(14)}`
    );

    console.log(`METRIC search_ms=${result.searchMs.toFixed(2)} pages=${size} strategy=incremental_index`);
  }

  console.log('\n=== Summary ===');
  console.log('Iteration 1 (baseline linear):   88.95ms at 10K pages');
  console.log('Iteration 2 (cached linear):    106.84ms at 10K pages (warm)');
  console.log('Iteration 3 (lazy index cold):  549.89ms at 10K pages (COLD) / 0.00ms (warm)');
  console.log('Iteration 4 (incremental):        ??ms at 10K pages (NO cold start)');
}

run().catch(console.error);