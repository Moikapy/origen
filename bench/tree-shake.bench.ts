/**
 * Benchmark: Runtime code size analysis
 *
 * After splitting dev/release builds, the remaining optimization
 * target is the actual runtime code size. Let's analyze what's
 * in index.js and the shared chunks.
 */

import { readFileSync } from 'node:fs';

// index.js analysis
const indexJs = readFileSync('dist/index.js', 'utf-8');
const lines = indexJs.split('\n').length;
const chars = indexJs.length;

// Check for tree-shakeability issues
const hasZodImport = indexJs.includes('zod');
const hasPiAiImport = indexJs.includes('pi-ai');
const hasPiAgentCoreImport = indexJs.includes('pi-agent-core');

console.log('=== Runtime Code Analysis ===\n');
console.log(`index.js: ${(chars/1024).toFixed(1)}KB, ${lines} lines`);
console.log(`Has zod import: ${hasZodImport}`);
console.log(`Has pi-ai import: ${hasPiAiImport}`);
console.log(`Has pi-agent-core: ${hasPiAgentCoreImport}`);

// Chunk analysis
import { readdirSync, statSync } from 'node:fs';
const chunks = readdirSync('dist').filter(f => f.startsWith('chunk-') && f.endsWith('.js'));
for (const chunk of chunks) {
  const content = readFileSync(`dist/${chunk}`, 'utf-8');
  const sizeKb = content.length / 1024;
  const lineCount = content.split('\n').length;
  
  // Identify what the chunk contains
  const hasSoul = content.includes('parseYamlFrontMatter') || content.includes('Soul');
  const hasWiki = content.includes('WikiProvider') || content.includes('invertedIndex');
  const hasAdapter = content.includes('adaptTool') || content.includes('convertMessages');
  const hasModels = content.includes('MODELS') || content.includes('getModel');
  
  const contents = [
    hasSoul ? 'soul' : '',
    hasWiki ? 'wiki' : '',
    hasAdapter ? 'adapter' : '',
    hasModels ? 'models' : '',
  ].filter(Boolean).join(', ');
  
  console.log(`${chunk}: ${sizeKb.toFixed(1)}KB, ${lineCount} lines [${contents || 'unknown'}]`);
}

// Entry point sizes
const entries = ['index.js', 'soul.js', 'models.js', 'adapter.js'];
for (const entry of entries) {
  const content = readFileSync(`dist/${entry}`, 'utf-8');
  console.log(`${entry}: ${(content.length/1024).toFixed(1)}KB, ${content.split('\n').length} lines`);
}

// Tree-shaking: which modules get pulled in by index.js?
console.log('\n=== Tree-Shaking Analysis ===');
console.log('index.js imports:');
const importLines = indexJs.split('\n').filter(l => l.includes('import') || l.includes('require'));
importLines.forEach(l => console.log(`  ${l.trim()}`));

// Module-level code analysis (what can't be tree-shaken)
const moduleLevelCode = indexJs.split('\n').filter(l => 
  !l.startsWith('//') && !l.startsWith('import') && l.trim().length > 0
);
console.log(`\nModule-level executable lines: ${moduleLevelCode.length}`);