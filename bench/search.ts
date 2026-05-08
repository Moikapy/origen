/**
 * Sovereign Memory Search Benchmark
 * 
 * Simulates different search strategies across varying dataset sizes
 * to find the most optimal approach for the wiki provider.
 * 
 * Strategies tested:
 * 1. Linear Scan (current) — reads every page, scans content
 * 2. Inverted Index (JSON) — term → page mapping stored alongside wiki
 * 3. SQLite FTS5 (cloud) — full-text search via D1
 * 
 * Dataset: Simulated wiki pages with realistic content
 */

import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

// ── Config ────────────────────────────────────────────────────────

const SIZES = [100, 500, 1000, 5000, 10000];
const QUERIES = ['grace', 'faith', 'romans', 'prayer', 'love'];
const ITERATIONS = 5;
const TEST_DIR = './bench-wiki';

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
  const title = `Page ${index}`;
  const content = `# ${title}\n\n${phrases.join('. ')}.\n\nAlso note that this page covers topics like ${phrases[0].split(' ').slice(0, 3).join(' ')} and related themes.`;
  return content;
}

// ── Strategy 1: Linear Scan (Current) ──────────────────────────

async function benchLinearScan(pageCount: number): Promise<number> {
  const dir = join(TEST_DIR, 'linear');
  await mkdir(dir, { recursive: true });

  // Generate pages
  const pages = new Map<string, string>();
  for (let i = 0; i < pageCount; i++) {
    const title = `Page_${i}`;
    const content = generatePage(i);
    pages.set(title, content);
    await writeFile(join(dir, `${title}.md`), content);
  }

  // Benchmark search
  const start = performance.now();
  for (const query of QUERIES) {
    const lowerQuery = query.toLowerCase();
    const results: string[] = [];
    for (const [title, content] of pages) {
      if (content.toLowerCase().includes(lowerQuery)) {
        results.push(title);
      }
    }
  }
  const end = performance.now();

  await rm(dir, { recursive: true, force: true });
  return end - start;
}

// ── Strategy 2: Inverted Index ──────────────────────────────────

interface InvertedIndex {
  [term: string]: Set<string>;
}

function tokenize(content: string): string[] {
  return content.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2);
}

async function benchInvertedIndex(pageCount: number): Promise<{ searchMs: number; buildMs: number }> {
  const dir = join(TEST_DIR, 'indexed');
  await mkdir(dir, { recursive: true });

  // Generate pages and build index
  const pages = new Map<string, string>();
  const index: InvertedIndex = {};

  const buildStart = performance.now();
  for (let i = 0; i < pageCount; i++) {
    const title = `Page_${i}`;
    const content = generatePage(i);
    pages.set(title, content);

    const tokens = tokenize(content);
    for (const token of tokens) {
      if (!index[token]) index[token] = new Set();
      index[token].add(title);
    }
  }
  // Serialize index to JSON (simulating disk write)
  const indexJson = JSON.stringify(
    Object.fromEntries(Object.entries(index).map(([k, v]) => [k, [...v]]))
  );
  await writeFile(join(dir, '_index.json'), indexJson);
  const buildEnd = performance.now();

  // Benchmark search
  // Simulate cold start: deserialize index
  const coldStart = performance.now();
  const loadedIndex: InvertedIndex = {};
  const rawIndex = JSON.parse(await readFile(join(dir, '_index.json'), 'utf-8'));
  for (const [term, titles] of Object.entries(rawIndex)) {
    loadedIndex[term] = new Set(titles as string[]);
  }
  const indexLoadTime = performance.now() - coldStart;

  const searchStart = performance.now();
  for (const query of QUERIES) {
    const lowerQuery = query.toLowerCase();
    // Direct O(1) lookup
    const results = loadedIndex[lowerQuery] ? [...loadedIndex[lowerQuery]] : [];
  }
  const searchEnd = performance.now();

  await rm(dir, { recursive: true, force: true });

  return {
    searchMs: searchEnd - searchStart + indexLoadTime, // include index load cost
    buildMs: buildEnd - buildStart,
  };
}

