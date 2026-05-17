/**
 * LocalPeerProvider — Filesystem-backed peer and session storage.
 *
 * @module peers-local
 * @remarks This module imports `node:fs/promises` and `node:path`.
 *          It is NOT compatible with Cloudflare Workers. Use CloudPeerProvider instead.
 */

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Peer, Session, PeerProvider } from "./types";

export class LocalPeerProvider implements PeerProvider {
  private peers = new Map<string, Peer>();
  private sessions = new Map<string, Session>();
  private loaded = false;

  constructor(private rootDir: string = "./.origen-peers") {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const data = await readFile(join(this.rootDir, "peers.json"), "utf-8");
      const peerList: Peer[] = JSON.parse(data);
      for (const p of peerList) this.peers.set(p.id, p);
    } catch { /* no file yet */ }
    try {
      const data = await readFile(join(this.rootDir, "sessions.json"), "utf-8");
      const sessionList: Session[] = JSON.parse(data);
      for (const s of sessionList) this.sessions.set(s.id, s);
    } catch { /* no file yet */ }
  }

  private async persist(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(
      join(this.rootDir, "peers.json"),
      JSON.stringify([...this.peers.values()], null, 2),
      "utf-8",
    );
    await writeFile(
      join(this.rootDir, "sessions.json"),
      JSON.stringify([...this.sessions.values()], null, 2),
      "utf-8",
    );
  }

  async getOrCreatePeer(id: string, type = "user", metadata: Record<string, unknown> = {}): Promise<Peer> {
    await this.ensureLoaded();
    const existing = this.peers.get(id);
    if (existing) return existing;
    const now = Date.now();
    const peer: Peer = { id, type, metadata, createdAt: now, updatedAt: now };
    this.peers.set(id, peer);
    await this.persist();
    return peer;
  }

  async getPeer(id: string): Promise<Peer | null> {
    await this.ensureLoaded();
    return this.peers.get(id) ?? null;
  }

  async updatePeer(id: string, metadata: Record<string, unknown>): Promise<Peer> {
    await this.ensureLoaded();
    const peer = this.peers.get(id);
    if (!peer) throw new Error(`Peer not found: ${id}`);
    peer.metadata = { ...peer.metadata, ...metadata };
    peer.updatedAt = Date.now();
    this.peers.set(id, peer);
    await this.persist();
    return peer;
  }

  async listPeers(type?: string): Promise<Peer[]> {
    await this.ensureLoaded();
    const all = [...this.peers.values()];
    return type ? all.filter((p) => p.type === type) : all;
  }

  async createSession(peerIds: string[], metadata: Record<string, unknown> = {}): Promise<Session> {
    await this.ensureLoaded();
    const session: Session = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      peerIds,
      startedAt: Date.now(),
      metadata,
    };
    this.sessions.set(session.id, session);
    await this.persist();
    return session;
  }

  async endSession(sessionId: string): Promise<void> {
    await this.ensureLoaded();
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.endedAt = Date.now();
    this.sessions.set(sessionId, session);
    await this.persist();
  }

  async getSession(sessionId: string): Promise<Session | null> {
    await this.ensureLoaded();
    return this.sessions.get(sessionId) ?? null;
  }

  async getActiveSessions(peerId?: string): Promise<Session[]> {
    await this.ensureLoaded();
    const all = [...this.sessions.values()].filter((s) => !s.endedAt);
    return peerId ? all.filter((s) => s.peerIds.includes(peerId)) : all;
  }

  /** Clear all data. For testing only. */
  async clear(): Promise<void> {
    this.peers.clear();
    this.sessions.clear();
    this.loaded = true; // prevent re-load after clear
    try {
      await unlink(join(this.rootDir, "peers.json"));
    } catch { /* ok */ }
    try {
      await unlink(join(this.rootDir, "sessions.json"));
    } catch { /* ok */ }
  }
}