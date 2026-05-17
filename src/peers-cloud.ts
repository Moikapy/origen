/**
 * CloudPeerProvider — Cloudflare D1-backed peer and session storage.
 *
 * @module peers-cloud
 * @remarks Edge-runtime compatible. No Node.js filesystem imports.
 */

import type { Peer, Session, PeerProvider } from "./types";

export class CloudPeerProvider implements PeerProvider {
  constructor(private d1Provider: () => Promise<any>) {}

  private async getDB() {
    return this.d1Provider();
  }

  async getOrCreatePeer(id: string, type = "user", metadata: Record<string, unknown> = {}): Promise<Peer> {
    const db = await this.getDB();
    const existing = await db.prepare("SELECT * FROM peers WHERE id = ?").bind(id).first();
    if (existing) {
      return {
        id: existing.id as string,
        type: existing.type as string,
        metadata: typeof existing.metadata === "string" ? JSON.parse(existing.metadata) : (existing.metadata ?? {}),
        createdAt: existing.created_at as number,
        updatedAt: existing.updated_at as number,
      };
    }
    const now = Date.now();
    await db.prepare(
      "INSERT INTO peers (id, type, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, type, JSON.stringify(metadata), now, now).run();
    return { id, type, metadata, createdAt: now, updatedAt: now };
  }

  async getPeer(id: string): Promise<Peer | null> {
    const db = await this.getDB();
    const row = await db.prepare("SELECT * FROM peers WHERE id = ?").bind(id).first();
    if (!row) return null;
    return {
      id: row.id as string,
      type: row.type as string,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {}),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  async updatePeer(id: string, metadata: Record<string, unknown>): Promise<Peer> {
    const db = await this.getDB();
    const existing = await this.getPeer(id);
    if (!existing) throw new Error(`Peer not found: ${id}`);
    const merged = { ...existing.metadata, ...metadata };
    const now = Date.now();
    await db.prepare(
      "UPDATE peers SET metadata = ?, updated_at = ? WHERE id = ?"
    ).bind(JSON.stringify(merged), now, id).run();
    return { ...existing, metadata: merged, updatedAt: now };
  }

  async listPeers(type?: string): Promise<Peer[]> {
    const db = await this.getDB();
    const rows = type
      ? await db.prepare("SELECT * FROM peers WHERE type = ?").bind(type).all()
      : await db.prepare("SELECT * FROM peers").all();
    return (rows.results ?? []).map((r: any) => ({
      id: r.id,
      type: r.type,
      metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata ?? {}),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async createSession(peerIds: string[], metadata: Record<string, unknown> = {}): Promise<Session> {
    const db = await this.getDB();
    const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    await db.prepare(
      "INSERT INTO sessions (id, peer_ids, started_at, ended_at, metadata) VALUES (?, ?, ?, NULL, ?)"
    ).bind(id, JSON.stringify(peerIds), now, JSON.stringify(metadata)).run();
    return { id, peerIds, startedAt: now, metadata };
  }

  async endSession(sessionId: string): Promise<void> {
    const db = await this.getDB();
    const now = Date.now();
    await db.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").bind(now, sessionId).run();
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const db = await this.getDB();
    const row = await db.prepare("SELECT * FROM sessions WHERE id = ?").bind(sessionId).first();
    if (!row) return null;
    const session: Session = {
      id: row.id as string,
      peerIds: typeof row.peer_ids === "string" ? JSON.parse(row.peer_ids) : (row.peer_ids ?? []),
      startedAt: row.started_at as number,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {}),
    };
    if (row.ended_at) session.endedAt = row.ended_at as number;
    return session;
  }

  async getActiveSessions(peerId?: string): Promise<Session[]> {
    const db = await this.getDB();
    const rows = peerId
      ? await db.prepare("SELECT * FROM sessions WHERE ended_at IS NULL AND peer_ids LIKE ?").bind(`%"${peerId}"%`).all()
      : await db.prepare("SELECT * FROM sessions WHERE ended_at IS NULL").all();
    return (rows.results ?? []).map((r: any) => {
      const session: Session = {
        id: r.id,
        peerIds: typeof r.peer_ids === "string" ? JSON.parse(r.peer_ids) : (r.peer_ids ?? []),
        startedAt: r.started_at,
        metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata ?? {}),
      };
      if (r.ended_at) session.endedAt = r.ended_at;
      return session;
    });
  }
}

export const PEERS_MIGRATION = `
CREATE TABLE IF NOT EXISTS peers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'user',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  peer_ids TEXT NOT NULL DEFAULT '[]',
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_peers_type ON peers(type);
CREATE INDEX IF NOT EXISTS idx_sessions_ended ON sessions(ended_at);
`;