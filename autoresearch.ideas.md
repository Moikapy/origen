# Autoresearch Ideas Backlog

## Completed
- ✅ search_ms: 1.79ms → 0.08ms (95.5% improvement, 59× confidence)
- ✅ tool_overhead_µs: 3.99µs per adaptTools call (negligible — 50,000× smaller than LLM latency)
- ✅ build_ms: 8,852ms → 33ms (99.6% improvement via dev/release split)

## Deferred Ideas

### Edge Runtime Compatibility (Medium Priority)
- LocalWikiProvider imports `fs/promises` and `path`, which breaks in Cloudflare Workers
- Split wiki.ts into wiki-local.ts and wiki-cloud.ts so bundlers can tree-shake
- Consider making LocalWikiProvider a dynamic import so it's not bundled on edge
- Impact: Enables full Origen usage on Workers without polyfills

### Runtime Code Size (Low Priority)  
- Total JS: ~50KB — already small
- soul.md parser (12.8KB) could be lazy-loaded since it's only needed at persona init
- Could use `import('./soul')` dynamic import in agent.ts to defer
- Impact: ~25% reduction in initial bundle for apps that don't use Soul.md

### Wiki System Prompt Optimization (Low Priority)
- Current system prompt injection adds ~200 tokens per request
- Could cache the prompt and only regenerate when wiki config changes
- Impact: Marginal — 200 tokens is ~0.1% of typical context window

### LocalWikiProvider Cold Start (Low Priority)
- Fresh provider: 2.15ms at 100 pages (warm: 0.08ms)
- Could pre-warm the index on startup with a `warmup()` method
- Impact: Minimal — 2.15ms is negligible compared to LLM latency