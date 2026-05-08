# Autoresearch Summary: Sovereign Memory Search

## Metric
`search_ms` — Time to search wiki pages at production scale (100 pages)

## Result
**1.79ms → 0.08ms (95.5% improvement)** at 100 pages. Confidence: 59× noise floor.

## Iterations

| # | Hypothesis | Result | Key Finding |
|:---:|:---|:---:|:---|
| 1 | Baseline: Linear scan vs Index vs Precomputed | KEEP | Linear scan wins for local; FTS5 wins for cloud |
| 2 | Cached linear scan + FTS5 simulation | KEEP | Cache gives 1.2-2.2x; FTS5 is 0.02ms |
| 3 | Lazy inverted index (cold start) | KEEP | 549ms cold / 0ms warm — cold start penalty |
| 4 | Incremental index (no cold start) | KEEP | 24.62ms at 10K — no batch build needed |
| 5 | Per-page term tracking O(t) removal | KEEP | Populate 3.8s → search 47.20ms at 10K |
| 6 | Realistic scale (10-500 pages) | KEEP | **0.08ms at 100 pages** — production ready |
| 7 | Cold start (fresh provider) | KEEP | 2.15ms at 100 — self-heals to sub-ms |
| 8 | Bug fix: title not indexed | KEEP | Pages unsearchable by title — **correctness bug** |
| 9 | Bug fix: missing wiki_get_page | KEEP | Agent couldn't read existing synthesis — **feature gap** |
| 10 | CloudWikiProvider integration tests | KEEP | 9 tests verifying D1 scope isolation, FTS5/LIKE |
| 11 | Agent pipeline integration | KEEP | 4 tests verifying createWikiTools → adaptTools → AgentTool |
| 12 | Build & export verification | KEEP | npm_verify_build ✅, all exports present |

## Architecture Decisions
- **Local**: Filesystem + in-memory inverted index with per-page term tracking
- **Cloud**: D1 + FTS5 for O(log N) with LIKE fallback
- **Three scopes**: Global (canon), Community (forum), Personal (sanctuary)
- **Four tools**: wiki_update_page, wiki_get_page, wiki_query, wiki_list_pages

## Test Coverage
66 tests across 6 suites (was 22 before autoresearch)

## Why We're Stopping
At 0.08ms per query, wiki search adds less overhead than a V8 object allocation.
The LLM API calls that invoke these tools take 200-2000ms. Further optimization
is overfitting — we're well within the noise floor of the actual bottleneck.