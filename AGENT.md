# AGENT.md — Operator's Manual 🐉

This project uses a living knowledge base at `.codebase-wiki/`. The wiki is the **source of truth for architectural intent**. Code is the source of truth for current implementation.

**When they diverge, the wiki must be updated. Not optional. Not "when you remember." Always.**

---

## 🔴 Mandatory: Wiki Updates After Every Change

Every time you modify source code, you **MUST** update the wiki. No exceptions.

### The Update Protocol

After **any** of these events:
- Adding, removing, or renaming a module, function, or type
- Changing how modules interact (new dependency, changed interface)
- Fixing a bug that involved a design decision
- Adding a new feature or API surface
- Changing configuration, exports, or public interfaces

You **MUST** do the following, in order:

1. **Ingest**: Run `wiki_ingest` (source: `all`) to sync file tree and commits
2. **Update entities**: If you touched a source file, update its entity page with `wiki_entity`
3. **Document decisions**: If you made a design choice, create an ADR with `wiki_decision`
4. **Capture concepts**: If you implemented a pattern, create a concept with `wiki_concept`
5. **Lint**: Run `wiki_lint` and resolve any orphans or contradictions
6. **Resolve contradictions**: If `wiki_lint` reports content overlap between a hand-crafted page and an auto-generated stub, merge the stub INTO the hand-crafted page using `wiki_resolve strategy=merge`. Never delete hand-crafted pages in favor of stubs.

**If you skip this, the wiki rots. Rotten wikis are worse than no wiki.**

### What Counts as a "Design Decision"

- Choosing one library over another (ADR)
- Choosing a data flow pattern — e.g., eager subscription vs lazy (ADR)
- Introducing a new module or responsibility boundary (concept)
- Changing how errors are handled, retried, or classified (concept)
- Adding a new provider, model, or integration path (entity + concept)

### What Does NOT Need a Wiki Update

- Fixing a typo in a comment
- Formatting changes (prettier, lint fixes)
- Bumping a version number
- Adding a test that doesn't change behavior

---

## 📖 Wiki-First Reasoning

**Before** making significant architectural changes or adding new modules:

1. Run `wiki_query` to identify existing concepts or ADRs that might be affected
2. Check if a decision was already made — don't repeat or contradict it
3. If a concept already exists, extend it rather than creating a duplicate

---

## 🛠️ ADR Rules

- Code tells you *what* happened; the wiki tells you *why*
- **Never delete an ADR.** Update its status to `deprecated` or `superseded`
- Every ADR must have: Context, Decision, Status, and Consequences

---

## 📐 Concept Rules

When you implement a non-trivial pattern (e.g., "eager event stream," "provider-aware auth"):

1. Capture it as a concept via `wiki_concept`
2. Link it to the entity it applies to (`applies_to`)
3. Write a **Description** section explaining *why* it exists, not just *what* it does

This prevents future agents (or future you) from "fixing" a bug that was actually a deliberate design choice.

---

## ⚠️ Forbidden Actions

- **Do NOT** treat the wiki as a passive log that you update "later." Update it now.
- **Do NOT** ignore `wiki_lint` warnings. Fix them the same session they appear.
- **Do NOT** create orphan pages without cross-linking to existing pages.
- **Do NOT** rewrite git history to "clean up" (see SOUL.md).

## ℹ️ Known Lint False Positives

`wiki_lint` may report content overlap between hand-crafted pages (e.g., `adapter`) and phantom pages named after source files (e.g., `src/adapter.ts`). These are **false positives** caused by the lint scanning `## Key Files` content that mentions source paths. If the overlapping page does not exist as a file in `.codebase-wiki/entities/`, it is safe to ignore. Do NOT create duplicate pages to satisfy these warnings.

---

## Quick Reference

| Action | Tool |
|--------|------|
| Sync file tree + commits | `wiki_ingest` (source: `all`) |
| Enrich stub pages with LLM | `wiki_ingest` (source: `llm`) |
| Search the wiki | `wiki_query` |
| Create/update a module page | `wiki_entity` |
| Create/update an ADR | `wiki_decision` |
| Create/update a concept | `wiki_concept` |
| Check wiki health | `wiki_lint` |
| Resolve contradictions | `wiki_resolve` (use `strategy=merge` for stubs→hand-crafted) |

---

*The dragon remembers everything — but only if you write it down.* 🐉🛡️