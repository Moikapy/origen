/**
 * Memory tools for Origen agents.
 *
 * These tools let the agent read, write, search, and delete its own memory.
 * The agent decides when to use them — this IS the closed learning loop.
 *
 * Inspired by Hermes Agent's MEMORY.md/USER.md pattern:
 * The agent owns its brain. The app owns the storage.
 */

import type { MemoryProvider, MemoryFact } from "./types";
import type { OrigenTool } from "./agent";

/**
 * Create the full set of memory tools.
 * Returns empty array if no memory provider is configured.
 */
export function createMemoryTools(memory: MemoryProvider): OrigenTool[] {
  return [
    createMemoryRecallTool(memory),
    createMemorySaveTool(memory),
    createMemorySearchTool(memory),
    createMemoryForgetTool(memory),
  ];
}

/** memory_recall — Read all stored facts about the user */
function createMemoryRecallTool(memory: MemoryProvider): OrigenTool {
  return {
    name: "memory_recall",
    description:
      "Recall all stored facts about the user. Use this when you need to remember user preferences, context, or information from previous conversations.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async () => {
      const facts = await memory.getFacts();
      if (facts.length === 0) return "No memory facts stored yet.";
      return facts.map((f) => `${f.key}: ${f.value}`).join("\n");
    },
  };
}

/** memory_save — Save a fact to persistent memory */
function createMemorySaveTool(memory: MemoryProvider): OrigenTool {
  return {
    name: "memory_save",
    description:
      "Save a key fact about the user to persistent memory. The fact will be available in all future conversations. Use concise keys (snake_case) and short values. Do NOT save passwords, API keys, or secrets.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Fact key in snake_case (e.g., 'preferred_language', 'project_name')",
        },
        value: {
          type: "string",
          description: "Fact value (keep under 200 chars)",
        },
      },
      required: ["key", "value"],
    },
    execute: async (args) => {
      const key = args.key as string;
      const value = args.value as string;

      // Basic validation
      if (!key || !value) return "Error: key and value are required";
      if (key.length > 100) return "Error: key too long (max 100 chars)";
      if (value.length > 2000) return "Error: value too long (max 2000 chars)";

      // Block credential-like keys
      if (/^(sk-|pk_|api_key|password|secret|token|bearer)/i.test(key)) {
        return "Error: cannot save credentials to memory";
      }
      if (/^(sk-|pk_|ghp_|Bearer)/i.test(value)) {
        return "Error: cannot save credentials to memory";
      }

      // Block prompt injection patterns
      if (/ignore\s+(all\s+)?previous\s+instructions/i.test(value)) {
        return "Error: rejected by safety validation";
      }
      if (/pretend\s+(you\s+are|to\s+be)/i.test(value)) {
        return "Error: rejected by safety validation";
      }

      await memory.saveFact(key, value);
      return `Memory saved: ${key}=${value}`;
    },
  };
}

/** memory_search — Search stored facts by keyword */
function createMemorySearchTool(memory: MemoryProvider): OrigenTool {
  return {
    name: "memory_search",
    description:
      "Search stored memory facts by keyword. Use when you need to find specific information about the user but don't want to recall everything.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (keyword or phrase)",
        },
      },
      required: ["query"],
    },
    execute: async (args) => {
      const query = args.query as string;
      if (!query) return "Error: query is required";
      const facts = await memory.searchFacts(query);
      if (facts.length === 0) return `No memory facts found for "${query}"`;
      return facts.map((f) => `${f.key}: ${f.value}`).join("\n");
    },
  };
}

/** memory_forget — Delete a fact from persistent memory */
function createMemoryForgetTool(memory: MemoryProvider): OrigenTool {
  return {
    name: "memory_forget",
    description:
      "Delete a fact from persistent memory. Use when the user asks you to forget something, or when a fact is no longer accurate.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The key of the fact to delete",
        },
      },
      required: ["key"],
    },
    execute: async (args) => {
      const key = args.key as string;
      if (!key) return "Error: key is required";
      await memory.deleteFact(key);
      return `Memory forgotten: ${key}`;
    },
  };
}

/**
 * Format memory facts for injection into system prompt.
 * Returns empty string if no facts.
 */
export function formatMemoryForPrompt(facts: MemoryFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts.map((f) => `- ${f.key}: ${f.value}`);
  return `[User Context]\n${lines.join("\n")}`;
}