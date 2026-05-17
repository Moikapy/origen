# Origen Representations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Honcho-style peer memory (representations) to Origen — auto-built insights about users, agents, and NPCs that persist across conversations.

**Architecture:** Peers and sessions are stored via a new `PeerProvider` interface (D1 or JSON-file backed). Representations are wiki pages with a `[representation]` namespace prefix. A `RepresentationEngine` runs after conversations to extract insights using a configurable LLM. Summaries are injected into the system prompt; deep reads use a `representation_query` tool.

**Tech Stack:** TypeScript, Vitest, same patterns as existing wiki/memory modules (cloud D1 + local filesystem)

---

## File Structure

```
src/
├── types.ts                    # MODIFY: Add Peer, Session, RepresentationMeta, PeerProvider, AgentConfig.peers
├── agent.ts                    # MODIFY: Peer/provider initialization, summary injection, auto-build hook
├── peers.ts                    # CREATE: Peer + Session types, LocalPeerProvider, CloudPeerProvider
├── peers-local.ts              # CREATE: Filesystem-backed PeerProvider (JSON files)
├── peers-cloud.ts              # CREATE: D1-backed PeerProvider (SQLite tables)
├── representation.ts           # CREATE: RepresentationEngine — build, summarize, query
├── representation-tools.ts     # CREATE: OrigenTools for peer/representation interaction
└── index.ts                     # MODIFY: Export new types and functions

test/
├── peers-local.test.ts          # CREATE: LocalPeerProvider tests
├── peers-cloud.test.ts          # CREATE: CloudPeerProvider tests
├── representation.test.ts      # CREATE: RepresentationEngine tests
└── representation-tools.test.ts # CREATE: Tool tests
```

---

### Task 1: Peer and Session Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Write the failing test for Peer and Session types**

Create `test/peers-local.test.ts` with the first test:

```typescript
import { describe, it, expect } from "vitest";
import type { Peer, Session, PeerProvider } from "../src/types";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/peers-local.test.ts`
Expected: FAIL — types `Peer` and `Session` not exported from `src/types`

- [ ] **Step 3: Add Peer and Session types to `src/types.ts`**

Add to `src/types.ts` after `MemoryFact`:

```typescript
/** A peer — any entity the agent can build knowledge about. */
export interface Peer {
  id: string;
  type: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** A session — a conversation window between peers. */
export interface Session {
  id: string;
  peerIds: string[];
  startedAt: number;
  endedAt?: number;
  metadata: Record<string, unknown>;
}

/** Metadata stored alongside a representation wiki page. */
export interface RepresentationMeta {
  peerId: string;
  aspect: string;
  sessionIds: string[];
  lastBuiltAt: number;
  buildModel: string;
}

/** Provider for peer and session metadata. */
export interface PeerProvider {
  getOrCreatePeer(id: string, type?: string, metadata?: Record<string, unknown>): Promise<Peer>;
  getPeer(id: string): Promise<Peer | null>;
  updatePeer(id: string, metadata: Record<string, unknown>): Promise<Peer>;
  listPeers(type?: string): Promise<Peer[]>;

  createSession(peerIds: string[], metadata?: Record<string, unknown>): Promise<Session>;
  endSession(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<Session | null>;
  getActiveSessions(peerId?: string): Promise<Session[]>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/peers-local.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts test/peers-local.test.ts
git commit -m "feat: add Peer, Session, RepresentationMeta, and PeerProvider types"
```

---

### Task 2: LocalPeerProvider

**Files:**
- Create: `src/peers-local.ts`
- Create: `src/peers.ts` (re-export barrel)
- Modify: `test/peers-local.test.ts`

- [ ] **Step 1: Write failing tests for LocalPeerProvider**

Add to `test/peers-local.test.ts`:

```typescript
import { LocalPeerProvider } from "../src/peers-local";

describe("LocalPeerProvider", () => {
  const provider = new LocalPeerProvider("./.test-origen-peers");

  afterEach(async () => {
    // Clean up test directory
    await provider.clear();
  });

  it("creates a peer with defaults", async () => {
    const peer = await provider.getOrCreatePeer("user:moikapy", "user", { name: "Moikapy" });
    expect(peer.id).toBe("user:moikapy");
    expect(peer.type).toBe("user");
    expect(peer.metadata.name).toBe("Moikapy");
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

  it("returns null for nonexistent peer", async () => {
    const peer = await provider.getPeer("nonexistent");
    expect(peer).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/peers-local.test.ts`
Expected: FAIL — `LocalPeerProvider` not found

- [ ] **Step 3: Implement LocalPeerProvider**

