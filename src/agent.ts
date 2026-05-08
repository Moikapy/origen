/**
 * Origen — Agent Engine (v0.3)
 *
 * Multi-provider agent harness built on pi-ai + pi-agent-core.
 * Supports OpenRouter, Ollama, Anthropic, Google, and any OpenAI-compatible API.
 * Soul.md personas, streaming, parallel tool execution, abort support.
 */

import { Agent } from "@mariozechner/pi-agent-core";
import { streamSimple } from "@mariozechner/pi-ai";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { z } from "zod";
import {
  adaptTools,
  convertMessages,
  buildContext,
  createEventStream,
  resolveModel,
} from "./adapter";
import { createWikiTools } from "./wiki-tools";
import { LocalWikiProvider, CloudWikiProvider, type WikiProvider } from "./wiki";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { DEFAULT_MODEL_ID, THINKING_MODELS, type ModelId } from "./models";
import type { D1Provider, Citation, UsageInfo } from "./types";

// ── Tool definition ───────────────────────────────────────────────────

/**
 * A tool that the host app registers with Origen.
 * Simple interface: name, description, JSON schema, and an execute function
 * that receives (args, getD1). The adapter wraps this into pi-agent-core's AgentTool.
 */
export interface OrigenTool {
  name: string;
  description: string;
  /** OpenAI function-calling parameter schema (JSON) */
  parameters: Record<string, unknown>;
  /** Zod schema for runtime validation (optional) */
  inputSchema?: z.ZodType;
  execute: (args: Record<string, unknown>, getD1: D1Provider) => Promise<string>;
}

// ── Agent configuration ───────────────────────────────────────────────

export interface AgentConfig {
  appName?: string;
  systemPrompt?: string;
  tools: OrigenTool[];
  getD1: D1Provider;
  model?: ModelId;
  maxSteps?: number;
  /** Custom citation extractor */
  extractCitations?: (text: string) => Citation[];
  /** Dynamic API key resolution per provider (e.g., for expiring OAuth tokens) */
  getApiKey?: (provider: string) => Promise<string | undefined>;
  /** Ollama base URL override (default: http://localhost:11434/v1) */
  ollamaBaseUrl?: string;
  /** Tool execution mode: "parallel" (default) or "sequential" */
  toolExecution?: "sequential" | "parallel";
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Reasoning/thinking level for models that support it */
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
  wiki?: {
    type: 'local' | 'cloud';
    rootDir?: string; // Only used for 'local'
    userId?: string;  // Required for personal scope
  };

}

// ── Auth check ────────────────────────────────────────

export interface AuthCheckResult {
  authenticated: boolean;
  apiKey: string | null;
  provider?: string;
  error?: string;
}

/**
 * Provider-aware auth check. Tests key availability for each provider.
 * If no provider argument, checks OpenRouter + Ollama availability.
 */
export async function checkAuth(
  getApiKey: ((provider: string) => Promise<string | undefined>) | (() => Promise<string | null>),
): Promise<AuthCheckResult> {
  // Normalize to per-provider signature
  const getProviderKey = getApiKey.length >= 1
    ? getApiKey as (provider: string) => Promise<string | undefined>
    : async (provider: string) => {
        const key = await (getApiKey as () => Promise<string | null>)();
        return key ?? undefined;
      };

  // Try OpenRouter first
  const orKey = await getProviderKey("openrouter");
  if (orKey) return { authenticated: true, apiKey: orKey, provider: "openrouter" };

  // Try Ollama
  const ollamaKey = await getProviderKey("ollama");
  if (ollamaKey) return { authenticated: true, apiKey: ollamaKey, provider: "ollama" };

  // Try Anthropic
  const anthropicKey = await getProviderKey("anthropic");
  if (anthropicKey) return { authenticated: true, apiKey: anthropicKey, provider: "anthropic" };

  return {
    authenticated: false,
    apiKey: null,
    error: "Connect your OpenRouter account or configure Ollama to enable AI-powered study.",
  };
}

/** Convenience: check OpenRouter auth only (backward compat). */
export async function checkOpenRouterAuth(
  getApiKey: () => Promise<string | null>
): Promise<AuthCheckResult> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { authenticated: false, apiKey: null, error: "Connect your OpenRouter account to enable AI-powered study." };
  }
  return { authenticated: true, apiKey, provider: "openrouter" };
}

// ── Stream event types ─────────────────────────────────────────────────

export type StreamEvent =
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "text"; content: string }
  | { type: "done"; message: string; citations: Citation[]; usage?: UsageInfo }
  | { type: "error"; message: string };

// ── Streaming agent call ───────────────────────────────────────────────

