/**
 * @moikapy/origen/wiki — Sovereign Memory wiki providers.
 *
 * Re-exports LocalWikiProvider (filesystem) and CloudWikiProvider (D1).
 *
 * **Tree-shaking**: Import from specific sub-paths to avoid pulling
 * unnecessary Node.js imports on edge runtimes:
 *   - `@moikapy/origen/wiki/cloud` — CloudWikiProvider only (edge-safe)
 *   - `@moikapy/origen/wiki/local`  — LocalWikiProvider only (Node.js)
 *
 * @module wiki
 */

export { LocalWikiProvider } from './wiki-local';
export { CloudWikiProvider, CLOUD_WIKI_MIGRATION } from './wiki-cloud';
export type { WikiProvider, WikiScope } from './types';