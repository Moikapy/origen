# Design: Origen Representations (Honcho-Style Peer Memory)

> **Status**: Draft
> **Author**: Shalom 🐉 + Moikapy
> **Date**: 2026-05-17

---

## Problem

Origen has two memory systems — flat key-value facts (`memory-tools.ts`) and structured wiki pages (`wiki-tools.ts`). Both require the LLM to **manually** decide what to save and when to query it. There is no automatic reasoning across conversations. After a chat ends, the agent forgets everything except what it explicitly saved.

Honcho solves this by building **representations** — synthesized conclusions about peers that persist across sessions and automatically update. Origen needs this capability.

## Decisions

Made through collaborative brainstorming on 2026-05-17:

1. **Full Honcho model** — Peers, sessions, representations, perspective-taking. Not just a "hook after conversations."
2. **Dynamic peers** — Any entity can be a peer. Users, agents, NPCs, organizations. Created at runtime, not predefined.
3. **Both auto + manual representation building** — Auto-build after conversations, manual trigger for imports or app-driven events.
4. **Configurable reasoning model** — The app picks which LLM runs representation extraction. Default cheap, crank up for quality.
5. **Representations write into existing wiki** — No new storage system. Wiki pages with `[representation]` namespace + metadata. Reuse FTS5/search/inverted-index infrastructure.
6. **Summary injection + query tool** — Compact representation summaries in system prompt (like memory facts), `representation_query` tool for deep reads.
7. **Default + explicit sessions** — Each `streamOrigen()` call is a session by default. Apps can group calls into logical sessions via `AgentConfig.session`.

---

## Architecture

### Data Model

Three new concepts added to Origen, plus one namespace convention for the wiki:

#### Peer

Any entity the agent builds knowledge about.

```typescript
interface Peer {
  id: string;           // Unique identifier (e.g., "user:moikapy", "agent:shalom", "npc:guard_42")
  type: "user" | "agent" | "npc" | "organization" | string;  // Extensible
  metadata: Record<string, unknown>;  // App-defined (name, email, role, etc.)
  createdAt: number;
  updatedAt: number;
}
```

Peers are created implicitly when they first appear in a conversation, or explicitly via `peer_create`.

#### Session

A conversation window. Groups messages for representation building.

```typescript
interface Session {
  id: string;           // Auto-generated UUID or app-provided
  peerIds: string[];    // All peers in this conversation
  startedAt: number;
  endedAt?: number;     // Set when session is marked complete
  metadata: Record<string, unknown>;  // App-defined (topic, channel, etc.)
}
```

**Default**: Each `streamOrigen()` call creates a session. Ends when the generator completes.
**Explicit**: App provides `sessionId` and `peerIds` in `AgentConfig` to group multiple calls.

#### Representation

An auto-generated wiki page storing synthesized knowledge about a peer.

Stored in the wiki with the namespace `[representation]` and metadata:

```typescript
interface RepresentationMeta {
  peerId: string;           // Which peer this is about
  sessionIds: string[];    // Sessions that contributed to this representation
  lastBuiltAt: number;     // When the representation was last updated
  buildModel: string;      // Which model built it (e.g., "openrouter/free")
}
```

**Wiki page title format**: `[representation] {peerId}/{aspect}`
- `[representation] user:moikapy/preferences` — "Moikapy prefers Python, functional patterns..."
- `[representation] user:moikapy/goals` — "Building an AI-powered business..."
- `[representation] agent:shalom/behaviors` — "Tends to over-engineer; push back when simpler exists"
- `[representation] npc:guard_42/knowledge` — "Knows about the north gate patrol schedule"

The namespace `[representation]` distinguishes auto-generated pages from hand-written wiki pages.

#### Summary (Derived, not stored)

A compact 1-3 sentence summary per peer, derived from all representation pages for that peer. Computed at session start and injected into the system prompt. Not stored — it's assembled on the fly from the wiki pages.

---

### Storage

Representations live in the same wiki providers that already exist:

- `CloudWikiProvider` — D1 + FTS5 (production, edge-compatible)
- `LocalWikiProvider` — Filesystem + inverted index (dev, Node.js)

**New D1 table** (for CloudWikiProvider):

```sql
CREATE TABLE IF NOT EXISTS representations (
  peer_id TEXT NOT NULL,
  aspect TEXT NOT NULL,
  content TEXT NOT NULL,
  session_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array
  build_model TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'personal',
  user_id TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (peer_id, aspect, COALESCE(user_id, ''))
);

CREATE INDEX IF NOT EXISTS idx_representations_peer ON representations(peer_id);
CREATE INDEX IF NOT EXISTS idx_representations_scope_user ON representations(scope, user_id);
```