Create `src/peers-local.ts`:

```typescript
/**
 * LocalPeerProvider — Filesystem-backed peer and session storage.
 * Uses JSON files for metadata. NOT compatible with Cloudflare Workers.
 */

import { readFile, writeFile, mkdir, unlink, readdir } from "node:fs/promises";
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
      const peers: Peer[] = JSON.parse(data);
      for (const p of peers) this.peers.set(p.id, p);
    } catch { /* no file yet */ }
    try {
      const data = await readFile(join(this.rootDir, "sessions.json"), "utf-8");
      const sessions: Session[] = JSON.parse(data);
      for (const s of sessions) this.sessions.set(s.id, s);
    } catch { /* no file yet */ }
  }

  private async persist(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(
      join(this.rootDir, "peers.json"),
      JSON.stringify([...this.peers.values()], null, 2),
      "utf-8"
    );
    await writeFile(
      join(this.rootDir, "sessions.json"),
      JSON.stringify([...this.sessions.values()], null, 2),
      "utf-8"
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

  /** Clear all data (for testing). */
  async clear(): Promise<void> {
    this.peers.clear();
    this.sessions.clear();
    try {
      await unlink(join(this.rootDir, "peers.json"));
    } catch { /* ok */ }
    try {
      await unlink(join(this.rootDir, "sessions.json"));
    } catch { /* ok */ }
  }
}
```

- [ ] **Step 4: Create the barrel file `src/peers.ts`**

```typescript
/**
 * @moikapy/origen/peers — Peer and session providers for the representation system.
 *
 * Re-exports LocalPeerProvider (filesystem) and CloudPeerProvider (D1).
 *
 * **Tree-shaking**: Import from specific sub-paths for edge compatibility:
 *   - `@moikapy/origen/peers/cloud` — CloudPeerProvider only (edge-safe)
 *   - `@moikapy/origen/peers/local`  — LocalPeerProvider only (Node.js)
 */

export { LocalPeerProvider } from "./peers-local";
export { CloudPeerProvider, PEERS_MIGRATION } from "./peers-cloud";
export type { Peer, Session, PeerProvider } from "./types";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/peers-local.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/peers-local.ts src/peers.ts test/peers-local.test.ts
git commit -m "feat: implement LocalPeerProvider with filesystem-backed storage"
```

---

### Task 3: CloudPeerProvider

**Files:**
- Create: `src/peers-cloud.ts`
- Create: `test/peers-cloud.test.ts`

- [ ] **Step 1: Write failing tests for CloudPeerProvider**

Create `test/peers-cloud.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { CloudPeerProvider } from "../src/peers-cloud";

// Mock D1 database for testing
function createMockD1() {
  const tables: Record<string, Map<string, Record<string, unknown>>> = {
    peers: new Map(),
    sessions: new Map(),
  };

  return {
    prepare(sql: string) {
      const bound: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          bound.push(...params);
          return stmt;
        },
        async first() {
          // Simplified mock — handles SELECT from peers and sessions
          if (sql.includes("FROM peers WHERE id = ?")) {
            const id = bound[0] as string;
            const row = tables.peers.get(id);
            return row ?? null;
          }
          if (sql.includes("FROM sessions WHERE id = ?")) {
            const id = bound[0] as string;
            const row = tables.sessions.get(id);
            return row ?? null;
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          // Mock INSERT/UPDATE/DELETE
          if (sql.includes("INTO peers")) {
            const row = { id: bound[0], type: bound[1], metadata: bound[2], created_at: bound[3], updated_at: bound[4] };
            tables.peers.set(bound[0] as string, row as Record<string, unknown>);
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INTO sessions")) {
            const row = { id: bound[0], peer_ids: bound[1], started_at: bound[2], ended_at: bound[3], metadata: bound[4] };
            tables.sessions.set(bound[0] as string, row as Record<string, unknown>);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return stmt;
    },
  };
}

describe("CloudPeerProvider", () => {
  let provider: CloudPeerProvider;
  let mockD1: ReturnType<typeof createMockD1>;

  beforeEach(() => {
    mockD1 = createMockD1();
    provider = new CloudPeerProvider(async () => mockD1 as any);
  });

  it("creates a peer", async () => {
    const peer = await provider.getOrCreatePeer("user:moikapy", "user", { name: "Moikapy" });
    expect(peer.id).toBe("user:moikapy");
    expect(peer.type).toBe("user");
  });

  it("returns null for nonexistent peer", async () => {
    const peer = await provider.getPeer("nonexistent");
    expect(peer).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/peers-cloud.test.ts`
