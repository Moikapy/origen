/**
 * Benchmark: Tool adaptation overhead
 *
 * Measures the cost of OrigenTool → AgentTool adaptation per tool call.
 * This is the "last mile" overhead between the wiki search (0.08ms) and
 * the LLM API call (200-2000ms).
 */

import { adaptTools } from '../src/adapter';
import { LocalWikiProvider } from '../src/wiki';
import { createWikiTools } from '../src/wiki-tools';
import type { OrigenTool } from '../src/agent';
import type { D1Provider } from '../src/types';

// ── Mock D1 ──────────────────────────────────────────────────────────────
const mockD1: D1Provider = async () => ({
  prepare: () => ({
    bind: () => ({
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
    }),
  }),
}) as any;

// ── Create test tools ────────────────────────────────────────────────────
function createTestTools(count: number): OrigenTool[] {
  const tools: OrigenTool[] = [];
  for (let i = 0; i < count; i++) {
    tools.push({
      name: `test_tool_${i}`,
      description: `Test tool ${i} for benchmarking`,
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: `Input for tool ${i}` },
        },
        required: ['input'],
      },
      execute: async (args) => `Result from tool ${i}: ${args.input}`,
    });
  }
  return tools;
}

// ── Benchmarks ───────────────────────────────────────────────────────────

const ITERATIONS = 10_000;

async function benchAdaptTools(toolCount: number): Promise<number> {
  const tools = createTestTools(toolCount);

  // Warmup
  for (let i = 0; i < 100; i++) {
    adaptTools(tools, mockD1);
  }

  // Measure
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    adaptTools(tools, mockD1);
  }
  const elapsed = performance.now() - start;

  return elapsed / ITERATIONS * 1000; // Convert to µs
}

async function benchWikiToolAdaptation(): Promise<number> {
  const provider = new LocalWikiProvider('./bench-wiki-temp');
  const wikiTools = createWikiTools(provider, 'bench-user');

  // Convert to OrigenTool format (same path as agent.ts)
  const origenTools: OrigenTool[] = wikiTools.map(wt => ({
    name: wt.name,
    description: wt.description,
    parameters: wt.parameters,
    execute: async (args) => await wt.execute(args),
  }));

  // Warmup
  for (let i = 0; i < 100; i++) {
    adaptTools(origenTools, mockD1);
  }

  // Measure
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    adaptTools(origenTools, mockD1);
  }
  const elapsed = performance.now() - start;

  return elapsed / ITERATIONS * 1000; // Convert to µs
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Tool Adaptation Overhead Benchmark ===\n');

  // 1. AdaptTools with varying tool counts
  for (const count of [1, 5, 10, 20]) {
    const overhead = await benchAdaptTools(count);
    console.log(`adaptTools(${count} tools): ${overhead.toFixed(2)}µs per call`);
  }
  console.log();

  // 2. Wiki tool adaptation (most realistic scenario)
  const wikiOverhead = await benchWikiToolAdaptation();
  console.log(`Wiki tools (5 tools) adaptation: ${wikiOverhead.toFixed(2)}µs per call`);
  console.log();

  // 3. Key metric: tool overhead per streamOrigen call
  const fiveToolOverhead = await benchAdaptTools(5);
  const twentyToolOverhead = await benchAdaptTools(20);
  console.log('=== Production Scenario ===');
  console.log(`5 tools (wiki only): ${fiveToolOverhead.toFixed(2)}µs one-time per streamOrigen call`);
  console.log(`20 tools (wiki + 15 app): ${twentyToolOverhead.toFixed(2)}µs one-time per streamOrigen call`);
  console.log();

  // Primary metric for autoresearch
  console.log(`METRIC tool_overhead_µs=${fiveToolOverhead.toFixed(2)}`);
}

main().catch(console.error);