import { describe, it, expect, vi } from "vitest";
import { createRepresentationTools } from "../src/representation-tools";
import type { PeerProvider, WikiProvider, Peer } from "../src/types";
import { RepresentationEngine } from "../src/representation";

function createMockWikiProvider(): WikiProvider {
  const pages = new Map<string, string>();
  function makeKey(title: string, scope: string, userId?: string): string {
    return `${scope}||${userId ?? "_"}||${title}`;
  }
  return {
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
      for (const [key] of pages) {
        if (key.toLowerCase().includes(query.toLowerCase())) {
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
          results.push(key.split("||")[2]);
        }
      }
      return results;
    },
  };
}

function createMockPeerProvider(): PeerProvider {
  const peers = new Map<string, Peer>();
  return {
    async getOrCreatePeer(id, type, metadata) {
      const existing = peers.get(id);
      if (existing) return existing;
      const peer: Peer = { id, type: type ?? "user", metadata: metadata ?? {}, createdAt: Date.now(), updatedAt: Date.now() };
      peers.set(id, peer);
      return peer;
    },
    async getPeer(id) { return peers.get(id) ?? null; },
    async updatePeer(id, metadata) {
      const peer = peers.get(id);
      if (!peer) throw new Error(`Peer not found: ${id}`);
      peer.metadata = { ...peer.metadata, ...metadata };
      peer.updatedAt = Date.now();
      return peer;
    },
    async listPeers(type) { return [...peers.values()].filter((p) => !type || p.type === type); },
    async createSession(peerIds, metadata) {
      return { id: `sess_${Date.now()}`, peerIds, startedAt: Date.now(), metadata: metadata ?? {} };
    },
    async endSession() {},
    async getSession() { return null; },
    async getActiveSessions() { return []; },
  };
}

describe("createRepresentationTools", () => {
  it("returns all 5 representation tools", () => {
    const wiki = createMockWikiProvider();
    const peerProvider = createMockPeerProvider();
    const engine = new RepresentationEngine(wiki, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });
    const tools = createRepresentationTools(peerProvider, wiki, engine);
    expect(tools).toHaveLength(5);
    expect(tools.find((t) => t.name === "representation_query")).toBeDefined();
    expect(tools.find((t) => t.name === "representation_observe")).toBeDefined();
    expect(tools.find((t) => t.name === "peer_create")).toBeDefined();
    expect(tools.find((t) => t.name === "peer_info")).toBeDefined();
    expect(tools.find((t) => t.name === "representation_build")).toBeDefined();
  });

  it("peer_create creates a peer", async () => {
    const wiki = createMockWikiProvider();
    const peerProvider = createMockPeerProvider();
    const engine = new RepresentationEngine(wiki, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });
    const tools = createRepresentationTools(peerProvider, wiki, engine);
    const createTool = tools.find((t) => t.name === "peer_create")!;
    const result = await createTool.execute(
      { id: "npc:guard_42", type: "npc", metadata: JSON.stringify({ name: "Guard" }) },
      async () => { throw new Error("no D1"); },
    );
    expect(result).toContain("npc:guard_42");
  });

  it("representation_observe saves an observation", async () => {
    const wiki = createMockWikiProvider();
    const peerProvider = createMockPeerProvider();
    const engine = new RepresentationEngine(wiki, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });
    const tools = createRepresentationTools(peerProvider, wiki, engine);
    const observeTool = tools.find((t) => t.name === "representation_observe")!;
    const result = await observeTool.execute(
      { peer_id: "user:moikapy", aspect: "preferences", observation: "Likes Python" },
      async () => { throw new Error("no D1"); },
    );
    expect(result).toContain("Observation recorded");
    expect(result).toContain("preferences");

    // Verify the page was saved
    const page = await wiki.getPage("[representation] user:moikapy/preferences", "personal", "user:moikapy");
    expect(page).toBe("Likes Python");
  });

  it("representation_observe appends to existing observations", async () => {
    const wiki = createMockWikiProvider();
    const peerProvider = createMockPeerProvider();
    const engine = new RepresentationEngine(wiki, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });

    // Pre-populate
    await wiki.savePage("[representation] user:moikapy/preferences", "Likes Python", "personal", "user:moikapy");

    const tools = createRepresentationTools(peerProvider, wiki, engine);
    const observeTool = tools.find((t) => t.name === "representation_observe")!;
    await observeTool.execute(
      { peer_id: "user:moikapy", aspect: "preferences", observation: "Also likes TypeScript" },
      async () => { throw new Error("no D1"); },
    );

    const page = await wiki.getPage("[representation] user:moikapy/preferences", "personal", "user:moikapy");
    expect(page).toContain("Python");
    expect(page).toContain("[manual] Also likes TypeScript");
  });

  it("peer_info returns peer metadata and summary", async () => {
    const wiki = createMockWikiProvider();
    const peerProvider = createMockPeerProvider();
    const engine = new RepresentationEngine(wiki, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });

    // Create a peer and add representation
    await peerProvider.getOrCreatePeer("user:alice", "user", { name: "Alice" });
    await wiki.savePage("[representation] user:alice/preferences", "Likes TypeScript", "personal", "user:alice");

    const tools = createRepresentationTools(peerProvider, wiki, engine);
    const infoTool = tools.find((t) => t.name === "peer_info")!;
    const result = await infoTool.execute(
      { peer_id: "user:alice" },
      async () => { throw new Error("no D1"); },
    );
    expect(result).toContain("user:alice");
    expect(result).toContain("TypeScript");
  });

  it("peer_info returns not found for unknown peer", async () => {
    const wiki = createMockWikiProvider();
    const peerProvider = createMockPeerProvider();
    const engine = new RepresentationEngine(wiki, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });
    const tools = createRepresentationTools(peerProvider, wiki, engine);
    const infoTool = tools.find((t) => t.name === "peer_info")!;
    const result = await infoTool.execute(
      { peer_id: "unknown" },
      async () => { throw new Error("no D1"); },
    );
    expect(result).toContain("not found");
  });
});