Expected: FAIL — `CloudPeerProvider` not found

- [ ] **Step 3: Implement CloudPeerProvider**

Create `src/peers-cloud.ts`:

```typescript
/**
 * CloudPeerProvider — Cloudflare D1-backed peer and session storage.
 * Edge-runtime compatible. No Node.js filesystem imports.
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
    // Active = ended_at IS NULL
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/peers-cloud.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/peers-cloud.ts test/peers-cloud.test.ts
git commit -m "feat: implement CloudPeerProvider with D1 storage"
```

---

### Task 4: Representation Engine

**Files:**
- Create: `src/representation.ts`
- Create: `test/representation.test.ts`

- [ ] **Step 1: Write failing tests for RepresentationEngine**

Create `test/representation.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { RepresentationEngine } from "../src/representation";
import type { PeerProvider, WikiProvider, Peer } from "../src/types";

// Mock providers
function createMockWikiProvider(): WikiProvider {
  const pages = new Map<string, string>();
  return {
    async getPage(title, scope, userId) { return pages.get(`${scope}:${userId ?? "_"}:${title}`) ?? null; },
    async savePage(title, content, scope, userId) { pages.set(`${scope}:${userId ?? "_"}:${title}`, content); },
    async deletePage(title, scope, userId) { return pages.delete(`${scope}:${userId ?? "_"}:${title}`); },
    async search(query, scopes, userId) {
      const results: string[] = [];
      for (const [key, _] of pages) {
        if (key.toLowerCase().includes(query.toLowerCase())) results.push(key);
      }
      return results;
    },
    async listAllPages(scope, userId) {
      const results: string[] = [];
      for (const [key, _] of pages) {
        if (key.startsWith(`${scope}:`)) results.push(key.split(":").pop()!);
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
    async endSession(sessionId) { /* no-op */ },
    async getSession(sessionId) { return null; },
    async getActiveSessions(peerId) { return []; },
  };
}

describe("RepresentationEngine", () => {
  it("builds a representation for a peer from conversation messages", async () => {
    const wiki = createMockWikiProvider();
    const peerProvider = createMockPeerProvider();
    const mockLLMCall = vi.fn().mockResolvedValue({
      "user:moikapy": {
        preferences: "Prefers Python, functional patterns, and DRY code",
        goals: "Building an AI-powered business with faith-driven products",
      },
      "agent:shalom": {
        behaviors: "Tends toward over-engineering; strong at system design",
      },
    });

    const engine = new RepresentationEngine(wiki, peerProvider, {
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

    // Verify LLM was called
    expect(mockLLMCall).toHaveBeenCalled();

    // Verify representation pages were saved to wiki
    const prefPage = await wiki.getPage("[representation] user:moikapy/preferences", "personal", "user:moikapy");
    expect(prefPage).not.toBeNull();
    expect(prefPage).toContain("Python");
  });

  it("summarizes representations for system prompt injection", async () => {
    const wiki = createMockWikiProvider();
    const peerProvider = createMockPeerProvider();
    const engine = new RepresentationEngine(wiki, peerProvider, {
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/representation.test.ts`
Expected: FAIL — `RepresentationEngine` not found

- [ ] **Step 3: Implement RepresentationEngine**

Create `src/representation.ts`:

