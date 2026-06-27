# Agent Configuration Convention

## CLAUDE.md canonical-docs banner

Every repo's `CLAUDE.md` (whether in Factory or a consumer repo) begins with a standardized banner that links to the canonical Factory agent rules. This ensures that Claude Code (in VS Code) and Sauna (the supervisor) load the same constraints, eliminating brain-drift across the two surfaces.

### Banner format

Placed at the very top of `CLAUDE.md`, before any other content:

**In Factory (`Factory/CLAUDE.md`):**
```markdown
> 📘 **Canonical agent rules live in `factory`.** Read these in order:
> 1. `./docs/supervisor/CONTEXT.md` — what every agent loads first
> 2. `./docs/PLATFORM_STANDARDS.md` — 10 conformance dimensions
> 3. `./docs/adr/*.md` (all Accepted) — architectural decisions
> 4. `./docs/supervisor/TRUST_LADDER.md` — promotion + "clean run" rules
> 5. `./docs/GAP_REGISTER.md` — current platform gaps
>
> This file holds **only repo-local rules** that don't apply elsewhere. Anything cross-cutting belongs in factory, not here.
```

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

### Content after the banner

Repo-local `CLAUDE.md` content is restricted to rules, patterns, and conventions that:
- Apply only to that specific repo (e.g., HumanDesign-specific Forge persona conventions, videoking-specific Mux integrations)
- Do not duplicate or restate Factory canonical constraints (hard constraints, package matrix, stack version pins, banned tools, ADRs)

If local content duplicates factory canonical rules, replace it with a one-line pointer to the factory doc instead.

### Rationale

The Factory repo is the authoritative source for cross-cutting platform rules. When Claude Code loads a consumer repo's `CLAUDE.md`, it must be immediately directed to load Factory's canonical rules first (via the banner links), ensuring the same architectural constraints, package versions, and governance apply whether the work is initiated from VS Code (Claude Code) or from GitHub (Sauna supervisor). Duplicating content creates drift and maintenance burden; linking ensures a single source of truth.
