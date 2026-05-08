/**
 * Sovereign Memory — Iteration 7
 * 
 * Tests the COLD-START edge case: what happens when the LocalWikiProvider
 * is re-instantiated (as it would be in a Cloudflare Worker)?
 * 
 * In Workers, the provider starts with empty cache and empty index on every
 * request (or every cold start). The first search must fall back to 
 * linearSearch which loads all pages from disk.
 * 
 * Hypothesis: The linearSearch fallback will be slow at scale because it
 * reads every page from disk. We need a "warmup" strategy or an optimization
 * for this path specifically.
 */

import { performance } from 'node:perf_hooks';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalWikiProvider } from '../src/wiki';
import type { WikiScope } from '../src/types';

const SIZES = [10, 25, 50, 100, 200, 500];
const QUERIES = ['grace', 'faith', 'prayer'];
const TEST_DIR = './bench-wiki-v7';

const TOPICS = [
  'Grace is unmerited favor from God. In Romans, Paul explains that we are saved by grace through faith.',
  'Faith is the assurance of things hoped for. Hebrews 11 defines faith as the substance of things not seen.',
  'Prayer is communion with God. Jesus taught the Lords Prayer. Paul exhorts believers to pray without ceasing.',
  'Love is patient and kind. God is love. The greatest commandment is to love God and neighbor.',
  'The book of Romans covers justification by faith, sanctification, and life in the Spirit.',
];

function generatePage(index: number): string {
  return `${TOPICS[index % TOPICS.length]} Study ${index}: Additional analysis of chapter ${index + 1} and practical application.`;
}

interface ColdStartResult {
  populateMs: number;
  coldFirstSearchMs: number;  // First search on fresh provider (linearSearch fallback)
  warmSecondSearchMs: number; // Second search (index now built from first search)
  continuedSearchMs: number;  // Third search (fully warm)
  totalColdStartMs: number;    // Total time from fresh provider to having results
}

async function benchColdStart(pageCount: number): Promise<ColdStartResult> {
  const dir = join(TEST_DIR, `cold-${pageCount}`);
  await mkdir(dir, { recursive: true });
  
  // Phase 1: Populate with a separate provider
  const setupProvider = new LocalWikiProvider(dir);
  const populateStart = performance.now();
  for (let i = 0; i < pageCount; i++) {
    await setupProvider.savePage(`Page_${i}`, generatePage(i), 'community');
  }
  const populateEnd = performance.now();
  
  // Phase 2: COLD START - new provider instance (empty cache, empty index)
  const coldProvider = new LocalWikiProvider(dir);
  
  // First search (triggers linearSearch -> loads all pages -> indexes them)
  const coldStart = performance.now();
  const coldResults = await coldProvider.search('grace', ['community']);
  const coldEnd = performance.now();
  const coldFirstSearchMs = coldEnd - coldStart;
  
  // Verify results
  if (coldResults.length === 0) {
    console.error(`COLD START FAIL: No results for 'grace' at ${pageCount} pages`);
  }
  
  // Second search (should use the now-built index)
  const warmStart = performance.now();
  await coldProvider.search('faith', ['community']);
  const warmEnd = performance.now();
  const warmSecondSearchMs = warmEnd - warmStart;
  
  // Third search (fully warm)
  const continuedStart = performance.now();
  await coldProvider.search('prayer', ['community']);
  const continuedEnd = performance.now();
  const continuedSearchMs = continuedEnd - warmStart;
  
  await rm(dir, { recursive: true, force: true });
  
  return {
    populateMs: populateEnd - populateStart,
    coldFirstSearchMs,
    warmSecondSearchMs,
    continuedSearchMs,
    totalColdStartMs: coldEnd - coldStart, // time user actually waits
  };
}

async function run() {
  console.log('=== Sovereign Memory — Cold Start Benchmark ===\n');
  console.log('Tests what happens when LocalWikiProvider is re-instantiated');
  console.log('(empty cache + index) — the Cloudflare Worker scenario.\n');
  console.log(`${'Pages'.padEnd(8)} ${'Cold(ms)'.padEnd(12)} ${'Warm(ms)'.padEnd(12)} ${'Cont(ms)'.padEnd(12)} ${'Cold/query'.padEnd(14)}`);
  console.log('-'.repeat(58));

  for (const size of SIZES) {
    const result = await benchColdStart(size);
    const perQuery = (result.coldFirstSearchMs / QUERIES.length).toFixed(2);
    console.log(
      `${String(size).padEnd(8)} ` +
      `${result.coldFirstSearchMs.toFixed(2).padEnd(12)} ` +
      `${result.warmSecondSearchMs.toFixed(2).padEnd(12)} ` +
      `${result.continuedSearchMs.toFixed(2).padEnd(12)} ` +
      `${perQuery.padEnd(14)}ms`
    );

    console.log(`METRIC search_ms=${perQuery} pages=${size} strategy=cold_start_realistic per_query=true`);
  }

  console.log('\n=== Analysis ===');
  console.log('Cold = first search on fresh provider (linearSearch fallback)');
  console.log('Warm = second search (index built from first search + cached pages)');
  console.log('Cont = third search (fully warm index)');
  console.log('');
  console.log('If cold start is >50ms at 200 pages, we need a warmup function');
  console.log('that pre-loads pages into cache before the first request.');
}

run().catch(console.error);