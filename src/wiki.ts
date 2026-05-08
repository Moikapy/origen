import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { WikiProvider, WikiScope } from './types';

export type { WikiProvider } from './types';

/**
 * Local filesystem-based wiki provider with in-memory cache.
 * 
 * Strategy: Linear scan + LRU cache. The benchmark proved that for local
 * filesystem storage, reading pages into memory and scanning them with
 * String.includes (V8-optimized) beats any index approach due to the
 * overhead of JSON serialization/deserialization. The cache eliminates
 * disk I/O on repeated searches.
 * 
 * Cache policy:
 * - Pages are cached on first read or write
 * - Cache is invalidated when a page is saved (content may have changed)
 * - Cache key = "{scope}:{userId}:{title}" for isolation
 * - No size limit — wiki pages are small and the dataset is bounded
 */
export class LocalWikiProvider implements WikiProvider {
  private cache = new Map<string, string>();

  constructor(private rootDir: string) {}

  private cacheKey(title: string, scope: WikiScope, userId?: string): string {
    return `${scope}:${userId ?? '_'}:${title}`;
  }

  private getPath(title: string, scope: WikiScope, userId?: string): string {
    if (scope === 'personal') {
      if (!userId) throw new Error('userId is required for personal scope');
      return join(this.rootDir, 'personal', userId, `${title}.md`);
    }
    return join(this.rootDir, scope, `${title}.md`);
  }

  async getPage(title: string, scope: WikiScope, userId?: string): Promise<string | null> {
    const key = this.cacheKey(title, scope, userId);
    
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    try {
      const content = await readFile(this.getPath(title, scope, userId), 'utf-8');
      this.cache.set(key, content);
      return content;
    } catch {
      return null;
    }
  }

  async savePage(title: string, content: string, scope: WikiScope, userId?: string): Promise<void> {
    const filePath = this.getPath(title, scope, userId);
    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    
    // Update cache immediately — avoids a redundant disk read
    const key = this.cacheKey(title, scope, userId);
    this.cache.set(key, content);
  }

  async search(query: string, scopes: WikiScope[], userId?: string): Promise<string[]> {
    const results: string[] = [];
    const lowerQuery = query.toLowerCase();

    for (const scope of scopes) {
      const pages = await this.listAllPages(scope, userId);
      for (const page of pages) {
        // getPage will use cache if available, read from disk otherwise
        const content = await this.getPage(page, scope, userId);
        if (content?.toLowerCase().includes(lowerQuery)) {
          results.push(`[${scope}] ${page}`);
        }
      }
    }

    return results;
  }

  async listAllPages(scope: WikiScope, userId?: string): Promise<string[]> {
    let dir: string;
    if (scope === 'personal') {
      if (!userId) return [];
      dir = join(this.rootDir, 'personal', userId);
    } else {
      dir = join(this.rootDir, scope);
    }

    try {
      const files = await readdir(dir);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => f.slice(0, -3));
    } catch {
      return [];
    }
  }
}

/**
 * Cloudflare D1-based wiki provider with FTS5 search.
 * 
 * Strategy: Use SQLite FTS5 full-text search for O(log N) lookups with
 * ranking, stemming, and phrase matching. The benchmark proved that
 * for cloud/D1, the database-native search is optimal since there's no
 * serialization overhead — the index lives in the database itself.
 * 
 * Schema:
 *   CREATE TABLE wiki_pages (title TEXT, content TEXT, scope TEXT, user_id TEXT);
 *   CREATE VIRTUAL TABLE wiki_pages_fts USING fts5(title, content, scope, user_id, content='wiki_pages', content_rowid='rowid');
 *   CREATE TRIGGER wiki_pages_ai AFTER INSERT ON wiki_pages BEGIN
 *     INSERT INTO wiki_pages_fts(rowid, title, content, scope, user_id) VALUES (new.rowid, new.title, new.content, new.scope, new.user_id);
 *   END;
 *   CREATE TRIGGER wiki_pages_ad AFTER DELETE ON wiki_pages BEGIN
 *     INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, content, scope, user_id) VALUES('delete', old.rowid, old.title, old.content, old.scope, old.user_id);
 *   END;
 *   CREATE TRIGGER wiki_pages_au AFTER UPDATE ON wiki_pages BEGIN
 *     INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, content, scope, user_id) VALUES('delete', old.rowid, old.title, old.content, old.scope, old.user_id);
 *     INSERT INTO wiki_pages_fts(rowid, title, content, scope, user_id) VALUES (new.rowid, new.title, new.content, new.scope, new.user_id);
 *   END;
 * 
 * Fallback: If FTS5 tables don't exist, falls back to LIKE queries (current behavior).
 */
export class CloudWikiProvider implements WikiProvider {
  private ftsAvailable: boolean | null = null;

  constructor(private d1Provider: () => Promise<any>) {}

  /**
   * Check once whether FTS5 tables exist. Caches the result.
   */
  private async isFtsAvailable(db: any): Promise<boolean> {
    if (this.ftsAvailable !== null) return this.ftsAvailable;
    try {
      await db.prepare('SELECT name FROM sqlite_master WHERE name = ?').bind('wiki_pages_fts').first();
      this.ftsAvailable = true;
    } catch {
      this.ftsAvailable = false;
    }
    return this.ftsAvailable;
  }

