# ADR-0005: PR Size Budget by Trust Tier

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** @adrper79-dot
- **Tags:** governance, code-quality, reviewability

## Context

Reviewable PRs are atomic PRs. Sprawling PRs hide bugs, slow merge throughput, and overwhelm Claude (ADR-0003) and human reviewers alike. The 4x throughput model (ADR-0004) requires PRs small enough to review at glance.

Memory shows recent PR churn — 34 PRs in 30 hours one stretch — was mostly small focused changes; that's the right pattern. Without a budget, future agent-authored work may produce large omnibus PRs that bottleneck on review.

## Decision

Every PR has a hard size budget by trust tier (CODEOWNERS path scope):

| Tier | Path scope | Max diff lines (added + removed) |
|---|---|---:|
| **Green** | `docs/**`, `*.md`, `session/**`, generated docs | ≤ 50 |
| **Yellow** | `apps/*/src/**`, `client/**`, `tests/**`, non-critical worker routes | ≤ 200 |
| **Red** | `.github/workflows/**`, `packages/**`, `migrations/**`, billing, wrangler bindings, auth flows | ≤ 500 |

Generated files (build output, lockfiles, schemas auto-emitted from migrations) are excluded from the diff count. The PR size guard workflow handles the exclusion automatically.

Exceptions require the `size-exception-approved` label, applied by a CODEOWNER with a comment explaining why decomposition isn't worth it. Examples that legitimately exceed budget:
- Initial scaffolding for a new app (one-time)
- Wholesale rename across files (mechanical)
- Mass-migration to a new pattern after an ADR

## Alternatives considered

1. **No size limit.** Rejected: omnibus PRs are the historical failure mode. Even at solo-founder scale, big PRs slow merge.

2. **One global limit (e.g., 200 lines).** Rejected: too small for legitimate Red-tier work (migrations, package internals), too large to enforce review discipline on Green tier docs.

3. **Soft advisory (no enforcement).** Rejected: agents will trend toward larger PRs without a hard limit. The supervisor loop and sub-agents need a budget to plan against.

4. **Smaller budgets (e.g., 20/100/300).** Rejected: too restrictive for the platform's current complexity. Re-evaluate after 90 days of data.

## Consequences

- **Positive:**
  - Atomic PRs review in seconds (Claude) to minutes (human).
  - Decomposed PRs ship faster — each lands as soon as it's ready, not blocked on a bigger sibling.
  - Failure radius smaller — a 50-line revert affects less than a 500-line revert.
  - Supervisor and sub-agents plan against a known budget, producing smaller atomic deliverables.

- **Negative:**
  - Some intuitively-single-unit work decomposes into multiple PRs (e.g., new feature = scaffold PR + impl PR + tests PR + docs PR).
  - Stack-style PRs (one against another's branch) add merge coordination — mitigated by `[stack: N of M]` title convention.
  - Mechanical changes (renames) often hit the cap legitimately; require `size-exception-approved` overhead.

- **Neutral:**
  - Compatible with sub-agent fan-out (ADR-0004): each sub-agent's atomic PR fits inside the budget.
  - Compatible with Claude reviewer (ADR-0003): atomic PRs are exactly what Claude can review reliably.

## Rollback

Loosen the budgets in this ADR or remove the guard workflow. Estimated effort: 15 minutes (workflow toggle + ADR amendment).

Triggers for rollback consideration:
- ≥20% of PRs need `size-exception-approved` over a 30-day window (signal: budget too tight)
- Sub-agent fan-out (ADR-0004) produces consistently >budget PRs even after decomposition guidance (signal: decomposition strategies insufficient)
- Mechanical migrations bottleneck on exception approval (signal: need a "mechanical" tier with separate budget)

## Implementation

- [ ] Append §11 to `docs/PLATFORM_STANDARDS.md` with the table (this PR)
- [ ] Update `docs/supervisor/CONTEXT.md` with PR size constraint (this PR)
- [ ] Write `.github/workflows/pr-size-guard.yml` enforcing the budget as a required check (Stage 4)
- [ ] Generated-file exclusion list maintained in `.github/pr-size-exclusions.txt` (Stage 4)
- [ ] Add `size-exception-approved` label to org label set (Stage 4)

## Links

- ADR-0001: Cohesion Architecture
- ADR-0002: Operating Framework
- ADR-0003: Claude as Primary Reviewer
- ADR-0004: Sub-agent Fan-out Pattern
- `docs/PLATFORM_STANDARDS.md` §11 (this PR adds it)
- `docs/supervisor/TRUST_LADDER.md`