**Local (filesystem)** — Uses wiki's existing directory structure with the `[representation]` prefix:

```
.origen-wiki/
  personal/
    user_moikapy/
      [representation] user:moikapy:preferences.md
      [representation] user:moikapy:goals.md
```

The `PeerProvider` is a lightweight metadata store — peers themselves (IDs, types, metadata) need a separate table since wiki pages only store content, not structured peer records.

```sql
CREATE TABLE IF NOT EXISTS peers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'user',
  metadata TEXT NOT NULL DEFAULT '{}',  -- JSON
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  peer_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}'   -- JSON
);
```

For local mode, these are stored as JSON files:

```
.origen-origen/
  peers.json
  sessions.json
```

---

### Provider Interface

```typescript
// types.ts additions

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

The `RepresentationEngine` uses `WikiProvider` + `PeerProvider` together. It reads/writes representations as wiki pages and stores peer/session metadata via `PeerProvider`.

---

### Representation Engine

The core system. Two modes: automatic (after conversations) and manual (on-demand).

#### Auto-Build: After Conversation

When `streamOrigen()` yields a `done` event:

1. **Identify peers** — Extract the user and any other entities from the conversation context
2. **Identify session** — Use the session ID from config (or auto-generated)
3. **Gather context** — Collect all messages from the session, plus existing representation pages for each peer
4. **Extract insights** — Call the reasoning LLM with a structured prompt:
   ```
   Analyze this conversation and extract insights about each participant.
   
   [Existing representation for user:moikapy]
   [Conversation messages]
   
   For each peer, update or create:
   - preferences: What they prefer or dislike
   - goals: What they're working toward
   - behaviors: How they communicate, what patterns you notice
   - knowledge: What they know or have learned
   
   Return JSON: { "peer_id": { "aspect": "updated content" } }
   ```
5. **Write to wiki** — Save each aspect as `[representation] {peerId}/{aspect}` in personal scope
6. **Update session** — Mark session as representation-built

This runs **asynchronously** — the user gets the `done` event immediately, representation building happens in the background.

#### Manual Build: On-Demand

```typescript
const engine = new RepresentationEngine(wikiProvider, peerProvider, {
  reasoningModel: "openrouter/free",
  getApiKey: async (provider) => getKey(provider),
});

// Build representations for a specific peer across all sessions
await engine.buildRepresentation("user:moikapy");

// Build for all peers in a session
await engine.buildSessionRepresentations(sessionId);
```

Or via the `representation_build` tool during conversation.

---

### Tool Interface

New tools added to Origen's tool set when representation is enabled:

```typescript
export function createRepresentationTools(
  peerProvider: PeerProvider,
  wikiProvider: WikiProvider,
  reasoningConfig: { model: ModelId; getApiKey: GetApiKeyFn }
): OrigenTool[];
```

| Tool | Description |
|---|---|
| `representation_query` | Search representation pages for a peer. Returns matching aspects. |
| `representation_observe` | Manually add an observation about a peer (before the auto-build fires) |
| `peer_create` | Create a new peer with id, type, and metadata |
| `peer_info` | Get a peer's metadata and representation summary |
| `representation_build` | Manually trigger representation building for a peer or session |

These are **additional tools** — the existing wiki and memory tools remain unchanged. The `representation_query` tool queries wiki pages with the `[representation]` prefix.

---

### System Prompt Injection

When representations are enabled, the system prompt gets augmented with:

```
[Representation Summary]
Moikapy: Software engineer building AI-powered tools. Prefers functional patterns, DRY code. Values faith-driven business. Currently working on Origen agent engine.
Shalom (self): Tends toward over-engineering. Strong at system design. Remembers past mistakes.

You have access to deeper knowledge about each participant. Use representation_query to read full representations when you need detail beyond this summary.
```

For multi-peer conversations, each peer gets a summary line.

For the agent itself, a self-representation is included — this is how the agent learns and improves its own behavior over time.

---

### AgentConfig Extension

```typescript
export interface AgentConfig {
  // ... existing fields ...

