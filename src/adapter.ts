/**
 * Adapter: bridges Origen's simple types to pi-agent-core/pi-ai types.
 *
 * - OrigenTool → AgentTool (injects D1Provider)
 * - pi-ai Model resolution (OpenRouter, Ollama, Anthropic, Google)
 * - StreamEvent translation (AgentEvent → Origen's StreamEvent)
 */

import { getModel } from "@mariozechner/pi-ai";
import type { Model, Api, Message, Context, Tool } from "@mariozechner/pi-ai";
import type { AgentTool, AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { OrigenTool, StreamEvent } from "./agent";
import type { D1Provider, Citation, UsageInfo } from "./types";

// ── Tool adapter ─────────────────────────────────────────────────────

/**
 * Convert an OrigenTool into a pi-agent-core AgentTool.
 * The D1Provider is captured in closure so the tool's execute gets it.
 */
export function adaptTool(tool: OrigenTool, getD1: D1Provider): AgentTool {
  return {
    name: tool.name,
    description: tool.description,
    // Convert JSON schema to TypeBox format — pi-agent-core uses TypeBox
    // but accepts plain JSON schemas for the tool definition sent to the LLM.
    // We provide parameters as a TypeBox-like schema.
    parameters: {
      type: "object",
      ...tool.parameters,
    } as any,
    label: tool.name,
    execute: async (_toolCallId, params, _signal) => {
      const result = await tool.execute(params as Record<string, unknown>, getD1);
      return {
        content: [{ type: "text" as const, text: result }],
        details: {},
      };
    },
  };
}

/** Adapt all OrigenTools for an Agent instance. */
export function adaptTools(tools: OrigenTool[], getD1: D1Provider): AgentTool[] {
  return tools.map((t) => adaptTool(t, getD1));
}

// ── Model resolution ──────────────────────────────────────────────────

export interface ModelResolutionOptions {
  /** Ollama base URL, e.g. "http://localhost:11434/v1" */
  ollamaBaseUrl?: string;
}

/** Known Ollama models that don't exist in pi-ai's generated registry. */
const OLLAMA_MODELS: Record<string, Partial<Model<Api>>> = {
  "ollama/llama3": {
    id: "llama3",
    name: "Llama 3 (Ollama)",
    api: "openai-completions",
    provider: "ollama",
    baseUrl: "http://localhost:11434/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 4096,
  },
  "ollama/gemma3": {
    id: "gemma3",
    name: "Gemma 3 (Ollama)",
    api: "openai-completions",
    provider: "ollama",
    baseUrl: "http://localhost:11434/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 4096,
  },
  "ollama/mistral": {
    id: "mistral",
    name: "Mistral (Ollama)",
    api: "openai-completions",
    provider: "ollama",
    baseUrl: "http://localhost:11434/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 4096,
  },
  "ollama/qwen3": {
    id: "qwen3",
    name: "Qwen 3 (Ollama)",
    api: "openai-completions",
    provider: "ollama",
    baseUrl: "http://localhost:11434/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 4096,
  },
  "ollama/deepseek-r1": {
    id: "deepseek-r1",
    name: "DeepSeek R1 (Ollama)",
    api: "openai-completions",
    provider: "ollama",
    baseUrl: "http://localhost:11434/v1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 65536,
    maxTokens: 8192,
  },
};

const DEFAULT_MODEL: Model<Api> = {
  id: "openrouter/free",
  name: "Free (Auto)",
  api: "openai-completions",
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 4096,
};

/**
 * Resolve a model ID string to a pi-ai Model object.
 * Tries pi-ai's registry first, then falls back to built-in Ollama definitions.
 */
export function resolveModel(modelId: string, options?: ModelResolutionOptions): Model<Api> {
  // Try Ollama models first
  if (modelId.startsWith("ollama/")) {
    const ollamaDef = OLLAMA_MODELS[modelId];
    if (ollamaDef) {
      const baseUrl = options?.ollamaBaseUrl ?? ollamaDef.baseUrl ?? "http://localhost:11434/v1";
      return {
        ...DEFAULT_MODEL,
        ...ollamaDef,
        baseUrl,
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          supportsUsageInStreaming: false,
          maxTokensField: "max_tokens",
          requiresToolResultName: false,
          requiresAssistantAfterToolResult: false,
          requiresThinkingAsText: true,
          requiresReasoningContentOnAssistantMessages: false,
          thinkingFormat: "openai",
          supportsStrictMode: false,
          supportsLongCacheRetention: false,
        },
      } as Model<Api>;
    }
    // Generic Ollama model: user typed a custom model name
    const customId = modelId.replace("ollama/", "");
    return {
      ...DEFAULT_MODEL,
      id: customId,
      name: `${customId} (Ollama)`,
      provider: "ollama",
      baseUrl: options?.ollamaBaseUrl ?? "http://localhost:11434/v1",
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsUsageInStreaming: false,
        maxTokensField: "max_tokens",
        requiresToolResultName: false,
        requiresAssistantAfterToolResult: false,
        requiresThinkingAsText: true,
        requiresReasoningContentOnAssistantMessages: false,
        thinkingFormat: "openai",
        supportsStrictMode: false,
        supportsLongCacheRetention: false,
      },
    } as Model<Api>;
  }

  // Try pi-ai's model registry (OpenRouter, Anthropic, Google, etc.)
  // pi-ai groups by provider, so we try known providers
  const providers = ["openrouter", "anthropic", "google", "openai", "deepseek", "groq", "xai"];
  for (const provider of providers) {
    try {
      const model = getModel(provider as any, modelId as any);
      if (model) return model as Model<Api>;
    } catch {
      // Not found in this provider, try next
    }
  }

  // Fallback: create a generic OpenRouter-compatible model
  return {
    ...DEFAULT_MODEL,
    id: modelId,
    name: modelId,
  };
}

