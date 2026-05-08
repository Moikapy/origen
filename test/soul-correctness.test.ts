/**
 * Benchmark: Soul.md specification correctness audit
 *
 * During performance benchmarking, discovered that `domain_focus` accepts
 * a string but `buildPrompt()` calls `.join()` on it, crashing at runtime.
 *
 * This audit systematically tests all Soul.md fields for:
 * 1. Type coercion (string vs array, string vs number)
 * 2. Missing/optional fields
 * 3. Edge cases in YAML parsing
 * 4. Profile override merging
 */

import { describe, it, expect } from 'vitest';
import { loadSoul } from '../src/soul';

describe('Soul.md Correctness Audit', () => {
  describe('Field type handling', () => {
    it('should handle domain_focus as array', () => {
      const soul = loadSoul(`---
id: test
name: Test
identity:
  domain_focus:
    - biblical studies
    - theology
---
Body text.`);
      const prompt = soul.buildPrompt();
      expect(prompt).toContain('Domain expertise: biblical studies, theology');
    });

    it('should handle domain_focus as string (common mistake)', () => {
      const soul = loadSoul(`---
id: test
name: Test
identity:
  domain_focus: biblical studies
---
Body text.`);
      // This SHOULD work — strings should be coerced to single-element arrays
      const prompt = soul.buildPrompt();
      expect(prompt).toContain('Domain expertise: biblical studies');
    });

    it('should handle domain_focus as comma-separated string', () => {
      const soul = loadSoul(`---
id: test
name: Test
identity:
  domain_focus: biblical studies, theology, church history
---
Body text.`);
      const prompt = soul.buildPrompt();
      // Should split on comma or at least handle as single-element
      expect(prompt).toContain('Domain expertise:');
    });

    it('should handle voice.formality as number', () => {
      const soul = loadSoul(`---
id: test
name: Test
voice:
  formality: 70
  warmth: 80
  verbosity: 40
  jargon: 30
---
Body text.`);
      const prompt = soul.buildPrompt();
      expect(prompt).toContain('professional');
      expect(prompt).toContain('warm and approachable');
      expect(prompt).toContain('concise');
    });

    it('should handle voice.formality as string number', () => {
      const soul = loadSoul(`---
id: test
name: Test
voice:
  formality: "70"
---
Body text.`);
      // YAML should parse "70" as string, not number
      // buildPrompt should handle this gracefully
      expect(() => soul.buildPrompt()).not.toThrow();
    });

    it('should handle empty optional fields', () => {
      const soul = loadSoul(`---
id: test
name: Test
---
Body text.`);
      const prompt = soul.buildPrompt();
      expect(prompt).toContain('You are Test.');
      // Should NOT contain empty sections
      expect(prompt).not.toContain('Domain expertise:');
      expect(prompt).not.toContain('Non-goals:');
      expect(prompt).not.toContain('Priorities');
      expect(prompt).not.toContain('Forbidden patterns');
    });

    it('should handle null values gracefully', () => {
      const soul = loadSoul(`---
id: test
name: Test
voice:
  formality: null
  warmth: null
  verbosity: null
---
Body text.`);
      // Should not crash on null values
      expect(() => soul.buildPrompt()).not.toThrow();
    });

    it('should handle banned_phrases with quoted strings', () => {
      const soul = loadSoul(`---
id: test
name: Test
voice:
  banned_phrases:
    - "As an AI"
    - "I'd be happy to help"
  preferred_phrases:
    - "Let's explore"
---
Body text.`);
      const prompt = soul.buildPrompt();
      expect(prompt).toContain('Never say: "As an AI", "I\'d be happy to help"');
      expect(prompt).toContain('Prefer: "Let\'s explore"');
    });
  });

  describe('Profile override merging', () => {
    it('should deep merge profile overrides', () => {
      const soul = loadSoul(`---
id: test
name: Test
voice:
  formality: 70
  warmth: 80
  verbosity: 40
profiles:
  - default
  - concise
profile_overrides:
  concise:
    voice:
      verbosity: 20
---
Body text.`);
      const concise = soul.selectProfile('concise');
      const prompt = concise.buildPrompt();
      // Concise override should set verbosity to 20 (extremely concise)
      expect(prompt).toContain('extremely concise');
      // Should retain other voice settings from base
      expect(prompt).toContain('professional'); // formality: 70
    });

    it('should return same soul for unknown profile', () => {
      const soul = loadSoul(`---
id: test
name: Test
profiles:
  - default
---
Body text.`);
      const same = soul.selectProfile('nonexistent');
      expect(same.config.name).toBe('Test');
      // Should return self unchanged
      expect(same).toBe(soul);
    });
  });

  describe('YAML parser robustness', () => {
    it('should handle inline list syntax', () => {
      const soul = loadSoul(`---
id: test
name: Test
identity:
  non_goals: [medical advice, political commentary]
---
Body text.`);
      const prompt = soul.buildPrompt();
      expect(prompt).toContain('Non-goals: medical advice, political commentary');
    });

    it('should handle numeric string values', () => {
      const soul = loadSoul(`---
id: test
name: Test
relationship:
  trust_baseline: 0.8
---
Body text.`);
      const prompt = soul.buildPrompt();
      // Should not crash
      expect(prompt).toContain('You are Test');
    });

    it('should handle empty YAML body', () => {
      const soul = loadSoul(`---
id: test
name: Test
---
`);
      const prompt = soul.buildPrompt();
      expect(prompt).toContain('You are Test.');
    });

    it('should handle no front matter at all', () => {
      expect(() => loadSoul('Just some text')).toThrow('Soul.md missing required field: id');
    });

    it('should handle quoted strings with special characters', () => {
      const soul = loadSoul(`---
id: "test-with-dashes"
name: "Test Agent: The Sequel"
---
Body text.`);
      expect(soul.config.id).toBe('test-with-dashes');
      expect(soul.config.name).toBe('Test Agent: The Sequel');
    });
  });

  describe('buildPrompt completeness', () => {
    it('should include all sections for a full persona', () => {
      const soul = loadSoul(`---
id: full-test
name: Scholar
identity:
  role: Study Companion
  archetype: Scholar
  domain_focus:
    - biblical studies
    - theology
  non_goals:
    - medical advice
relationship:
  stance: peer
  user_model_default: intermediate
  trust_baseline: 0.8
values:
  priorities:
    - Accuracy
    - Depth
    - Charity
  taboo:
    - Fabricating sources
voice:
  formality: 60
  warmth: 70
  verbosity: 50
  jargon: 40
  banned_phrases:
    - "As an AI"
  preferred_phrases:
    - "Consider this"
interaction:
  clarifying_questions: when_ambiguous
  uncertainty: explicit
  disagreement: soft
  confirmations: implicit
cognition:
  mode: analytical
safety:
  refusal_style: brief
  speculation: mark
  no_fabrication: true
actions:
  when_to_use_tools: when_needed
  explain_actions: brief
---
Additional instructions here.`);
      const prompt = soul.buildPrompt();
      
      // Identity
      expect(prompt).toContain('Scholar');
      expect(prompt).toContain('Study Companion');
      expect(prompt).toContain('Domain expertise: biblical studies, theology');
      expect(prompt).toContain('Non-goals: medical advice');
      
      // Relationship
      expect(prompt).toContain('collaborate');
      expect(prompt).toContain('moderate familiarity');
      
      // Values
      expect(prompt).toContain('Priorities');
      expect(prompt).toContain('1. Accuracy');
      
      // Voice
      expect(prompt).toContain('Voice & Style');
      
      // Interaction
      expect(prompt).toContain('Interaction Policy');
      
      // Cognition
      expect(prompt).toContain('Cognition');
      
      // Safety
      expect(prompt).toContain('Safety');
      expect(prompt).toContain('Never fabricate');
      
      // Actions
      expect(prompt).toContain('Actions');
      
      // Body
      expect(prompt).toContain('Additional instructions here');
    });
  });
});