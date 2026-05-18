# Latimer-Woods-Tech Marketing Plan

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Index over the strategy layer · **Owner:** @adrper79-dot

> Canonical entry point. Everything marketing-related across the portfolio is reachable from here. Operating model: **hands-off autonomous loop** under operator-defined constraints — the operator approves what matters and reviews escalations only.

> If a marketing rule isn't in this folder, it isn't a rule. If a rule conflicts with [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md), FRIDGE wins. The platform [`docs/ROADMAP.md`](../ROADMAP.md) explicitly excludes GTM strategy ("Tracked separately; surfaced in the quarterly customer gate") — this folder is that separate tracking.

---

## 1. North star

**Active paying subscribers retained ≥30 days, decomposed by `(product, icp)`.** One target, immutable, decomposed for diagnostics. MRR, signups, CAC, LTV are all derivatives or constraints — never targets. Locked in [`CONSTITUTION.md §1`](./CONSTITUTION.md#1-north-star).

Reported weekly in the Pushover digest alongside the existing 5-question frame from [`docs/STATE.md`](../STATE.md).

---

## 2. The data model

Marketing operates on a **product × ICP matrix** ([`ICP_MATRIX.md`](./ICP_MATRIX.md)). Every filled cell is a real go-to-market with its own ICP file, voice, channels, budget, and KPIs. Every empty cell is a deliberate non-play.

**Current matrix (as of 2026-05-18):**

|  | Consumer | Power user | Practitioner-of-1 | Practitioner team | Channel partner |
|---|---|---|---|---|---|
| Selfprime | 🟡 | ⏳ | 🟡 ← *first domino* | ⏳ | ⏳ |
| Capricast | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Cypher of Healing | 🟡 | 🚫 | ⏳ | ⏳ | 🚫 |
| Xico City | ⏳ | ⏳ | 🟡 | ⏳ | ⏳ |
| Factory | 🚫 | 🚫 | 🟡 (internal) | ⏳ | 🚫 |

Legend + full grid + cell-file template: [`ICP_MATRIX.md`](./ICP_MATRIX.md).

---

## 3. The strategy layer (this folder, PR 1)

| Doc | What lives there |
|---|---|
| [`CONSTITUTION.md`](./CONSTITUTION.md) | Rules the autonomous system can't break — north star, voice gate, budget caps, approval tiers, allowlist, tripwires, compliance, honesty, operator rights |
| [`ICP_MATRIX.md`](./ICP_MATRIX.md) | Product × ICP grid (canonical) |
| [`VOICES.md`](./VOICES.md) | Voice profile matrix and registration rules |
| [`ROADMAP.md`](./ROADMAP.md) | Sequencing — 3-PR plan, 25-capability firepower list |
| [`icp/`](./icp/) | One file per filled matrix cell |

---

## 4. The operating-model layer (PR 2)

| Doc | What lives there |
|---|---|
| [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) | The autonomous loop — agents, kanban, queue, gates |
| [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) | What surfaces to the operator and when |
| [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) | Per-channel, per-cell, per-portfolio caps |
| [`LIFECYCLE.md`](./LIFECYCLE.md) | Per-ICP lifecycle stages + funnel definitions (closes [G34](../GAP_REGISTER.md)) |
| [`ATTRIBUTION.md`](./ATTRIBUTION.md) | Model choice + UTM convention + dedup |
| [`CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md) | Per-ICP channel choice with reasoning |
| [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) | North star → per-cell diagnostic decomposition |
| [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) | `(product, icp, channel, surface, campaign_id)` convention |

### Completeness pass (PR 5 — added 2026-05-18 from grand review)

| Doc | What lives there |
|---|---|
| [`COST_PROJECTION.md`](./COST_PROJECTION.md) | Bottoms-up cost math; identifies v1 [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) as at-the-ceiling; three load-bearing controls (tier demotion, prompt caching, circuit breaker) |
| [`OPS_CHECKLIST.md`](./OPS_CHECKLIST.md) | 12 ops touchpoints per new Worker (rate-limiter, DNS, secrets, etc.) + external account lead times |
| [`IMAGE_GENERATION.md`](./IMAGE_GENERATION.md) | Visual matrix + Replicate/SDXL/Imagen stack + image-voice gate |
| [`DSR_HANDLING.md`](./DSR_HANDLING.md) | Per-table DSR cascade rules; supersedes [`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance) placeholder |
| [`docs/decisions/2026-05-18-resend-fallback-provider.md`](../decisions/2026-05-18-resend-fallback-provider.md) | ADR — Postmark as Resend fallback |
| [`docs/runbooks/marketing-incident-response.md`](../runbooks/marketing-incident-response.md) | M-SEV-1 to M-SEV-4; 7-tripwire response table; account suspension matrix |
| [`icp/capricast.md`](./icp/capricast.md) + [`icp/capricast-creator.md`](./icp/capricast-creator.md) | Capricast positioning (portfolio #3 — was entirely ⏳) |

---

## 5. The plumbing layer (PR 3, 13 sub-PRs)

| # | Sub-PR | Brief |
|---|---|---|
| 3a | Real drip sequencer in `@lwt/email` | [`pr3-briefs/3a-email-drip.md`](./pr3-briefs/3a-email-drip.md) |
| 3b | ICP dimension migration across CRM/content/analytics | [`pr3-briefs/3b-icp-dimension.md`](./pr3-briefs/3b-icp-dimension.md) |
| 3c | Voice profile matrix in `@lwt/copy` | [`pr3-briefs/3c-voice-matrix.md`](./pr3-briefs/3c-voice-matrix.md) |
| 3d | Surface registry | [`pr3-briefs/3d-surface-registry.md`](./pr3-briefs/3d-surface-registry.md) |
| 3e | Marketing supervisor Worker | [`pr3-briefs/3e-supervisor-worker.md`](./pr3-briefs/3e-supervisor-worker.md) |
| 3f | LinkedIn + YouTube adapters in `@lwt/social` | [`pr3-briefs/3f-social-adapters.md`](./pr3-briefs/3f-social-adapters.md) |
| 3g | Topic queue generator (transit + signal mining) | [`pr3-briefs/3g-topic-queue.md`](./pr3-briefs/3g-topic-queue.md) |
| 3h | Practitioner-branded shareables | [`pr3-briefs/3h-shareables.md`](./pr3-briefs/3h-shareables.md) |
| 3i | Embed-worker (chart calc widgets) | [`pr3-briefs/3i-embed-worker.md`](./pr3-briefs/3i-embed-worker.md) |
| 3j | Referral compounding | [`pr3-briefs/3j-referrals.md`](./pr3-briefs/3j-referrals.md) |
| 3k | `@lwt/attribution` package | [`pr3-briefs/3k-attribution.md`](./pr3-briefs/3k-attribution.md) |
| 3l | LLM-rank tracker | [`pr3-briefs/3l-llm-rank.md`](./pr3-briefs/3l-llm-rank.md) |
| 3m | Brand-safety tripwire | [`pr3-briefs/3m-brand-safety-tripwire.md`](./pr3-briefs/3m-brand-safety-tripwire.md) |

**Bottleneck cluster:** 3a → 3b → 3c. Everything else depends on these three. After they land, the remaining 10 sub-PRs are parallelizable via agent teams.

---

## 6. What "mature" means

A marketing plan is mature when an outsider can read this folder and answer:

| # | Question | Lives in |
|---|---|---|
| 1 | Who are we selling to? | [`icp/`](./icp/) (one file per matrix cell) |
| 2 | What are we selling and why is it different? | §1 of each ICP file |
| 3 | Where do we find them? | §3 of each ICP file, [`CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md) |
| 4 | How do we move them through the funnel? | [`LIFECYCLE.md`](./LIFECYCLE.md) |
| 5 | When are we shipping campaigns? | The supervisor loop's queue + monthly retro |
| 6 | Why-it-worked / why-it-didn't? | [`ATTRIBUTION.md`](./ATTRIBUTION.md) + monthly retros |
| 7 | What changes if budget swings 10× or 0×? | §1.6 + §1.7 of each ICP, [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) |
| 8 | What happens if something goes wrong? | [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires), [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) |

Today (2026-05-18, after PR 1): 1, 2, 3 partially answered (3 cells filled). PR 2 adds 4, 5, 6, 7, 8. PR 3 makes them executable hands-off.

---

## 7. Operating cadence

| Ritual | Frequency | Output |
|---|---|---|
| Supervisor loop tick | Continuous (cron-driven) | Campaign queue advancement |
| Operator digest | Daily, 06:00 local | Pushover — 3 escalations max + north star number |
| Weekly retro (auto) | Sun 18:00 | Auto-generated `playbooks/retros/{date}.md` — A/B results, conversion deltas, drift signals |
| Monthly retro (operator-read) | First Mon | Operator reads + approves any rule changes for the month |
| Quarterly customer gate | Per [`docs/customer-gate/`](../customer-gate/) | Refresh ICP files; refresh build-stop thresholds; refresh matrix |

---

## 8. Who owns what

| Function | Owner | Mode |
|---|---|---|
| Constitution amendments | @adrper79-dot | ADR-required |
| Matrix updates (add cells, change readiness) | @adrper79-dot | Direct edit |
| ICP file creation | Marketing supervisor agent | Drafts; operator approves first version |
| Copy production | LLM via [`@lwt/copy`](../../packages/copy/) | Voice-gated; auto-published Tier 1 |
| Video production | Automated pipeline + topic queue agent | Auto-published Tier 1 |
| Email sequences | Drip sequencer (PR 3a) | Tier 2 to activate new sequences |
| Channel adapters | [`@lwt/social`](../../packages/social/) + dispatcher | Auto-published Tier 1 |
| Attribution | `@lwt/attribution` (PR 3k) | Owned package |
| Budget enforcement | Marketing supervisor + [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) | Hard caps; tier 3 to overspend |
| Brand-safety tripwires | [`@lwt/validation`](../../packages/validation/) extensions | Auto-pause; tier 3 escalation |
| Operator escalation handling | @adrper79-dot | Daily review (≤15 min/day target) |

---

## 9. Cross-references

| Doc / code | Why |
|---|---|
| [`docs/STATE.md`](../STATE.md) | Live numbers (auto-generated daily); north-star metric reported here |
| [`docs/ROADMAP.md`](../ROADMAP.md) | Platform stages — explicitly excludes GTM |
| [`docs/customer-gate/M1_M2_CATALOG_2026-05-17.md`](../customer-gate/M1_M2_CATALOG_2026-05-17.md) | Operator worksheets — paired 1:1 with `icp/` files |
| [`docs/MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md) | 12 monetization events — basis for [`LIFECYCLE.md`](./LIFECYCLE.md) |
| [`docs/GAP_REGISTER.md`](../GAP_REGISTER.md) | G34 (PostHog funnel definitions) closes in PR 2 via [`LIFECYCLE.md`](./LIFECYCLE.md) |
| [`packages/copy/`](../../packages/copy/) | Voice profiles |
| [`packages/validation/`](../../packages/validation/) | Brand-voice gate |
| [`packages/crm/`](../../packages/crm/) | Leads, conversion, outreach with voice-gated scripts |
| [`packages/email/`](../../packages/email/) | Transactional + (post-PR 3a) sequencer |
| [`packages/social/`](../../packages/social/) | X + Pinterest today; LinkedIn + YT (post-PR 3f) |
| [`packages/video/`](../../packages/video/) + [`packages/schedule/`](../../packages/schedule/) | Automated video factory + priority scoring |
| [`packages/analytics/`](../../packages/analytics/) | PostHog + factory_events |
| [`.claude/.../memory/project_priority_order.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_priority_order.md) | Portfolio priority |
| [`.claude/.../memory/feedback_engineering_style.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/feedback_engineering_style.md) | Operator expects mature execution without confirmation theatre |

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 (v0) | @adrper79-dot (drafted by Claude) | Initial scaffold — single-ICP-per-product model |
| 2026-05-18 (v1) | @adrper79-dot (drafted by Claude) | Refactored to product × ICP matrix; autonomous-loop framing; 25-capability firepower list; 3-PR sequence with PR 3 exploded into 13 sub-PRs |
