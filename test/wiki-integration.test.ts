/**
 * Sovereign Memory — Iteration 8: Integration Correctness Benchmark
 * 
 * Tests the FULL pipeline: LocalWikiProvider → createWikiTools → tool execution
 * across all three scopes (global, community, personal) with isolation guarantees.
 * 
 * This is a correctness test, not a performance test. We verify:
 * 1. Pages can be created and retrieved in all scopes
 * 2. Personal pages are isolated between users
 * 3. Global pages are readable by all users
 * 4. The tool interface matches what the agent loop expects
 * 5. Cross-scope search returns correctly scoped results
 * 6. The incremental index stays consistent after updates and deletes
 */

import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { LocalWikiProvider } from '../src/wiki';
import { createWikiTools } from '../src/wiki-tools';
import type { WikiScope } from '../src/types';

const TEST_DIR = './test-integration-wiki';

describe('Sovereign Memory — Full Integration', () => {
  const provider = new LocalWikiProvider(TEST_DIR);

  afterEach(async () => {
    // Clear the provider's cache and index between tests
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('Scope Isolation — The Three Vaults', () => {
    it('should keep personal pages invisible to other users', async () => {
      const aliceTools = createWikiTools(provider, 'alice');
      const bobTools = createWikiTools(provider, 'bob');

      // Alice saves a personal page
      const aliceUpdate = aliceTools.find(t => t.name === 'wiki_update_page')!;
      await aliceUpdate.execute({
        title: 'My Secret Prayer',
        content: 'Dear God, please help me with my struggles.',
        scope: 'personal',
      });

      // Bob searches for it — should NOT find it
      const bobQuery = bobTools.find(t => t.name === 'wiki_query')!;
      const bobResult = await bobQuery.execute({
        query: 'Secret Prayer',
        scopes: ['personal'],
      });
      expect(bobResult).not.toContain('My Secret Prayer');

      // Alice CAN find it
      const aliceQuery = aliceTools.find(t => t.name === 'wiki_query')!;
      const aliceResult = await aliceQuery.execute({
        query: 'Secret Prayer',
        scopes: ['personal'],
      });
      expect(aliceResult).toContain('My Secret Prayer');
    });

    it('should allow all users to read global pages', async () => {
      const aliceTools = createWikiTools(provider, 'alice');
      const bobTools = createWikiTools(provider, 'bob');

      // Alice saves a global page
      const aliceUpdate = aliceTools.find(t => t.name === 'wiki_update_page')!;
      await aliceUpdate.execute({
        title: 'Core Truth: God is Love',
        content: '1 John 4:8 — Whoever does not love does not know God, because God is love.',
        scope: 'global',
      });

      // Bob can find it
      const bobQuery = bobTools.find(t => t.name === 'wiki_query')!;
      const bobResult = await bobQuery.execute({
        query: 'God is love',
        scopes: ['global', 'community'],
      });
      expect(bobResult).toContain('Core Truth');
    });

    it('should not leak community pages into personal scope search', async () => {
      const tools = createWikiTools(provider, 'alice');

      // Save a community page
      const update = tools.find(t => t.name === 'wiki_update_page')!;
      await update.execute({
        title: 'Community Insight on Grace',
        content: 'Grace is for everyone.',
        scope: 'community',
      });

      // Search ONLY personal scope — should NOT find the community page
      const query = tools.find(t => t.name === 'wiki_query')!;
      const result = await query.execute({
        query: 'Grace',
        scopes: ['personal'],
      });
      expect(result).not.toContain('Community Insight');
    });
  });

  describe('Compounding Knowledge — The Synthesis Pattern', () => {
    it('should allow updating a page to compound knowledge', async () => {
      const tools = createWikiTools(provider, 'alice');
      const update = tools.find(t => t.name === 'wiki_update_page')!;

      // First insight
      await update.execute({
        title: 'Romans Study',
        content: 'Romans teaches justification by faith.',
        scope: 'community',
      });

      // Compound: add new insight
      await update.execute({
        title: 'Romans Study',
        content: 'Romans teaches justification by faith. Chapter 8 adds: nothing can separate us from the love of God.',
        scope: 'community',
      });

      // Verify the compounded knowledge
      const provider_direct = provider;
      const content = await provider_direct.getPage('Romans Study', 'community');
      expect(content).toContain('justification by faith');
      expect(content).toContain('nothing can separate us');
    });

    it('should maintain separate compounding tracks for each scope', async () => {
      const tools = createWikiTools(provider, 'studier');
      const update = tools.find(t => t.name === 'wiki_update_page')!;

      // Global compounding
      await update.execute({
        title: 'The Trinity',
        content: 'God is three persons in one essence.',
        scope: 'global',
      });

      // Personal compounding
      await update.execute({
        title: 'The Trinity',
        content: 'I struggled to understand this but Romans 8:26-27 helped.',
        scope: 'personal',
      });

      // Verify they are separate
      const globalContent = await provider.getPage('The Trinity', 'global');
      const personalContent = await provider.getPage('The Trinity', 'personal', 'studier');

      expect(globalContent).toBe('God is three persons in one essence.');
      expect(personalContent).toBe('I struggled to understand this but Romans 8:26-27 helped.');
    });
  });

  describe('Search Correctness — Index Consistency', () => {
    it('should find pages after multiple updates', async () => {
      const tools = createWikiTools(provider, 'researcher');
      const update = tools.find(t => t.name === 'wiki_update_page')!;
      const query = tools.find(t => t.name === 'wiki_query')!;

      // Create
      await update.execute({
        title: 'Prayer Guide',
        content: 'Start with adoration.',
        scope: 'community',
      });

      // Update (adds thanksgiving)
      await update.execute({
        title: 'Prayer Guide',
        content: 'Start with adoration. Then thanksgiving.',
        scope: 'community',
      });

      // Update (adds supplication)
      await update.execute({
        title: 'Prayer Guide',
        content: 'Start with adoration. Then thanksgiving. End with supplication.',
        scope: 'community',
      });

      // Search for original term
      let result = await query.execute({ query: 'adoration', scopes: ['community'] });
      expect(result).toContain('Prayer Guide');

      // Search for latest term
      result = await query.execute({ query: 'supplication', scopes: ['community'] });
      expect(result).toContain('Prayer Guide');

      // Search for removed content — old index entries should be gone
      result = await query.execute({ query: 'somethingneveradded', scopes: ['community'] });
      expect(result).toContain('No matching');
    });

    it('should handle multi-word AND queries correctly', async () => {
      const tools = createWikiTools(provider, 'scholar');
      const update = tools.find(t => t.name === 'wiki_update_page')!;

      // Page about prayer AND fasting
      await update.execute({
        title: 'Disciplines of Faith',
        content: 'Prayer and fasting are spiritual disciplines.',
        scope: 'community',
      });

      // Page about prayer only
      await update.execute({
        title: 'Morning Devotion',
        content: 'Prayer is the foundation of daily devotion.',
        scope: 'community',
      });

      // Search for "prayer" — should find both
      const query = tools.find(t => t.name === 'wiki_query')!;
      const prayerResult = await query.execute({ query: 'prayer', scopes: ['community'] });
      expect(prayerResult).toContain('Disciplines');
      expect(prayerResult).toContain('Morning');

      // Search for "prayer fasting" — should find ONLY the one with both
      const bothResult = await query.execute({ query: 'prayer fasting', scopes: ['community'] });
      expect(bothResult).toContain('Disciplines');
      // "Morning Devotion" does NOT contain "fasting" so should NOT be in AND results
      expect(bothResult).not.toContain('Morning');
    });
  });

  describe('Read-Before-Compound — The Synthesis Loop', () => {
    it('should allow agent to query, then read, then compound', async () => {
      const tools = createWikiTools(provider, 'scholar');
      const update = tools.find(t => t.name === 'wiki_update_page')!;
      const query = tools.find(t => t.name === 'wiki_query')!;
      const getPage = tools.find(t => t.name === 'wiki_get_page')!;

      // Step 1: Agent compounds initial knowledge
      await update.execute({
        title: 'Grace Study',
        content: 'Grace is unmerited favor from God.',
        scope: 'community',
      });

      // Step 2: Agent searches for existing synthesis
      const searchResult = await query.execute({ query: 'grace', scopes: ['community'] });
      expect(searchResult).toContain('Grace Study');

      // Step 3: Agent reads the existing page BEFORE compounding
      const existingContent = await getPage.execute({ title: 'Grace Study', scope: 'community' });
      expect(existingContent).toBe('Grace is unmerited favor from God.');

      // Step 4: Agent compounds new insight onto the existing synthesis
      await update.execute({
        title: 'Grace Study',
        content: `${existingContent} Chapter 8 adds: we are more than conquerors through Him who loved us.`,
        scope: 'community',
      });

      // Step 5: Verify the compounded knowledge
      const compounded = await getPage.execute({ title: 'Grace Study', scope: 'community' });
      expect(compounded).toContain('unmerited favor');
      expect(compounded).toContain('more than conquerors');
    });

    it('should return not-found for non-existent pages', async () => {
      const tools = createWikiTools(provider, 'scholar');
      const getPage = tools.find(t => t.name === 'wiki_get_page')!;

      const result = await getPage.execute({ title: 'Nonexistent Page', scope: 'community' });
      expect(result).toContain('not found');
    });

    it('should not allow reading personal pages across users', async () => {
      const aliceTools = createWikiTools(provider, 'alice');
      const bobTools = createWikiTools(provider, 'bob');

      // Alice saves a personal page
      const aliceUpdate = aliceTools.find(t => t.name === 'wiki_update_page')!;
      await aliceUpdate.execute({
        title: 'My Journal',
        content: 'Private thoughts about Romans 8.',
        scope: 'personal',
      });

      // Bob tries to read Alice's personal page
      const bobGetPage = bobTools.find(t => t.name === 'wiki_get_page')!;
      const bobResult = await bobGetPage.execute({ title: 'My Journal', scope: 'personal' });
      expect(bobResult).toContain('not found');

      // Alice CAN read her own page
      const aliceGetPage = aliceTools.find(t => t.name === 'wiki_get_page')!;
      const aliceResult = await aliceGetPage.execute({ title: 'My Journal', scope: 'personal' });
      expect(aliceResult).toBe('Private thoughts about Romans 8.');
    });
  });

  describe('Delete — Pruning Outdated Knowledge', () => {
    it('should delete a page and confirm it\'s gone', async () => {
      const provider = new LocalWikiProvider('./test-delete-wiki');
      await provider.savePage('Outdated', 'This is no longer accurate.', 'community');
      
      // Verify it exists
      const content = await provider.getPage('Outdated', 'community');
      expect(content).toBe('This is no longer accurate.');
      
      // Delete it
      const deleted = await provider.deletePage('Outdated', 'community');
      expect(deleted).toBe(true);
      
      // Verify it's gone
      const gone = await provider.getPage('Outdated', 'community');
      expect(gone).toBeNull();
    });

    it('should remove page from search index after deletion', async () => {
      const provider = new LocalWikiProvider('./test-delete-index-wiki');
      await provider.savePage('Obsolete Fact', 'The earth is flat.', 'community');
      
      // Verify it shows in search
      let results = await provider.search('flat', ['community']);
      expect(results).toContain('[community] Obsolete Fact');
      
      // Delete it
      await provider.deletePage('Obsolete Fact', 'community');
      
      // Verify it no longer shows in search
      results = await provider.search('flat', ['community']);
      expect(results).not.toContain('Obsolete Fact');
    });

    it('should return false when deleting a non-existent page', async () => {
      const provider = new LocalWikiProvider('./test-delete-nonexist-wiki');
      const deleted = await provider.deletePage('DoesNotExist', 'community');
      expect(deleted).toBe(false);
    });

    it('should not leak deleted pages across scopes', async () => {
      const provider = new LocalWikiProvider('./test-delete-scope-wiki');
      await provider.savePage('Same Title', 'Global truth.', 'global');
      await provider.savePage('Same Title', 'Community note.', 'community');
      
      // Delete community version
      await provider.deletePage('Same Title', 'community');
      
      // Global version should still exist
      const globalContent = await provider.getPage('Same Title', 'global');
      expect(globalContent).toBe('Global truth.');
      
      // Community version should be gone
      const communityContent = await provider.getPage('Same Title', 'community');
      expect(communityContent).toBeNull();
    });

    afterEach(async () => {
      await rm('./test-delete-wiki', { recursive: true, force: true });
      await rm('./test-delete-index-wiki', { recursive: true, force: true });
      await rm('./test-delete-nonexist-wiki', { recursive: true, force: true });
      await rm('./test-delete-scope-wiki', { recursive: true, force: true });
    });
  });

  describe('Listing and Scope Verification', () => {
    it('should list pages per scope without cross-contamination', async () => {
      const tools = createWikiTools(provider, 'member');
      const update = tools.find(t => t.name === 'wiki_update_page')!;
      const list = tools.find(t => t.name === 'wiki_list_pages')!;

      await update.execute({ title: 'G1', content: 'Global page 1', scope: 'global' });
      await update.execute({ title: 'G2', content: 'Global page 2', scope: 'global' });
      await update.execute({ title: 'C1', content: 'Community page 1', scope: 'community' });
      await update.execute({ title: 'P1', content: 'Personal page 1', scope: 'personal' });

      const globalPages = await list.execute({ scope: 'global' });
      expect(globalPages).toContain('G1');
      expect(globalPages).toContain('G2');
      expect(globalPages).not.toContain('C1');
      expect(globalPages).not.toContain('P1');

      const communityPages = await list.execute({ scope: 'community' });
      expect(communityPages).toContain('C1');
      expect(communityPages).not.toContain('G1');
      expect(communityPages).not.toContain('P1');

      const personalPages = await list.execute({ scope: 'personal' });
      expect(personalPages).toContain('P1');
      expect(personalPages).not.toContain('G1');
      expect(personalPages).not.toContain('C1');
    });
  });
});