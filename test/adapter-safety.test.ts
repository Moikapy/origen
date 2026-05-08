/**
 * Adapter type safety and edge case audit.
 *
 * The adapter is the critical bridge between Origen and pi-agent-core.
 * Every streamOrigen call goes through it. This audit tests:
 * 1. resolveModel() with various inputs
 * 2. convertMessages() edge cases
 * 3. translateEvent() for all event types
 * 4. createEventStream() lifecycle
 * 5. adaptTool() parameter handling
 */

import { describe, it, expect } from 'vitest';
import { resolveModel, convertMessages, adaptTool, translateEvent, defaultCitationExtractor, buildContext } from '../src/adapter';
import type { OrigenTool } from '../src/agent';
import type { D1Provider } from '../src/types';

// ── Mock D1 ──────────────────────────────────────────────────────────
const mockD1: D1Provider = async () => ({
  prepare: () => ({
    bind: () => ({
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
    }),
  }),
}) as any;

describe('Adapter Type Safety Audit', () => {
  describe('resolveModel()', () => {
    it('should resolve known OpenRouter models', () => {
      const model = resolveModel('openrouter/free');
      expect(model.id).toBe('openrouter/free');
      expect(model.provider).toBe('openrouter');
    });

    it('should resolve known Ollama models with defaults', () => {
      const model = resolveModel('ollama/llama3');
      expect(model.id).toBe('llama3');
      expect(model.provider).toBe('ollama');
      expect(model.baseUrl).toBe('http://localhost:11434/v1');
    });

    it('should use custom Ollama base URL', () => {
      const model = resolveModel('ollama/llama3', { ollamaBaseUrl: 'http://custom:1234/v1' });
      expect(model.baseUrl).toBe('http://custom:1234/v1');
    });

    it('should resolve unknown Ollama models as generic', () => {
      const model = resolveModel('ollama/my-custom-model');
      expect(model.id).toBe('my-custom-model');
      expect(model.name).toBe('my-custom-model (Ollama)');
      expect(model.provider).toBe('ollama');
      expect(model.baseUrl).toBe('http://localhost:11434/v1');
    });

    it('should fallback to generic model for unknown providers', () => {
      const model = resolveModel('unknown/model-name');
      expect(model.id).toBe('unknown/model-name');
      expect(model.name).toBe('unknown/model-name');
    });

    it('should resolve DeepSeek R1 as thinking model', () => {
      const model = resolveModel('ollama/deepseek-r1');
      expect(model.reasoning).toBe(true);
    });

    it('should not crash on empty model ID', () => {
      const model = resolveModel('');
      expect(model).toBeDefined();
      expect(model.id).toBe('');
    });

    it('should handle model ID with special characters', () => {
      const model = resolveModel('openrouter/google/gemma-4-31b-it:free');
      expect(model).toBeDefined();
    });
  });

  describe('convertMessages()', () => {
    it('should convert simple messages', () => {
      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there' },
      ];
      const result = convertMessages(messages);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('Hello');
      expect(result[1].role).toBe('assistant');
      expect(result[1].content).toBe('Hi there');
    });

    it('should handle empty messages array', () => {
      const result = convertMessages([]);
      expect(result).toHaveLength(0);
    });

    it('should handle messages with special characters', () => {
      const messages = [
        { role: 'user' as const, content: 'Hello "world" <script>alert(1)</script>' },
      ];
      const result = convertMessages(messages);
      expect(result[0].content).toBe('Hello "world" <script>alert(1)</script>');
    });

    it('should handle very long messages', () => {
      const longContent = 'x'.repeat(100000);
      const messages = [
        { role: 'user' as const, content: longContent },
      ];
      const result = convertMessages(messages);
      expect(result[0].content).toBe(longContent);
    });
  });

  describe('adaptTool()', () => {
    const testTool: OrigenTool = {
      name: 'test_tool',
      description: 'A test tool',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input parameter' },
        },
        required: ['input'],
      },
      execute: async (args) => `Result: ${args.input}`,
    };

    it('should adapt tool with all required fields', () => {
      const adapted = adaptTool(testTool, mockD1);
      expect(adapted.name).toBe('test_tool');
      expect(adapted.description).toBe('A test tool');
      expect(adapted.parameters).toBeDefined();
    });

    it('should execute tool and return result', async () => {
      const adapted = adaptTool(testTool, mockD1);
      const result = await adapted.execute('call-1', { input: 'hello' }, undefined as any);
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Result: hello');
    });

    it('should handle tool execute with missing optional params', async () => {
      const toolWithoutRequired: OrigenTool = {
        name: 'simple',
        description: 'Simple tool',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'done',
      };
      const adapted = adaptTool(toolWithoutRequired, mockD1);
      const result = await adapted.execute('call-2', {}, undefined as any);
      expect(result.content[0].text).toBe('done');
    });

    it('should handle tool execute that throws', async () => {
      const brokenTool: OrigenTool = {
        name: 'broken',
        description: 'A broken tool',
        parameters: { type: 'object', properties: {} },
        execute: async () => { throw new Error('Tool crashed'); },
      };
      const adapted = adaptTool(brokenTool, mockD1);
      await expect(adapted.execute('call-3', {}, undefined as any)).rejects.toThrow('Tool crashed');
    });
  });

  describe('translateEvent()', () => {
    it('should translate text_delta event', () => {
      const event = {
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hello world' },
      };
      const result = translateEvent(event as any);
      expect(result).toEqual({ type: 'text', content: 'Hello world' });
    });

    it('should translate thinking_delta event', () => {
      const event = {
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', delta: 'Let me think...' },
      };
      const result = translateEvent(event as any);
      expect(result).toEqual({ type: 'reasoning', content: 'Let me think...' });
    });

    it('should translate tool_execution_start', () => {
      const event = {
        type: 'tool_execution_start',
        toolName: 'lookup',
        args: { query: 'test' },
      };
      const result = translateEvent(event as any);
      expect(result).toEqual({
        type: 'tool_call',
        name: 'lookup',
        args: { query: 'test' },
      });
    });

    it('should translate tool_execution_end with text content', () => {
      const event = {
        type: 'tool_execution_end',
        toolName: 'lookup',
        result: {
          content: [{ type: 'text', text: 'Found: Genesis 1:1' }],
          details: {},
        },
      };
      const result = translateEvent(event as any);
      expect(result).toEqual({
        type: 'tool_result',
        name: 'lookup',
        result: 'Found: Genesis 1:1',
      });
    });

    it('should return null for unknown event types', () => {
      const event = { type: 'unknown_event' };
      const result = translateEvent(event as any);
      expect(result).toBeNull();
    });

    it('should handle agent_end event', () => {
      const event = {
        type: 'agent_end',
        messages: [{
          role: 'assistant',
          content: [{ type: 'text', text: 'Final answer' }],
          usage: { input: 100, output: 50, cost: { total: 0.001 } },
          stopReason: 'stop',
        }],
      };
      const result = translateEvent(event as any);
      expect(result?.type).toBe('done');
      if (result?.type === 'done') {
        expect(result.message).toBe('Final answer');
        expect(result.usage?.promptTokens).toBe(100);
        expect(result.usage?.completionTokens).toBe(50);
        expect(result.usage?.totalCost).toBe(0.001);
      }
    });

    it('should handle agent_end with error stop reason', () => {
      const event = {
        type: 'agent_end',
        messages: [{
          role: 'assistant',
          content: [],
          stopReason: 'error',
          errorMessage: 'Rate limit exceeded',
        }],
      };
      const result = translateEvent(event as any);
      expect(result?.type).toBe('error');
      if (result?.type === 'error') {
        expect(result.message).toBe('Rate limit exceeded');
      }
    });
  });

  describe('defaultCitationExtractor()', () => {
    it('should extract BOOK CHAPTER:VERSE citations', () => {
      const text = 'See [GEN 1:1] and [REV 22:21] for reference.';
      const citations = defaultCitationExtractor(text);
      expect(citations).toHaveLength(2);
      expect(citations[0]).toEqual({ book: 'GEN', chapter: 1, verse: 1 });
      expect(citations[1]).toEqual({ book: 'REV', chapter: 22, verse: 21 });
    });

    it('should return empty array for text without citations', () => {
      const citations = defaultCitationExtractor('No citations here.');
      expect(citations).toHaveLength(0);
    });

    it('should extract multiple citations from the same book', () => {
      const text = '[ROM 3:23] and [ROM 6:23]';
      const citations = defaultCitationExtractor(text);
      expect(citations).toHaveLength(2);
      expect(citations[0].chapter).toBe(3);
      expect(citations[1].chapter).toBe(6);
    });
  });

  describe('buildContext()', () => {
    it('should build context with system prompt, messages, and tools', () => {
      const messages = convertMessages([
        { role: 'user', content: 'Hello' },
      ]);
      const tools = [adaptTool({
        name: 'test',
        description: 'Test',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'ok',
      }, mockD1)];

      const context = buildContext('You are helpful.', messages, tools);
      expect(context.systemPrompt).toBe('You are helpful.');
      expect(context.messages).toHaveLength(1);
      expect(context.tools).toHaveLength(1);
      expect(context.tools[0].name).toBe('test');
    });
  });
});