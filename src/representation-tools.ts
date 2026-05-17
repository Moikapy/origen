/**
 * Representation tools for Origen agents.
 *
 * These tools let the agent query representations, observe peers,
 * create peers, and manually trigger representation building.
 *
 * @module representation-tools
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