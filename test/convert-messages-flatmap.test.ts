/**
 * TDD test: convertMessages must produce assistant content that survives
 * pi-ai's transformMessages, which calls .flatMap() on assistant content.
 *
 * BUG: assistant messages with string content crash when pi-ai processes them:
 *   assistantMsg.content.flatMap is not a function
 *
 * This test verifies the fix: assistant content must be normalized to
 * an array of content blocks [{type: "text", text: "..."}].
 */

import { describe, it, expect } from 'vitest';
import { convertMessages } from '../src/adapter';

describe('convertMessages flatMap crash prevention', () => {
  it('assistant message content must be an array (not a string)', () => {
    const messages = [
      { role: 'user' as const, content: 'What is grace?' },
      { role: 'assistant' as const, content: 'Grace is unmerited favor.' },
    ];
    const result = convertMessages(messages);
    
    // User message content stays as string (pi-ai accepts both)
    expect(typeof result[0].content).toBe('string');
    
    // Assistant message content MUST be an array for .flatMap() to work
    // in pi-ai's transformMessages
    expect(Array.isArray(result[1].content)).toBe(true);
  });

  it('assistant content array should contain text blocks', () => {
    const messages = [
      { role: 'assistant' as const, content: 'Hello world' },
    ];
    const result = convertMessages(messages);
    
    const content = result[0].content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');
    expect(content[0].text).toBe('Hello world');
  });

  it('empty assistant content should produce empty array', () => {
    const messages = [
      { role: 'assistant' as const, content: '' },
    ];
    const result = convertMessages(messages);
    
    expect(Array.isArray(result[0].content)).toBe(true);
    expect((result[0].content as unknown[]).length).toBe(0);
  });

  it('assistant content with .flatMap() must not throw', () => {
    const messages = [
      { role: 'assistant' as const, content: 'Test message' },
    ];
    const result = convertMessages(messages);
    
    // This is the exact operation that crashes when content is a string
    // Mimics: assistantMsg.content.flatMap((block) => { ... })
    const content = result[0].content as Array<{ type: string }>;
    expect(() => {
      content.flatMap((block: { type: string }) => {
        if (block.type === 'text') return [block];
        return [];
      });
    }).not.toThrow();
  });

  it('user message content should remain as string', () => {
    const messages = [
      { role: 'user' as const, content: 'What does the Bible say about faith?' },
    ];
    const result = convertMessages(messages);
    
    // User messages pass through as-is (string is valid for pi-ai UserMessage)
    expect(result[0].content).toBe('What does the Bible say about faith?');
    expect(typeof result[0].content).toBe('string');
  });

  it('mixed conversation: user strings + assistant arrays', () => {
    const messages = [
      { role: 'user' as const, content: 'Hi' },
      { role: 'assistant' as const, content: 'Hello!' },
      { role: 'user' as const, content: 'Tell me more' },
      { role: 'assistant' as const, content: 'Sure thing' },
    ];
    const result = convertMessages(messages);
    
    expect(result).toHaveLength(4);
    // Users stay as strings
    expect(typeof result[0].content).toBe('string');
    expect(typeof result[2].content).toBe('string');
    // Assistants are arrays
    expect(Array.isArray(result[1].content)).toBe(true);
    expect(Array.isArray(result[3].content)).toBe(true);
  });

  it('multi-line assistant content preserves full text', () => {
    const longText = 'Line 1\nLine 2\nLine 3\n\n**Bold** and *italic*';
    const messages = [
      { role: 'assistant' as const, content: longText },
    ];
    const result = convertMessages(messages);
    
    const content = result[0].content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe(longText);
  });
});