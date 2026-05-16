# ADR-0012 — Dependency Version Policy

**Status**: Accepted  
**Date**: 2026-05-05  
**Context**: FRH-08 — Version policy enforcement

---

## Context

Factory packages had no written rule governing how dependency versions are declared.
Manifests were using a mix of caret ranges (`^`) without a ratified standard, and no
CI check prevented regressions.

## Decision

**All external dependencies must use caret (`^`) ranges.**

| Scope | Required format | Rationale |
|---|---|---|
| `dependencies` (prod, external) | `^X.Y.Z` | Accepts compatible patch/minor updates; lockfile pins the exact installed version |
| `devDependencies` (external) | `^X.Y.Z` | Same: range + lockfile |
| Internal workspace refs | `workspace:*` | Managed by npm workspaces; no pinning needed |
| Peer dependencies | `^X` or `>=X <Y` | Convention for peer deps; validated separately |

**Prohibited formats** (enforced by `scripts/lint-dependency-versions.mjs`):

- Exact pins (`"1.2.3"`) — brittle; prevents Renovate from updating without a config change
- Tilde ranges (`~X.Y.Z`) — only accepts patch updates; too restrictive for our Renovate cadence
- Unbounded ranges (`*`, `>=X`, `>X`) — too permissive; breaks reproducibility guarantees
- Git/URL references (`git+https://…`, `file:…`) — disallowed outside local dev scripts
- Pre-release tags (`^1.0.0-beta`) — only in explicitly labelled `@next` packages

## Consequences

- Renovate can open minor/patch PRs without fighting pinned versions.
- `npm ci` on any machine produces the same tree because `package-lock.json` is committed.
- CI blocks any PR that adds a dependency in an out-of-policy format.
- One-time normalization: all existing deps were audited and confirmed to already be `^` ranges.

## Enforcement

`scripts/lint-dependency-versions.mjs` — run as a step in `.github/workflows/ci.yml`.
Exits non-zero if any manifest violates the policy. Violations print the offending package,
field, dependency name, and current version string.
