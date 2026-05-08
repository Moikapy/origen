import { WikiProvider, WikiScope } from './types';

export interface WikiToolInput {
  title?: string;
  content?: string;
  query?: string;
  scope?: WikiScope;
  scopes?: WikiScope[];
  userId?: string;
}

/**
 * Creates wiki tools for the agent's Sovereign Memory system.
 * 
 * The agent uses these tools to compound knowledge across three tiers:
 * - GLOBAL: The immutable "Canon" — core truths and verified knowledge.
 * - COMMUNITY: The "Living Forum" — aggregated insights from all users.
 * - PERSONAL: The "Private Sanctuary" — per-user memory, isolated and private.
 */
export function createWikiTools(provider: WikiProvider, defaultUserId?: string) {
  return [
    {
      name: 'wiki_update_page',
      description: `Updates or creates a page in the Sovereign Memory wiki. Use this to compound knowledge.
SCOPES:
- 'global': Core truths, verified knowledge. Use sparingly — this is the Canon.
- 'community': Aggregated insights, common patterns, Q&A. Use when you discover something broadly useful.
- 'personal': Private user memory. Use for user-specific preferences, history, and notes.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The title of the wiki page' },
          content: { type: 'string', description: 'The markdown content to save' },
          scope: {
            type: 'string',
            enum: ['global', 'community', 'personal'],
            description: "The memory tier. Default: 'community'",
          },
        },
        required: ['title', 'content', 'scope'],
      },
      execute: async ({ title, content, scope }: WikiToolInput) => {
        await provider.savePage(title!, content!, (scope ?? 'community') as WikiScope, defaultUserId);
        return `Successfully updated [${scope ?? 'community'}] page: ${title}`;
      },
    },
    {
      name: 'wiki_query',
      description: `Searches the Sovereign Memory wiki for relevant pages. Specify which tiers to search.
- 'global' + 'community': Best for answering factual questions.
- 'global' + 'community' + 'personal': Best for personalized responses.
- 'personal' only: Best for recalling user-specific history.`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search term' },
          scopes: {
            type: 'array',
            items: { type: 'string', enum: ['global', 'community', 'personal'] },
            description: "Which memory tiers to search. Default: ['global', 'community', 'personal']",
          },
        },
        required: ['query'],
      },
      execute: async ({ query, scopes }: WikiToolInput) => {
        const searchScopes = (scopes ?? ['global', 'community', 'personal']) as WikiScope[];
        const pages = await provider.search(query!, searchScopes, defaultUserId);
        return pages.length > 0
          ? `Found matching pages: ${pages.join(', ')}`
          : 'No matching pages found in the wiki.';
      },
    },
    {
      name: 'wiki_get_page',
      description: `Reads the full content of a specific page in the Sovereign Memory wiki. Use this after wiki_query to read the actual synthesis before compounding new knowledge onto it.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The title of the wiki page to read' },
          scope: {
            type: 'string',
            enum: ['global', 'community', 'personal'],
            description: "The memory tier. Default: 'community'",
          },
        },
        required: ['title', 'scope'],
      },
      execute: async ({ title, scope }: WikiToolInput) => {
        const content = await provider.getPage(title!, (scope ?? 'community') as WikiScope, defaultUserId);
        if (content === null) {
          return `Page "${title}" not found in [${scope ?? 'community'}] memory.`;
        }
        return content;
      },
    },
    {
      name: 'wiki_list_pages',
      description: 'Lists all page titles in a specific memory tier.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['global', 'community', 'personal'],
            description: "Which tier to list. Default: 'community'",
          },
        },
      },
      execute: async ({ scope }: WikiToolInput) => {
        const pages = await provider.listAllPages((scope ?? 'community') as WikiScope, defaultUserId);
        return pages.length > 0
          ? `Wiki [${scope ?? 'community'}] contains: ${pages.join(', ')}`
          : `The [${scope ?? 'community'}] wiki is currently empty.`;
      },
    },
  ];
}