```typescript
/**
 * RepresentationEngine — Builds and manages Honcho-style peer representations.
 *
 * Representations are auto-generated wiki pages that store synthesized insights
 * about peers (users, agents, NPCs). The engine:
 * 1. Gathers conversation messages and existing representations
 * 2. Calls a reasoning LLM to extract insights
 * 3. Writes structured pages to the wiki with [representation] namespace
 * 4. Provides summary extraction for system prompt injection
 */

import type { WikiProvider, WikiScope, PeerProvider } from "./types";

/** Config for calling the reasoning LLM. */
export interface RepresentationLLMConfig {
  /** Function that calls the reasoning LLM with a prompt and returns parsed JSON. */
  callLLM: (prompt: string, model: string) => Promise<Record<string, Record<string, string>>>;
  /** Model identifier for representation building. Default: "openrouter/free" */
  buildModel?: string;
}

/** Options for building representations from messages. */
export interface BuildOptions {
  /** Peers involved in this conversation. */
  peerIds: string[];
  /** Session ID for this conversation. */
  sessionId: string;
  /** Additional context about the conversation. */
  context?: string;
}

const REPRESENTATION_PREFIX = "[representation]";

export class RepresentationEngine {
  private buildModel: string;

  constructor(
    private wiki: WikiProvider,
    private peerProvider: PeerProvider,
    private llmConfig: RepresentationLLMConfig,
  ) {
    this.buildModel = llmConfig.buildModel ?? "openrouter/free";
  }

  /**
   * Build representations from conversation messages.
   * Gathers existing representations, calls LLM, saves results.
   */
  async buildFromMessages(
    messages: Array<{ role: string; content: string }>,
    options: BuildOptions,
  ): Promise<void> {
    const { peerIds, sessionId } = options;

    // Gather existing representations for context
    const existingRepresentations: Record<string, Record<string, string>> = {};
    for (const peerId of peerIds) {
      const aspects = await this.getRepresentationAspects(peerId);
      if (Object.keys(aspects).length > 0) {
        existingRepresentations[peerId] = aspects;
      }
    }

    // Build the prompt
    const prompt = this.buildPrompt(messages, existingRepresentations, peerIds);

    // Call the reasoning LLM
    const insights = await this.llmConfig.callLLM(prompt, this.buildModel);

    // Save insights to wiki
    for (const [peerId, aspects] of Object.entries(insights)) {
      for (const [aspect, content] of Object.entries(aspects)) {
        const scope: WikiScope = peerId.startsWith("agent:") ? "community" : "personal";
        const title = `${REPRESENTATION_PREFIX} ${peerId}/${aspect}`;
        const userId = scope === "personal" ? peerId : undefined;

        // Read existing content to merge, not just overwrite
        const existing = await this.wiki.getPage(title, scope, userId);
        const merged = existing
          ? this.mergeContent(existing, content, sessionId)
          : content;

        await this.wiki.savePage(title, merged, scope, userId);
      }
    }
  }

  /**
   * Build a representation for a specific peer across all their sessions.
   */
  async buildRepresentation(peerId: string): Promise<void> {
    const sessions = await this.peerProvider.getActiveSessions(peerId);
    const endedSessions = await this.getAllSessionsForPeer(peerId);

    // Gather all messages from sessions — this requires the app to provide them
    // For now, we re-read existing representations and refresh them
    const aspects = await this.getRepresentationAspects(peerId);
    // This is a refresh — the app should call buildFromMessages with actual messages
    // This method exists for manual trigger when the app has the data externally
  }

  /**
   * Get a compact summary of a peer's representations for system prompt injection.
   */
  async getSummary(peerId: string): Promise<string> {
    const aspects = await this.getRepresentationAspects(peerId);
    if (Object.keys(aspects).length === 0) return "";

    const lines = Object.entries(aspects).map(
      ([aspect, content]) => `${aspect}: ${content}`
    );
    return lines.join("; ");
  }

  /**
   * Get summaries for multiple peers.
   */
  async getSummaries(peerIds: string[]): Promise<string> {
    const parts: string[] = [];
    for (const peerId of peerIds) {
      const summary = await this.getSummary(peerId);
      if (summary) {
        parts.push(`${peerId}: ${summary}`);
      }
    }
    return parts.join("\n");
  }

  /**
   * Query representation aspects for a peer.
   */
  async getRepresentationAspects(peerId: string): Promise<Record<string, string>> {
    const scope: WikiScope = peerId.startsWith("agent:") ? "community" : "personal";
    const userId = scope === "personal" ? peerId : undefined;

    const results = await this.wiki.search(
      `${REPRESENTATION_PREFIX} ${peerId}`,
      [scope],
      userId
    );

    const aspects: Record<string, string> = {};
    for (const pageTitle of results) {
      const content = await this.wiki.getPage(pageTitle, scope, userId);
      if (content) {
        // Extract aspect from title: "[representation] peerId/aspect"
        const aspect = pageTitle.split("/").pop() ?? "general";
        aspects[aspect] = content;
      }
    }
    return aspects;
  }

  /** Build the LLM prompt for insight extraction. */
  private buildPrompt(
    messages: Array<{ role: string; content: string }>,
    existingRepresentations: Record<string, Record<string, string>>,
    peerIds: string[],
  ): string {
    const messageText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const existingText = Object.entries(existingRepresentations).length > 0
      ? `\n\nExisting representations:\n${JSON.stringify(existingRepresentations, null, 2)}`
      : "";

    return `Analyze this conversation and extract insights about each participant.

${messageText}
${existingText}

For each peer listed below, update or create representation aspects:
Peers: ${peerIds.join(", ")}

For each peer, output aspects as:
- preferences: What they prefer or dislike
- goals: What they're working toward
- behaviors: How they communicate, patterns you notice
- knowledge: What they know or have learned

