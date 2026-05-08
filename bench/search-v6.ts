/**
 * Sovereign Memory Search — Iteration 6
 * 
 * Real-world scale benchmark: test at PRODUCTION sizes (10-500 pages)
 * with realistic content and multi-term queries. Also tests the
 * full tool → provider pipeline, not just raw provider.search().
 * 
 * This validates that our optimization matters where it actually counts.
 */

import { performance } from 'node:perf_hooks';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalWikiProvider } from '../src/wiki';
import { createWikiTools } from '../src/wiki-tools';
import type { WikiScope } from '../src/types';

// ── Config ────────────────────────────────────────────────────────

const REALISTIC_SIZES = [10, 25, 50, 100, 200, 500];
const QUERIES = ['grace', 'faith', 'Romans chapter', 'prayer and fasting', 'love'];
const TEST_DIR = './bench-wiki-v6';

// ── Realistic Content Generation ──────────────────────────────────

const TOPICS = [
  { title: 'Grace', content: 'Grace is unmerited favor from God. In Romans, Paul explains that we are saved by grace through faith, not by works. This concept appears throughout the New Testament, particularly in Ephesians and Romans chapters 5-8.' },
  { title: 'Faith', content: 'Faith is the assurance of things hoped for. Hebrews 11 defines faith as the substance of things not seen. Abraham was counted righteous because of his faith. Faith connects believers to the promises of God.' },
  { title: 'Prayer', content: 'Prayer is communion with God. Jesus taught the disciples the Lords Prayer in Matthew 6. Paul exhorts believers to pray without ceasing in 1 Thessalonians 5:17. Fasting often accompanies prayer in the biblical tradition.' },
  { title: 'Love', content: 'God is love. The greatest commandment is to love God and love your neighbor. First Corinthians 13 describes love as patient and kind. Love never fails and is the fulfillment of the law.' },
  { title: 'Romans', content: 'The book of Romans is Pauls masterpiece on justification by faith. Romans chapters 1-3 establish universal sin. Chapters 4-5 explain justification. Chapters 6-8 cover sanctification and life in the Spirit. Chapters 9-11 address Israel. Chapters 12-16 give practical exhortations.' },
];

function generateRealisticPage(index: number): { title: string; content: string } {
  const topic = TOPICS[index % TOPICS.length];
  const variation = Math.floor(index / TOPICS.length);
  const content = `${topic.content} Variation ${variation}: This page explores ${topic.title.toLowerCase()} in depth, considering historical context and modern application. Chapter ${variation + 1} analysis reveals patterns of ${TOPICS[(index + 1) % TOPICS.length].title.toLowerCase()} and ${TOPICS[(index + 2) % TOPICS.length].title.toLowerCase()} interconnected with the main theme.`;
  return { title: `${topic.title} - Study ${variation}`, content };
}

type BenchResult = {
  populateMs: number;
  searchMs: number;
  toolQueryMs: number;
  updateMs: number;
};

async function benchRealistic(pageCount: number): Promise<BenchResult> {
  const dir = join(TEST_DIR, `pages-${pageCount}`);
  await mkdir(dir, { recursive: true });
  const provider = new LocalWikiProvider(dir);
  
  // Populate with realistic content
  const populateStart = performance.now();
  for (let i = 0; i < pageCount; i++) {
    const { title, content } = generateRealisticPage(i);
    await provider.savePage(title, content, 'community');
  }
  const populateEnd = performance.now();
  
  // Raw provider search
  const searchStart = performance.now();
  for (const query of QUERIES) {
    await provider.search(query, ['community']);
  }
  const searchEnd = performance.now();
  
  // Full tool pipeline (same path the agent would take)
  const tools = createWikiTools(provider);
  const queryTool = tools.find(t => t.name === 'wiki_query')!;
  const toolStart = performance.now();
  for (const query of QUERIES) {
    await queryTool.execute({ query, scopes: ['community'] });
  }
  const toolEnd = performance.now();
  
  // Incremental update
  const updateStart = performance.now();
  await provider.savePage('Grace - Study 0', 'Updated: Grace is the foundation of salvation through faith alone.', 'community');
  const updateEnd = performance.now();
  
  await rm(dir, { recursive: true, force: true });
  
  return {
    populateMs: populateEnd - populateStart,
    searchMs: searchEnd - searchStart,
    toolQueryMs: toolEnd - toolStart,
    updateMs: updateEnd - updateStart,
  };
}

async function run() {
  console.log('=== Sovereign Memory — Realistic Scale Benchmark ===\n');
  console.log(`${'Pages'.padEnd(8)} ${'Pop(ms)'.padEnd(10)} ${'Search(ms)'.padEnd(12)} ${'Tool(ms)'.padEnd(12)} ${'Update(ms)'.padEnd(12)} ${'Search/query'.padEnd(14)}`);
  console.log('-'.repeat(68));

  for (const size of REALISTIC_SIZES) {
    const result = await benchRealistic(size);
    const perQuery = (result.searchMs / QUERIES.length).toFixed(2);
    console.log(
      `${String(size).padEnd(8)} ` +
      `${result.populateMs.toFixed(2).padEnd(10)} ` +
      `${result.searchMs.toFixed(2).padEnd(12)} ` +
      `${result.toolQueryMs.toFixed(2).padEnd(12)} ` +
      `${result.updateMs.toFixed(12)} ` +
      `${perQuery.padEnd(14)}ms`
    );

    console.log(`METRIC search_ms=${perQuery} pages=${size} strategy=incremental_realistic per_query=true`);
  }

  console.log('\n=== Context ===');
  console.log('These are PRODUCTION-SCALE sizes. A wiki for a single project');
  console.log('will typically have 20-200 pages. The Bible app might reach 500.');
  console.log('');
  console.log('If search/query is under 1ms at these scales, the optimization');
  console.log('is production-ready and further work has diminishing returns.');
}

run().catch(console.error);