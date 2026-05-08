import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { LocalWikiProvider } from '../src/wiki';
import { createWikiTools } from '../src/wiki-tools';

describe('Wiki Tools Execution — Scoped', () => {
  const provider = new LocalWikiProvider('./test-tools-tiered-wiki');

  afterEach(async () => {
    await rm('./test-tools-tiered-wiki', { recursive: true, force: true });
  });

  it('should allow the agent to save and update wiki pages via tools', async () => {
    const tools = createWikiTools(provider);
    
    const updateTool = tools.find(t => t.name === 'wiki_update_page');
    expect(updateTool).toBeDefined();

    await updateTool!.execute({ 
      title: 'Knowledge Synthesis', 
      content: 'Initial knowledge.',
      scope: 'community',
    });
    
    let content = await provider.getPage('Knowledge Synthesis', 'community');
    expect(content).toBe('Initial knowledge.');

    // Update the same page (compounding knowledge)
    await updateTool!.execute({ 
      title: 'Knowledge Synthesis', 
      content: 'Updated synthesis with new findings.',
      scope: 'community',
    });

    content = await provider.getPage('Knowledge Synthesis', 'community');
    expect(content).toBe('Updated synthesis with new findings.');
  });

  it('should allow the agent to query the wiki', async () => {
    await provider.savePage('AI Architecture', 'This system uses a hybrid wiki.', 'global');
    
    const tools = createWikiTools(provider);
    const queryTool = tools.find(t => t.name === 'wiki_query');
    
    const result = await queryTool!.execute({ 
      query: 'hybrid wiki',
      scopes: ['global', 'community'],
    });
    
    expect(result).toContain('AI Architecture');
  });

  it('should allow the agent to list all pages in a scope', async () => {
    await provider.savePage('Page1', 'Content 1', 'global');
    await provider.savePage('Page2', 'Content 2', 'global');
    
    const tools = createWikiTools(provider);
    const listTool = tools.find(t => t.name === 'wiki_list_pages');
    
    const result = await listTool!.execute({ scope: 'global' });
    expect(result).toContain('Page1');
    expect(result).toContain('Page2');
  });

  it('should isolate personal scope from community scope', async () => {
    const tools = createWikiTools(provider, 'user-99');

    // Save a personal note
    const updateTool = tools.find(t => t.name === 'wiki_update_page')!;
    await updateTool.execute({
      title: 'Private Note',
      content: 'This is only for me.',
      scope: 'personal',
    });

    // Save a community page
    await updateTool.execute({
      title: 'Community Insight',
      content: 'This is for everyone.',
      scope: 'community',
    });

    const personalContent = await provider.getPage('Private Note', 'personal', 'user-99');
    const communityContent = await provider.getPage('Community Insight', 'community');

    expect(personalContent).toBe('This is only for me.');
    expect(communityContent).toBe('This is for everyone.');

    // Verify private note NOT in community
    const notInCommunity = await provider.getPage('Private Note', 'community');
    expect(notInCommunity).toBeNull();
  });
});