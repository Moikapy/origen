/**
 * Origen v0.3 — unit tests for the core engine.
 * Tests model resolution, Soul.md parsing, message conversion, auth, and tool adapter wiring.
 * No external dependencies — scholar-tools tests live in the scholar monorepo.
 */

import { describe, test, expect, vi } from "vitest";
import { resolveModel } from "../src/adapter";
import { MODELS, DEFAULT_MODEL, DEFAULT_MODEL_ID, isOllamaModel, getModelsByProvider, getModelsForUI, supportsThinking, THINKING_MODELS, fetchOllamaModels, mergeOllamaModels, discoverOllamaModels, type ModelId } from "../src/models";
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

// ── Ollama Discovery ───────────────────────────────────────────────

describe("Ollama Discovery", () => {
  const mockOllamaResponse = {
    models: [
      {
        name: "llama3.2:latest",
        model: "llama3.2:latest",
        modified_at: "2026-03-14T16:30:30.612Z",
        size: 2019393189,
        digest: "abc123",
        details: {
          parent_model: "",
          format: "gguf",
          family: "llama",
          families: ["llama"],
          parameter_size: "3.2B",
          quantization_level: "Q4_K_M",
        },
      },
      {
        name: "deepseek-r1:latest",
        model: "deepseek-r1:latest",
        modified_at: "2026-03-14T12:24:55.817Z",
        size: 4754764544,
        digest: "def456",
        details: {
          parent_model: "",
          format: "gguf",
          family: "deepseek-r1",
          families: ["deepseek-r1"],
          parameter_size: "8B",
          quantization_level: "Q4_K_M",
        },
      },
      {
        name: "gemma4:cloud",
        model: "gemma4:cloud",
        remote_model: "gemma4",
        remote_host: "https://ollama.com:443",
        modified_at: "2026-04-14T13:57:13.095Z",
        size: 342,
        digest: "ghi789",
        details: {
          parent_model: "",
          format: "",
          family: "gemma4",
          families: ["gemma4"],
          parameter_size: "",
          quantization_level: "",
        },
      },
      {
        name: "nomic-embed-text:latest",
        model: "nomic-embed-text:latest",
        modified_at: "2026-02-21T03:06:35.05Z",
        size: 274302450,
        digest: "jkl012",
        details: {
          parent_model: "",
          format: "gguf",
          family: "nomic-bert",
          families: ["nomic-bert"],
          parameter_size: "137M",
          quantization_level: "F16",
        },
      },
    ],
  };

  test("fetchOllamaModels discovers local and cloud models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOllamaResponse),
    }));

    const models = await fetchOllamaModels("http://localhost:11434");

    // Should have llama3.2, deepseek-r1, gemma4 (cloud)
    expect(models["ollama/llama3.2"]).toBeDefined();
    expect(models["ollama/llama3.2"]?.free).toBe(true);
    expect(models["ollama/deepseek-r1"]).toBeDefined();
    expect(models["ollama/gemma4"]).toBeDefined();
    expect(models["ollama/gemma4"]?.description).toContain("Cloud");

    // Embedding model should be filtered out
    expect(models["ollama/nomic-embed-text"]).toBeUndefined();

    // Cloud tags should get a full tagged entry too
    expect(models["ollama/gemma4:cloud"]).toBeDefined();

    vi.restoreAllMocks();
  });

  test("fetchOllamaModels returns empty on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const models = await fetchOllamaModels("http://localhost:11434");
    expect(Object.keys(models)).toHaveLength(0);

    vi.restoreAllMocks();
  });

  test("fetchOllamaModels returns empty on non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const models = await fetchOllamaModels("http://localhost:11434");
    expect(Object.keys(models)).toHaveLength(0);

    vi.restoreAllMocks();
  });

  test("mergeOllamaModels merges discovered models into static registry", () => {
    const staticCount = Object.keys(MODELS).length;

    mergeOllamaModels({
      "ollama/my-custom-model": {
        name: "My Custom Model",
        description: "Local — custom model",
        free: true,
      },
    });

    expect(MODELS["ollama/my-custom-model"]).toBeDefined();
    expect(MODELS["ollama/my-custom-model"]?.name).toBe("My Custom Model");
    expect(Object.keys(MODELS).length).toBe(staticCount + 1);
  });

  test("discoverOllamaModels fetches and merges in one call", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOllamaResponse),
    }));

    const models = await discoverOllamaModels("http://localhost:11434");

    expect(models["ollama/llama3.2"]).toBeDefined();
    expect(models["ollama/deepseek-r1"]).toBeDefined();
    // Static cloud models should still be present
    expect(models["openrouter/free"]).toBeDefined();

    vi.restoreAllMocks();
  });

  test("reasoning models are tagged correctly", async () => {
    const deepseekOnly = {
      models: [{
        name: "deepseek-r1:latest",
        model: "deepseek-r1:latest",
        modified_at: "",
        size: 0,
        digest: "",
        details: {
          parent_model: "", format: "gguf", family: "deepseek-r1",
          families: ["deepseek-r1"], parameter_size: "8B", quantization_level: "Q4_K_M",
        },
      }],
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(deepseekOnly),
    }));

    const models = await fetchOllamaModels("http://localhost:11434");
    expect(models["ollama/deepseek-r1"]?.description).toContain("reasoning");

    vi.restoreAllMocks();
  });
});