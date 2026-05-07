# @moikapy/origen

> Multi-Provider Agent Engine — an agent harness, not a chatbot.

Named after **Origen of Alexandria** (c. 185–254 AD) — the early church's greatest scholar. This package is the **generic** agent harness that wraps any LLM provider with tool calling, streaming, and Soul.md personas.

**Domain-specific tools live in separate packages.** For Bible study, see `@moikapy/scholar-tools`.

## Providers

Origen supports multiple LLM providers via `@mariozechner/pi-ai`:

| Provider | Models | Auth |
|---|---|---|
| **OpenRouter** | 275+ models, free tier available | OAuth PKCE / API key |
| **Ollama** | Llama 3, Gemma 3, Mistral, Qwen 3, DeepSeek R1 | Local (no key needed) |
| **Anthropic** | Claude Sonnet 4, etc. | API key |
| **Google** | Gemini 2.5 Flash, etc. | API key |
| **OpenAI** | GPT-4o, etc. | API key |
| **DeepSeek, Groq, xAI** | Various | API key |

## Install

```bash
bun add @moikapy/origen
```

## Quick Start

```typescript
import { streamOrigen, MODELS } from "@moikapy/origen";
import type { OrigenTool, AgentConfig, ModelId } from "@moikapy/origen";

// Define your own tools
const myTool: OrigenTool = {
  name: "lookup",
  description: "Look up information",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Search query" } },
    required: ["query"],
  },
  execute: async (args, getD1) => {
    const d1 = await getD1();
    const result = await d1.prepare("SELECT * FROM data WHERE content LIKE ?").bind(`%${args.query}%`).all();
    return JSON.stringify(result.results);
  },
};

const config: AgentConfig = {
  appName: "MyApp",
  tools: [myTool],
  getD1: async () => myD1Database,
  model: "openrouter/free",
  // Provider-aware key resolution
  getApiKey: async (provider) => {
    if (provider === "ollama") return "ollama";
    return getOpenRouterKey();
  },
};

for await (const event of streamOrigen(messages, context, config)) {
  switch (event.type) {
    case "reasoning":  // thinking tokens (DeepSeek R1, etc.)
    case "tool_call":  // tool name + args
    case "tool_result": // tool execution result
    case "text":       // response text delta
    case "done":       // final message + citations + usage
    case "error":      // auth/rate-limit/network errors
  }
}
```

## Ollama Support

```typescript
const config: AgentConfig = {
  model: "ollama/llama3",
  ollamaBaseUrl: "http://localhost:11434/v1",
  getApiKey: async (provider) => {
    if (provider === "ollama") return "ollama"; // Ollama doesn't need a real key
    return undefined;
  },
  // ...
};
```

## Soul.md — Persona as Code

Origen supports [Soul.md (RFC-1)](https://github.com/rokoss21/soul.md) — a portable specification for AI agent personas:

```typescript
import { loadSoul } from "@moikapy/origen/soul";

const soul = loadSoul(soulMdContent);
const prompt = soul.buildPrompt();           // Generate system prompt
const concise = soul.selectProfile("concise"); // Switch profile
console.log(concise.buildPrompt());            // Concise version
```

### Supported Soul.md Fields

- **identity**: role, archetype, domain_focus, non_goals
- **relationship**: stance, user_model_default, trust_baseline
- **voice**: formality, warmth, verbosity, jargon, formatting, banned_phrases, preferred_phrases, emoji_policy
- **interaction**: clarifying_questions, uncertainty, disagreement, confirmations
- **cognition**: mode, depth, verification (fact_checking, cross_validation)
- **safety**: refusal_style, privacy, speculation, no_fabrication, no_false_certainty
- **actions**: when_to_use_tools, explain_actions, failover
- **state**: dynamic moods with trigger-based transitions
- **profiles**: named overlays (concise, scholarly, friendly, etc.)

## API

### `streamOrigen(messages, context, config, apiKey?)`

Async generator yielding `StreamEvent`s. Handles the full agent loop with parallel tool execution.

### `callOrigen(messages, context, config, apiKey?)`

Non-streaming wrapper. Returns `{ message, citations, usage }`.

### `checkAuth(getApiKey)`

Provider-aware auth check. Returns `{ authenticated, apiKey, provider, error? }`.

### `checkOpenRouterAuth(getApiKey)`

OpenRouter-only auth check (backward compat).

## Configuration

```typescript
interface AgentConfig {
  appName?: string;           // Used in default system prompt if no systemPrompt
  systemPrompt?: string;       // Override the default prompt entirely
  tools: OrigenTool[];         // Tools available to the agent
  getD1: D1Provider;           // () => Promise<D1Like> — database access
  model?: ModelId;            // Default: "openrouter/free"
  maxSteps?: number;          // Default: 5, max tool-call loops
  extractCitations?: (text: string) => Citation[]; // Custom citation parser
  getApiKey?: (provider: string) => Promise<string | undefined>; // Per-provider key
  ollamaBaseUrl?: string;      // Default: "http://localhost:11434/v1"
  toolExecution?: "sequential" | "parallel"; // Default: "parallel"
  signal?: AbortSignal;         // Cancellation support
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high"; // Reasoning
}
```

## Models

```typescript
import { MODELS, DEFAULT_MODEL, THINKING_MODELS, supportsThinking, isOllamaModel } from "@moikapy/origen/models";
```

## What Changed (v0.3)

- **Multi-provider**: OpenRouter, Ollama, Anthropic, Google, DeepSeek, Groq, xAI via pi-ai
- **Parallel tool execution**: Tools run concurrently by default
- **Abort support**: Pass `signal: AbortSignal` to cancel streaming
- **Soul.md personas**: Declarative persona definitions with profiles and moods
- **Provider-aware auth**: `getApiKey(provider)` resolves keys per-provider
- **No more hardcoded SSE parser**: Delegate to pi-ai + pi-agent-core

## License

MIT