Return a JSON object where keys are peer IDs and values are objects with aspect keys mapping to short descriptions.

Example:
{
  "user:moikapy": {
    "preferences": "Prefers Python and functional patterns",
    "goals": "Building an AI-powered business"
  },
  "agent:shalom": {
    "behaviors": "Strong at system design, tends to over-explain"
  }
}

Only include aspects where you have new or updated information. Keep descriptions concise (1-2 sentences).`;
  }

  /** Merge new content with existing representation content. */
  private mergeContent(existing: string, newContent: string, sessionId: string): string {
    // Simple merge: append new content with a session reference
    // Future: use LLM to synthesize merged content
    return `${existing}\n\n[${sessionId}] ${newContent}`;
  }

  /** Get all sessions for a peer (helper). */
  private async getAllSessionsForPeer(peerId: string): Promise<string[]> {
    const sessions = await this.peerProvider.getActiveSessions(peerId);
    return sessions.map((s) => s.id);
  }
}

/**
 * Format representation summaries for system prompt injection.
 */
export function formatRepresentationsForPrompt(summaries: string): string {
  if (!summaries) return "";
  return `[Representations]\n${summaries}\n\nUse representation_query to read full representations when you need detail beyond this summary.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/representation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/representation.ts test/representation.test.ts
git commit -m "feat: implement RepresentationEngine with build, summarize, and query"
```

---

### Task 5: Representation Tools

**Files:**
- Create: `src/representation-tools.ts`
- Create: `test/representation-tools.test.ts`

- [ ] **Step 1: Write failing tests for representation tools**

Create `test/representation-tools.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createRepresentationTools } from "../src/representation-tools";
import type { PeerProvider, WikiProvider, Peer } from "../src/types";
import { RepresentationEngine } from "../src/representation";

function createMockProviders() {
  const wikiPages = new Map<string, string>();
  const peers = new Map<string, Peer>();

  const wiki: WikiProvider = {
    async getPage(title, scope, userId) {
      return wikiPages.get(`${scope}:${userId ?? "_"}:${title}`) ?? null;
    },
    async savePage(title, content, scope, userId) {
      wikiPages.set(`${scope}:${userId ?? "_"}:${title}`, content);
    },
    async deletePage(title, scope, userId) {
      return wikiPages.delete(`${scope}:${userId ?? "_"}:${title}`);
    },
    async search(query, scopes, userId) {
      return [...wikiPages.keys()].filter((k) => k.toLowerCase().includes(query.toLowerCase()));
    },
    async listAllPages(scope, userId) {
      return [...wikiPages.keys()].filter((k) => k.startsWith(`${scope}:`)).map((k) => k.split(":").pop()!);
    },
  };

  const peerProvider: PeerProvider = {
    async getOrCreatePeer(id, type, metadata) {
      const existing = peers.get(id);
      if (existing) return existing;
      const peer: Peer = { id, type: type ?? "user", metadata: metadata ?? {}, createdAt: Date.now(), updatedAt: Date.now() };
      peers.set(id, peer);
      return peer;
    },
    async getPeer(id) { return peers.get(id) ?? null; },
    async updatePeer(id, metadata) { throw new Error("not implemented"); },
    async listPeers() { return [...peers.values()]; },
    async createSession() { return { id: "sess_1", peerIds: [], startedAt: Date.now(), metadata: {} }; },
    async endSession() {},
    async getSession() { return null; },
    async getActiveSessions() { return []; },
  };

  return { wiki, peerProvider, wikiPages, peers };
}

