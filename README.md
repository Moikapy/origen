# @moikapy/origen

> Multi-Provider Agent Engine — an agent harness, not a chatbot.

Named after **Origen of Alexandria** (c. 185–254 AD) — the early church's greatest scholar. This package is a **generic** agent harness that wraps any LLM provider with tool calling, streaming, Soul.md personas, and Cloudflare D1 integration.

**Domain-specific tools live in separate packages.** For Bible study, see `@moikapy/scholar-tools`.

## Features

- **Multi-provider**: OpenRouter, Ollama, Anthropic, Google, OpenAI, DeepSeek, Groq, xAI via `@mariozechner/pi-ai`
- **Streaming first**: `streamOrigen()` yields typed events (reasoning, tool calls, text deltas, citations)
- **Parallel tool execution**: Tools run concurrently by default; sequential mode available
- **Soul.md personas**: Declarative persona definitions with profiles, moods, and voice tuning
- **D1 integration**: Tools receive a `D1Provider` for Cloudflare D1 database access
- **Provider-aware auth**: `getApiKey(provider)` resolves keys per-provider (OAuth PKCE, local Ollama, etc.)
- **Abort support**: Pass `signal: AbortSignal` to cancel streaming mid-flight
- **Citation extraction**: Pluggable `extractCitations` for domain-specific parsing
- **Thinking models**: Automatic extended reasoning for DeepSeek R1, Claude Sonnet 4, Gemini 2.5 Flash

## Providers

| Provider | Models | Auth |
|---|---|---|
| **OpenRouter** | 275+ models, free tier available | OAuth PKCE / API key |
| **Ollama** | Llama 3, Gemma 3, Mistral, Qwen 3, DeepSeek R1, + any custom model | Local (no key needed) |
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

### Static Model List

Origen ships with hardcoded entries for popular Ollama models (Llama 3, Gemma 3, DeepSeek R1, etc.). These serve as fallbacks when Ollama isn't running.

### Dynamic Discovery

When Ollama is running, Origen can pull the full list of available models — including cloud models (`:cloud` suffix) — via `fetchOllamaModels()`:

```typescript
import { discoverOllamaModels, getModelsForUI } from "@moikapy/origen/models";

// Fetch from Ollama, merge into MODELS registry, return combined map
const allModels = await discoverOllamaModels("http://localhost:11434");
console.log(allModels["ollama/llama3.2"]); // { name: "llama3.2 (3.2B)", description: "Local — 3.2B (Q4_K_M) requires Ollama", free: true }

// Or do it in two steps for more control:
import { fetchOllamaModels, mergeOllamaModels } from "@moikapy/origen/models";

const discovered = await fetchOllamaModels("http://localhost:11434");
// Filter, transform, or inspect before merging
mergeOllamaModels(discovered);
```

**Key behaviors:**
- Embedding models (e.g., `nomic-embed-text`) are automatically filtered out
- Cloud models (tagged `:cloud`) are tagged as "Cloud" in their description
- Reasoning model families (DeepSeek R1, Qwen3, etc.) are auto-detected
- Network errors return empty results — no crash, just static fallbacks
- 5-second timeout — won't block startup if Ollama is slow

### Custom Models

Use `ollama/<model-name>` and Origen constructs a generic OpenAI-compatible config pointing at your Ollama server:

```typescript
const config: AgentConfig = {
  model: "ollama/my-custom-finetune",
  ollamaBaseUrl: "http://localhost:11434/v1",
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

| Section | Fields |
|---|---|
| **identity** | role, archetype, domain_focus, non_goals |
| **relationship** | stance, user_model_default, trust_baseline |
| **voice** | formality, warmth, verbosity, jargon, formatting, banned_phrases, preferred_phrases, emoji_policy |
| **interaction** | clarifying_questions, uncertainty, disagreement, confirmations |
| **cognition** | mode, depth, verification (fact_checking, cross_validation) |
| **safety** | refusal_style, privacy, speculation, no_fabrication, no_false_certainty |
| **actions** | when_to_use_tools, explain_actions, failover |
| **state** | dynamic moods with trigger-based transitions |
| **profiles** | named overlays (concise, scholarly, friendly, etc.) |
| **composition** | extends, mixins, merge_policy |

## API Reference

### `streamOrigen(messages, context, config, apiKey?)`

Async generator yielding `StreamEvent`s. Handles the full agent loop with parallel tool execution. Events: `reasoning`, `tool_call`, `tool_result`, `text`, `done`, `error`.

### `callOrigen(messages, context, config, apiKey?)`

Non-streaming wrapper. Returns `{ message, citations, usage }`.

### `checkAuth(getApiKey)`

Provider-aware auth check. Tries OpenRouter → Ollama → Anthropic. Returns `{ authenticated, apiKey, provider, error? }`.

### `checkOpenRouterAuth(getApiKey)`

OpenRouter-only auth check (backward compat).

### `resolveModel(modelId, options?)`

Resolves a model ID string to a pi-ai `Model` object. Handles Ollama models, pi-ai registry lookups, and generic fallbacks.

### `createEventStream(agent, extractCitations?)`

Eagerly subscribes to an Agent and returns `{ stream, unsubscribe }`. Subscribes synchronously before `prompt()` to avoid race conditions.

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
import {
  MODELS, DEFAULT_MODEL, THINKING_MODELS,
  supportsThinking, isOllamaModel,
  getModelsByProvider, getModelsForUI,
  fetchOllamaModels, mergeOllamaModels, discoverOllamaModels,
} from "@moikapy/origen/models";
```

