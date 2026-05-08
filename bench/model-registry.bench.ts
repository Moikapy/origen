/**
 * Benchmark: Model registry initialization
 *
 * Models module is 309 lines and builds a static map of 50+ models.
 * Measures: import time, MODELS object construction, resolveModel() lookup.
 */

const ITERATIONS = 10_000;

async function benchModelImport(): Promise<number> {
  // Warmup
  for (let i = 0; i < 10; i++) {
    const { MODELS } = await import('../src/models.js');
  }
  
  // Measure dynamic import time (first invocation is cold, subsequent are cached)
  // This tests the module initialization cost
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    const { MODELS } = await import('../src/models.js');
  }
  return (performance.now() - start) / 100 * 1000; // µs per import
}

async function benchResolveModel(): Promise<void> {
  const { resolveModel } = await import('../src/adapter.js');
  
  // Warmup
  for (let i = 0; i < 100; i++) resolveModel('openrouter/free');
  
  // Individual model lookups
  const models = [
    'openrouter/free',
    'anthropic/claude-sonnet-4',
    'google/gemini-2.5-flash-preview',
    'ollama/llama3',
  ];
  
  for (const modelId of models) {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      resolveModel(modelId);
    }
    const elapsed = (performance.now() - start) / ITERATIONS * 1000;
    console.log(`resolveModel('${modelId}'): ${elapsed.toFixed(2)}µs`);
  }
}

async function benchModelesObjectSize(): Promise<void> {
  const { MODELS } = await import('../src/models.js');
  const keys = Object.keys(MODELS);
  console.log(`MODELS object: ${keys.length} entries`);
  
  // JSON serialization size (proxy for memory)
  const json = JSON.stringify(MODELS);
  const sizeKb = Buffer.byteLength(json) / 1024;
  console.log(`MODELS JSON size: ${sizeKb.toFixed(1)}KB`);
}

async function main() {
  console.log('=== Model Registry Benchmark ===\n');
  
  const importTime = await benchModelImport();
  console.log(`Dynamic import (cached): ${importTime.toFixed(2)}µs\n`);
  
  await benchResolveModel();
  console.log('');
  
  await benchModelesObjectSize();
  console.log('');
  
  console.log('METRIC model_registry_µs=' + importTime.toFixed(2));
}

main().catch(console.error);