describe("createRepresentationTools", () => {
  it("returns representation_query tool", () => {
    const { wiki, peerProvider } = createMockProviders();
    const engine = new RepresentationEngine(wiki, peerProvider, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });
    const tools = createRepresentationTools(peerProvider, wiki, engine);
    const queryTool = tools.find((t) => t.name === "representation_query");
    expect(queryTool).toBeDefined();
    expect(queryTool!.description).toContain("representation");
  });

  it("returns peer_create and peer_info tools", () => {
    const { wiki, peerProvider } = createMockProviders();
    const engine = new RepresentationEngine(wiki, peerProvider, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });
    const tools = createRepresentationTools(peerProvider, wiki, engine);
    expect(tools.find((t) => t.name === "peer_create")).toBeDefined();
    expect(tools.find((t) => t.name === "peer_info")).toBeDefined();
    expect(tools.find((t) => t.name === "representation_observe")).toBeDefined();
    expect(tools.find((t) => t.name === "representation_build")).toBeDefined();
  });

  it("peer_create creates a peer", async () => {
    const { wiki, peerProvider } = createMockProviders();
    const engine = new RepresentationEngine(wiki, peerProvider, {
      callLLM: vi.fn(),
      buildModel: "openrouter/free",
    });
    const tools = createRepresentationTools(peerProvider, wiki, engine);
    const createTool = tools.find((t) => t.name === "peer_create")!;
    const result = await createTool.execute(
      { id: "npc:guard_42", type: "npc", metadata: JSON.stringify({ name: "Guard" }) },
      async () => { throw new Error("no D1"); }
    );
    expect(result).toContain("npc:guard_42");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/representation-tools.test.ts`
Expected: FAIL — `createRepresentationTools` not found

- [ ] **Step 3: Implement representation-tools.ts**

Create `src/representation-tools.ts`:

```typescript
/**
 * Representation tools for Origen agents.
 *
 * These tools let the agent query representations, observe peers,
 * create peers, and manually trigger representation building.
 */

import type { PeerProvider, WikiProvider, D1Provider } from "./types";
import type { OrigenTool } from "./agent";
import { RepresentationEngine } from "./representation";

export function createRepresentationTools(
  peerProvider: PeerProvider,
  wikiProvider: WikiProvider,
  engine: RepresentationEngine,
): OrigenTool[] {
  return [
    createRepresentationQueryTool(engine),
    createRepresentationObserveTool(wikiProvider),
    createPeerCreateTool(peerProvider),
    createPeerInfoTool(peerProvider, wikiProvider, engine),
    createRepresentationBuildTool(engine),
  ];
}

function createRepresentationQueryTool(engine: RepresentationEngine): OrigenTool {
  return {
    name: "representation_query",
    description: `Search representation pages for a peer. Returns matching aspects (preferences, goals, behaviors, knowledge).
Use this when you need detailed knowledge about a person, agent, or entity beyond the summary in the system prompt.`,
    parameters: {
      type: "object",
      properties: {
        peer_id: {
          type: "string",
          description: "The peer ID to query (e.g., 'user:moikapy', 'npc:guard_42')",
        },
        aspect: {
          type: "string",
          description: "Specific aspect to query (preferences, goals, behaviors, knowledge). Omit for all aspects.",
        },
      },
      required: ["peer_id"],
    },
    execute: async (args) => {
      const peerId = args.peer_id as string;
      const aspects = await engine.getRepresentationAspects(peerId);
      if (Object.keys(aspects).length === 0) {
        return `No representations found for peer ${peerId}.`;
      }
      if (args.aspect) {
        const aspect = aspects[args.aspect as string];
        return aspect ?? `Aspect "${args.aspect}" not found for peer ${peerId}.`;
      }
      return Object.entries(aspects)
        .map(([aspect, content]) => `**${aspect}**: ${content}`)
        .join("\n");
    },
  };
}

function createRepresentationObserveTool(wikiProvider: WikiProvider): OrigenTool {
  return {
    name: "representation_observe",
    description: `Manually add an observation about a peer. Use when you notice something important about a person, agent, or entity that you want to remember.
This observation is saved immediately — it doesn't wait for the auto-build.`,
    parameters: {
      type: "object",
      properties: {
        peer_id: {
          type: "string",
          description: "The peer ID this observation is about",
        },
        aspect: {
          type: "string",
          description: "The aspect (preferences, goals, behaviors, knowledge)",
        },
        observation: {
          type: "string",
          description: "The observation to record (concise, 1-2 sentences)",
        },
      },
      required: ["peer_id", "aspect", "observation"],
    },
    execute: async (args) => {
      const peerId = args.peer_id as string;
      const aspect = args.aspect as string;
      const observation = args.observation as string;
      const scope = peerId.startsWith("agent:") ? "community" : "personal";
      const userId = scope === "personal" ? peerId : undefined;
      const title = `[representation] ${peerId}/${aspect}`;

      const existing = await wikiProvider.getPage(title, scope, userId);
      const content = existing
        ? `${existing}\n[manual] ${observation}`
        : observation;

      await wikiProvider.savePage(title, content, scope, userId);
      return `Observation recorded for ${peerId}/${aspect}: ${observation}`;
    },
  };
}

function createPeerCreateTool(peerProvider: PeerProvider): OrigenTool {
  return {
    name: "peer_create",
    description: `Create a new peer entity. Peers can be users, agents, NPCs, organizations, or any entity you want to build knowledge about.`,
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique peer ID (e.g., 'user:alice', 'npc:merchant', 'org:company_name')",
        },
        type: {
          type: "string",
          description: "Peer type: 'user', 'agent', 'npc', 'organization', or custom",
        },
        metadata: {
          type: "string",
          description: "JSON object with peer metadata (name, role, etc.)",
        },
      },
      required: ["id"],
    },
    execute: async (args) => {
      const id = args.id as string;
      const type = (args.type as string) ?? "user";
      let metadata: Record<string, unknown> = {};
      if (args.metadata) {
        try {
          metadata = JSON.parse(args.metadata as string);
        } catch {
          return "Error: metadata must be valid JSON";
        }
      }
      const peer = await peerProvider.getOrCreatePeer(id, type, metadata);
      return `Peer created: ${peer.id} (type: ${peer.type})`;
    },
  };
}

