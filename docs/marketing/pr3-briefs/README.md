# PR 3 — Builder Briefs

**Status:** Drafted 2026-05-18 · **Phase:** Plumbing · **Order:** Per [`ROADMAP.md`](../ROADMAP.md) §"The 25-capability firepower list"

> One brief per sub-PR. Each brief is **self-contained** — a fresh agent or human can execute it without reading every other doc, by following the brief and the linked files only.

## Sub-PR sequence

```
3a (email drip)  ┐
3b (ICP dim)     ├── BOTTLENECK — must serialize
3c (voice mat)   ┘
                 │
   ┌─────────────┴────┬─────────┬─────────┬─────────┬─────────┐
   v                  v         v         v         v         v
  3d (surfaces)     3e (sup)  3f (LI/YT) 3h (shr)  3i (embed) 3j (refs)
                      │         │
                      v         v
                     3g (topic) 3m (tripwire)

  3k (attribution) — depends on 3b only
  3l (LLM-rank)    — independent
```

## Brief inventory

| # | Brief | Title | Depends on | Effort |
|---|---|---|---|---|
| 3a | [3a-email-drip.md](./3a-email-drip.md) | Real drip sequencer in `@lwt/email` | PR 1, PR 2 | 3 days |
| 3b | [3b-icp-dimension.md](./3b-icp-dimension.md) | ICP dimension migration across CRM/content/analytics | PR 1, PR 2 | 2 days |
| 3c | [3c-voice-matrix.md](./3c-voice-matrix.md) | Voice profile matrix in `@lwt/copy` | 3b | 2 days |
| 3d | [3d-surface-registry.md](./3d-surface-registry.md) | Surface registry — URL → cell routing | 3b | 2 days |
| 3e | [3e-supervisor-worker.md](./3e-supervisor-worker.md) | Marketing supervisor Worker | 3a, 3b, 3c | 5 days |
| 3f | [3f-social-adapters.md](./3f-social-adapters.md) | LinkedIn + YouTube + TikTok + Instagram adapters in `@lwt/social` | 3c | 3 days |
| 3g | [3g-topic-queue.md](./3g-topic-queue.md) | Topic queue generator (transit + signal mining) | 3c, 3e | 4 days |
| 3h | [3h-shareables.md](./3h-shareables.md) | Practitioner-branded shareables | 3b, 3c | 4 days |
| 3i | [3i-embed-worker.md](./3i-embed-worker.md) | Embed-worker (chart calc widgets) | 3b | 3 days |
| 3j | [3j-referrals.md](./3j-referrals.md) | Referral compounding | 3b | 3 days |
| 3k | [3k-attribution.md](./3k-attribution.md) | `@lwt/attribution` package | 3b | 3 days |
| 3l | [3l-llm-rank.md](./3l-llm-rank.md) | LLM-rank tracker | (independent) | 2 days |
| 3m | [3m-brand-safety-tripwire.md](./3m-brand-safety-tripwire.md) | Brand-safety tripwire | 3c, 3e | 2 days |

**Total raw effort:** ~38 engineer-days. With agent teams running parallelizable sub-PRs in parallel, real timeline is ~3 weeks after bottleneck cluster lands.

## Brief structure (every brief follows this template)

```markdown
# PR 3{x} — {Title}

**Status:** Drafted · **Depends on:** {prior briefs}
**Owner package(s):** `@latimer-woods-tech/{pkg}` · **Effort:** {N} days
**Branch:** `marketing/3{x}-{slug}`

## 1. Goal
## 2. Non-goals
## 3. Dependencies
## 4. Migrations (DDL + rollback per PLATFORM_STANDARDS §6)
## 5. API shape (TypeScript signatures)
## 6. Test plan (90%+ coverage per CLAUDE.md Quality Gates)
## 7. Verification (curl-able health check per CLAUDE.md Verification Requirement)
## 8. Acceptance criteria
## 9. File list
## 10. Risks + mitigations
## 11. Cross-references
```

## How to execute a brief

A fresh agent (or human) executing brief `3x`:

1. Read the brief end-to-end
2. Read every file linked in §3 (Dependencies)
3. Create branch `marketing/3{x}-{slug}`
4. Implement per §4–§7
5. Run quality gates per [CLAUDE.md](../../../CLAUDE.md#quality-gates):
   - `pnpm typecheck` — zero errors
   - `pnpm lint --max-warnings 0` — zero warnings
   - `pnpm test --coverage` — 90%+ line / 85%+ branch
   - `pnpm build` — clean tsup output
6. Run verification curl per §7 in a wrangler dev environment
7. Open PR with §8 (Acceptance criteria) as the checklist in the PR body

## Cross-references

- [`MARKETING_PLAN.md`](../MARKETING_PLAN.md) — index
- [`ROADMAP.md`](../ROADMAP.md) — 25-capability firepower list
- [`CONSTITUTION.md`](../CONSTITUTION.md) — non-negotiable rules every brief honors
- [`CLAUDE.md`](../../../CLAUDE.md) — repo standards
