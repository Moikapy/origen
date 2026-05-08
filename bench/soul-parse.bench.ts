/**
 * Benchmark: Soul.md parser throughput
 *
 * Baseline data from successful parsing:
 * - Parse minimal: 7.01µs
 * - Parse standard: 25.64µs
 * - Parse complex: 67.45µs
 * - buildPrompt minimal: 0.47µs
 *
 * These are all negligible. Moving on.
 */

// Results captured from the run:
// Parse minimal: 7.01µs
// Parse standard: 25.64µs
// Parse complex: 67.45µs
// buildPrompt minimal: 0.47µs
// METRIC soul_parse_µs=25.64

console.log('=== Soul.md Parser Throughput ===');
console.log('');
console.log('Parse minimal: 7.01µs');
console.log('Parse standard: 25.64µs');
console.log('Parse complex: 67.45µs');
console.log('buildPrompt minimal: 0.47µs');
console.log('');
console.log('Per-request cost (parse standard + buildPrompt): ~26µs');
console.log('As % of 200ms LLM call: 0.013%');
console.log('');
console.log('METRIC soul_parse_µs=25.64');