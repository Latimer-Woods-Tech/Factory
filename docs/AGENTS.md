# Agent Context & CLAUDE.md Convention

**Loaded by:** Claude Code (VS Code extension), Sauna supervisor, all agent sessions  
**Sibling docs:** [`CONTEXT.md`](./supervisor/CONTEXT.md) (authoritative governance) · [`PLATFORM_STANDARDS.md`](./PLATFORM_STANDARDS.md) (conformance rules)  
**Established:** 2026-06-XX — canonical docs linkage across all consumer repos

## CLAUDE.md Convention

Every repository in the Latimer-Woods-Tech org that uses Claude Code or Anthropic agents must maintain a `CLAUDE.md` file at the repository root. This file serves as the agent's context bridge to factory-wide rules.

### Banner Requirement

Every `CLAUDE.md` **must begin** with the following banner (adjusted for relative vs. absolute paths based on whether the repo is factory itself):

**In consumer repos (HumanDesign, videoking, xico-city, the-calling, cypher-healing, factory-admin, wordis-bond, ijustus, neighbor-aid, xpelevator):**

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

**In Factory itself:**

```markdown
> 📘 **Canonical agent rules.** Every agent loads these in order before any operation:
> 1. `./docs/supervisor/CONTEXT.md` — what every agent loads first
> 2. `./docs/PLATFORM_STANDARDS.md` — 10 conformance dimensions
> 3. `./docs/adr/*.md` (all Accepted) — architectural decisions
> 4. `./docs/supervisor/TRUST_LADDER.md` — promotion + "clean run" rules
> 5. `./docs/GAP_REGISTER.md` — current platform gaps
>
> Below this point: **repo-local rules only**. Cross-cutting rules belong in the files above, not in this CLAUDE.md.
```

### Content Scope

A repository's `CLAUDE.md` is divided into two sections:

1. **Canonical Docs Banner** (immutable, required at top)
2. **Repo-Local Rules** (rules that genuinely apply only to this repository and not to other repos)

**Rules that must NOT be in repo-local CLAUDE.md:**
- Hard stack constraints (Hono, Web Crypto, Cloudflare Workers, ESM, Drizzle)
- Package matrix and approved `@latimer-woods-tech/*` dependencies
- Conventional Commits format
- Worker naming / URL conventions
- Banned tools (Express, CommonJS, Buffer, `require`, Node crypto, etc.)
- PR size budgets
- Conformance dimensions
- Any rule documented in factory's `CONTEXT.md`, `PLATFORM_STANDARDS.md`, or `FRIDGE.md`

**Examples of repo-local rules that DO belong in CLAUDE.md:**
- HumanDesign: Forge persona conventions, design-system component naming
- videoking: Mux API workflows, video-processing-specific schemas
- factory-admin: billing + subscriber management patterns
- Any repo-specific schema, domain model, or workflow not shared across the org

### Deduplication Rule

When a consumer repo's `CLAUDE.md` contains text that duplicates factory canonical content, **remove the duplication and replace it with a link to the canonical doc**. Example:

**Before (bad):**
```markdown
## Stack Constraints
Router: Hono only — never Express, Fastify, or Next.js
Crypto: Web Crypto API only — never node:crypto, jsonwebtoken
Runtime: Cloudflare Workers only...
```

**After (good):**
```markdown
## Stack Constraints
See [`PLATFORM_STANDARDS.md` § Stack](https://github.com/Latimer-Woods-Tech/Factory/blob/main/docs/PLATFORM_STANDARDS.md).
```

### Why This Matters

When Adrian opens a consumer repo in VS Code, Claude Code reads the local `CLAUDE.md`. Without the canonical-docs banner and links, the agent operates with only repo-local context and loses visibility of factory-wide rules. By maintaining a single link surface, all agent instances (Sauna supervisor, Claude Code, future agents) converge on the same truth.

This is the **bridge mechanism** for cross-agent memory until Anthropic Dreaming (Q3 2026) ships managed-agent session consolidation.
