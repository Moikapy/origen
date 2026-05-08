/**
 * Sovereign Memory — Iteration 11: Agent Pipeline Integration Test
 * 
 * Verifies that wiki tools work through the FULL agent pipeline:
 * createWikiTools → OrigenTool conversion → adaptTools → AgentTool format
 * 
 * This tests the actual integration path that streamOrigen() uses.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { adaptTools } from '../src/adapter';
import { createWikiTools } from '../src/wiki-tools';
import { LocalWikiProvider } from '../src/wiki';
import type { OrigenTool, D1Provider } from '../src/types';

const TEST_DIR = './test-agent-pipeline-wiki';
const mockD1: D1Provider = async () => {
  throw new Error('D1 not needed for wiki tools');
};

describe('Sovereign Memory — Agent Pipeline Integration', () => {
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it('should adapt wiki tools into AgentTool format without errors', () => {
    const provider = new LocalWikiProvider(TEST_DIR);
    const wikiTools = createWikiTools(provider, 'test-user');

    // Convert wiki tools to OrigenTool format (same as streamOrigen does)
    const origenWikiTools: OrigenTool[] = wikiTools.map(wt => ({
      name: wt.name,
      description: wt.description,
      parameters: wt.parameters,
      // Wiki tools don't need D1, so we discard it
      execute: async (args: Record<string, unknown>) => await wt.execute(args),
    }));

    // This is the exact path streamOrigen takes
    const agentTools = adaptTools(origenWikiTools, mockD1);

    // All tools should be adapted successfully
    expect(agentTools.length).toBe(5); // update_page, get_page, query, list_pages, delete_page

    // Each should have the expected AgentTool properties
    for (const tool of agentTools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.execute).toBeTypeOf('function');
    }

    // Verify specific tool names
    const names = agentTools.map(t => t.name);
    expect(names).toContain('wiki_update_page');
    expect(names).toContain('wiki_get_page');
    expect(names).toContain('wiki_query');
    expect(names).toContain('wiki_list_pages');
    expect(names).toContain('wiki_delete_page');
  });

  it('should execute wiki tools through the adapted AgentTool pipeline', async () => {
    const provider = new LocalWikiProvider(TEST_DIR);
    const wikiTools = createWikiTools(provider, 'test-user');

    const origenWikiTools: OrigenTool[] = wikiTools.map(wt => ({
      name: wt.name,
      description: wt.description,
      parameters: wt.parameters,
      execute: async (args: Record<string, unknown>) => await wt.execute(args),
    }));

    const agentTools = adaptTools(origenWikiTools, mockD1);

    // Find the update tool
    const updateTool = agentTools.find(t => t.name === 'wiki_update_page')!;
    const queryTool = agentTools.find(t => t.name === 'wiki_query')!;
    const getPageTool = agentTools.find(t => t.name === 'wiki_get_page')!;
    const listTool = agentTools.find(t => t.name === 'wiki_list_pages')!;

    // Step 1: Write a page through the adapted tool
    const updateResult = await updateTool.execute('call_1', {
      title: 'Agent Pipeline Test',
      content: 'Knowledge compounded through the agent pipeline.',
      scope: 'community',
    }, undefined as any);

    expect(updateResult.content).toBeDefined();
    expect(updateResult.content[0].type).toBe('text');
    expect(updateResult.content[0].text).toContain('Successfully updated');
    expect(updateResult.content[0].text).toContain('Agent Pipeline Test');

    // Step 2: Search for it through the adapted tool
    const queryResult = await queryTool.execute('call_2', {
      query: 'agent pipeline',
      scopes: ['community'],
    }, undefined as any);

    expect(queryResult.content[0].text).toContain('Agent Pipeline Test');

    // Step 3: Read the full synthesis through the adapted tool
    const getResult = await getPageTool.execute('call_3', {
      title: 'Agent Pipeline Test',
      scope: 'community',
    }, undefined as any);

    expect(getResult.content[0].text).toBe('Knowledge compounded through the agent pipeline.');

    // Step 4: List pages through the adapted tool
    const listResult = await listTool.execute('call_4', {
      scope: 'community',
    }, undefined as any);

    expect(listResult.content[0].text).toContain('Agent Pipeline Test');
  });

  it('should enforce scope isolation through the adapted pipeline', async () => {
    const provider = new LocalWikiProvider(TEST_DIR);
    const aliceWikiTools = createWikiTools(provider, 'alice');
    const bobWikiTools = createWikiTools(provider, 'bob');

    // Convert Alice's tools to OrigenTool format
    const aliceOrigenTools: OrigenTool[] = aliceWikiTools.map(wt => ({
      name: wt.name,
      description: wt.description,
      parameters: wt.parameters,
      execute: async (args: Record<string, unknown>) => await wt.execute(args),
    }));

    const aliceAgentTools = adaptTools(aliceOrigenTools, mockD1);
    const updateTool = aliceAgentTools.find(t => t.name === 'wiki_update_page')!;

    // Alice saves a personal page
    await updateTool.execute('call_1', {
      title: 'My Private Note',
      content: 'This is only for Alice.',
      scope: 'personal',
    }, undefined as any);

    // Convert Bob's tools to OrigenTool format
    const bobOrigenTools: OrigenTool[] = bobWikiTools.map(wt => ({
      name: wt.name,
      description: wt.description,
      parameters: wt.parameters,
      execute: async (args: Record<string, unknown>) => await wt.execute(args),
    }));

    const bobAgentTools = adaptTools(bobOrigenTools, mockD1);
    const bobQueryTool = bobAgentTools.find(t => t.name === 'wiki_query')!;

    // Bob searches for Alice's personal page — should NOT find it
    const bobResult = await bobQueryTool.execute('call_2', {
      query: 'Private',
      scopes: ['personal'],
    }, undefined as any);

    expect(bobResult.content[0].text).toContain('No matching');
  });

  it('should handle multi-word AND queries through the pipeline', async () => {
    const provider = new LocalWikiProvider(TEST_DIR);
    const wikiTools = createWikiTools(provider, 'researcher');
    const origenTools: OrigenTool[] = wikiTools.map(wt => ({
      name: wt.name,
      description: wt.description,
      parameters: wt.parameters,
      execute: async (args: Record<string, unknown>) => await wt.execute(args),
    }));
    const agentTools = adaptTools(origenTools, mockD1);

    const updateTool = agentTools.find(t => t.name === 'wiki_update_page')!;

    // Page about prayer AND fasting
    await updateTool.execute('call_1', {
      title: 'Spiritual Disciplines',
      content: 'Prayer and fasting are key spiritual disciplines.',
      scope: 'community',
    });

    // Page about prayer only
    await updateTool.execute('call_2', {
      title: 'Morning Devotion',
      content: 'Prayer is the foundation of daily devotion.',
      scope: 'community',
    });

    const queryTool = agentTools.find(t => t.name === 'wiki_query')!;

    // Search for "prayer fasting" — AND logic should find ONLY the first page
    const result = await queryTool.execute('call_3', {
      query: 'prayer fasting',
      scopes: ['community'],
    }, undefined as any);

    expect(result.content[0].text).toContain('Spiritual Disciplines');
    expect(result.content[0].text).not.toContain('Morning Devotion');
  });
});