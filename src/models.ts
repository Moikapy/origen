/**
 * Origen model configuration.
 *
 * Delegates to pi-ai's model registry for known providers (OpenRouter, Anthropic, Google, etc.)
 * Plus custom entries for Ollama and free-tier aliases.
 */

import { getModel } from "@mariozechner/pi-ai";
import type { Model, Api } from "@mariozechner/pi-ai";
export type { Model as ProviderModel, Api } from "@mariozechner/pi-ai";

// ── Model registry ────────────────────────────────────────────────────

export interface ModelConfig {
  name: string;
  description: string;
  free: boolean;
}

/** UI-facing model config — safe to send to the client. Strips internal fields. */
export type UIModelConfig = ModelConfig;

/** Get models as a simple UI map (name, description, free). No internal fields. */
export function getModelsForUI(): Record<string, UIModelConfig> {
  const uiModels: Record<string, UIModelConfig> = {};
  for (const [id, config] of Object.entries(MODELS)) {
    uiModels[id] = { name: config.name, description: config.description, free: config.free };
  }
  return uiModels;
}

// Build MODELS map from pi-ai registry + custom entries
function buildModels(): Record<string, ModelConfig> {
  const models: Record<string, ModelConfig> = {};

  // ── OpenRouter (free tier) ───────────────────────────
  models["openrouter/free"] = {
    name: "Free (Auto)",
    description: "Free — auto-selects best free model for your request",
    free: true,
  };
  models["google/gemma-4-31b-it:free"] = {
    name: "Gemma 4 31B",
    description: "Free — great quality for Bible study",
    free: true,
  };
  models["nvidia/nemotron-3-super-120b-a12b:free"] = {
    name: "Nemotron 3 Super",
    description: "Free — large model, strong reasoning",
    free: true,
  };
  models["deepseek/deepseek-r1:free"] = {
    name: "DeepSeek R1 (Free)",
    description: "Free — reasoning with thinking support",
    free: true,
  };

  models["qwen/qwen3-coder:free"] = {
    name: "Qwen3 Coder",
    description: "Free — 480B parameters, excellent tool use",
    free: true,
  };

  // ── OpenRouter (premium) ─────────────────────────────
  models["openrouter/auto"] = {
    name: "Auto (All)",
    description: "Auto-selects best model (requires credits)",
    free: false,
  };
  models["anthropic/claude-sonnet-4"] = {
    name: "Claude Sonnet 4",
    description: "Premium — excellent quality + reasoning (requires credits)",
    free: false,
  };
  models["google/gemini-2.5-flash-preview"] = {
    name: "Gemini 2.5 Flash",
    description: "Premium — fast with thinking (requires credits)",
    free: false,
  };

  // ── Ollama (local, always free) ──────────────────────
  models["ollama/llama3"] = {
    name: "Llama 3 (Ollama)",
    description: "Local — Meta's Llama 3, requires Ollama",
    free: true,
  };
  models["ollama/gemma3"] = {
    name: "Gemma 3 (Ollama)",
    description: "Local — Google's Gemma 3, requires Ollama",
    free: true,
  };
  models["ollama/mistral"] = {
    name: "Mistral (Ollama)",
    description: "Local — Mistral's 7B model, requires Ollama",
    free: true,
  };
  models["ollama/qwen3"] = {
    name: "Qwen 3 (Ollama)",
    description: "Local — Alibaba's Qwen 3, requires Ollama",
    free: true,
  };
  models["ollama/deepseek-r1"] = {
    name: "DeepSeek R1 (Ollama)",
    description: "Local — reasoning model, requires Ollama",
    free: true,
  };

  return models;
}

export const MODELS: Record<string, ModelConfig> = buildModels();
export type ModelId = keyof typeof MODELS;

/** Default model — free router, works with $0 credits */
export const DEFAULT_MODEL_ID: ModelId = "openrouter/free";

/** Backward compat alias */
export const DEFAULT_MODEL: ModelId = DEFAULT_MODEL_ID;

/** Models that support extended thinking */
export const THINKING_MODELS: ReadonlySet<ModelId> = new Set<ModelId>([
  "anthropic/claude-sonnet-4",
  "deepseek/deepseek-r1:free",
  "google/gemini-2.5-flash-preview",
  "ollama/deepseek-r1",
]);

/** Check if a model supports extended thinking */
export function supportsThinking(model: ModelId): boolean {
  return THINKING_MODELS.has(model);
}

/** Check if a model is an Ollama model */
export function isOllamaModel(model: ModelId): boolean {
  return (model as string).startsWith("ollama/");
}

/** Get all model IDs for a specific provider prefix */
export function getModelsByProvider(provider: string): ModelId[] {
  return (Object.keys(MODELS) as ModelId[]).filter((id) =>
    (id as string).startsWith(`${provider}/`)
  );
}