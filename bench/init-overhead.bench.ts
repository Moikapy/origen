/**
 * Benchmark: Agent initialization overhead
 *
 * Measures the cost of setting up the agent before any LLM call.
 * This is the "time-to-first-token contribution" from Origen itself.
 *
 * Key operations:
 * 1. resolveModel() — model ID → pi-ai Model object
 * 2. adaptTools() — OrigenTool[] → AgentTool[] with D1Provider closure
 * 3. createEventStream() — Agent event subscription
 * 4. System prompt construction — wiki augmentation
 * 5. Full streamOrigen setup (everything except the LLM call)
 */

import { resolveModel, createEventStream, adaptTools, buildContext, convertMessages } from '../src/adapter';
import { MODELS, DEFAULT_MODEL_ID } from '../src/models';
import { LocalWikiProvider, CloudWikiProvider, CLOUD_WIKI_MIGRATION } from '../src/wiki';
import { createWikiTools } from '../src/wiki-tools';
import { Agent } from '@mariozechner/pi-agent-core';
import type { OrigenTool } from '../src/agent';
import type { D1Provider } from '../src/types';

// Mock D1
const mockD1: D1Provider = async () => ({
  prepare: () => ({
    bind: () => ({
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
    }),
  }),
}) as any;

// Realistic tool set (5 wiki + 3 app tools)
function createAppTools(): OrigenTool[] {
  return [
    {
      name: 'lookup',
      description: 'Look up information in the database',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: async (args) => JSON.stringify({ result: 'found' }),
    },
    {
      name: 'calculate',
      description: 'Perform a calculation',
      parameters: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] },
      execute: async (args) => '42',
    },
    {
      name: 'search',
      description: 'Search the web',
      parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      execute: async (args) => 'No results',
    },
  ];
}

function createWikiOrigenTools(provider: LocalWikiProvider): OrigenTool[] {
  const wikiTools = createWikiTools(provider, 'bench-user');
  return wikiTools.map(wt => ({
    name: wt.name,
    description: wt.description,
    parameters: wt.parameters,
    execute: async (args) => await wt.execute(args),
  }));
}

const ITERATIONS = 10_000;

async function benchResolveModel(): Promise<number> {
  // Warmup
  for (let i = 0; i < 100; i++) resolveModel('openrouter/free');
  
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    resolveModel('openrouter/free');
  }
  return (performance.now() - start) / ITERATIONS * 1000; // µs
}

async function benchAdaptTools(): Promise<number> {
  const tools = [...createAppTools()];
  const provider = new LocalWikiProvider('./bench-init-wiki');
  tools.push(...createWikiOrigenTools(provider));
  
  // Warmup
  for (let i = 0; i < 100; i++) adaptTools(tools, mockD1);
  
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    adaptTools(tools, mockD1);
  }
  return (performance.now() - start) / ITERATIONS * 1000; // µs
}

async function benchConvertMessages(): Promise<number> {
  const messages = [
    { role: 'user' as const, content: 'What is the meaning of life?' },
    { role: 'assistant' as const, content: 'The meaning of life is...' },
    { role: 'user' as const, content: 'Can you elaborate?' },
  ];
  
  // Warmup
  for (let i = 0; i < 100; i++) convertMessages(messages);
  
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    convertMessages(messages);
  }
  return (performance.now() - start) / ITERATIONS * 1000; // µs
}

async function benchAgentConstruction(): Promise<number> {
  const model = resolveModel('openrouter/free');
  const tools = adaptTools(createAppTools(), mockD1);
  const piMessages = convertMessages([
    { role: 'user' as const, content: 'Hello' },
  ]);
  
  // Warmup
  for (let i = 0; i < 100; i++) {
    new Agent({
      initialState: { systemPrompt: 'You are helpful.', model, thinkingLevel: 'off', tools, messages: piMessages },
      getApiKey: async () => undefined,
      toolExecution: 'parallel',
    });
  }
  
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    new Agent({
      initialState: { systemPrompt: 'You are helpful.', model, thinkingLevel: 'off', tools, messages: piMessages },
      getApiKey: async () => undefined,
      toolExecution: 'parallel',
    });
  }
  return (performance.now() - start) / ITERATIONS * 1000; // µs
}

async function benchFullPipeline(): Promise<number> {
  const provider = new LocalWikiProvider('./bench-init-wiki');
  const wikiTools = createWikiOrigenTools(provider);
  const appTools = createAppTools();
  const allTools = [...appTools, ...wikiTools];
  
  // Warmup
  for (let i = 0; i < 100; i++) {
    const model = resolveModel('openrouter/free');
    const adapted = adaptTools(allTools, mockD1);
  }
  
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const model = resolveModel('openrouter/free');
    const adapted = adaptTools(allTools, mockD1);
    const messages = convertMessages([
      { role: 'user' as const, content: 'Tell me about grace.' },
    ]);
  }
  return (performance.now() - start) / ITERATIONS * 1000; // µs
}

async function main() {
  console.log('=== Agent Initialization Overhead Benchmark ===\n');
  
  const resolveTime = await benchResolveModel();
  console.log(`resolveModel(): ${resolveTime.toFixed(2)}µs`);
  
  const adaptTime = await benchAdaptTools();
  console.log(`adaptTools(8 tools): ${adaptTime.toFixed(2)}µs`);
  
  const convertTime = await benchConvertMessages();
  console.log(`convertMessages(3 msgs): ${convertTime.toFixed(2)}µs`);
  
  const agentTime = await benchAgentConstruction();
  console.log(`new Agent({}): ${agentTime.toFixed(2)}µs`);
  
  const pipelineTime = await benchFullPipeline();
  console.log(`Full pipeline (model + adapt + convert): ${pipelineTime.toFixed(2)}µs`);
  
  console.log('\n=== Summary ===');
  console.log(`Total Origen overhead per streamOrigen call: ${pipelineTime.toFixed(2)}µs`);
  console.log(`As % of 200ms LLM call: ${(pipelineTime / 200000 * 100).toFixed(4)}%`);
  console.log(`As % of 1000ms LLM call: ${(pipelineTime / 1000000 * 100).toFixed(4)}%`);
  console.log(`\nMETRIC init_µs=${pipelineTime.toFixed(2)}`);
  
  // Cleanup
  const { rmSync } = await import('node:fs');
  rmSync('./bench-init-wiki', { recursive: true, force: true });
}

main().catch(console.error);