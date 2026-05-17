/**
 * RepresentationEngine — Builds and manages Honcho-style peer representations.
 *
 * Representations are auto-generated wiki pages that store synthesized insights
 * about peers (users, agents, NPCs). The engine:
 * 1. Gathers conversation messages and existing representations
 * 2. Calls a reasoning LLM to extract insights
 * 3. Writes structured pages to the wiki with [representation] namespace
 * 4. Provides summary extraction for system prompt injection
 *
 * @module representation
 */

import type { WikiProvider, WikiScope } from "./types";

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
    let insights: Record<string, Record<string, string>>;
    try {
      insights = await this.llmConfig.callLLM(prompt, this.buildModel);
    } catch {
      // Best-effort: if LLM fails, don't crash the conversation
      return;
    }

    // Validate insights is a non-empty object
    if (!insights || typeof insights !== "object") return;

    // Save insights to wiki
    for (const [peerId, aspects] of Object.entries(insights)) {
      if (typeof aspects !== "object" || aspects === null) continue;
      for (const [aspect, content] of Object.entries(aspects)) {
        if (typeof content !== "string" || !content.trim()) continue;

        const scope: WikiScope = peerId.startsWith("agent:") ? "community" : "personal";
        const title = `${REPRESENTATION_PREFIX} ${peerId}/${aspect}`;
        const userId = scope === "personal" ? peerId : undefined;

        // Read existing content to merge
        const existing = await this.wiki.getPage(title, scope, userId);
        const merged = existing
          ? this.mergeContent(existing, content, sessionId)
          : content;

        await this.wiki.savePage(title, merged, scope, userId);
      }
    }
  }

  /**
   * Build a representation for a specific peer.
   * This is a manual trigger — the app should provide messages separately
   * via buildFromMessages for automatic extraction.
   */
  async buildRepresentation(_peerId: string): Promise<void> {
    // Manual build requires messages — this method exists for the tool
    // but the actual work is done by buildFromMessages
    // The tool will call buildFromMessages with stored messages
  }

  /**
   * Get a compact summary of a peer's representations for system prompt injection.
   */
  async getSummary(peerId: string): Promise<string> {
    const aspects = await this.getRepresentationAspects(peerId);
    if (Object.keys(aspects).length === 0) return "";

    const lines = Object.entries(aspects).map(
      ([aspect, content]) => `${aspect}: ${content}`,
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
      userId,
    );

    const aspects: Record<string, string> = {};
    for (const pageTitle of results) {
      const content = await this.wiki.getPage(pageTitle, scope, userId);
      if (content) {
        // Extract aspect from title: "[representation] peerId/aspect"
        const parts = pageTitle.split("/");
        const aspect = parts.pop() ?? "general";
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
}

/**
 * Format representation summaries for system prompt injection.
 */
export function formatRepresentationsForPrompt(summaries: string): string {
  if (!summaries) return "";
  return `[Representations]\n${summaries}\n\nUse representation_query to read full representations when you need detail beyond this summary.`;
}