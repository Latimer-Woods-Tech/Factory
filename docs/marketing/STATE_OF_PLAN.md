# State of the Marketing Plan

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Snapshot · **Owner:** @adrper79-dot

> **Read this first.** If you're an operator, agent, or new contributor landing on `docs/marketing/` cold, this file is the map. It tells you what's shipped, what's not, what's gating each remaining piece, and what to do next.

> If this file becomes stale, the supervisor's quarterly review (per [`MARKETING_PLAN.md §7`](./MARKETING_PLAN.md)) refreshes it. If staleness rate >2 weeks → `tier:2` escalation per [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md).

---

## 1. The whole plan at a glance

```
                  STRATEGY                           OPERATING MODEL                    PLUMBING
                ╔═══════════╗                     ╔══════════════════╗            ╔═════════════════╗
                ║ ✅ shipped ║                     ║   ✅ shipped     ║            ║  ❌ not started ║
                ╠═══════════╣                     ╠══════════════════╣            ╠═════════════════╣
 docs/marketing/MARKETING_PLAN.md   ─┐    LIFECYCLE.md             ─┐   docs/marketing/pr3-briefs/3a–3m
 docs/marketing/CONSTITUTION.md     ─┤    KPI_DECOMPOSITION.md     ─┤      (13 sub-PRs closed; awaiting
 docs/marketing/ICP_MATRIX.md       ─┤    CHANNEL_DOCTRINE.md      ─┤       resurrection post-validation)
 docs/marketing/VOICES.md           ─┤    ATTRIBUTION.md           ─┤
 docs/marketing/ROADMAP.md          ─┤    CAMPAIGN_TAGGING.md      ─┤   packages/{email,crm,content,
 docs/marketing/COST_PROJECTION.md  ─┤    ESCALATION_TIERS.md      ─┤      copy,attribution,referrals,
 docs/marketing/DSR_HANDLING.md     ─┤    BUDGET_CAPS.md           ─┤      topics,imagegen,social,...}
 docs/marketing/IMAGE_GENERATION.md ─┤    MARKETING_SUPERVISOR.md  ─┤      → code work, all blocked
 docs/marketing/OPS_CHECKLIST.md    ─┤                              │
                                     │    runbooks/                 │
 docs/marketing/icp/                 │    marketing-incident-       │     apps/marketing-supervisor/
   ├ selfprime.md (parent)           │      response.md             │     apps/embed-worker/
   ├ selfprime-practitioner.md       │                              │     apps/shareables-worker/
   ├ selfprime-consumer.md           │    decisions/                │     apps/llm-rank-worker/
   ├ capricast.md (parent)           │    2026-05-18-attribution-   │      → all blocked on PR 3 resurrection
   ├ capricast-creator.md            │      model.md
   ├ cypher-practitioner.md          │    2026-05-18-resend-
   └ factory-internal.md             │      fallback-provider.md
                                     │                              │
                                     │    sequences/                │
                                     │    practitioner_design_      │
                                     │      partner_v1.yaml         │
                                     │                              │
                                     │    scenarios/                │
                                     │    01-happy-path             │
                                     │    02-tripwire-fires         │
                                     │    03-cross-product-flywheel │
                                     │                              │
                                     │    playbooks/                │
                                     │    operator-validation-      │
                                     │      sprint.md               │
                                     │    first-domino-bootstrap.md │
                                     │    first-domino-candidates.md│
                                     │                              │
                                     │    CONSISTENCY_AUDIT.md      │
                                     └──────────────────────────────┘
                                              ↓
                              GATE: operator validation sprint
                                  (5 hours of human work)
                                  → continue / narrow / reframe / pivot
                                              ↓
                                    plumbing layer activates
```

---

## 2. What's shipped (28 docs on `main` once PR 5 umbrella merges)

