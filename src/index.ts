/**
 * @moikapy/origen — Multi-Provider Agent Engine
 *
 * Generic agent harness with Soul.md personas, streaming, tool calling.
 * Supports OpenRouter, Ollama, Anthropic, Google, and any OpenAI-compatible API.
 *
 * Domain-specific tools live in their own packages (e.g., @moikapy/scholar-tools).
 *
 * Usage:
 *   import { streamOrigen } from "@moikapy/origen";
 *   import { allBibleTools, buildScholarPrompt } from "@moikapy/scholar-tools";
 *
 *   const config = {
 *     systemPrompt: buildScholarPrompt(),
 *     tools: allBibleTools(),
 *     getD1: async () => myD1,
 *     model: "openrouter/free",
 *     getApiKey: async (provider) => resolveKey(provider),
 *   };
 */

export type {
  D1Like,
  D1Provider,
  ReadingContext,
  Citation,
  UsageInfo,
  ModelConfig as OrigenModelConfig,
  WikiProvider,
  WikiScope,
} from "./types";


export {
  MODELS,
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL,
  THINKING_MODELS,
  supportsThinking,
  isOllamaModel,
  getModelsByProvider,
  getModelsForUI,
  fetchOllamaModels,
  mergeOllamaModels,
  discoverOllamaModels,
  type ModelId,
  type ModelConfig,
  type UIModelConfig,
} from "./models";

export {
  streamOrigen,
  callOrigen,
  checkAuth,
  checkOpenRouterAuth,
  type AgentConfig,
  type OrigenTool,
  type AuthCheckResult,
  type AgentResponse,
  type StreamEvent,
} from "./agent";

export { resolveModel, createEventStream, defaultCitationExtractor } from "./adapter";
export type { ModelResolutionOptions } from "./adapter";

export { loadSoul } from "./soul";
export type { Soul } from "./soul";

export { LocalWikiProvider, CloudWikiProvider } from "./wiki";
export { createWikiTools } from "./wiki-tools";
