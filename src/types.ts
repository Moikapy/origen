/**
 * Origen types — no runtime deps, safe for client + server.
 */

/** Memory visibility scope for the LLM-Wiki */
export type WikiScope = 'global' | 'community' | 'personal';

/** Wiki provider interface for compounding memory */
export interface WikiProvider {
  getPage(title: string, scope: WikiScope, userId?: string): Promise<string | null>;
  savePage(title: string, content: string, scope: WikiScope, userId?: string): Promise<void>;
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

/** Chat context passed from the UI (what the user is reading) */
export interface ReadingContext {
  translation: string;
  bookCode: string;
  chapter: number;
  selectedVerses?: number[];
}

/** Agent message with optional metadata */
export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** SSE events streamed from the agent to the UI */
export type StreamEvent =
  | { type: "thinking"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "text"; content: string }
  | { type: "done"; message: string; citations: Citation[]; usage?: UsageInfo }
  | { type: "error"; message: string };

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