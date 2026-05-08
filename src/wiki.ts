import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { WikiProvider, WikiScope } from './types';

export type { WikiProvider } from './types';

/**
 * Local filesystem-based wiki provider.
 * Stores pages as markdown files in a tiered directory structure:
 *   {rootDir}/global/        — The Canon (read-only for most agents)
 *   {rootDir}/community/     — The Living Forum (collaborative synthesis)
 *   {rootDir}/personal/{userId}/ — The Private Sanctuary (per-user)
 */
export class LocalWikiProvider implements WikiProvider {
  constructor(private rootDir: string) {}

  private getPath(title: string, scope: WikiScope, userId?: string): string {
    if (scope === 'personal') {
      if (!userId) throw new Error('userId is required for personal scope');
      return join(this.rootDir, 'personal', userId, `${title}.md`);
    }
    return join(this.rootDir, scope, `${title}.md`);
  }

  async getPage(title: string, scope: WikiScope, userId?: string): Promise<string | null> {
    try {
      return await readFile(this.getPath(title, scope, userId), 'utf-8');
    } catch {
      return null;
    }
  }

  async savePage(title: string, content: string, scope: WikiScope, userId?: string): Promise<void> {
    const filePath = this.getPath(title, scope, userId);
    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  }

  async search(query: string, scopes: WikiScope[], userId?: string): Promise<string[]> {
    const results: string[] = [];
    const lowerQuery = query.toLowerCase();

    for (const scope of scopes) {
      const pages = await this.listAllPages(scope, userId);
      for (const page of pages) {
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
 * Cloudflare D1-based wiki provider.
 * Stores pages in a `wiki_pages` table with scope and user_id columns.
 * All pages are markdown content, just like local — only the storage differs.
 */
export class CloudWikiProvider implements WikiProvider {
  constructor(private d1Provider: () => Promise<any>) {}

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