### Built-in Model IDs

| ID | Name | Free? |
|---|---|---|
| `openrouter/free` | Free (Auto) | ✅ |
| `google/gemma-4-31b-it:free` | Gemma 4 31B | ✅ |
| `nvidia/nemotron-3-super-120b-a12b:free` | Nemotron 3 Super | ✅ |
| `deepseek/deepseek-r1:free` | DeepSeek R1 (Free) | ✅ |
| `qwen/qwen3-coder:free` | Qwen3 Coder | ✅ |
| `ollama/llama3` | Llama 3 (Ollama) | ✅ |
| `ollama/llama3.1` | Llama 3.1 8B (Ollama) | ✅ |
| `ollama/gemma3` | Gemma 3 (Ollama) | ✅ |
| `ollama/mistral` | Mistral 7B (Ollama) | ✅ |
| `ollama/qwen3` | Qwen 3 (Ollama) | ✅ |
| `ollama/deepseek-r1` | DeepSeek R1 (Ollama) | ✅ |
| `ollama/codellama` | Code Llama (Ollama) | ✅ |
| `ollama/phi3` | Phi-3 (Ollama) | ✅ |
| `openrouter/auto` | Auto (All) | ❌ |
| `anthropic/claude-sonnet-4` | Claude Sonnet 4 | ❌ |
| `google/gemini-2.5-flash-preview` | Gemini 2.5 Flash | ❌ |

### Thinking Models

Extended reasoning support for: `anthropic/claude-sonnet-4`, `deepseek/deepseek-r1:free`, `google/gemini-2.5-flash-preview`, `ollama/deepseek-r1`.

### Dynamic Ollama Discovery

Ollama models can be discovered at runtime from a running server:

| Function | Description |
|---|---|
| `fetchOllamaModels(baseUrl?)` | Query Ollama `/api/tags`, return `Record<string, ModelConfig>` |
| `mergeOllamaModels(models)` | Merge discovered models into the static `MODELS` registry |
| `discoverOllamaModels(baseUrl?)` | One-shot: fetch + merge + return combined map |

## Exports Map

```json
{
  ".":           "Main entry — streamOrigen, callOrigen, checkAuth, MODELS, Soul, etc.",
  "./models":    "MODELS registry, supportsThinking, isOllamaModel, getModelsByProvider",
  "./soul":      "Soul class, loadSoul, SoulConfig types",
  "./adapter":   "resolveModel, createEventStream, adaptTools, convertMessages"
}
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Your App                          │
│  streamOrigen(messages, context, config)            │
└────────┬──────────────┬─────────────────────────────┘
         │              │
    ┌────▼────┐    ┌─────▼──────┐
    │ agent.ts│    │ adapter.ts │
    │ Agent   │    │ Tool adapt │
    │ loop    │    │ Model res. │
    │ Auth    │    │ Event xlate│
    └────┬────┘    └─────┬──────┘
         │              │
    ┌────▼──────────────▼────┐
    │  pi-ai + pi-agent-core│
    │  (LLM providers,     │
    │   streaming, tools)   │
    └───────────────────────┘
```

- **agent.ts** — Agent loop, auth checks, event types. Orchestrates `Agent` from pi-agent-core.
- **adapter.ts** — Bridges Origen's simple types to pi-ai/pi-agent-core. Tool adaptation, model resolution, event translation, eager event stream.
- **models.ts** — Model registry with UI-safe configs, thinking model detection, provider filtering.
- **soul.ts** — Soul.md RFC-1 parser with YAML front matter, profile overlays, prompt generation.
- **types.ts** — Zero-dependency types (D1Like, Citation, UsageInfo, ReadingContext).

## Changelog

### v0.5 (current)
- **Dynamic Ollama discovery**: `fetchOllamaModels()`, `mergeOllamaModels()`, `discoverOllamaModels()` pull live models from Ollama's `/api/tags` endpoint
- **Improved Ollama model catalog**: Added Llama 3.1, Mistral Nemo, Code Llama, Phi-3; updated context windows
- **Ollama provider in resolveModel**: Now tries `ollama` in the pi-ai registry loop
- **Exported `defaultCitationExtractor`**: Now importable for custom citation pipelines
- **Reduced `as any` casts**: Replaced with documented type assertions where pi-ai generics are too narrow

### v0.4
- **Zod validation**: Optional `inputSchema` on `OrigenTool` for runtime parameter validation
- **Qwen3 Coder**: Added `qwen/qwen3-coder:free` to model registry
- **getModelsForUI()**: UI-safe model configs without internal fields
- **getModelsByProvider()**: Filter models by provider prefix
- **UIModelConfig type**: Stripped model config safe for client-side use

### v0.3
- **Multi-provider**: OpenRouter, Ollama, Anthropic, Google, DeepSeek, Groq, xAI via pi-ai
- **Parallel tool execution**: Tools run concurrently by default
- **Abort support**: Pass `signal: AbortSignal` to cancel streaming
- **Soul.md personas**: Declarative persona definitions with profiles and moods
- **Provider-aware auth**: `getApiKey(provider)` resolves keys per-provider
- **Eager event stream**: `createEventStream()` subscribes before prompt to avoid race conditions
- **No more hardcoded SSE parser**: Delegate to pi-ai + pi-agent-core

## License

MIT