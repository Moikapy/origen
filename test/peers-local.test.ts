import { describe, it, expect } from "vitest";
import type { Peer, Session, PeerProvider, PeersConfig, RepresentationMeta, WikiScope } from "../src/types";

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