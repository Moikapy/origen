import { describe, it, expect, vi } from "vitest";
import { RepresentationEngine, formatRepresentationsForPrompt } from "../src/representation";
import type { WikiProvider, WikiScope } from "../src/types";

/**
 * Mock wiki provider that uses a Map with composite keys.
 * Uses a unique separator "||" to avoid ambiguity with colons in titles.
 */
function createMockWikiProvider(): WikiProvider & { pages: Map<string, string> } {
  const pages = new Map<string, string>();

  function makeKey(title: string, scope: WikiScope, userId?: string): string {
    return `${scope}||${userId ?? "_"}||${title}`;
  }

  return {
    pages,
    async getPage(title, scope, userId) {
      return pages.get(makeKey(title, scope, userId)) ?? null;
    },
    async savePage(title, content, scope, userId) {
      pages.set(makeKey(title, scope, userId), content);
    },
    async deletePage(title, scope, userId) {
      return pages.delete(makeKey(title, scope, userId));
    },
    async search(query, scopes, userId) {
      const results: string[] = [];
      for (const [key, _] of pages) {
        if (key.toLowerCase().includes(query.toLowerCase())) {
          // Key format: "scope||userId||title" — split on "||" to get title
          const parts = key.split("||");
          results.push(parts[2]);
        }
      }
      return results;
    },
    async listAllPages(scope, userId) {
      const results: string[] = [];
      for (const key of pages.keys()) {
        if (key.startsWith(`${scope}||`)) {
          const parts = key.split("||");
          results.push(parts[2]);
        }
      }
      return results;
    },
  };
}

describe("RepresentationEngine", () => {
  it("builds representations from conversation messages", async () => {
    const wiki = createMockWikiProvider();
    const mockLLMCall = vi.fn().mockResolvedValue({
      "user:moikapy": {
        preferences: "Prefers Python, functional patterns, and DRY code",
        goals: "Building an AI-powered business with faith-driven products",
      },
      "agent:shalom": {
        behaviors: "Tends toward over-engineering; strong at system design",
      },
    });

    const engine = new RepresentationEngine(wiki, {
      callLLM: mockLLMCall,
      buildModel: "openrouter/free",
    });

    const messages = [
      { role: "user" as const, content: "I prefer Python over JavaScript" },
      { role: "assistant" as const, content: "Noted! Python it is." },
    ];

    await engine.buildFromMessages(messages, {
      peerIds: ["user:moikapy", "agent:shalom"],
      sessionId: "sess_test1",
    });

    expect(mockLLMCall).toHaveBeenCalled();

    // Check that pages were saved
    let foundPrefs = false;
    for (const [key, value] of wiki.pages) {
      if (key.includes("preferences") && value.includes("Python")) {
        foundPrefs = true;
      }
    }
    expect(foundPrefs).toBe(true);
  });

  it("gets summary for a peer with existing representations", async () => {
    const wiki = createMockWikiProvider();
    const engine = new RepresentationEngine(wiki, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });

    // Pre-populate wiki with representation pages
    await wiki.savePage("[representation] user:moikapy/preferences", "Prefers Python, functional patterns", "personal", "user:moikapy");
    await wiki.savePage("[representation] user:moikapy/goals", "Building AI-powered business tools", "personal", "user:moikapy");

    const summary = await engine.getSummary("user:moikapy");
    expect(summary).toContain("Python");
    expect(summary).toContain("business");
  });

  it("returns empty summary for unknown peer", async () => {
    const wiki = createMockWikiProvider();
    const engine = new RepresentationEngine(wiki, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });

    const summary = await engine.getSummary("user:unknown");
    expect(summary).toBe("");
  });

  it("gets summaries for multiple peers", async () => {
    const wiki = createMockWikiProvider();
    const engine = new RepresentationEngine(wiki, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });

    await wiki.savePage("[representation] user:alice/preferences", "Likes TypeScript", "personal", "user:alice");

    const summaries = await engine.getSummaries(["user:alice"]);
    expect(summaries).toContain("alice");
    expect(summaries).toContain("TypeScript");
  });

  it("handles LLM call failure gracefully", async () => {
    const wiki = createMockWikiProvider();
    const failingLLM = vi.fn().mockRejectedValue(new Error("LLM unavailable"));
    const engine = new RepresentationEngine(wiki, {
      callLLM: failingLLM,
      buildModel: "openrouter/free",
    });

    // Should not throw
    await engine.buildFromMessages(
      [{ role: "user", content: "Hello" }],
      { peerIds: ["user:moikapy"], sessionId: "sess_test" },
    );

    // No pages should be saved
    expect(wiki.pages.size).toBe(0);
  });

  it("handles empty LLM response gracefully", async () => {
    const wiki = createMockWikiProvider();
    const emptyLLM = vi.fn().mockResolvedValue({});
    const engine = new RepresentationEngine(wiki, {
      callLLM: emptyLLM,
      buildModel: "openrouter/free",
    });

    await engine.buildFromMessages(
      [{ role: "user", content: "Hello" }],
      { peerIds: ["user:moikapy"], sessionId: "sess_test" },
    );

    // No pages should be saved for empty response
    expect(wiki.pages.size).toBe(0);
  });
});

describe("formatRepresentationsForPrompt", () => {
  it("formats non-empty summaries", () => {
    const result = formatRepresentationsForPrompt("Moikapy: Prefers Python\nShalom: System design");
    expect(result).toContain("[Representations]");
    expect(result).toContain("representation_query");
    expect(result).toContain("Moikapy");
  });

  it("returns empty string for empty summaries", () => {
    expect(formatRepresentationsForPrompt("")).toBe("");
  });
});