export async function* streamOrigen(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  context: Record<string, unknown> | undefined,
  config: AgentConfig,
  apiKey?: string,
): AsyncGenerator<StreamEvent> {
  const systemPrompt = config.systemPrompt ?? `You are ${config.appName ?? "Origen"}, an AI assistant. Use your tools to help the user.`;
  const modelId = config.model ?? DEFAULT_MODEL_ID;
  const maxSteps = config.maxSteps ?? 5;
  const extractCitations = config.extractCitations;

  // Resolve model to pi-ai Model object
  const model = resolveModel(modelId, { ollamaBaseUrl: config.ollamaBaseUrl });

  // Adapt tools to AgentTool format
  const baseTools = adaptTools(config.tools, config.getD1);
  let finalTools = [...baseTools];

  // ── Sovereign Memory Integration ────────────────────────────────────
  // When wiki is enabled, inject wiki tools and augment the system prompt
  // so the LLM knows how to use its memory.
  let finalSystemPrompt = systemPrompt;

  if (config.wiki) {
    const provider = config.wiki.type === 'local' 
      ? new LocalWikiProvider(config.wiki.rootDir ?? './.origen-wiki')
      : new CloudWikiProvider(config.getD1);
    
    const wikiTools = createWikiTools(provider, config.wiki.userId);
    
    // Convert purely internal wiki tools to OrigenTool format for adaptation
    const adaptedWikiTools = wikiTools.map(wt => ({
      name: wt.name,
      description: wt.description,
      parameters: wt.parameters,
      execute: async (args: any) => await wt.execute(args),
    }));
    
    finalTools = [...baseTools, ...adaptTools(adaptedWikiTools, config.getD1)];

    // Augment system prompt with wiki context instructions
    finalSystemPrompt = `${systemPrompt}\n\nYou have access to a Sovereign Memory wiki with three tiers:\n- **global**: The Canon \u2014 core truths and verified knowledge. Use sparingly.\n- **community**: The Living Forum \u2014 aggregated insights, common patterns, Q\u0026A.\n- **personal**: The Private Sanctuary \u2014 user-specific preferences, history, and notes.\n\nWhen you learn something new, compound it into the wiki using wiki_update_page. When you need to recall knowledge, use wiki_query first, then wiki_get_page to read the full synthesis. Always read before you write to avoid duplicating knowledge.`;
  }


  // Convert messages — Origen's simple {role, content} maps to pi-ai UserMessages.
  // Assistant messages lack thinking/toolCall content, so we cast through the union.
  const piMessages = convertMessages(messages) as AgentMessage[];

  // Inject context into last user message
  if (context && piMessages.length > 0) {
    const lastIdx = piMessages.length - 1;
    const lastMsg = piMessages[lastIdx];
    if (lastMsg.role === "user") {
      piMessages[lastIdx] = {
        ...lastMsg,
        content: `[Context: ${JSON.stringify(context)}] ${typeof lastMsg.content === "string" ? lastMsg.content : ""}`,
      };
    }
  }

  // Resolve API key per provider
  const resolveApiKey = async (provider: string): Promise<string | undefined> => {
    if (config.getApiKey) return config.getApiKey(provider);
    if (apiKey) return apiKey;
    return undefined;
  };

  // Create Agent
  const agent = new Agent({
    initialState: {
      systemPrompt: finalSystemPrompt,
      model,
      thinkingLevel: config.thinkingLevel ?? (THINKING_MODELS.has(modelId) ? "medium" : "off"),
      tools: finalTools,
      messages: piMessages,
    },
    getApiKey: resolveApiKey,
    toolExecution: config.toolExecution ?? "parallel",
  });

  // CRITICAL: Create event stream BEFORE calling prompt.
  // createEventStream subscribes eagerly (synchronously), so no events
  // are missed even though agent.prompt() emits events during execution.
  const { stream, unsubscribe } = createEventStream(agent, extractCitations);

  let streamError: string | null = null;

  // Start prompt without awaiting — events flow through active subscription
  agent.prompt(piMessages).catch((error) => {
    // If prompt throws without emitting agent_end, capture error
    // to yield after the stream ends
    streamError = error instanceof Error ? error.message : String(error);
    unsubscribe(); // clean up since agent won't emit agent_end
  });

  try {
    for await (const event of stream) {
      yield event;
    }
  } finally {
    unsubscribe();
  }

  // If prompt() threw without emitting events, yield the error now
  if (streamError) {
    yield { type: "error", message: `Agent error: ${streamError}` };
  }
}

// ── Non-streaming agent call ──────────────────────────────────────────

export interface AgentResponse {
  message: string;
  citations: Citation[];
  usage?: UsageInfo;
}

export async function callOrigen(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  context: Record<string, unknown> | undefined,
  config: AgentConfig,
  apiKey?: string,
): Promise<AgentResponse> {
  let message = "";
  const citations: Citation[] = [];
  let usage: UsageInfo | undefined;

  for await (const event of streamOrigen(messages, context, config, apiKey)) {
    switch (event.type) {
      case "text": message += event.content; break;
      case "done": citations.push(...event.citations); usage = event.usage; break;
      case "error": throw new Error(event.message);
    }
  }

  return { message, citations, usage };
}