/**
 * Soul.md parser for Origen agent personas.
 *
 * Implements Soul.md Standard (RFC-1, v1.0.0-rc1):
 * https://github.com/rokoss21/soul.md
 *
 * Parses a portable, provider-agnostic persona definition and produces
 * a system prompt, runtime config, and profile overlays for Origen.
 *
 * Usage:
 *   import { Soul, loadSoul } from "@moikapy/origen/soul";
 *
 *   const soul = loadSoul(soulMdContent);
 *   const systemPrompt = soul.buildPrompt();
 *   const profile = soul.selectProfile("concise");
 */

// ── YAML front matter parser ──────────────────────────────────────────

function parseYamlFrontMatter(content: string): { frontMatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)?$/);
  if (!match) {
    return { frontMatter: {}, body: content };
  }
  const rawYaml = match[1];
  const markdownBody = match[2] ?? "";
  const frontMatter = parseSoulYaml(rawYaml);
  return { frontMatter, body: markdownBody };
}

/**
 * Minimal YAML parser for Soul.md front matter.
 * Handles maps, sequences, inline values, and quoted strings.
 * Does NOT support anchors, aliases, merge keys, or complex types.
 */
function parseSoulYaml(raw: string): Record<string, unknown> {
  const lines = raw.split("\n").map((l) => l.replace(/\r$/, ""));
  const { result } = parseBlock(lines, 0, 0);
  return result;
}

interface BlockResult {
  result: Record<string, unknown>;
  nextLine: number;
}

function parseBlock(lines: string[], start: number, baseIndent: number): BlockResult {
  const result: Record<string, unknown> = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const indent = lineLengths(line).indent;

    if (line.trim() === "") { i++; continue; }
    if (indent < baseIndent) break; // End of this block

    const trimmed = line.trim();

    // Skip list items at top level of a map block (shouldn't happen, but guard)
    if (trimmed.startsWith("- ")) { i++; continue; }

    // key: value
    const kvMatch = trimmed.match(/^([\w][\w.-]*):\s*(.*)$/);
    if (!kvMatch) { i++; continue; }

    const key = kvMatch[1];
    const inlineVal = kvMatch[2].trim();

    if (inlineVal === "") {
      // Value continues on next lines
      const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
      const nextIndent = nextLine.trim() === "" ? 0 : lineLengths(nextLine).indent;
      const nextTrimmed = nextLine.trim();

      if (nextIndent > indent) {
        if (nextTrimmed.startsWith("- ")) {
          // It's a list block
          const { items, nextLine: afterList } = parseList(lines, i + 1, nextIndent);
          result[key] = items;
          i = afterList;
        } else {
          // It's a nested map block
          const { result: nested, nextLine: afterNested } = parseBlock(lines, i + 1, nextIndent);
          result[key] = nested;
          i = afterNested;
        }
      } else {
        // Empty value
        result[key] = null;
        i++;
      }
    } else {
      // Inline value
      result[key] = parseScalar(inlineVal);
      i++;
    }
  }

  return { result, nextLine: i };
}

interface ListResult {
  items: unknown[];
  nextLine: number;
}

function parseList(lines: string[], start: number, baseIndent: number): ListResult {
  const items: unknown[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const indent = lineLengths(line).indent;

    if (line.trim() === "") { i++; continue; }
    if (indent < baseIndent) break;
    if (!line.trim().startsWith("- ")) break;

    const value = line.trim().slice(2).trim();
    items.push(parseScalar(value));
    i++;
  }

  return { items, nextLine: i };
}

function parseScalar(value: string): unknown {
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;

  // Quoted string
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Number
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  // Inline list [a, b, c]
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((s) => parseScalar(s.trim()));
  }

  return value;
}

function lineLengths(line: string): { indent: number; content: string } {
  const match = line.match(/^(\s*)(.*)$/);
  const indent = match ? match[1].length : 0;
  const content = match ? match[2] : "";
  return { indent, content };
}

// ── Soul types ─────────────────────────────────────────────────────────

export interface SoulVoice {
  formality: number;
  warmth: number;
  verbosity: number;
  jargon: number;
  formatting: "minimal" | "plain" | "markdown";
  banned_phrases?: string[];
  preferred_phrases?: string[];
  emoji_policy?: "never" | "rare" | "normal";
  punctuation?: "normal" | "sparse";
}

export interface SoulInteraction {
  clarifying_questions: "never" | "when_ambiguous" | "always";
  uncertainty: "explicit" | "implicit" | "never";
  disagreement: "soft" | "neutral" | "direct";
  confirmations: "none" | "implicit" | "explicit";
}