// ── Message conversion ────────────────────────────────────────────────

/** Convert Origen's simple messages to pi-ai Message format. */
export function convertMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Message[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content as any,
    timestamp: Date.now(),
  })) as Message[];
}

// ── Context builder ───────────────────────────────────────────────────

/** Build a pi-ai Context from Origen's config. */
export function buildContext(
  systemPrompt: string,
  messages: Message[],
  adaptedTools: AgentTool[]
): Context {
  return {
    systemPrompt,
    messages,
    tools: adaptedTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  };
}

// ── Event translation ─────────────────────────────────────────────────

/** Default citation extractor — [BOOK CHAPTER:VERSE] patterns. */
function defaultCitationExtractor(text: string): Citation[] {
  const citations: Citation[] = [];
  const regex = /\[([A-Z]{3})\s+(\d+):(\d+)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    citations.push({ book: match[1], chapter: parseInt(match[2]), verse: parseInt(match[3]) });
  }
  return citations;
}

/** Translate a pi-agent-core AgentEvent into an Origen StreamEvent. */
export function translateEvent(
  event: AgentEvent,
  extractCitations?: (text: string) => Citation[]
): StreamEvent | null {
  switch (event.type) {
    case "message_update": {
      const assistantEvent = event.assistantMessageEvent;
      if (assistantEvent.type === "text_delta") {
        return { type: "text" as const, content: assistantEvent.delta };
      }
      if (assistantEvent.type === "thinking_delta") {
        return { type: "reasoning" as const, content: assistantEvent.delta };
      }
      return null;
    }
    case "tool_execution_start": {
      return {
        type: "tool_call" as const,
        name: event.toolName,
        args: event.args as Record<string, unknown>,
      };
    }
    case "tool_execution_end": {
      const resultText = event.result?.content
        ?.filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n") ?? "";
      return {
        type: "tool_result" as const,
        name: event.toolName,
        result: resultText,
      };
    }
    case "agent_end": {
      // Find the final assistant message
      const assistantMsg = event.messages
        .filter((m): m is any => m.role === "assistant")
        .pop();
      const text = assistantMsg?.content
        ?.filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("") ?? "";
      const usage: UsageInfo | undefined = assistantMsg?.usage
        ? {
            promptTokens: assistantMsg.usage.input,
            completionTokens: assistantMsg.usage.output,
            totalCost: assistantMsg.usage.cost?.total,
          }
        : undefined;
      const citFn = extractCitations ?? defaultCitationExtractor;
      // Check for error
      if (assistantMsg?.stopReason === "error" || assistantMsg?.stopReason === "aborted") {
        return {
          type: "error" as const,
          message: assistantMsg.errorMessage ?? "Agent encountered an error",
        };
      }
      return {
        type: "done" as const,
        message: text,
        citations: citFn(text),
        usage,
      };
    }
    default:
      return null;
  }
}

/**
 * Eagerly subscribe to an Agent and return an async iterable of Origen StreamEvents.
 *
 * CRITICAL: The subscription is created synchronously when this function is called,
 * BEFORE agent.prompt() starts. This avoids the race condition where events
 * emitted during prompt() are missed if subscription happens after.
 *
 * Usage:
 *   const { stream, unsubscribe } = createEventStream(agent, extractCitations);
 *   agent.prompt(messages); // events flow into stream via active subscription
 *   for await (const event of stream) { ... }
 */
export function createEventStream(
  agent: any, // Agent from pi-agent-core
  extractCitations?: (text: string) => Citation[]
): {
  stream: AsyncGenerator<StreamEvent>;
  unsubscribe: () => void;
} {
  const queue: StreamEvent[] = [];
  let resolve: (() => void) | null = null;
  let done = false;

  // Subscribe IMMEDIATELY (before prompt is called)
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    const translated = translateEvent(event, extractCitations);
    if (translated) {
      queue.push(translated);
      if (resolve) {
        resolve();
        resolve = null;
      }
    }
    if (event.type === "agent_end") {
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    }
  });

  async function* stream(): AsyncGenerator<StreamEvent> {
    try {
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (done) break;
        await new Promise<void>((r) => { resolve = r; });
      }
    } finally {
      unsubscribe();
    }
  }

  return { stream: stream(), unsubscribe };
}

/**
 * Subscribe to an Agent and yield Origen StreamEvents.
 * Handles the full lifecycle from agent_start to agent_end.
 *
 * @deprecated Use createEventStream() instead to avoid race conditions.
 * This function subscribes lazily (on first iteration) which can miss events
 * if the agent has already started emitting.
 */
export async function* agentToStreamEvents(
  agent: any,
  extractCitations?: (text: string) => Citation[]
): AsyncGenerator<StreamEvent> {
  yield* createEventStream(agent, extractCitations).stream;
}