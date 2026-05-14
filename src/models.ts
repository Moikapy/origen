/**
 * Origen model configuration.
 *
 * Static entries for cloud providers (OpenRouter, Anthropic, Google, etc.)
 * plus dynamic Ollama model discovery via GET /api/tags.
 *
 * Hardcoded Ollama entries serve as fallbacks when Ollama isn't reachable.
 * When connected, fetchOllamaModels() pulls the live model list and merges
 * it with the static entries.
 */

import { getModel } from "@mariozechner/pi-ai";
import type { Model, Api } from "@mariozechner/pi-ai";
export type { Model as ProviderModel, Api } from "@mariozechner/pi-ai";

// ── Types ─────────────────────────────────────────────────────────────

export interface ModelConfig {
  name: string;
  description: string;
  free: boolean;
}

/** UI-facing model config — safe to send to the client. Strips internal fields. */
export type UIModelConfig = ModelConfig;

/** Ollama /api/tags response shape. */
interface OllamaModelResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
      parent_model: string;
      format: string;
      family: string;
      families: string[] | null;
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}

// ── Static model registry (cloud + hardcoded Ollama defaults) ────────

function buildStaticModels(): Record<string, ModelConfig> {
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

  // ── Ollama (local, always free — fallback defaults) ──
  models["ollama/llama3"] = {
    name: "Llama 3 (Ollama)",
    description: "Local — Meta's Llama 3, requires Ollama",
    free: true,
  };
  models["ollama/llama3.1"] = {
    name: "Llama 3.1 (Ollama)",
    description: "Local — Llama 3.1 8B, 128K context, requires Ollama",
    free: true,
  };
  models["ollama/gemma3"] = {
    name: "Gemma 3 (Ollama)",
    description: "Local — Google's Gemma 3, requires Ollama",
    free: true,
  };
  models["ollama/mistral"] = {
    name: "Mistral 7B (Ollama)",
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
  models["ollama/codellama"] = {
    name: "Code Llama (Ollama)",
    description: "Local — code-focused Llama variant, requires Ollama",
    free: true,
  };
  models["ollama/phi3"] = {
    name: "Phi-3 (Ollama)",
    description: "Local — Microsoft's small but capable model, requires Ollama",
    free: true,
  };

  return models;
}

export const MODELS: Record<string, ModelConfig> = buildStaticModels();
export type ModelId = keyof typeof MODELS;

/** Default model — free router, works with $0 credits */
export const DEFAULT_MODEL_ID: ModelId = "openrouter/free";

/** Backward compat alias */
export const DEFAULT_MODEL: ModelId = DEFAULT_MODEL_ID;

/** Models that support or require extended thinking */
export const THINKING_MODELS: ReadonlySet<string> = new Set<string>([
  "anthropic/claude-sonnet-4",
  "deepseek/deepseek-r1:free",
  "google/gemini-2.5-flash-preview",
  "ollama/deepseek-r1",
  "openrouter/free", // auto-router may select reasoning models
  "qwen/qwen3-coder:free", // Qwen3 supports reasoning
]);

/** Check if a model supports extended thinking */
export function supportsThinking(model: string): boolean {
  return THINKING_MODELS.has(model);
}

/** Check if a model is an Ollama model */
export function isOllamaModel(model: string): boolean {
  return model.startsWith("ollama/");
}

/** Get all model IDs for a specific provider prefix */
export function getModelsByProvider(provider: string): string[] {
  return Object.keys(MODELS).filter((id) => id.startsWith(`${provider}/`));
}

/** Get models as a simple UI map (name, description, free). No internal fields. */
export function getModelsForUI(): Record<string, UIModelConfig> {
  const uiModels: Record<string, UIModelConfig> = {};
  for (const [id, config] of Object.entries(MODELS)) {
    uiModels[id] = { name: config.name, description: config.description, free: config.free };
  }
  return uiModels;
}

// ── Dynamic Ollama discovery ─────────────────────────────────────────

/** Known reasoning model families — used to tag discovered models. */
const REASONING_FAMILIES = new Set([
  "deepseek-r1", "deepseek-r1-distill", "qwq", "qwen3", "kimi-k2",
  "glm-5.1", "gemma4",
]);

/** Derive a human-readable description from Ollama model details.
 *  Handles null details (some Ollama versions return details: null).
 */
function describeOllamaModel(
  name: string,
  details: OllamaModelResponse["models"][number]["details"] | null,
  isCloud: boolean,
): string {
  const location = isCloud ? "Cloud" : "Local";
  const family = details?.family || name.split(":")[0].split("-")[0];
  const params = details?.parameter_size;
  const quant = details?.quantization_level;
  const isReasoning = details?.families?.some((f) => REASONING_FAMILIES.has(f)) ?? REASONING_FAMILIES.has(family);

  const parts: string[] = [location, "—"];

  if (params && params !== "") {
    parts.push(params);
  }
  if (quant && quant !== "") {
    parts.push(`(${quant})`);
  }
  if (isReasoning) {
    parts.push("reasoning");
  }
  parts.push("requires Ollama");

  return parts.join(" ");
}

/**
 * Fetch available models from a running Ollama server.
 *
 * Calls GET /api/tags on the Ollama server and returns model configs
 * merged with the static defaults. Cloud models (e.g., foo:cloud)
 * are included alongside local models.
 *
 * @param baseUrl - Ollama server URL (default: http://localhost:11434)
 * @returns Object with discovered Ollama model configs (keyed by "ollama/<name>")
 */
export async function fetchOllamaModels(
  baseUrl: string = "http://localhost:11434",
): Promise<Record<string, ModelConfig>> {
  const tagsUrl = `${baseUrl.replace(/\/v1$/, "")}/api/tags`;

  let response: Response;
  try {
    response = await fetch(tagsUrl, { signal: AbortSignal.timeout(5000) });
  } catch {
    // Ollama not reachable — return empty, callers use static defaults
    return {};
  }

  if (!response.ok) {
    return {};
  }

  let data: OllamaModelResponse;
  try {
    data = await response.json();
  } catch {
    // Invalid JSON — server returned malformed response (e.g., HTML error page)
    return {};
  }
  const discovered: Record<string, ModelConfig> = {};

  // Guard against missing or non-array models field
  if (!Array.isArray(data?.models)) {
    return discovered;
  }

  for (const model of data.models) {
    // Strip tag suffix for a cleaner ID (e.g., "llama3.2:latest" → "llama3.2")
    const tagSuffix = model.name.includes(":") ? model.name.split(":").pop() : "";
    const isCloud = tagSuffix === "cloud";
    const baseName = model.name.split(":")[0];
    const modelId = `ollama/${baseName}`;

    // Skip embedding models
    if (model.details?.family === "nomic-bert" || model.details?.families?.includes("nomic-bert")) {
      continue;
    }

    const description = describeOllamaModel(baseName, model.details, isCloud);

    discovered[modelId] = {
      name: model.details?.parameter_size
        ? `${baseName} (${model.details.parameter_size})`
        : baseName,
      description,
      free: true,
    };

    // If there's a tag like :cloud or :latest, also register the full tagged name
    if (tagSuffix && tagSuffix !== "latest") {
      const fullId = `ollama/${model.name}`;
      discovered[fullId] = {
        name: model.name,
        description,
        free: true,
      };
    }
  }

  return discovered;
}

/**
 * Merge dynamically discovered Ollama models into the static MODELS registry.
 *
 * Static defaults are kept as fallbacks. Discovered models override
 * entries with the same key (e.g., "ollama/llama3" from the server
 * replaces the hardcoded entry with live data).
 *
 * @param ollamaModels - Models returned by fetchOllamaModels()
 */
export function mergeOllamaModels(ollamaModels: Record<string, ModelConfig>): void {
  for (const [id, config] of Object.entries(ollamaModels)) {
    MODELS[id] = config;
  }
}

/**
 * One-shot: fetch Ollama models and merge them into the registry.
 * Returns the combined model map.
 *
 * @param baseUrl - Ollama server URL (default: http://localhost:11434)
 */
export async function discoverOllamaModels(
  baseUrl: string = "http://localhost:11434",
): Promise<Record<string, ModelConfig>> {
  const discovered = await fetchOllamaModels(baseUrl);
  mergeOllamaModels(discovered);
  return { ...MODELS };
}