| Layer | Files | Lines | Status |
|---|---|---|---|
| Strategy | 9 top-level + 6 ICP files | ~3,400 | ✅ on main (PRs 1+2 merged); PR 5 umbrella has revisions awaiting merge |
| Operating model | 8 top-level + 1 ADR + 1 IR runbook | ~2,200 | ✅ same |
| Stress tests + validation | 3 scenarios + 3 playbook files + 1 sequence YAML + 1 audit + this file | ~2,200 | ✅ same |

**Single open PR:** [#823 — PR 5 umbrella](https://github.com/Latimer-Woods-Tech/Factory/pull/823) contains PRs 5+6+7+8 stacked. Awaiting operator review/merge.

---

## 3. What's NOT shipped + what gates each piece

| Not shipped | Gate | When it unblocks |
|---|---|---|
| **PR 3 plumbing (13 sub-PRs)** — drip sequencer, ICP dimension migration, voice matrix, surface registry, supervisor Worker, social adapters, topic queue, shareables, embed-worker, referrals, attribution package, LLM-rank tracker, brand-safety tripwire | **Operator validation sprint must land first** ([`playbooks/operator-validation-sprint.md`](./playbooks/operator-validation-sprint.md)). Plus per [`CONSISTENCY_AUDIT.md §6`](./CONSISTENCY_AUDIT.md), three sub-PRs need co-design (3j+3k+3h share data shapes) | After sprint: if "continue" → resurrect PR 3 with revisions per audit Phase 3 |
| **Phase 2 — 3 new tripwires + operational tightening** | PR 3m + supervisor worker exist | After plumbing |
| **6 Tier-1 schema fixes** (T1-1 through T1-5 in audit) | PR 3b migration | After plumbing starts |
| **5 ICP files** for queued cells (selfprime-power/studio/partner, cypher-seeker, xicocity-creator, cypher-clinic, xicocity-collective) | Operator priority decision | When operator picks the next cell to fill (post-sprint) |
| **Capricast positioning validation** | Capricast cohesion at 24/100 — product itself needs work | Independent of marketing |
| **Internationalization, mobile UX, audio side-channels** | Backlog — not blocking current cells | Post-MVP |

---

## 4. The single thing left to do

**Run the operator validation sprint.** 5 hours of focused human work, structured Monday-Friday. The playbook is at [`playbooks/operator-validation-sprint.md`](./playbooks/operator-validation-sprint.md). Pre-conditions (~95 min) include:

1. Review + edit [`playbooks/first-domino-candidates.md`](./playbooks/first-domino-candidates.md) — 10 named + 20 TBD entries; the 20 TBDs need operator-fill from public lineage rosters
2. Verify public business email + Calendly link for Tier-1
3. Set up Calendly with 8 slots Mon-Fri afternoons
4. Block calendar Mon-Fri 14:00-17:00 local

After the sprint (Friday 17:00), the operator's decision tree per the playbook §8 is:

- **Continue** (≥3 calls scored 27+) → `selfprime:practitioner` graduates `discovery` → `earned_active`; PR 3 plumbing resurrects with validated assumptions; voice corpus seeds with verbatim quotes
- **Narrow / Reframe / Pivot or kill** → ADR revising ICP/positioning/pricing; re-sprint or sunset cell

Everything in this plan is gated on this outcome.

---

## 5. What this plan represents — by the numbers

- **6 PRs** opened on 2026-05-18 (PRs 1-8; some merged into others)
- **~7,700 net lines** of docs across 28 files
- **32 integration gaps** surfaced by stress tests; 11 closed in Phase 1 doc fixes (PR 7); 21 remain (5 Tier-1 schema, 13 Tier-2 spec, 3 Tier-3 operational with code dependencies, 4 Tier-4 polish)
- **5 ICP cells** filled with positioning + voice + channel + budget — selfprime-practitioner (priority #1, first domino), selfprime-consumer, capricast-creator, cypher-practitioner, factory-internal
- **3 stress-test scenarios** end-to-end traced
- **1 ADR shipped** (attribution model); 1 ADR pending (Resend fallback provider — drafted, not yet ADR-numbered for merge)

The plan is **as mature as it can be without practitioner data**.

---

## 6. What this plan deliberately is NOT

For the record, things outside scope (per audit + ROADMAP):

- **Code.** All plumbing remains specified but unwritten.
- **A campaign in flight.** Nothing has been sent to anyone. The first send happens during the sprint.
- **Validated.** Every ICP claim, every pricing tier, every positioning sentence is hypothesis until a real practitioner agrees or disagrees.
- **International, mobile-first, multi-product simultaneously.** US English, web-first, Selfprime-first. Capricast positioning is in but not validated; Cypher and Xico City have voices but no ICP cells filled.

---

## 7. If you're an operator landing here today

| Time available | What to do |
|---|---|
| **5 min** | Read this file. Check [`CONSISTENCY_AUDIT.md` §8](./CONSISTENCY_AUDIT.md) for the "what this means for the operator" rollup. |
| **30 min** | Read this + [`MARKETING_PLAN.md`](./MARKETING_PLAN.md) + [`ICP_MATRIX.md`](./ICP_MATRIX.md) + skim [`CONSTITUTION.md`](./CONSTITUTION.md). |
| **2 hours** | Read all of §1-§4 above + spot-check 2 ICP files + read the validation sprint playbook + read the cost projection. Be ready to merge PR #823. |
| **1 week** | Pre-conditions for the sprint (review candidate list, verify contacts, set up Calendly) + run the sprint Mon-Fri + decision Friday 17:00. |

---

## 8. If you're a future Claude / agent landing here cold

The marketing plan in `docs/marketing/` is the most heavily-stressed piece of documentation in the Factory monorepo. Specifics worth knowing:

- **Three branch-drift incidents** during the maturation session (2026-05-18). Always commit + push each meaningful unit of work; never batch more than one agent's output before pushing.
- **Closed PRs got orphaned twice** (PR 3, PR 4). When a stacked PR's base closes, the dependent PR's content is orphaned but the files survive on disk if they were already committed locally. **Cherry-pick onto a known-good branch** to recover.
- **Stacked-PR merge pattern:** when the child PR merges, GitHub auto-merges its commits into the parent and deletes the child branch. The umbrella PR collects all stacked commits.
- **PR 3 (the plumbing layer) is correctly closed.** Don't re-open until operator validation lands. Per the audit, schema work pre-validation = hill-climbing on synthetic data.
- **Authoritative claims live in specific docs**, not duplicated: north star = CONSTITUTION §1, retention def = LIFECYCLE §1.1, voice keys = VOICES §1, attribution model = ATTRIBUTION + ADR 2026-05-18, budget cap revisions = COST_PROJECTION §7. If a different doc says something different, that doc is wrong.

---

## 9. Cross-references — the canonical entry points

- [`MARKETING_PLAN.md`](./MARKETING_PLAN.md) — index over the plan (read for navigation)
- [`CONSTITUTION.md`](./CONSTITUTION.md) — rules the system can't break (read for the contract)
- [`ICP_MATRIX.md`](./ICP_MATRIX.md) — product × audience grid (read for the data model)
- [`CONSISTENCY_AUDIT.md`](./CONSISTENCY_AUDIT.md) — 32 gaps + 4-phase fix sequence (read for what's left)
- [`playbooks/operator-validation-sprint.md`](./playbooks/operator-validation-sprint.md) — 5-day sprint (read when you're ready to run it)
- [`COST_PROJECTION.md`](./COST_PROJECTION.md) — economic reality check (read before any spend decision)
- [`ROADMAP.md`](./ROADMAP.md) — the 25-capability firepower list (read for build sequencing)

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — initial snapshot post-PRs-1-through-8; documents that the plan is gated on operator validation sprint; lessons-learned for future Claude/agents |
