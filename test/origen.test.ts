/**
 * Origen v0.3 — unit tests for the core engine.
 * Tests model resolution, Soul.md parsing, message conversion, auth, and tool adapter wiring.
 * No external dependencies — scholar-tools tests live in the scholar monorepo.
 */

import { describe, test, expect } from "vitest";
import { resolveModel } from "../src/adapter";
import { MODELS, DEFAULT_MODEL, DEFAULT_MODEL_ID, isOllamaModel, getModelsByProvider, getModelsForUI, supportsThinking, THINKING_MODELS, type ModelId } from "../src/models";
import { Soul, loadSoul } from "../src/soul";
import { checkOpenRouterAuth, checkAuth } from "../src/agent";

// ── Model Resolution ──────────────────────────────────────────────────

describe("Model Resolution", () => {
  test("resolves OpenRouter models", () => {
    const model = resolveModel("openrouter/free");
    expect(model.id).toBe("openrouter/free");
    expect(model.provider).toBeDefined();
  });

  test("resolves Ollama models with custom base URL", () => {
    const model = resolveModel("ollama/llama3", { ollamaBaseUrl: "http://192.168.1.100:11434/v1" });
    expect(model.id).toBe("llama3");
    expect(model.provider).toBe("ollama");
    expect(model.baseUrl).toBe("http://192.168.1.100:11434/v1");
  });

  test("resolves Ollama models with default base URL", () => {
    const model = resolveModel("ollama/llama3");
    expect(model.baseUrl).toBe("http://localhost:11434/v1");
  });

  test("resolves unknown Ollama models generically", () => {
    const model = resolveModel("ollama/my-custom-model");
    expect(model.id).toBe("my-custom-model");
    expect(model.name).toContain("Ollama");
  });

  test("isOllamaModel correctly identifies Ollama models", () => {
    expect(isOllamaModel("ollama/llama3")).toBe(true);
    expect(isOllamaModel("openrouter/free")).toBe(false);
  });
});

// ── MODELS Registry ─────────────────────────────────────────────────

describe("MODELS Registry", () => {
  test("has required models", () => {
    expect(MODELS).toHaveProperty("openrouter/free");
    expect(MODELS).toHaveProperty("google/gemma-4-31b-it:free");
    expect(MODELS).toHaveProperty("deepseek/deepseek-r1:free");
    expect(MODELS).toHaveProperty("anthropic/claude-sonnet-4");
    expect(MODELS).toHaveProperty("ollama/llama3");
    expect(MODELS).toHaveProperty("qwen/qwen3-coder:free");
  });

  test("DEFAULT_MODEL aliases match", () => {
    expect(DEFAULT_MODEL_ID).toBe("openrouter/free");
    expect(DEFAULT_MODEL).toBe("openrouter/free");
  });

  test("THINKING_MODELS includes expected entries", () => {
    expect(THINKING_MODELS.has("anthropic/claude-sonnet-4")).toBe(true);
    expect(supportsThinking("deepseek/deepseek-r1:free")).toBe(true);
  });

  test("getModelsForUI strips internal fields", () => {
    const uiModels = getModelsForUI();
    for (const config of Object.values(uiModels)) {
      expect(config).toHaveProperty("name");
      expect(config).toHaveProperty("description");
      expect(config).toHaveProperty("free");
      expect((config as any)._model).toBeUndefined();
    }
  });

  test("getModelsByProvider returns correct subsets", () => {
    const orModels = getModelsByProvider("openrouter");
    expect(orModels.length).toBeGreaterThan(0);
    orModels.forEach(id => expect((id as string).startsWith("openrouter/")).toBe(true));

    const ollamaModels = getModelsByProvider("ollama");
    expect(ollamaModels.length).toBeGreaterThan(0);
  });
});

// ── Soul.md ────────────────────────────────────────────────────────

describe("Soul.md", () => {
  test("parses basic Soul config from YAML front matter", () => {
    const soulMd = `---
id: test.soul
name: TestBot
version: 1
identity:
  archetype: assistant
---

# TestBot

You are a helpful assistant.
`;
    const soul = loadSoul(soulMd);
    expect(soul.config.id).toBe("test.soul");
    expect(soul.config.name).toBe("TestBot");
    expect(soul.config.identity?.archetype).toBe("assistant");
    const prompt = soul.buildPrompt();
    expect(prompt).toContain("TestBot");
    expect(prompt).toContain("helpful assistant");
  });

  test("selectProfile returns modified Soul with profile overrides", () => {
    const soulMd = `---
id: test.soul
version: 1
name: TestBot
identity:
  archetype: assistant
profiles:
  - default
  - concise
profile_overrides:
  concise:
    voice:
      verbosity: 20
      instructions: Be extremely concise.
---

# TestBot

You are a helpful assistant.
`;
    const soul = loadSoul(soulMd);
    const concise = soul.selectProfile("concise");
    const prompt = concise.buildPrompt();
    expect(prompt).toContain("extremely concise");
  });
});

// ── Auth Check ─────────────────────────────────────────────────────

describe("Auth Check", () => {
  test("checkOpenRouterAuth returns authenticated when key provided", async () => {
    const result = await checkOpenRouterAuth(async () => "sk-test-key");
    expect(result.authenticated).toBe(true);
    expect(result.apiKey).toBe("sk-test-key");
    expect(result.provider).toBe("openrouter");
  });

  test("checkOpenRouterAuth returns error when no key", async () => {
    const result = await checkOpenRouterAuth(async () => null);
    expect(result.authenticated).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("checkAuth with Ollama provider returns authenticated", async () => {
    const result = await checkAuth(async (provider) => {
      if (provider === "ollama") return "ollama";
      return undefined;
    });
    expect(result.authenticated).toBe(true);
    expect(result.provider).toBe("ollama");
  });

  test("checkAuth returns error when no provider has key", async () => {
    const result = await checkAuth(async () => undefined);
    expect(result.authenticated).toBe(false);
    expect(result.error).toBeDefined();
  });
});