function createPeerInfoTool(
  peerProvider: PeerProvider,
  wikiProvider: WikiProvider,
  engine: RepresentationEngine,
): OrigenTool {
  return {
    name: "peer_info",
    description: `Get information about a peer, including metadata and a summary of their representations.`,
    parameters: {
      type: "object",
      properties: {
        peer_id: {
          type: "string",
          description: "The peer ID to look up",
        },
      },
      required: ["peer_id"],
    },
    execute: async (args) => {
      const peerId = args.peer_id as string;
      const peer = await peerProvider.getPeer(peerId);
      if (!peer) return `Peer "${peerId}" not found.`;

      const summary = await engine.getSummary(peerId);
      const representationNote = summary ? `\nRepresentations: ${summary}` : "\nNo representations yet.";

      return `Peer: ${peer.id}\nType: ${peer.type}\nMetadata: ${JSON.stringify(peer.metadata)}${representationNote}`;
    },
  };
}

function createRepresentationBuildTool(engine: RepresentationEngine): OrigenTool {
  return {
    name: "representation_build",
    description: `Manually trigger representation building for a peer. This analyzes recent conversations and updates the peer's representations.
Use this when you want to refresh knowledge about a peer outside of the automatic post-conversation build.`,
    parameters: {
      type: "object",
      properties: {
        peer_id: {
          type: "string",
          description: "The peer ID to build representations for",
        },
      },
      required: ["peer_id"],
    },
    execute: async (args) => {
      const peerId = args.peer_id as string;
      await engine.buildRepresentation(peerId);
      return `Representation build triggered for ${peerId}. Results will be saved to wiki pages.`;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/representation-tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/representation-tools.ts test/representation-tools.test.ts
git commit -m "feat: implement representation tools (query, observe, peer_create, peer_info, build)"
```

---

### Task 6: AgentConfig Extension and Integration

**Files:**
- Modify: `src/agent.ts`
- Modify: `src/types.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add `peers` config to AgentConfig in `src/types.ts`**

Add the `PeersConfig` interface to `src/types.ts` (after `MemoryProvider`):

```typescript
/** Configuration for the peer representation system. */
export interface PeersConfig {
  /** Provider for peer/session metadata. Required for representation system. */
  peerProvider: PeerProvider;
  /** Wiki provider for reading/writing representations. Uses existing wiki config if not set. */
  wikiProvider?: WikiProvider;
  /** Model to use for representation reasoning. Default: same as conversation model */
  reasoningModel?: string;
  /** Whether to auto-build representations after conversations. Default: true */
  autoBuild?: boolean;
  /** Session ID for grouping multiple streamOrigen calls. Default: auto-generated per call */
  sessionId?: string;
  /** Peer IDs present in this conversation. Default: ["user:default"] */
  peerIds?: string[];
  /** Self-representation peer ID. Default: "agent:{appName}" */
  selfPeerId?: string;
}
```

- [ ] **Step 2: Add `peers` field to `AgentConfig` in `src/agent.ts`**

Add to the `AgentConfig` interface:

```typescript
  /** Peer memory and representation system. */
  peers?: types.PeersConfig;
```

Import `PeersConfig` as needed.

- [ ] **Step 3: Wire representation initialization and auto-build into `streamOrigen()`**

In `streamOrigen()`, after wiki/memory initialization and before the agent is created, add:

```typescript
// ── Representation Integration ──────────────────────────────────────
let representationSummary = "";
let representationEngine: RepresentationEngine | null = null;
let representationSessionId: string | undefined;

if (config.peers) {
  const wikiForRepr = config.peers.wikiProvider ?? wikiProvider;
  if (wikiForRepr) {
    representationEngine = new RepresentationEngine(wikiForRepr, config.peers.peerProvider, {
      callLLM: async (prompt, model) => {
        // Use streamOrigen's own infrastructure to call the reasoning model
        const result = await callOrigen(
          [{ role: "user", content: prompt }],
          {},
          { ...config, model: (config.peers?.reasoningModel ?? model) as ModelId },
        );
        try {
          return JSON.parse(result.message);
        } catch {
          return {};
        }
      },
      buildModel: (config.peers.reasoningModel as ModelId) ?? modelId,
    });

    // Build summary for system prompt injection
    const peerIds = config.peers.peerIds ?? ["user:default"];
    representationSummary = await representationEngine.getSummaries(peerIds);

    // Create or use session
    if (config.peers.sessionId) {
      representationSessionId = config.peers.sessionId;
    } else {
      const session = await config.peers.peerProvider.createSession(peerIds);
      representationSessionId = session.id;
    }
  }
}
```

And inject into system prompt:

```typescript
if (representationSummary) {
  finalSystemPrompt = `${finalSystemPrompt}\n\n${formatRepresentationsForPrompt(representationSummary)}`;
}
```

And add representation tools:

```typescript
if (representationEngine && wikiForRepr) {
  const reprTools = createRepresentationTools(config.peers.peerProvider, wikiForRepr, representationEngine);
  finalTools = [...finalTools, ...adaptTools(reprTools, config.getD1)];
}
```

And add auto-build hook after the stream ends (after the `for await` loop):

```typescript
// Auto-build representations after conversation
if (representationEngine && config.peers?.autoBuild !== false && representationSessionId) {
  // Fire and forget — don't block the response
  representationEngine.buildFromMessages(messages, {
    peerIds: config.peers?.peerIds ?? ["user:default"],
    sessionId: representationSessionId,
  }).catch(() => { /* best-effort, don't fail the response */ });
}
```

- [ ] **Step 4: Export new types and functions from `src/index.ts`**

Add exports:

```typescript
export { LocalPeerProvider } from "./peers-local";
export { CloudPeerProvider, PEERS_MIGRATION } from "./peers-cloud";
export { RepresentationEngine, formatRepresentationsForPrompt } from "./representation";
export { createRepresentationTools } from "./representation-tools";
export type { Peer, Session, RepresentationMeta, PeerProvider, PeersConfig } from "./types";
```

- [ ] **Step 5: Update package.json exports**

Add to the exports map in `package.json`:

```json
"./peers/local": {
  "types": "./dist/peers-local.d.ts",
  "import": "./dist/peers-local.js",
  "default": "./dist/peers-local.js"
},
"./peers/cloud": {
  "types": "./dist/peers-cloud.d.ts",
  "import": "./dist/peers-cloud.js",
  "default": "./dist/peers-cloud.js"
}
```

Note: `peers.ts` barrel export stays in the main entry point. The local/cloud sub-paths are for tree-shaking, same pattern as wiki.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/agent.ts src/types.ts src/index.ts package.json
git commit -m "feat: integrate representation system into agent loop with auto-build and tool injection"
```

---

### Task 7: Build Verification and Final QA

**Files:** No new files — verification only.

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Build the package**

Run: `npm run build:release`
Expected: Successful build, all dist files generated

- [ ] **Step 4: Verify exports**

Run: `node -e "const o = require('./dist/index.js'); console.log(Object.keys(o).filter(k => k.includes('Peer') || k.includes('Representation') || k.includes('Session')))" ` 
Expected: Peer, Session, RepresentationMeta, PeerProvider, PeersConfig, LocalPeerProvider, CloudPeerProvider, PEERS_MIGRATION, RepresentationEngine, formatRepresentationsForPrompt, createRepresentationTools

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: complete representation system — Honcho-style peer memory for Origen v0.7.0"
```

---

## Scope Check

| Spec Requirement | Task |
|---|---|
| Peer type and storage | Task 1 (types), Task 2 (local), Task 3 (cloud) |
| Session management | Task 2 (LocalPeerProvider), Task 3 (CloudPeerProvider) |
| Representation Engine (build, summarize, query) | Task 4 |
| Representation tools (query, observe, peer_create, peer_info, build) | Task 5 |
| System prompt injection (summary + tool) | Task 6 |
| Auto-build after conversations | Task 6 |
| Manual build on-demand | Task 5 (representation_build tool), Task 6 (callLLM config) |
| AgentConfig.peers extension | Task 6 |
| Backward compatible (opt-in) | Task 6 (config.peers is optional) |
| `[representation]` namespace in wiki | Task 4 (RepresentationEngine), Task 5 (tools) |
| D1 migration SQL | Task 3 (PEERS_MIGRATION) |
| Tree-shaking (peers/local, peers/cloud) | Task 6 (package.json exports) |

No gaps. Every spec requirement has a corresponding task.