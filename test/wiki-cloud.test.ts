/**
 * CloudWikiProvider Integration Tests
 * 
 * Tests scope isolation, FTS5 fallback, LIKE search, and compounding
 * knowledge with a realistic D1 mock.
 */

import { describe, it, expect } from 'vitest';
import { CloudWikiProvider } from '../src/wiki';
import type { WikiScope } from '../src/types';

interface Row {
  rowid: number;
  title: string;
  content: string;
  scope: string;
  user_id: string | null;
}

function createMockD1(withFts5 = false) {
  const store = new Map<string, Row>();
  let nextRowid = 1;

  // The store key uniquely identifies a page by scope + userId + title
  const key = (scope: string, userId: string | null, title: string) =>
    `${scope}::${userId ?? 'NULL'}::${title}`;

  const d1 = {
    prepare: (_sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: async () => {
          // INSERT OR REPLACE into wiki_pages
          // Non-personal: params = [title, content, scope] (SQL has NULL for user_id)
          // Personal: params = [title, content, scope, userId]
          const title = params[0] as string;
          const content = params[1] as string;
          const scope = params[2] as string;
          const userIdRaw = params.length >= 4 ? params[3] as string | null : null;
          const k = key(scope, userIdRaw, title);
          if (store.has(k)) {
            store.set(k, { ...store.get(k)!, content });
          } else {
            store.set(k, { rowid: nextRowid++, title, content, scope, user_id: userIdRaw });
          }
          return { meta: { changes: 1 } };
        },
        first: async () => {
          // FTS5 detection
          if (_sql.includes('sqlite_master')) {
            return withFts5 ? { name: 'wiki_pages_fts' } : null;
          }
          // SELECT content with user_id (personal scope)
          if (_sql.includes('user_id') && _sql.includes('SELECT content')) {
            const [title, scope, userId] = params as [string, string, string];
            for (const row of store.values()) {
              if (row.title === title && row.scope === scope && row.user_id === userId) {
                return { content: row.content };
              }
            }
            return null;
          }
          // SELECT content without user_id (global/community scope)
          if (_sql.includes('SELECT content')) {
            const [title, scope] = params as [string, string];
            for (const row of store.values()) {
              // Match by title and scope, and user_id must be null for non-personal
              if (row.title === title && row.scope === scope && row.user_id === null) {
                return { content: row.content };
              }
            }
            return null;
          }
          return null;
        },
        all: async () => {
          const results: { title: string }[] = [];
          
          // FTS5 MATCH search
          if (_sql.includes('MATCH')) {
            const queryStr = (params[0] as string).toLowerCase();
            const scope = params[1] as string;
            const isPersonal = _sql.includes('user_id');
            const userId = isPersonal ? params[2] as string : null;
            
            for (const row of store.values()) {
              if (row.scope !== scope) continue;
              if (isPersonal && row.user_id !== userId) continue;
              if (!isPersonal && row.user_id !== null) continue;
              if (row.content.toLowerCase().includes(queryStr) || row.title.toLowerCase().includes(queryStr)) {
                results.push({ title: row.title });
              }
            }
            return { results };
          }

          // LIKE search
          if (_sql.includes('content LIKE')) {
            const likeTerm = params[params.length - 1] as string;
            const searchTerm = likeTerm.replace(/%/g, '').toLowerCase();
            const isPersonal = _sql.includes('AND user_id');
            
            if (isPersonal) {
              const [scope, userId] = params as [string, string, string];
              for (const row of store.values()) {
                if (row.scope !== scope || row.user_id !== userId) continue;
                if (row.content.toLowerCase().includes(searchTerm) || row.title.toLowerCase().includes(searchTerm)) {
                  results.push({ title: row.title });
                }
              }
            } else {
              const [scope] = params as [string];
              for (const row of store.values()) {
                if (row.scope !== scope || row.user_id !== null) continue;
                if (row.content.toLowerCase().includes(searchTerm) || row.title.toLowerCase().includes(searchTerm)) {
                  results.push({ title: row.title });
                }
              }
            }
            return { results };
          }

          // SELECT title (list pages)
          if (_sql.includes('SELECT title')) {
            const isPersonal = _sql.includes('user_id');
            if (isPersonal) {
              const [scope, userId] = params as [string, string];
              for (const row of store.values()) {
                if (row.scope === scope && row.user_id === userId) {
                  results.push({ title: row.title });
                }
              }
            } else {
              const [scope] = params as [string];
              for (const row of store.values()) {
                if (row.scope === scope && row.user_id === null) {
                  results.push({ title: row.title });
                }
              }
            }
            return { results };
          }

          return { results };
        },
      }),
    }),
  };

  return d1;
}

