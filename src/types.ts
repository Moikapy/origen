/**
 * Origen types — no runtime deps, safe for client + server.
 */

/** Memory visibility scope for the LLM-Wiki */
export type WikiScope = 'global' | 'community' | 'personal';

/** Wiki provider interface for compounding memory */
export interface WikiProvider {
  getPage(title: string, scope: WikiScope, userId?: string): Promise<string | null>;
  savePage(title: string, content: string, scope: WikiScope, userId?: string): Promise<void>;
  deletePage(title: string, scope: WikiScope, userId?: string): Promise<boolean>;
  search(query: string, scopes: WikiScope[], userId?: string): Promise<string[]>;
  listAllPages(scope: WikiScope, userId?: string): Promise<string[]>;
}

/** D1-compatible database interface for tool execution */
export interface D1Like {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      all(): Promise<{ results?: Record<string, unknown>[] }>;
      first(): Promise<Record<string, unknown> | null>;
      run(): Promise<{ meta?: { changes: number; last_row_id: number } }>;
    };
  };
}

/** Function that provides a D1 instance to tool executors */
export type D1Provider = () => Promise<D1Like>;

/** Memory store interface for the agent's persistent memory.
 *  The app provides the storage (D1, localStorage, etc.),
 *  the agent decides what to remember and when.
 */
export interface MemoryProvider {
  /** Get all stored facts */
  getFacts(): Promise<MemoryFact[]>;
  /** Save or update a fact */
  saveFact(key: string, value: string): Promise<void>;
  /** Delete a fact by key */
  deleteFact(key: string): Promise<void>;
  /** Search facts by query (for recall) */
  searchFacts(query: string): Promise<MemoryFact[]>;
}

/** A single memory fact stored by the agent */
export interface MemoryFact {
  key: string;
  value: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Chat context passed from the UI (what the user is reading) */
export interface ReadingContext {
  translation: string;
  bookCode: string;
  chapter: number;
  selectedVerses?: number[];
}

/** Simplified message format for streamOrigen/callOrigen inputs.
 *  Use this for simple text-only conversations.
 *  The full AgentMessage type from pi-agent-core is re-exported from agent.ts.
 */
export interface SimpleMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** @deprecated Use SimpleMessage for input, AgentMessage from agent.ts for the full type. */
export type AgentMessage = SimpleMessage;
;

export interface Citation {
  book: string;
  chapter: number;
  verse: number;
}

export interface UsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  totalCost?: number;
}

/** Model configuration entry */
export interface ModelConfig {
  name: string;
  description: string;
  free: boolean;
}