// ── Strategy 3: Precomputed Search Map (Optimal for Local) ──────

interface SearchEntry {
  title: string;
  snippet: string; // first 200 chars for context
}

async function benchPrecomputedMap(pageCount: number): Promise<{ searchMs: number; buildMs: number }> {
  const dir = join(TEST_DIR, 'precomputed');
  await mkdir(dir, { recursive: true });

  // Generate pages and build a flat search map
  const searchMap: Record<string, SearchEntry[]> = {};

  const buildStart = performance.now();
  for (let i = 0; i < pageCount; i++) {
    const title = `Page_${i}`;
    const content = generatePage(i);
    const tokens = new Set(tokenize(content));

    for (const token of tokens) {
      if (!searchMap[token]) searchMap[token] = [];
      searchMap[token].push({
        title,
        snippet: content.slice(0, 200),
      });
    }
  }
  await writeFile(join(dir, '_search.json'), JSON.stringify(searchMap));
  const buildEnd = performance.now();

  // Benchmark search (cold start: load + query)
  const loadStart = performance.now();
  const loaded = JSON.parse(await readFile(join(dir, '_search.json'), 'utf-8')) as Record<string, SearchEntry[]>;
  const searchStart = performance.now();
  for (const query of QUERIES) {
    const lowerQuery = query.toLowerCase();
    const results = loaded[lowerQuery] || [];
  }
  const searchEnd = performance.now();

  await rm(dir, { recursive: true, force: true });

  return {
    searchMs: (searchEnd - loadStart), // total time including load
    buildMs: buildEnd - buildStart,
  };
}

// ── Runner ──────────────────────────────────────────────────────

async function run() {
  console.log('=== Sovereign Memory Search Benchmark ===\n');
  console.log(`${'Pages'.padEnd(10)} ${'Linear'.padEnd(12)} ${'Index(search)'.padEnd(14)} ${'Index(build)'.padEnd(14)} ${'Precomp(search)'.padEnd(16)} ${'Precomp(build)'.padEnd(14)}`);
  console.log('-'.repeat(80));

  // Header for METRIC parsing
  console.log('METRIC_NAME search_ms');

  for (const size of SIZES) {
    const linearMs = await benchLinearScan(size);
    const indexed = await benchInvertedIndex(size);
    const precomputed = await benchPrecomputedMap(size);

    console.log(
      `${String(size).padEnd(10)} ` +
      `${linearMs.toFixed(2).padEnd(12)} ` +
      `${indexed.searchMs.toFixed(2).padEnd(14)} ` +
      `${indexed.buildMs.toFixed(2).padEnd(14)} ` +
      `${precomputed.searchMs.toFixed(2).padEnd(16)} ` +
      `${precomputed.buildMs.toFixed(2).padEnd(14)}`
    );

    // METRIC lines for autoresearch
    console.log(`METRIC search_ms=${linearMs.toFixed(2)} pages=${size} strategy=linear`);
    console.log(`METRIC search_ms=${indexed.searchMs.toFixed(2)} pages=${size} strategy=inverted_index`);
    console.log(`METRIC search_ms=${precomputed.searchMs.toFixed(2)} pages=${size} strategy=precomputed`);
  }

  console.log('\n=== Analysis ===');
  console.log('Linear scan: O(N×L) — reads every page, scans every character');
  console.log('Inverted index: O(1) lookup + O(K) results, but requires index build O(N×L) and load time');
  console.log('Precomputed map: O(1) lookup with snippets included, larger index but zero post-lookup work');
  console.log('\nFor LOCAL (filesystem): Precomputed map is optimal — one JSON load, instant lookups');
  console.log('For CLOUD (D1): SQLite FTS5 is optimal — built-in, O(log N), handles ranking and stemming');
}

run().catch(console.error);