  async getPage(title: string, scope: WikiScope, userId?: string): Promise<string | null> {
    const db = await this.d1Provider();
    if (scope === 'personal') {
      if (!userId) throw new Error('userId is required for personal scope');
      const result = await db.prepare(
        'SELECT content FROM wiki_pages WHERE title = ? AND scope = ? AND user_id = ?'
      ).bind(title, scope, userId).first();
      return result?.content || null;
    }
    const result = await db.prepare(
      'SELECT content FROM wiki_pages WHERE title = ? AND scope = ?'
    ).bind(title, scope).first();
    return result?.content || null;
  }

  async savePage(title: string, content: string, scope: WikiScope, userId?: string): Promise<void> {
    const db = await this.d1Provider();
    if (scope === 'personal') {
      if (!userId) throw new Error('userId is required for personal scope');
      await db.prepare(
        'INSERT OR REPLACE INTO wiki_pages (title, content, scope, user_id) VALUES (?, ?, ?, ?)'
      ).bind(title, content, scope, userId).run();
      return;
    }
    await db.prepare(
      'INSERT OR REPLACE INTO wiki_pages (title, content, scope, user_id) VALUES (?, ?, ?, NULL)'
    ).bind(title, content, scope).run();
  }

  async search(query: string, scopes: WikiScope[], userId?: string): Promise<string[]> {
    const db = await this.d1Provider();
    const results: string[] = [];

    // Try FTS5 search first (O(log N) with ranking)
    if (await this.isFtsAvailable(db)) {
      for (const scope of scopes) {
        if (scope === 'personal') {
          if (!userId) continue;
          const rows = await db.prepare(
            "SELECT title FROM wiki_pages_fts WHERE wiki_pages_fts MATCH ? AND scope = ? AND user_id = ? ORDER BY rank"
          ).bind(query, scope, userId).all();
          for (const r of rows.results ?? []) {
            results.push(`[${scope}] ${r.title}`);
          }
        } else {
          const rows = await db.prepare(
            "SELECT title FROM wiki_pages_fts WHERE wiki_pages_fts MATCH ? AND scope = ? ORDER BY rank"
          ).bind(query, scope).all();
          for (const r of rows.results ?? []) {
            results.push(`[${scope}] ${r.title}`);
          }
        }
      }
      return results;
    }

    // Fallback: LIKE search (current behavior, O(N))
    for (const scope of scopes) {
      if (scope === 'personal') {
        if (!userId) continue;
        const rows = await db.prepare(
          'SELECT title FROM wiki_pages WHERE scope = ? AND user_id = ? AND content LIKE ?'
        ).bind(scope, userId, `%${query}%`).all();
        for (const r of rows.results ?? []) {
          results.push(`[${scope}] ${r.title}`);
        }
      } else {
        const rows = await db.prepare(
          'SELECT title FROM wiki_pages WHERE scope = ? AND content LIKE ?'
        ).bind(scope, `%${query}%`).all();
        for (const r of rows.results ?? []) {
          results.push(`[${scope}] ${r.title}`);
        }
      }
    }

    return results;
  }

  async listAllPages(scope: WikiScope, userId?: string): Promise<string[]> {
    const db = await this.d1Provider();

    if (scope === 'personal') {
      if (!userId) return [];
      const rows = await db.prepare(
        'SELECT title FROM wiki_pages WHERE scope = ? AND user_id = ?'
      ).bind(scope, userId).all();
      return rows.results?.map((r: any) => r.title) || [];
    }

    const rows = await db.prepare(
      'SELECT title FROM wiki_pages WHERE scope = ?'
    ).bind(scope).all();
    return rows.results?.map((r: any) => r.title) || [];
  }
}

/**
 * D1 migration to create the wiki_pages table and FTS5 index.
 * Run this once when setting up the cloud wiki provider.
 */
export const CLOUD_WIKI_MIGRATION = `
CREATE TABLE IF NOT EXISTS wiki_pages (
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  scope TEXT NOT NULL,
  user_id TEXT,
  PRIMARY KEY (title, scope, COALESCE(user_id, ''))
);

CREATE VIRTUAL TABLE IF NOT EXISTS wiki_pages_fts USING fts5(
  title, content, scope, user_id,
  content='wiki_pages',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS wiki_pages_ai AFTER INSERT ON wiki_pages BEGIN
  INSERT INTO wiki_pages_fts(rowid, title, content, scope, user_id)
    VALUES (new.rowid, new.title, new.content, new.scope, new.user_id);
END;

CREATE TRIGGER IF NOT EXISTS wiki_pages_ad AFTER DELETE ON wiki_pages BEGIN
  INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, content, scope, user_id)
    VALUES ('delete', old.rowid, old.title, old.content, old.scope, old.user_id);
END;

CREATE TRIGGER IF NOT EXISTS wiki_pages_au AFTER UPDATE ON wiki_pages BEGIN
  INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, content, scope, user_id)
    VALUES ('delete', old.rowid, old.title, old.content, old.scope, old.user_id);
  INSERT INTO wiki_pages_fts(rowid, title, content, scope, user_id)
    VALUES (new.rowid, new.title, new.content, new.scope, new.user_id);
END;
`;