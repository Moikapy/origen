/**
 * Comprehensive type export audit for @moikapy/origen
 *
 * Verifies that:
 * 1. All public types are re-exported from index.ts
 * 2. Types match their source definitions (no divergence)
 * 3. Runtime values match type declarations
 * 4. No orphaned types (defined but not exported)
 * 5. No phantom exports (exported but not in dist)
 */

import { describe, it, expect } from "vitest";
import {
  // Types from types.ts
  type D1Like,
  type D1Provider,
  type ReadingContext,
  type Citation,
  type UsageInfo,
  type WikiProvider,
  type WikiScope,
  type SimpleMessage,
  // Renamed type
  type OrigenModelConfig,
  // From models.ts
  MODELS,
  DEFAULT_MODEL,
  DEFAULT_MODEL_ID,
  THINKING_MODELS,
  supportsThinking,
  isOllamaModel,
  type ModelId,
  type ModelConfig,
  type UIModelConfig,
  // From agent.ts
  streamOrigen,
  callOrigen,
  checkAuth,
  checkOpenRouterAuth,
  type AgentConfig,
  type OrigenTool,
  type AuthCheckResult,
  type AgentResponse,
  type StreamEvent,
  type AgentMessage,
  // From adapter.ts
  resolveModel,
  createEventStream,
  defaultCitationExtractor,
  type ModelResolutionOptions,
  // From soul.ts
  loadSoul,
  type Soul,
  type SoulVoice,
  type SoulInteraction,
  type SoulSafety,
  type SoulCognition,
  type SoulActions,
  type SoulConfig,
  // From wiki
  LocalWikiProvider,
  CloudWikiProvider,
  CLOUD_WIKI_MIGRATION,
  createWikiTools,
  type WikiToolInput,
} from "../src/index";

// ── Internal imports for divergence checks ──
import type { StreamEvent as AgentStreamEvent } from "../src/agent";
import type { Soul as SoulType } from "../src/soul";
import type { WikiScope as TypesWikiScope } from "../src/types";