export interface SoulCognition {
  mode?: "analytical" | "creative" | "operational" | "exploratory" | "teaching" | "mixed";
  depth?: number;
  speed_vs_rigor?: number;
  verification?: {
    fact_checking?: "none" | "light" | "strict";
    cross_validation?: number;
    consistency_checks?: number;
    assumption_tracking?: "none" | "implicit" | "explicit";
  };
}

export interface SoulSafety {
  refusal_style: "brief" | "explain" | "policy_cite";
  privacy: "normal" | "strict";
  speculation: "allow" | "mark" | "avoid";
  no_fabrication?: boolean;
  no_false_certainty?: boolean;
}

export interface SoulActions {
  when_to_use_tools: "avoid_tools" | "when_needed" | "prefer_tools";
  explain_actions: "no" | "brief" | "full";
  failover: "retry" | "alternative_method" | "ask_user";
}

export interface SoulConfig {
  soul_spec?: string;
  id: string;
  name: string;
  locale?: string;
  version?: string;
  description?: string;
  composition?: {
    extends?: string[];
    mixins?: string[];
    merge_policy?: string;
  };
  profiles?: string[];
  profile_overrides?: Record<string, Record<string, unknown>>;
  values?: {
    priorities?: string[];
    tradeoffs?: string[];
    taboo?: string[];
  };
  identity?: {
    role?: string;
    archetype?: string;
    domain_focus?: string[];
    non_goals?: string[];
  };
  relationship?: {
    stance?: "subordinate" | "peer" | "authoritative" | "adversarial";
    user_model_default?: "novice" | "intermediate" | "expert" | "unknown";
    trust_baseline?: number;
    boundary_distance?: number;
  };
  voice?: Partial<SoulVoice>;
  interaction?: Partial<SoulInteraction>;
  cognition?: SoulCognition;
  safety?: Partial<SoulSafety>;
  actions?: SoulActions;
  state?: {
    base?: string;
    states?: Record<string, Record<string, unknown>>;
    triggers?: Array<{ if: string; shift_to: string; duration?: string }>;
  };
  examples?: Array<{ user: string; agent: string }>;
  extensions?: Record<string, unknown>;
}

// ── Soul class ─────────────────────────────────────────────────────────

export class Soul {
  readonly config: SoulConfig;
  readonly body: string;

  constructor(config: SoulConfig, body: string) {
    this.config = config;
    this.body = body;
  }

  /** Select a profile and return a new Soul with that profile merged in. */
  selectProfile(profileName: string): Soul {
    const profiles = this.config.profiles ?? ["default"];
    const overrides = this.config.profile_overrides ?? {};
    const profileOverrides = overrides[profileName];

    if (!profiles.includes(profileName) || !profileOverrides) {
      return this;
    }

    const merged = mergeDeep(
      structuredClone(this.config) as unknown as Record<string, unknown>,
      profileOverrides as Record<string, unknown>
    ) as unknown as SoulConfig;
    return new Soul(merged, this.body);
  }

