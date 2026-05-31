# Agent Configuration & Repo-Local Rules

## CLAUDE.md Convention

Every repository in the Latimer-Woods-Tech org maintains a `CLAUDE.md` file at the root. This file serves as the entry point for AI agents (Claude Code in VS Code, Sauna supervisor workflows, and future agent surfaces) to understand repo-specific constraints and practices.

### Structure

Every `CLAUDE.md` **begins with the Canonical Docs banner**:

```markdown
> 📘 **Canonical agent rules live in `factory`.** Read these in order from https://github.com/Latimer-Woods-Tech/Factory/tree/main/docs before touching anything:
> 1. `docs/supervisor/CONTEXT.md` — what every agent loads first
> 2. `docs/PLATFORM_STANDARDS.md` — 10 conformance dimensions
> 3. `docs/adr/*.md` (all Accepted) — architectural decisions
> 4. `docs/supervisor/TRUST_LADDER.md` — promotion + "clean run" rules
> 5. `docs/GAP_REGISTER.md` — current platform gaps
>
> This file holds **only repo-local rules** that don't apply elsewhere. Anything cross-cutting belongs in factory, not here.
```

(For Factory's own `CLAUDE.md`, use relative paths: `./docs/supervisor/CONTEXT.md` instead of GitHub URLs.)

### Content Rules

- **Canonical constraints, package matrix, stack pins, banned tools:** link to factory, do not duplicate. When you find duplication during a repo audit, remove it and replace with a one-line pointer.
- **Repo-local rules only:** conventions that apply *only* within this repository (e.g., HumanDesign's Forge persona conventions, videoking's Mux config patterns, factory-admin's Stripe-handler topology) stay in the local `CLAUDE.md`.
- **No cross-cutting content:** if a rule or constraint could apply to another repo in the org, it belongs in factory's canonical docs, not here.

### Why

Sauna (the supervisor) and Claude Code (in VS Code) are two agent surfaces that work on the same codebase. Sauna loads `factory/docs/supervisor/CONTEXT.md`; Claude Code loads the local `CLAUDE.md`. Without canonical linkage, they diverge — same product, two brains. The banner + pointer pattern ensures both surfaces read the same ground truth for hard constraints and stack decisions, while preserving the ability for each repo to document its own local conventions.

## Audit Schedule

Every Q1, verify that all consumer repos have:
1. The banner at the top of `CLAUDE.md`.
2. No duplication of factory canonical content.
3. Only repo-local rules in the remainder of the file.

Used in the Stage checklist for cross-repo sync work.