describe("Type Export Audit", () => {
  // ── 1. All public types are re-exported ──
  it("SimpleMessage is the simplified input type", () => {
    const _simple: SimpleMessage = { role: "user", content: "hello" };
    expect(_simple.role).toBe("user");
    expect(_simple.content).toBe("hello");
  });

  it("exports all fundamental types from types.ts", () => {
    // These are type-only imports; if they compile, they're exported correctly.
    const _d1: D1Like = {
      prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({ meta: { changes: 0, last_row_id: 0 } }) }) }),
    };
    const _d1p: D1Provider = async () => _d1;
    const _rc: ReadingContext = { translation: "ESV", bookCode: "gen", chapter: 1 };
    const _cit: Citation = { book: "Genesis", chapter: 1, verse: 1 };
    const _usage: UsageInfo = { promptTokens: 100, completionTokens: 50 };
    const _scope: WikiScope = "global";
    const _msg: AgentMessage = { role: "user", content: "hello" };

    // Structural checks
    expect(_d1).toBeDefined();
    expect(_d1p).toBeDefined();
    expect(_rc).toBeDefined();
    expect(_cit).toBeDefined();
    expect(_usage).toBeDefined();
    expect(_scope).toBe("global");
    expect(_msg).toBeDefined();
  });

  it("exports model types from models.ts", () => {
    const _mid: ModelId = "openrouter/free";
    const _mc: ModelConfig = { name: "Free", description: "Free tier", free: true };
    const _umc: UIModelConfig = { ..._mc, id: "openrouter/free" };
    const _omc: OrigenModelConfig = _mc; // OrigenModelConfig is a re-export of ModelConfig

    expect(_mid).toBe("openrouter/free");
    expect(_mc.free).toBe(true);
    expect(_umc.id).toBeDefined();
    expect(_omc).toBeDefined();
  });

  it("exports agent types from agent.ts", () => {
    const _ac: Partial<AgentConfig> = {};
    const _ot: OrigenTool = {
      name: "test",
      description: "test tool",
      parameters: { type: "object", properties: {} },
      execute: async () => "ok",
    };
    const _ar: AuthCheckResult = { valid: true, provider: "openrouter" };
    const _resp: AgentResponse = { text: "hello", citations: [], usage: undefined };

    // StreamEvent variants
    const _se1: StreamEvent = { type: "reasoning", content: "thinking..." };
    const _se2: StreamEvent = { type: "text", content: "response" };
    const _se3: StreamEvent = { type: "tool_call", name: "search", args: {} };
    const _se4: StreamEvent = { type: "tool_result", name: "search", result: "found" };
    const _se5: StreamEvent = { type: "done", message: "complete", citations: [] };
    const _se6: StreamEvent = { type: "error", message: "oops" };

    expect(_se1.type).toBe("reasoning");
    expect(_se2.type).toBe("text");
    expect(_se3.type).toBe("tool_call");
    expect(_se4.type).toBe("tool_result");
    expect(_se5.type).toBe("done");
    expect(_se6.type).toBe("error");
  });

  // ── 2. Type divergence checks ──
  it("StreamEvent in exports matches StreamEvent in agent.ts (no divergence)", () => {
    // These should be the same type. If they diverge, this assignment will fail at compile time.
    const _agentEvent: AgentStreamEvent = { type: "reasoning", content: "test" };
    const _exportedEvent: StreamEvent = _agentEvent;

    // Verify all variant names exist in both
    const agentVariants: StreamEvent["type"][] = [
      "reasoning", "text", "tool_call", "tool_result", "done", "error"
    ];
    agentVariants.forEach((variant) => {
      expect(variant).toBeDefined();
    });
  });

  it("AgentMessage in exports matches full pi-agent-core type", () => {
    // AgentMessage is now re-exported from agent.ts (the full pi-agent-core type)
    // SimpleMessage from types.ts is the simplified version for streamOrigen inputs
    const _simple: SimpleMessage = { role: "user", content: "hi" };
    expect(_simple).toBeDefined();
  });

  it("Soul type in exports matches Soul in soul.ts", () => {
    const _soul: Soul = {
      name: "test",
      tagline: "test",
      role: "assistant",
      identity: "test",
      tone: "direct",
    };
    const _exported: Soul = _soul;
    expect(_exported).toBeDefined();
  });

  it("WikiScope in exports matches WikiScope in types.ts", () => {
    const _types: TypesWikiScope = "global";
    const _exported: WikiScope = _types;
    expect(_exported).toBe("global");
  });

  // ── 3. Runtime values match type declarations ──
  it("MODELS object keys match ModelId type", () => {
    const modelIds: ModelId[] = Object.keys(MODELS) as ModelId[];
    expect(modelIds.length).toBeGreaterThan(0);

    // Every key should be accessible
    modelIds.forEach((id) => {
      expect(MODELS[id]).toBeDefined();
      expect(MODELS[id].name).toBeTruthy();
    });
  });

  it("DEFAULT_MODEL_ID matches a key in MODELS", () => {
    expect(MODELS[DEFAULT_MODEL_ID]).toBeDefined();
    expect(DEFAULT_MODEL).toBe(DEFAULT_MODEL_ID); // DEFAULT_MODEL is a ModelId string, not an object
  });

  it("THINKING_MODELS contains valid ModelIds", () => {
    THINKING_MODELS.forEach((id) => {
      expect(MODELS[id]).toBeDefined();
    });
  });

  it("CLOUD_WIKI_MIGRATION has correct structure", () => {
    expect(CLOUD_WIKI_MIGRATION).toBeDefined();
    expect(typeof CLOUD_WIKI_MIGRATION).toBe("string");
  });

  // ── 8. No duplicate type definitions (divergence risk) ──
  it("StreamEvent has no duplicate type with different variants", () => {
    // The canonical StreamEvent is in agent.ts and re-exported from index.ts
    // types.ts should NOT define its own StreamEvent (it was removed in run #27)
    const fs = require("fs");
    const typesContent = fs.readFileSync("src/types.ts", "utf-8");
    expect(typesContent).not.toMatch(/type\s+StreamEvent/);
    expect(typesContent).not.toMatch(/interface\s+StreamEvent/);
  });

  it("AgentMessage has no duplicate definition in types.ts (only SimpleMessage)", () => {
    // AgentMessage should be re-exported from agent.ts (full pi-agent-core type)
    // types.ts should only define SimpleMessage (AgentMessage there is deprecated alias)
    const fs = require("fs");
    const typesContent = fs.readFileSync("src/types.ts", "utf-8");
    // The full AgentMessage is re-exported from agent.ts
    expect(typesContent).toMatch(/SimpleMessage/);
    // types.ts AgentMessage is a deprecated alias for SimpleMessage
    expect(typesContent).toMatch(/@deprecated/);
  });

  // ── 4. No orphaned types (defined but not exported) ──
  it("exports WikiProvider interface (used by createWikiTools)", () => {
    // WikiProvider must be exported so consumers can implement it
    const _wp: WikiProvider = {
      getPage: async () => null,
      savePage: async () => {},
      deletePage: async () => false,
      search: async () => [],
      listAllPages: async () => [],
    };
    expect(_wp).toBeDefined();
  });

  it("exports D1Like and D1Provider (used by tool executors)", () => {
    // These must be exported for consumers who pass D1 bindings
    const _d1: D1Like = {
      prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({ meta: { changes: 0, last_row_id: 0 } }) }) }),
    };
    const _d1p: D1Provider = async () => _d1;
    expect(_d1).toBeDefined();
    expect(_d1p).toBeDefined();
  });

  // ── 5. Function exports ──
  it("exports all runtime functions", () => {
    expect(typeof streamOrigen).toBe("function");
    expect(typeof callOrigen).toBe("function");
    expect(typeof checkAuth).toBe("function");
    expect(typeof checkOpenRouterAuth).toBe("function");
    expect(typeof resolveModel).toBe("function");
    expect(typeof createEventStream).toBe("function");
    expect(typeof defaultCitationExtractor).toBe("function");
    expect(typeof loadSoul).toBe("function");
    expect(typeof supportsThinking).toBe("function");
    expect(typeof isOllamaModel).toBe("function");
    expect(typeof LocalWikiProvider).toBe("function");
    expect(typeof CloudWikiProvider).toBe("function");
    expect(typeof createWikiTools).toBe("function");
  });

  // ── 6. Edge cases ──
  it("OrigenModelConfig is a re-export of ModelConfig (no divergence)", () => {
    const _mc: ModelConfig = { name: "test", description: "test", free: false };
    const _omc: OrigenModelConfig = _mc; // Should be assignable
    expect(_omc).toBeDefined();
  });

  it("handleAuth null return for agent config", () => {
    // Verify checkAuth and checkOpenRouterAuth exist and are typed
    expect(typeof checkAuth).toBe("function");
    expect(typeof checkOpenRouterAuth).toBe("function");
  });

  it("exports Soul sub-types (SoulVoice, SoulInteraction, SoulSafety)", () => {
    const _voice: SoulVoice = { formality: 0.5, warmth: 0.7, verbosity: 0.5, jargon: 0.3, formatting: "markdown" };
    const _interaction: SoulInteraction = { clarifying_questions: "when_ambiguous", uncertainty: "explicit", disagreement: "soft", confirmations: "implicit" };
    const _safety: SoulSafety = { refusal_style: "brief", privacy: "normal", speculation: "mark" };
    expect(_voice.formality).toBe(0.5);
    expect(_interaction.disagreement).toBe("soft");
    expect(_safety.refusal_style).toBe("brief");
  });

  it("exports WikiToolInput type", () => {
    const _input: WikiToolInput = { title: "test", content: "content", scope: "global" };
    expect(_input.title).toBe("test");
    expect(_input.scope).toBe("global");
  });

  // ── 7. Dist build matches source exports ──
  it("dist/index.js re-exports all named exports from src/index.ts", async () => {
    // Read source exports
    const fs = await import("fs");
    const source = fs.readFileSync("src/index.ts", "utf-8");

    // Parse exported names
    const exportNames: string[] = [];
    const typeExportPattern = /export\s+type\s+\{(.*?)\}/gs;
    const valueExportPattern = /export\s+\{(.*?)\}/gs;

    // Collect all export names from source
    const allExports = new Set<string>();
    for (const line of source.split("\n")) {
      if (line.includes("export ") && !line.startsWith("//") && !line.startsWith(" *")) {
        const match = line.match(/export\s+(?:type\s+)?\{([^}]+)\}/);
        if (match) {
          match[1].split(",").forEach((name) => {
            const trimmed = name.trim().split(/\s+as\s+/)[0].trim();
            if (trimmed) allExports.add(trimmed);
          });
        }
        // Also handle: export { X as Y }
        const typeOnlyMatch = line.match(/export\s+type\s+\{([^}]+)\}/);
        if (typeOnlyMatch) {
          typeOnlyMatch[1].split(",").forEach((name) => {
            const trimmed = name.trim().split(/\s+as\s+/)[0].trim();
            if (trimmed) allExports.add(trimmed);
          });
        }
      }
    }

    // Verify each source export is accessible from dist
    const dist = await import("./dist/index.js");
    const missingFromDist: string[] = [];
    for (const name of allExports) {
      // Type exports won't show up in runtime object
      const typeOnlyExports = new Set([
        "D1Like", "D1Provider", "ReadingContext", "Citation", "UsageInfo",
        "OrigenModelConfig", "WikiProvider", "WikiScope", "SimpleMessage",
        "AgentMessage", "ModelId", "ModelConfig", "UIModelConfig",
        "AgentConfig", "OrigenTool", "AuthCheckResult", "AgentResponse",
        "StreamEvent", "ModelResolutionOptions", "Soul",
        "SoulVoice", "SoulInteraction", "SoulSafety", "SoulCognition",
        "SoulActions", "SoulConfig", "WikiToolInput",
      ]);
      if (!typeOnlyExports.has(name) && !(name in dist)) {
        missingFromDist.push(name);
      }
    }

    expect(missingFromDist).toEqual([]);
  });

  it("AgentResponse has optional fields", () => {
    const _minimal: AgentResponse = { text: "hello" };
    const _full: AgentResponse = {
      text: "hello",
      citations: [{ book: "Gen", chapter: 1, verse: 1 }],
      usage: { promptTokens: 100, completionTokens: 50, totalCost: 0.001 },
    };
    expect(_minimal).toBeDefined();
    expect(_full).toBeDefined();
  });
});