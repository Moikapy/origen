import { LocalWikiProvider } from './dist/wiki/local.js';

const p = new LocalWikiProvider('./debug-test-dir');

await p.savePage('Outdated Info', 'This knowledge is no longer accurate.', 'community');
console.log('After save, searching...');

const results = await p.search('outdated', ['community']);
console.log('Search results:', results);

import { rmSync } from 'node:fs';
rmSync('./debug-test-dir', { recursive: true, force: true });
console.log('Done');
