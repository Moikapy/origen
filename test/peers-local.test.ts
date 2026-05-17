import { describe, it, expect, afterEach } from "vitest";
import type { Peer, Session, PeerProvider, PeersConfig, RepresentationMeta, WikiScope } from "../src/types";
import { LocalPeerProvider } from "../src/peers-local";

describe("Peer and Session types", () => {
  it("Peer has required fields", () => {
    const peer: Peer = {
      id: "user:moikapy",
      type: "user",
      metadata: { name: "Moikapy" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(peer.id).toBe("user:moikapy");
    expect(peer.type).toBe("user");
  });

  it("Session has required fields", () => {
    const session: Session = {
      id: "sess_abc123",
      peerIds: ["user:moikapy", "agent:shalom"],
      startedAt: Date.now(),
      metadata: {},
    };
    expect(session.peerIds).toHaveLength(2);
    expect(session.endedAt).toBeUndefined();
  });

  it("Session can have endedAt", () => {
    const session: Session = {
      id: "sess_abc123",
      peerIds: ["user:moikapy"],
      startedAt: Date.now(),
      endedAt: Date.now(),
      metadata: {},
    };
    expect(session.endedAt).toBeDefined();
  });

  it("RepresentationMeta has required fields", () => {
    const meta: RepresentationMeta = {
      peerId: "user:moikapy",
      aspect: "preferences",
      sessionIds: ["sess_1", "sess_2"],
      lastBuiltAt: Date.now(),
      buildModel: "openrouter/free",
    };
    expect(meta.peerId).toBe("user:moikapy");
    expect(meta.aspect).toBe("preferences");
  });

  it("PeersConfig requires peerProvider", () => {
    const mockProvider: PeerProvider = {
      getOrCreatePeer: async () => ({ id: "test", type: "user", metadata: {}, createdAt: 0, updatedAt: 0 }),
      getPeer: async () => null,
      updatePeer: async () => ({ id: "test", type: "user", metadata: {}, createdAt: 0, updatedAt: 0 }),
      listPeers: async () => [],
      createSession: async () => ({ id: "s1", peerIds: [], startedAt: 0, metadata: {} }),
      endSession: async () => {},
      getSession: async () => null,
      getActiveSessions: async () => [],
    };

    const config: PeersConfig = {
      peerProvider: mockProvider,
    };
    expect(config.peerProvider).toBeDefined();
    expect(config.autoBuild).toBeUndefined(); // default behavior
  });
});

describe("LocalPeerProvider", () => {
  const provider = new LocalPeerProvider("./.test-origen-peers");

  afterEach(async () => {
    await provider.clear();
  });

  it("creates a peer with defaults", async () => {
    const peer = await provider.getOrCreatePeer("user:moikapy", "user", { name: "Moikapy" });
    expect(peer.id).toBe("user:moikapy");
    expect(peer.type).toBe("user");
    expect(peer.metadata.name).toBe("Moikapy");
    expect(peer.createdAt).toBeGreaterThan(0);
  });

  it("returns existing peer on duplicate create", async () => {
    const peer1 = await provider.getOrCreatePeer("user:moikapy", "user");
    const peer2 = await provider.getOrCreatePeer("user:moikapy", "user");
    expect(peer1.id).toBe(peer2.id);
    expect(peer1.createdAt).toBe(peer2.createdAt);
  });

  it("updates peer metadata", async () => {
    await provider.getOrCreatePeer("user:moikapy", "user");
    const updated = await provider.updatePeer("user:moikapy", { timezone: "America/New_York" });
    expect(updated.metadata.timezone).toBe("America/New_York");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(updated.createdAt);
  });

  it("creates and ends a session", async () => {
    const session = await provider.createSession(["user:moikapy", "agent:shalom"]);
    expect(session.peerIds).toHaveLength(2);
    expect(session.endedAt).toBeUndefined();

    await provider.endSession(session.id);
    const ended = await provider.getSession(session.id);
    expect(ended?.endedAt).toBeDefined();
  });

  it("lists peers by type", async () => {
    await provider.getOrCreatePeer("user:alice", "user");
    await provider.getOrCreatePeer("npc:guard", "npc");

    const users = await provider.listPeers("user");
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe("user:alice");
  });

  it("lists all peers without type filter", async () => {
    await provider.getOrCreatePeer("user:alice", "user");
    await provider.getOrCreatePeer("npc:guard", "npc");

    const all = await provider.listPeers();
    expect(all).toHaveLength(2);
  });

  it("returns null for nonexistent peer", async () => {
    const peer = await provider.getPeer("nonexistent");
    expect(peer).toBeNull();
  });

  it("returns null for nonexistent session", async () => {
    const session = await provider.getSession("nonexistent");
    expect(session).toBeNull();
  });

  it("tracks active sessions by peer", async () => {
    await provider.getOrCreatePeer("user:alice", "user");
    const s1 = await provider.createSession(["user:alice"]);
    const s2 = await provider.createSession(["user:alice", "agent:shalom"]);

    const active = await provider.getActiveSessions("user:alice");
    expect(active).toHaveLength(2);

    await provider.endSession(s1.id);
    const stillActive = await provider.getActiveSessions("user:alice");
    expect(stillActive).toHaveLength(1);
  });

  it("throws on update of nonexistent peer", async () => {
    await expect(provider.updatePeer("ghost", {})).rejects.toThrow("Peer not found");
  });

  it("throws on end of nonexistent session", async () => {
    await expect(provider.endSession("ghost_session")).rejects.toThrow("Session not found");
  });

  it("persists peers across instances", async () => {
    await provider.getOrCreatePeer("user:persist_test", "user", { tag: "first" });

    // Create a new provider instance pointing to the same directory
    const provider2 = new LocalPeerProvider("./.test-origen-peers");
    const peer = await provider2.getPeer("user:persist_test");
    expect(peer).not.toBeNull();
    expect(peer?.metadata.tag).toBe("first");
  });
});