import { LocalWikiProvider } from './dist/wiki/local.js';

const p = new LocalWikiProvider('./debug-test-dir');

await p.savePage('Outdated Info', 'This knowledge is no longer accurate.', 'community');

// Direct cache access
const cache = p['cache'];
console.log('Cache entries:');
for (const [k, v] of cache.entries()) {
  console.log(`  ${k}: ${v.substring(0, 50)}...`);
}

// Direct index access
const idx = p['invertedIndex'];
console.log('\nIndex entries for "outdated":');
const keys = idx.get('outdated');
console.log('  keys:', keys);

// Also check what "terms" are indexed
const pageTerms = p['pageTerms'];
console.log('\nPage terms:');
for (const [k, v] of pageTerms.entries()) {
  console.log(`  ${k}: ${[...v].join(', ')}`);
}

const results = await p.search('outdated', ['community']);
console.log('\nSearch results:', results);

import { rmSync } from 'node:fs';
rmSync('./debug-test-dir', { recursive: true, force: true });
