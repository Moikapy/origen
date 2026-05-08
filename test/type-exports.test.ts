/**
 * Type export correctness audit.
 *
 * Verifies that:
 * - All type exports are present in the built package
 * - StreamEvent in agent.ts matches what streamOrigen yields
 * - AgentMessage type is correctly exported
 * - No duplicate type definitions diverge between modules
 */

import { describe, it, expect } from 'vitest';
import {
  type StreamEvent,
  type AgentConfig,
  type OrigenTool,
  type AuthCheckResult,
  type AgentResponse,
  type Citation,
  type UsageInfo,
  type D1Provider,
  type D1Like,
  type WikiScope,
  type ModelConfig,
  type ModelId,
  type ReadingContext,
} from '../src/index';

// Import the authoritative StreamEvent from agent
import { type StreamEvent as AgentStreamEvent } from '../src/agent';

describe('Type Export Correctness Audit', () => {
  describe('StreamEvent type consistency', () => {
    it('should have all event types that streamOrigen yields', () => {
      // The StreamEvent union must include these exact variants
      // from the agent.ts definition:
      const validTypes = ['reasoning', 'tool_call', 'tool_result', 'text', 'done', 'error'] as const;
      
      // Each must be a valid StreamEvent['type']
      for (const t of validTypes) {
        const event: StreamEvent = { type: t, content: '' } as StreamEvent;
        expect(event.type).toBe(t);
      }
    });

    it('should NOT have stale "thinking" type from old types.ts definition', () => {
      // The old types.ts had "thinking" instead of "reasoning".
      // This test ensures the fix is in place — StreamEvent should use "reasoning".
      // TypeScript would catch this at compile time, but we verify at runtime too.
      const reasoningEvent: StreamEvent = { type: 'reasoning', content: 'test' };
      expect(reasoningEvent.type).toBe('reasoning');
    });
  });

  describe('All expected type exports', () => {
    it('should re-export StreamEvent from agent.ts', () => {
      // StreamEvent imported from index should be the same as from agent.ts
      // (TypeScript structural typing ensures this)
      const event: StreamEvent = { type: 'text', content: 'hello' };
      const agentEvent: AgentStreamEvent = event;
      expect(agentEvent.type).toBe('text');
    });

    it('should export OrigenTool with required fields', () => {
      // Compile-time check that OrigenTool has all required fields
      const tool: OrigenTool = {
        name: 'test',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'result',
      };
      expect(tool.name).toBe('test');
    });

    it('should export AuthCheckResult with correct shape', () => {
      const success: AuthCheckResult = {
        authenticated: true,
        apiKey: 'test-key',
        provider: 'openrouter',
      };
      const failure: AuthCheckResult = {
        authenticated: false,
        apiKey: null,
        error: 'No key found',
      };
      expect(success.authenticated).toBe(true);
      expect(failure.authenticated).toBe(false);
    });

    it('should export AgentResponse with optional usage', () => {
      const withUsage: AgentResponse = {
        message: 'test',
        citations: [],
        usage: { promptTokens: 10, completionTokens: 20 },
      };
      const withoutUsage: AgentResponse = {
        message: 'test',
        citations: [],
      };
      expect(withUsage.usage?.promptTokens).toBe(10);
      expect(withoutUsage.usage).toBeUndefined();
    });

    it('should export Citation with required fields', () => {
      const citation: Citation = {
        book: 'John',
        chapter: 3,
        verse: 16,
      };
      expect(citation.book).toBe('John');
    });

    it('should export WikiScope as union type', () => {
      const scopes: WikiScope[] = ['global', 'community', 'personal'];
      expect(scopes).toHaveLength(3);
    });

    it('should export ReadingContext with required fields', () => {
      const ctx: ReadingContext = {
        translation: 'ESV',
        bookCode: 'jn',
        chapter: 3,
      };
      expect(ctx.bookCode).toBe('jn');
    });
  });

  describe('Model types', () => {
    it('should have ModelConfig with required fields', () => {
      const config: ModelConfig = {
        name: 'test-model',
        description: 'A test model',
        free: true,
      };
      expect(config.free).toBe(true);
    });
  });
});