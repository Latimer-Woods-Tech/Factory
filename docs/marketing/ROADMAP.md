# Marketing Maturation Roadmap

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Active · **Owner:** @adrper79-dot

> Sequences marketing maturation as ordered PRs. Three layers — **strategy** (docs only) → **operating model** (specs + ADRs) → **plumbing** (code, parallelizable). Each layer's PR(s) must merge before the next layer's begin.

---

## Status

| Layer | PR(s) | Status |
|---|---|---|
| Strategy foundation | PR 1 | 🟢 drafted on `marketing/plan-maturation` branch 2026-05-18 |
| Operating model | PR 2 | 🟡 drafted in same branch 2026-05-18 |
| Plumbing | PR 3a–3m | 🟡 builder briefs drafted; code not started |

---

## The 25-capability firepower list

Numbered so every other doc can reference work units. Roughly: 6 strategy artefacts, 6 operating-model specs, 13 code units.

### Strategy primitives (PR 1 — docs only)

| # | Capability | Artefact |
|---|---|---|
| 1 | Rules the autonomous system can't break | [`CONSTITUTION.md`](./CONSTITUTION.md) |
| 2 | Product × ICP grid (canonical) | [`ICP_MATRIX.md`](./ICP_MATRIX.md) |
| 3 | One ICP file per filled cell | [`icp/*.md`](./icp/) |
| 4 | Voice profile matrix design | [`VOICES.md`](./VOICES.md) |
| 5 | Channel doctrine per ICP | [`CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md) (lands in PR 2) |
| 6 | KPI decomposition | [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) (lands in PR 2) |

### Operating-model specs (PR 2 — specs + ADRs)

| # | Capability | Artefact |
|---|---|---|
| 7 | Autonomous loop spec | [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) |
| 8 | Escalation tiers | [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) |
| 9 | Budget caps | [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) |
| 10 | Per-ICP funnels (closes G34) | [`LIFECYCLE.md`](./LIFECYCLE.md) |
| 11 | Attribution model | [`ATTRIBUTION.md`](./ATTRIBUTION.md) + ADR |
| 12 | Campaign tagging convention | [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) |

### Plumbing code units (PR 3 — exploded into sub-PRs)

| # | Sub-PR | Builder brief | Depends on |
|---|---|---|---|
| 13 | 3a | [`pr3-briefs/3a-email-drip.md`](./pr3-briefs/3a-email-drip.md) | PR 1, PR 2 |
| 14 | 3b | [`pr3-briefs/3b-icp-dimension.md`](./pr3-briefs/3b-icp-dimension.md) | PR 1, PR 2 |
| 15 | 3c | [`pr3-briefs/3c-voice-matrix.md`](./pr3-briefs/3c-voice-matrix.md) | 3b |
| 16 | 3d | [`pr3-briefs/3d-surface-registry.md`](./pr3-briefs/3d-surface-registry.md) | 3b |
| 17 | 3e | [`pr3-briefs/3e-supervisor-worker.md`](./pr3-briefs/3e-supervisor-worker.md) | 3a, 3b, 3c |
| 18 | 3f | [`pr3-briefs/3f-social-adapters.md`](./pr3-briefs/3f-social-adapters.md) | 3c |
| 19 | 3g | [`pr3-briefs/3g-topic-queue.md`](./pr3-briefs/3g-topic-queue.md) | 3c, 3e |
| 20 | 3h | [`pr3-briefs/3h-shareables.md`](./pr3-briefs/3h-shareables.md) | 3b, 3c |
| 21 | 3i | [`pr3-briefs/3i-embed-worker.md`](./pr3-briefs/3i-embed-worker.md) | 3b |
| 22 | 3j | [`pr3-briefs/3j-referrals.md`](./pr3-briefs/3j-referrals.md) | 3b |
| 23 | 3k | [`pr3-briefs/3k-attribution.md`](./pr3-briefs/3k-attribution.md) | 3b |
| 24 | 3l | [`pr3-briefs/3l-llm-rank.md`](./pr3-briefs/3l-llm-rank.md) | (independent) |
| 25 | 3m | [`pr3-briefs/3m-brand-safety-tripwire.md`](./pr3-briefs/3m-brand-safety-tripwire.md) | 3c, 3e |

**Bottleneck cluster** (must ship before everything else): 3a (drip sequencer) → 3b (ICP dimension migration) → 3c (voice matrix). These three serialize. Everything else parallelizes via agent teams.

---

## PR 1 — Strategy foundation *(this PR; drafted 2026-05-18)*

**Branch:** `marketing/plan-maturation`

**Adds:**
- [`docs/marketing/CONSTITUTION.md`](./CONSTITUTION.md)
- [`docs/marketing/ICP_MATRIX.md`](./ICP_MATRIX.md)
- [`docs/marketing/VOICES.md`](./VOICES.md)
- [`docs/marketing/MARKETING_PLAN.md`](./MARKETING_PLAN.md) *(refactored v0 → v1)*
- [`docs/marketing/ROADMAP.md`](./ROADMAP.md) *(this file, refactored)*
- ICP files (per matrix priority order):
  - [`icp/selfprime.md`](./icp/selfprime.md) — product parent index
  - [`icp/selfprime-practitioner.md`](./icp/selfprime-practitioner.md) — first domino
  - [`icp/selfprime-consumer.md`](./icp/selfprime-consumer.md)
  - [`icp/cypher-practitioner.md`](./icp/cypher-practitioner.md) (agent-drafted; reviewed)
  - [`icp/factory-internal.md`](./icp/factory-internal.md) (agent-drafted; reviewed)

**Modifies:**
- [`docs/customer-gate/M1_M2_CATALOG_2026-05-17.md`](../customer-gate/M1_M2_CATALOG_2026-05-17.md) — adds companion-doc links per product

**Exit criteria:**
- [x] CONSTITUTION + ICP_MATRIX + VOICES all merged
- [x] ≥3 ICP files filled (template validated across multiple cells)
- [ ] Operator approves matrix readiness states *(awaits review)*
- [ ] [`docs/STATE.md`](../STATE.md) standing-reads list updated to surface `MARKETING_PLAN.md`

**Out of scope:** any code change; any operating-model spec; PR 3 builder execution.

---

## PR 2 — Operating model *(drafted 2026-05-18)*

**Branch:** `marketing/plan-maturation` (continued)

**Adds:**
- [`docs/marketing/MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md)
- [`docs/marketing/ESCALATION_TIERS.md`](./ESCALATION_TIERS.md)
- [`docs/marketing/BUDGET_CAPS.md`](./BUDGET_CAPS.md)
- [`docs/marketing/LIFECYCLE.md`](./LIFECYCLE.md) — closes [G34](../GAP_REGISTER.md)
- [`docs/marketing/ATTRIBUTION.md`](./ATTRIBUTION.md) + ADR in [`docs/decisions/`](../decisions/)
- [`docs/marketing/CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md)
- [`docs/marketing/KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md)
- [`docs/marketing/CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md)

**Depends on:** PR 1 merged (specs reference ICP cells + constitution rules).

**Exit criteria:**
- [ ] All 8 PR-2 docs land
- [ ] [G34](../GAP_REGISTER.md) closed (PostHog funnels defined in `LIFECYCLE.md`)
- [ ] Attribution ADR accepted
- [ ] Budget caps numerically set for ≥3 matrix cells

**Out of scope:** any code (PR 3); retroactive backfill of attribution.

---

## PR 3 — Plumbing fills *(builder briefs drafted 2026-05-18; code TBD)*

**Branches:** one per sub-PR (`marketing/3a-email-drip`, etc.)

**Each sub-PR has a builder brief** in [`pr3-briefs/`](./pr3-briefs/) that includes:
- Goal + non-goals
- Dependencies on prior sub-PRs
- Migrations (DDL + rollback per [PLATFORM_STANDARDS §6](../PLATFORM_STANDARDS.md))
- API shape
- Test plan (90%+ coverage per [CLAUDE.md Quality Gates](../../CLAUDE.md#quality-gates))
- Verification (curl-able health check per [CLAUDE.md Verification Requirement](../../CLAUDE.md#verification-requirement-stop--read-this-before-declaring-anything-working))
- Acceptance criteria

**Sub-PR sequencing:**

```
3a (email drip)  ┐
3b (ICP dim)     ├── BOTTLENECK CLUSTER (must serialize)
3c (voice mat)   ┘
                 │
   ┌─────────────┴──────┬─────────┬─────────┬─────────┬─────────┐
   v                    v         v         v         v         v
  3d (surfaces)        3e (sup)  3f (LI/YT) 3h (shr)  3i (embed) 3j (refs)
                        │         │
                        v         v
                       3g (topic) 3m (tripwire)
                       
  3k (attribution) — depends on 3b only, can start with 3d
  3l (LLM-rank)    — independent, can start any time
```

After bottleneck cluster, 10 sub-PRs parallelize. With agent teams, plumbing layer ships in ≤3 weeks at 4-agent fan-out.

**Operator review pace:** the operator's only blocker is approving Tier-3 actions (per [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers)) and reviewing the daily 3-escalation digest. Target operator time: ≤15 min/day during build + ≤5 min/day at steady state.

---

## What this roadmap deliberately doesn't include

- **Code execution for PR 3** — that's a separate scheduling decision; the briefs make the work spawnable but don't spawn it.
- **Capricast positioning** — queued; gates on operator decision per [`project_capricast_rename.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_capricast_rename.md).
- **Paid acquisition budgets** — gated on per-cell `paid_ready` per [`CONSTITUTION.md §5`](./CONSTITUTION.md#5-channel-allowlist--readiness-gates).
- **Brand identity refresh** — voice profiles are accepted v1; iteration is post-Stage-2.
- **Sales motion / outbound playbook** — `@lwt/crm` ships the engine; the playbook for *when* lives in [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) + retros, not in this roadmap.

---

## Cross-references

- [`MARKETING_PLAN.md`](./MARKETING_PLAN.md) — canonical index
- [`CONSTITUTION.md`](./CONSTITUTION.md) — rules
- [`ICP_MATRIX.md`](./ICP_MATRIX.md) — grid
- [`docs/ROADMAP.md`](../ROADMAP.md) — platform roadmap (excludes GTM)
- [`docs/GAP_REGISTER.md`](../GAP_REGISTER.md) — G34 closes in PR 2
- [`CLAUDE.md`](../../CLAUDE.md) — repo hard constraints

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 (v0) | @adrper79-dot (drafted by Claude) | Initial 3-PR sequencer, single-ICP model |
| 2026-05-18 (v1) | @adrper79-dot (drafted by Claude) | Refactored to 25-capability firepower list; PR 3 exploded to 13 sub-PRs with builder briefs; matrix-aware |