  /** Peer memory and representation system */
  peers?: {
    /** Provider for peer/session metadata. Required for representation system. */
    peerProvider: PeerProvider;
    /** Wiki provider for reading/writing representations. Uses existing wiki config if not set. */
    wikiProvider?: WikiProvider;
    /** Model to use for representation reasoning. Default: same as conversation model */
    reasoningModel?: ModelId;
    /** Whether to auto-build representations after conversations. Default: true */
    autoBuild?: boolean;
    /** Session ID for grouping multiple streamOrigen calls. Default: auto-generated per call */
    sessionId?: string;
    /** Peer IDs present in this conversation. Default: ["user:default"] */
    peerIds?: string[];
    /** Self-representation peer ID. Default: "agent:{appName}" */
    selfPeerId?: string;
  };
}
```

This follows the same pattern as `wiki` and `memory` — optional config that activates the feature.

---

### Auto-Build Lifecycle

```
streamOrigen(messages, context, config)
  │
  ├─ Config: peers.peerProvider provided?
  │    YES → Activate representation system
  │    NO  → Skip (wiki/memory work as-is)
  │
  ├─ Before conversation:
  │    1. Get or create peers for all peerIds
  │    2. Create session (or use provided sessionId)
  │    3. Load representation summaries for all peers
  │    4. Inject summaries into system prompt
  │
  ├─ During conversation:
  │    - Agent has representation_query, representation_observe, peer_info tools
  │    - Agent can manually build representation via representation_build
  │
  └─ After conversation (done event):
       1. End session
       2. If autoBuild !== false:
          a. Gather messages + existing representations
          b. Call reasoning model to extract insights
          c. Write/update representation pages in wiki
          d. Update session metadata
```

---

### Multi-Peer Example

A game with NPCs:

```typescript
const config: AgentConfig = {
  appName: "GameMaster",
  tools: [ /* game tools */ ],
  getD1: async () => gameD1,
  model: "openrouter/free",
  peers: {
    peerProvider: d1PeerProvider,
    peerIds: ["user:player_1", "npc:merchant", "npc:guard"],
    selfPeerId: "agent:gamemaster",
    reasoningModel: "openrouter/free",  // cheap model for extraction
  },
};

// After several conversations, the agent has built:
// [representation] user:player_1/preferences → "Prefers stealth over combat..."
// [representation] npc:merchant/knowledge → "Knows about the black market..."
// [representation] agent:gamemaster/behaviors → "Tends to make encounters too easy..."

// In conversation, the agent can:
// - Query what the merchant NPC knows: representation_query("npc:merchant")
// - Observe that the player is getting frustrated: representation_observe("user:player_1", "frustrated with difficulty")
// - Build a new representation after a major story event: representation_build("npc:merchant")
```

---

### Migration

**Backward compatible.** If `config.peers` is not provided, Origen works exactly as it does today — no changes to wiki, memory, or the agent loop. The representation system is opt-in.

For existing wiki pages, the `[representation]` namespace prefix ensures no collision with hand-written pages. The wiki search and page listing functions continue to work — representations appear as wiki pages with that prefix.

**Migration path for existing users**:

1. Add `peerProvider` to `AgentConfig`
2. Run a one-time `representation_build` for each existing user to bootstrap from their existing memory facts and wiki pages
3. Auto-build takes over from there

---

### Context-Mode Patterns

The representation system reuses the indexing/search patterns from context-mode (the MCP tool running this development session):

- **BM25/FTS5 search**: Same inverted-index pattern as `LocalWikiProvider` and `CloudWikiProvider`. Representations are wiki pages that get indexed automatically.
- **Session-scoped knowledge**: Like context-mode keeps per-session content, representations keep per-peer synthesized knowledge.
- **On-demand retrieval**: Like `ctx_search`, the `representation_query` tool lets the agent pull deep knowledge when needed, keeping the system prompt lean.

We learn from context-mode's patterns but build for production (Cloudflare Workers + Node.js), not just the dev tool context.

---

## Success Criteria

1. **Auto-representation works**: After a conversation, representation pages are created/updated for each peer in the session without manual intervention.
2. **Summary injection works**: System prompt includes compact representation summaries for all conversation peers.
3. **Representation query works**: Agent can call `representation_query` to read deep knowledge about any peer.
4. **Existing features untouched**: Wiki and memory tools work exactly as before when `config.peers` is not provided.
5. **Multi-peer scenarios**: Game NPCs, multi-user chats, and self-representation all work with the same system.
6. **Backward compatible**: No breaking changes to the existing API.

## Out of Scope (v1)

- **Vector/embedding search** — Representations use FTS5/BM25 keyword search. Vector similarity is v2.
- **Representation merging across apps** — Each app's representations are isolated. Cross-app sharing requires a shared provider.
- **Auto-reasoning about agent behavior** — Self-representation (agent:shalom) is built the same way, but the prompt needs careful design to avoid sycophancy. v1 includes it but marks it experimental.
- **Representation versioning/diffing** — Representations are overwritten. History tracking is v2.