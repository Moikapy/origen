import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { LocalWikiProvider, CloudWikiProvider } from '../src/wiki';
import { createWikiTools } from '../src/wiki-tools';
import type { WikiScope } from '../src/types';

const TEST_DIR = './test-tiered-wiki';

describe('Sovereign Memory — Tiered Wiki', () => {
  // ── Local Provider Tests ──────────────────────────────────────────

  describe('LocalWikiProvider — Scoped Storage', () => {
    let provider: LocalWikiProvider;

    beforeEach(() => {
      provider = new LocalWikiProvider(TEST_DIR);
    });

    afterEach(async () => {
      await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should save and retrieve a GLOBAL page', async () => {
      await provider.savePage('Core Doctrine', 'God is love.', 'global');
      const content = await provider.getPage('Core Doctrine', 'global');
      expect(content).toBe('God is love.');
    });

    it('should save and retrieve a COMMUNITY page', async () => {
      await provider.savePage('Common Questions', 'Many ask about grace.', 'community');
      const content = await provider.getPage('Common Questions', 'community');
      expect(content).toBe('Many ask about grace.');
    });

    it('should save and retrieve a PERSONAL page for a specific user', async () => {
      await provider.savePage('My Journey', 'Struggled with Romans 7.', 'personal', 'user-123');
      const content = await provider.getPage('My Journey', 'personal', 'user-123');
      expect(content).toBe('Struggled with Romans 7.');
    });

    it('should NOT leak personal pages across users', async () => {
      await provider.savePage('My Journey', 'Private note.', 'personal', 'user-123');
      await provider.savePage('My Journey', 'Different note.', 'personal', 'user-456');
      
      const content123 = await provider.getPage('My Journey', 'personal', 'user-123');
      const content456 = await provider.getPage('My Journey', 'personal', 'user-456');
      
      expect(content123).toBe('Private note.');
      expect(content456).toBe('Different note.');
    });

    it('should NOT leak personal pages into global scope', async () => {
      await provider.savePage('Secret', 'Private data.', 'personal', 'user-123');
      const content = await provider.getPage('Secret', 'global');
      expect(content).toBeNull();
    });

    it('should search across multiple scopes', async () => {
      await provider.savePage('Grace', 'Grace is unmerited favor.', 'global');
      await provider.savePage('Faith', 'Faith connects to grace.', 'community');
      await provider.savePage('Prayer', 'Prayer deepens faith.', 'personal', 'user-123');

      const results = await provider.search('grace', ['global', 'community'], 'user-123');
      expect(results).toContain('[global] Grace');
      expect(results).toContain('[community] Faith');
      expect(results).not.toContain('[personal] Prayer');
    });

    it('should search personal scope when specified', async () => {
      await provider.savePage('Prayer', 'Prayer deepens faith.', 'personal', 'user-123');

      const withPersonal = await provider.search('prayer', ['global', 'community', 'personal'], 'user-123');
      const withoutPersonal = await provider.search('prayer', ['global', 'community'], 'user-123');

      expect(withPersonal).toContain('[personal] Prayer');
      expect(withoutPersonal).not.toContain('[personal] Prayer');
    });

    it('should list pages per scope', async () => {
      await provider.savePage('Alpha', 'First.', 'global');
      await provider.savePage('Beta', 'Second.', 'community');
      await provider.savePage('Gamma', 'Third.', 'personal', 'user-123');

      const globalPages = await provider.listAllPages('global');
      const communityPages = await provider.listAllPages('community');
      const personalPages = await provider.listAllPages('personal', 'user-123');

      expect(globalPages).toContain('Alpha');
      expect(globalPages).not.toContain('Beta');
      expect(communityPages).toContain('Beta');
      expect(personalPages).toContain('Gamma');
    });
  });

  // ── Cloud Provider Tests ──────────────────────────────────────────

  describe('CloudWikiProvider — Scoped D1 Storage', () => {
    function createMockD1() {
      const store = new Map<string, { content: string; scope: string; user_id: string | null }>();
      return {
        prepare: (sql: string) => ({
          bind: (...params: any[]) => ({
            run: async () => {
              // INSERT OR REPLACE
              if (sql.includes('INSERT OR REPLACE')) {
                const [title, content, scope, userId] = params;
                const key = `${scope}:${title}:${userId ?? 'NULL'}`;
                store.set(key, { content, scope, user_id: userId ?? null });
                return { meta: { changes: 1 } };
              }
            },
            first: async () => {
              // SELECT WHERE title AND scope (AND user_id)
              if (sql.includes('user_id')) {
                const [title, scope, userId] = params;
                const key = `${scope}:${title}:${userId}`;
                const entry = store.get(key);
                return entry ? { content: entry.content } : null;
              }
              const [title, scope] = params;
              for (const [key, val] of store) {
                if (val.scope === scope && key.includes(title)) {
                  return { content: val.content };
                }
              }
              return null;
            },
            all: async () => {
              // SELECT WHERE scope (AND user_id AND content LIKE)
              const results: any[] = [];
              for (const [key, val] of store) {
                if (sql.includes('content LIKE')) {
                  const query = params[params.length - 1] as string;
                  const searchTerm = query.replace(/%/g, '').toLowerCase();
                  if (val.content.toLowerCase().includes(searchTerm)) {
                    results.push({ title: key.split(':')[1] });
                  }
                } else if (sql.includes('user_id')) {
                  const [scope, userId] = params;
                  if (val.scope === scope && val.user_id === userId) {
                    results.push({ title: key.split(':')[1] });
                  }
                } else {
                  const [scope] = params;
                  if (val.scope === scope) {
                    results.push({ title: key.split(':')[1] });
                  }
                }
              }
              return { results };
            },
          }),
        }),
      };
    }

    it('should save and retrieve a GLOBAL page via D1', async () => {
      const mockD1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(mockD1));
      await provider.savePage('Core Doctrine', 'God is love.', 'global');
      const content = await provider.getPage('Core Doctrine', 'global');
      expect(content).toBe('God is love.');
    });

    it('should save and retrieve a PERSONAL page via D1', async () => {
      const mockD1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(mockD1));
      await provider.savePage('My Journey', 'Private note.', 'personal', 'user-789');
      const content = await provider.getPage('My Journey', 'personal', 'user-789');
      expect(content).toBe('Private note.');
    });

    it('should NOT leak personal pages across users in D1', async () => {
      const mockD1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(mockD1));
      await provider.savePage('Note', 'User A data.', 'personal', 'user-a');
      await provider.savePage('Note', 'User B data.', 'personal', 'user-b');

      const contentA = await provider.getPage('Note', 'personal', 'user-a');
      const contentB = await provider.getPage('Note', 'personal', 'user-b');

      expect(contentA).toBe('User A data.');
      expect(contentB).toBe('User B data.');
    });

    it('should throw when accessing personal scope without userId', async () => {
      const mockD1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(mockD1));
      await expect(provider.getPage('Note', 'personal')).rejects.toThrow('userId is required');
    });
  });

  // ── Tool Execution Tests ──────────────────────────────────────────

  describe('Wiki Tools — Scoped Execution', () => {
    const provider = new LocalWikiProvider('./test-tools-tiered-wiki');

    afterEach(async () => {
      await rm('./test-tools-tiered-wiki', { recursive: true, force: true });
    });

    it('should update a page in the GLOBAL scope', async () => {
      const tools = createWikiTools(provider);
      const updateTool = tools.find(t => t.name === 'wiki_update_page')!;

      const result = await updateTool.execute({
        title: 'Core Truth',
        content: 'The canon.',
        scope: 'global',
      });

      expect(result).toContain('global');
      const content = await provider.getPage('Core Truth', 'global');
      expect(content).toBe('The canon.');
    });

    it('should update a page in the PERSONAL scope with a userId', async () => {
      const tools = createWikiTools(provider, 'user-42');
      const updateTool = tools.find(t => t.name === 'wiki_update_page')!;

      await updateTool.execute({
        title: 'My Note',
        content: 'Personal insight.',
        scope: 'personal',
      });

      const content = await provider.getPage('My Note', 'personal', 'user-42');
      expect(content).toBe('Personal insight.');
    });

    it('should query across multiple scopes', async () => {
      await provider.savePage('Alpha', 'Universal truth.', 'global', undefined);
      await provider.savePage('Beta', 'Community wisdom.', 'community', undefined);
      await provider.savePage('Gamma', 'Personal journal.', 'personal', 'user-42');

      const tools = createWikiTools(provider, 'user-42');
      const queryTool = tools.find(t => t.name === 'wiki_query')!;

      const result = await queryTool.execute({
        query: 'truth',
        scopes: ['global', 'community', 'personal'],
      });

      expect(result).toContain('[global] Alpha');
    });

    it('should list pages in a specific scope', async () => {
      await provider.savePage('Global Page', 'Content.', 'global', undefined);
      await provider.savePage('Community Page', 'Content.', 'community', undefined);

      const tools = createWikiTools(provider);
      const listTool = tools.find(t => t.name === 'wiki_list_pages')!;

      const result = await listTool.execute({ scope: 'global' });
      expect(result).toContain('Global Page');
      expect(result).not.toContain('Community Page');
    });
  });
});