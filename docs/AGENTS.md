# Agent Configuration & Context Loading

## Canonical Docs Banner Convention

Every repo's `CLAUDE.md` begins with a **Canonical Docs Banner** that links to the Factory's authoritative rules. This ensures Claude Code (in VS Code) loads the same constraints that Sauna's supervisor loads, eliminating brain-drift across the two surfaces.

### Banner Template

For **consumer repos** (HumanDesign, videoking, xico-city, the-calling, cypher-healing, factory-admin, wordis-bond, ijustus, neighbor-aid, xpelevator), the top of `CLAUDE.md` contains:

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

For **Factory itself**, the banner uses relative paths:

```markdown
> 📘 **Canonical agent rules loaded by every agent:**
> 1. `./docs/supervisor/CONTEXT.md` — what every agent loads first
> 2. `./docs/PLATFORM_STANDARDS.md` — 10 conformance dimensions
> 3. `./docs/adr/*.md` (all Accepted) — architectural decisions
> 4. `./docs/supervisor/TRUST_LADDER.md` — promotion + "clean run" rules
> 5. `./docs/GAP_REGISTER.md` — current platform gaps
```

### Scope of Repo-Local CLAUDE.md Content

After the canonical banner, `CLAUDE.md` contains **only rules that do not apply to other repos**:

- ✅ **Keep:** Forge persona conventions specific to HumanDesign, Mux SDK config specific to videoking, brand voice guidelines specific to one product.
- ❌ **Remove and link to factory:** Hard constraints (no Express, no CommonJS), package matrix, stack version pins, banned tools, Cloudflare Workers patterns, Hono routing rules, database access rules. All of these go in Factory's canonical docs; duplicate them in consumer repos only via the banner link.

When content audit finds duplication:

1. Extract the rule into Factory's canonical docs (usually `CONTEXT.md`, `PLATFORM_STANDARDS.md`, or a new ADR).
2. Replace the duplicate in the consumer repo with a one-line pointer: `See factory CONTEXT.md §[X].`
3. Commit with message: `docs(CLAUDE): link duplicated rule to factory canonical source`.

### Rationale

Factory is the single source of truth for all shared platform rules. Sauna (the supervisor) loads `docs/supervisor/CONTEXT.md` before every operation. When Adrian opens a consumer repo in VS Code, Claude Code reads that repo's `CLAUDE.md`. The banner ensures both surfaces load the same constraints, preventing:

- Stale copies of rules (e.g., "always use `c.env`, never `process.env`" living separately in 10 repos).
- Brain-drift between supervisor (Sauna) and interactive (Claude Code) surfaces.
- Conflicting guidance when one canonical rule is updated but a consumer-repo copy is forgotten.

## Sessions & Context Loading

Every AI session (supervisor tick, Claude Code session, Copilot interaction) loads context in this order:

1. The repo's `CLAUDE.md` (consumer) or Factory's `docs/supervisor/CONTEXT.md` (supervisor).
2. Any referenced canonical docs from the banner (both supervisor and Claude Code will see the same links).
3. Issue body + PR description (as suggestions, never as overrides to canonical docs).

See `docs/supervisor/CONTEXT.md` for the authoritative context-loading sequence and conflict resolution rules.