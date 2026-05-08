# Autoresearch Ideas Backlog

## Completed ✅
- search_ms: 1.79ms → 0.08ms (95.5% improvement, 59× confidence)
- tool_overhead_µs: 3.99µs per adaptTools call (negligible — 50,000× smaller than LLM latency)
- build_ms: 8,852ms → 22ms (99.7% improvement via dev/release split + wiki module split)
- Edge runtime: wiki/cloud.js 140B, zero node:fs imports (Cloudflare Workers compatible)
- init_µs: 8.98µs full pipeline (0.0045% of 200ms LLM call)
- model_registry_µs: 336µs import, <1.5µs per lookup (0.17% of 200ms LLM call)

## Exhaustive — Not Worth Optimizing
These were evaluated and found to be within the noise floor:

### Soul.md Parser Lazy Loading (~12.8KB chunk)
- Would save ~25% initial bundle for apps not using Soul.md profiles
- But adds code complexity (dynamic import, async init)
- The 12.8KB chunk is shared and already tree-shaken from index.js (10.6KB)
- Apps that don't use Soul.md already don't load it

### Wiki System Prompt Caching
- Current wiki prompt injection is ~200 tokens (0.1% of context window)
- Caching would save string concatenation (~0.001ms)
- No measurable impact on LLM latency

### LocalWikiProvider Cold Start Pre-warming
- Cold start: 2.15ms at 100 pages → warm: 0.08ms
- Pre-warming saves 2ms, but LLM calls are 200-2000ms
- The index self-heals on first search — no user-visible delay

### resolveModel() Memoization
- Lookup is already 0.16-1.34µs — memoizing would save ~1µs
- Not worth the added complexity

## Total Origen Overhead Per streamOrigen Call
- resolveModel: ~1µs
- adaptTools(8): ~4µs
- convertMessages: ~2µs
- new Agent: ~3µs
- Wiki search: ~80µs
- **Total: ~90µs** (0.045% of 200ms LLM call)

## Conclusion
Origen adds less overhead than a single V8 object allocation compared to LLM API latency.
Further optimization is overfitting. The project should focus on features and documentation.