describe('Sovereign Memory — CloudWikiProvider Integration', () => {
  describe('Scope Isolation via D1', () => {
    it('should keep personal pages invisible to other users', async () => {
      const d1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(d1));

      await provider.savePage('My Secret', 'Private thoughts about prayer.', 'personal', 'alice');

      // Bob can NOT find it
      const bobResults = await provider.search('prayer', ['personal'], 'bob');
      expect(bobResults).toEqual([]);

      // Alice CAN find it
      const aliceResults = await provider.search('prayer', ['personal'], 'alice');
      expect(aliceResults.length).toBeGreaterThan(0);
      expect(aliceResults).toContain('[personal] My Secret');
    });

    it('should allow all users to read global pages', async () => {
      const d1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(d1));

      await provider.savePage('Core Truth', 'God is love.', 'global');

      const result = await provider.search('love', ['global']);
      expect(result).toContain('[global] Core Truth');
    });

    it('should not leak community pages into personal search', async () => {
      const d1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(d1));

      await provider.savePage('Community Insight', 'Shared wisdom about prayer.', 'community');

      const personalOnly = await provider.search('prayer', ['personal'], 'alice');
      expect(personalOnly).toEqual([]);
    });

    it('should list pages per scope without cross-contamination', async () => {
      const d1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(d1));

      await provider.savePage('G1', 'Global 1', 'global');
      await provider.savePage('G2', 'Global 2', 'global');
      await provider.savePage('C1', 'Community 1', 'community');
      await provider.savePage('P1', 'Personal 1', 'personal', 'alice');

      const globalPages = await provider.listAllPages('global');
      const communityPages = await provider.listAllPages('community');
      const personalPages = await provider.listAllPages('personal', 'alice');

      expect(globalPages).toContain('G1');
      expect(globalPages).toContain('G2');
      expect(globalPages).not.toContain('C1');

      expect(communityPages).toContain('C1');
      expect(communityPages).not.toContain('G1');

      expect(personalPages).toContain('P1');
      expect(personalPages).not.toContain('G1');
    });
  });

  describe('FTS5 Detection and Fallback', () => {
    it('should use LIKE fallback when FTS5 is not available', async () => {
      const d1 = createMockD1(false);
      const provider = new CloudWikiProvider(() => Promise.resolve(d1));

      await provider.savePage('Grace Study', 'Grace is unmerited favor.', 'community');
      const results = await provider.search('grace', ['community']);
      expect(results).toContain('[community] Grace Study');
    });

    it('should use FTS5 when available', async () => {
      const d1 = createMockD1(true);
      const provider = new CloudWikiProvider(() => Promise.resolve(d1));

      await provider.savePage('Faith Study', 'Faith is the substance of things hoped for.', 'community');
      const results = await provider.search('faith', ['community']);
      expect(results).toContain('[community] Faith Study');
    });

    it('should throw when accessing personal scope without userId', async () => {
      const d1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(d1));

      await expect(provider.getPage('Test', 'personal')).rejects.toThrow('userId is required');
      await expect(provider.savePage('Test', 'Content', 'personal')).rejects.toThrow('userId is required');
    });
  });

  describe('Compounding Knowledge via D1', () => {
    it('should allow updating a page to compound knowledge', async () => {
      const d1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(d1));

      await provider.savePage('Romans', 'Justification by faith.', 'community');
      let content = await provider.getPage('Romans', 'community');
      expect(content).toBe('Justification by faith.');

      await provider.savePage('Romans', 'Justification by faith. Chapter 8: nothing can separate us.', 'community');
      content = await provider.getPage('Romans', 'community');
      expect(content).toContain('Justification by faith');
      expect(content).toContain('nothing can separate us');
    });

    it('should handle same title in different scopes', async () => {
      const d1 = createMockD1();
      const provider = new CloudWikiProvider(() => Promise.resolve(d1));

      await provider.savePage('Grace', 'Universal truth about grace.', 'global');
      await provider.savePage('Grace', 'Community understanding of grace.', 'community');
      await provider.savePage('Grace', 'My personal experience of grace.', 'personal', 'alice');

      const globalContent = await provider.getPage('Grace', 'global');
      const communityContent = await provider.getPage('Grace', 'community');
      const personalContent = await provider.getPage('Grace', 'personal', 'alice');

      expect(globalContent).toBe('Universal truth about grace.');
      expect(communityContent).toBe('Community understanding of grace.');
      expect(personalContent).toBe('My personal experience of grace.');
    });
  });
});