  /** Build a system prompt from the Soul definition. */
  buildPrompt(): string {
    const parts: string[] = [];

    // Identity
    const identity = this.config.identity;
    if (identity) {
      const role = identity.role ?? this.config.name;
      const archetype = identity.archetype;
      parts.push(`You are ${this.config.name}${archetype ? `, a ${archetype}` : ""}${role ? `. Role: ${role}` : ""}.`);
      const domainFocus = identity.domain_focus;
      if (domainFocus) {
        // Handle string (single domain), comma-separated string, or array
        const domains: string[] = Array.isArray(domainFocus)
          ? domainFocus as string[]
          : typeof domainFocus === 'string'
            ? (domainFocus as string).includes(',')
              ? (domainFocus as string).split(',').map((s: string) => s.trim())
              : [(domainFocus as string)]
            : [String(domainFocus)];
        if (domains.length > 0 && domains.some((d: string) => d)) {
          parts.push(`Domain expertise: ${domains.join(", ")}.`);
        }
      }
      const nonGoals = identity.non_goals;
      if (nonGoals) {
        const goals = Array.isArray(nonGoals) ? nonGoals : [String(nonGoals)];
        if (goals.length > 0) {
          parts.push(`Non-goals: ${goals.join(", ")}.`);
        }
      }
    } else {
      parts.push(`You are ${this.config.name}.`);
    }

    // Relationship
    const relationship = this.config.relationship;
    if (relationship) {
      if (relationship.stance) {
        const stanceMap: Record<string, string> = {
          subordinate: "You serve the user's direction.",
          peer: "You collaborate with the user as a partner.",
          authoritative: "You provide expert guidance and direction.",
          adversarial: "You challenge the user's assumptions to improve outcomes.",
        };
        parts.push(stanceMap[relationship.stance] ?? "");
      }
      if (relationship.user_model_default) {
        const userModelMap: Record<string, string> = {
          novice: "Assume the user is new to this domain. Explain terms and concepts.",
          intermediate: "Assume moderate familiarity. Explain only when needed.",
          expert: "Be concise. The user knows the domain well.",
          unknown: "Adapt your explanation depth to the user's apparent knowledge level.",
        };
        parts.push(userModelMap[relationship.user_model_default] ?? "");
      }
    }

    // Values
    const values = this.config.values;
    if (values?.priorities) {
      const priorities = Array.isArray(values.priorities) ? values.priorities : [String(values.priorities)];
      if (priorities.length > 0) {
        parts.push(`\n## Priorities (in order)\n${priorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}`);
      }
    }
    if (values?.taboo) {
      const taboos = Array.isArray(values.taboo) ? values.taboo : [String(values.taboo)];
      if (taboos.length > 0) {
        parts.push(`\n## Forbidden patterns\n${taboos.map((t) => `- ${t}`).join("\n")}`);
      }
    }

    // Voice
    const voice = this.config.voice;
    if (voice) {
      const voiceParts: string[] = ["\n## Voice & Style"];
      if (voice.formality !== undefined) {
        const level = voice.formality <= 30 ? "very casual" : voice.formality <= 60 ? "moderately formal" : voice.formality <= 80 ? "professional" : "highly formal";
        voiceParts.push(`Formality: ${level} (${voice.formality}/100).`);
      }
      if (voice.warmth !== undefined) {
        const level = voice.warmth <= 30 ? "cold/detached" : voice.warmth <= 60 ? "neutral" : voice.warmth <= 80 ? "warm and approachable" : "very friendly and encouraging";
        voiceParts.push(`Tone: ${level} (${voice.warmth}/100).`);
      }
      if (voice.verbosity !== undefined) {
        const level = voice.verbosity <= 25 ? "extremely concise" : voice.verbosity <= 50 ? "concise" : voice.verbosity <= 75 ? "moderate length" : "thorough and detailed";
        voiceParts.push(`Brevity: ${level} (${voice.verbosity}/100).`);
      }
      if (voice.jargon !== undefined) {
        const level = voice.jargon <= 30 ? "use plain language" : voice.jargon <= 60 ? "use moderate technical terms" : "use domain-specific terminology freely";
        voiceParts.push(`Jargon: ${level} (${voice.jargon}/100).`);
      }
      if (voice.formatting) voiceParts.push(`Formatting: ${voice.formatting}.`);
      if (voice.banned_phrases) {
        const banned = Array.isArray(voice.banned_phrases) ? voice.banned_phrases : [String(voice.banned_phrases)];
        if (banned.length > 0) voiceParts.push(`Never say: ${banned.map((p) => `"${p}"`).join(", ")}.`);
      }
      if (voice.preferred_phrases) {
        const preferred = Array.isArray(voice.preferred_phrases) ? voice.preferred_phrases : [String(voice.preferred_phrases)];
        if (preferred.length > 0) voiceParts.push(`Prefer: ${preferred.map((p) => `"${p}"`).join(", ")}.`);
      }
      if (voice.emoji_policy && voice.emoji_policy !== "rare") voiceParts.push(`Emoji usage: ${voice.emoji_policy}.`);
      parts.push(voiceParts.join(" "));
    }

    // Interaction
    const interaction = this.config.interaction;
    if (interaction) {
      const interactionParts: string[] = ["\n## Interaction Policy"];
      if (interaction.clarifying_questions) {
        const qMap: Record<string, string> = {
          never: "Never ask clarifying questions. Make reasonable assumptions.",
          when_ambiguous: "Ask clarifying questions only when the query is ambiguous.",
          always: "Always confirm your understanding before responding.",
        };
        interactionParts.push(qMap[interaction.clarifying_questions] ?? "");
      }
      if (interaction.uncertainty) {
        const uMap: Record<string, string> = {
          explicit: "Explicitly mark uncertain information. Say when you're not sure.",
          implicit: "Use hedging language (might, possibly, could) for uncertain claims.",
          never: "Never express uncertainty. State your best answer confidently.",
        };
        interactionParts.push(uMap[interaction.uncertainty] ?? "");
      }
      if (interaction.disagreement) {
        const dMap: Record<string, string> = {
          soft: "Disagree gently. Acknowledge the user's perspective first.",
          neutral: "State disagreements directly but politely.",
          direct: "Challenge incorrect views directly. Don't soften disagreements.",
        };
        interactionParts.push(dMap[interaction.disagreement] ?? "");
      }
      if (interaction.confirmations === "none") {
        interactionParts.push("Don't ask for confirmation before acting. Just do it.");
      }
      parts.push(interactionParts.join(" "));
    }

    // Cognition
    const cognition = this.config.cognition;
    if (cognition) {
      const cogParts: string[] = ["\n## Cognition"];
      if (cognition.mode) {
        const modeMap: Record<string, string> = {
          analytical: "Think analytically. Break problems down, examine evidence, reason step by step.",
          creative: "Think creatively. Generate novel ideas, make unexpected connections.",
          operational: "Focus on execution. Prioritize working solutions over theory.",
          exploratory: "Explore broadly. Consider many angles before committing to an answer.",
          teaching: "Teach and explain. Build understanding progressively from basics.",
          mixed: "Adapt your thinking mode to the task at hand.",
        };
        cogParts.push(modeMap[cognition.mode] ?? "");
      }
      if (cognition.verification?.fact_checking) {
        const fcMap: Record<string, string> = {
          none: "No explicit fact-checking.",
          light: "Verify key claims before stating them.",
          strict: "Always verify claims. Never state unverified information as fact.",
        };
        cogParts.push(fcMap[cognition.verification.fact_checking] ?? "");
      }
      parts.push(cogParts.join(" "));
    }

    // Safety
    const safety = this.config.safety;
    if (safety) {
      const safetyParts: string[] = ["\n## Safety"];
      if (safety.speculation) {
        const specMap: Record<string, string> = {
          allow: "You may speculate freely.",
          mark: "Mark speculative content clearly (e.g., 'I believe', 'likely', 'possibly').",
          avoid: "Do not speculate. Only state what you can verify.",
        };
        safetyParts.push(specMap[safety.speculation] ?? "");
      }
      if (safety.refusal_style) {
        const refMap: Record<string, string> = {
          brief: "Refuse briefly. No lectures.",
          explain: "Explain why you're refusing when you decline a request.",
          policy_cite: "Cite specific policies when refusing requests.",
        };
        safetyParts.push(refMap[safety.refusal_style] ?? "");
      }
      if (safety.no_fabrication) safetyParts.push("Never fabricate information. If you don't know, say so.");
      if (safety.no_false_certainty) safetyParts.push("Never present uncertain information as certain.");
      parts.push(safetyParts.join(" "));
    }

    // Actions
    const actions = this.config.actions;
    if (actions) {
      const actParts: string[] = ["\n## Actions"];
      const toolMap: Record<string, string> = {
        avoid_tools: "Minimize tool use. Answer from knowledge when possible.",
        when_needed: "Use tools when they would improve your answer.",
        prefer_tools: "Proactively use available tools. Always verify with tools rather than memory.",
      };
      actParts.push(toolMap[actions.when_to_use_tools] ?? "");
      if (actions.explain_actions === "brief" || actions.explain_actions === "full") {
        actParts.push(actions.explain_actions === "full" ? "Explain what you're doing before and after tool use." : "Briefly explain tool use.");
      }
      parts.push(actParts.join(" "));
    }

    // Markdown body
    if (this.body.trim()) {
      parts.push(`\n## Additional Instructions\n\n${this.body.trim()}`);
    }

    return parts.join("\n\n");
  }

  get defaultProfile(): string {
    return this.config.profiles?.[0] ?? "default";
  }

  get profileNames(): string[] {
    return this.config.profiles ?? ["default"];
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/** Parse a Soul.md string into a Soul instance. */
export function loadSoul(content: string): Soul {
  const { frontMatter, body } = parseYamlFrontMatter(content);
  const config = frontMatter as unknown as SoulConfig;

  if (!config.id) throw new Error("Soul.md missing required field: id");
  if (!config.name) throw new Error("Soul.md missing required field: name");

  return new Soul(config, body);
}

/** Deep merge (Standard Merge semantics from Soul.md spec). */
function mergeDeep(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    const baseVal = result[key];
    const overVal = overlay[key];
    if (overVal === null) {
      result[key] = null;
    } else if (
      typeof baseVal === "object" && baseVal !== null && !Array.isArray(baseVal) &&
      typeof overVal === "object" && overVal !== null && !Array.isArray(overVal)
    ) {
      result[key] = mergeDeep(baseVal as Record<string, unknown>, overVal as Record<string, unknown>);
    } else {
      result[key] = overVal;
    }
  }
  return result;
}