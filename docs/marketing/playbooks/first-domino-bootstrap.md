# First-Domino Bootstrap — 5 Design Partners

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Operator-staging · **Cell:** `selfprime:practitioner` · **Campaign:** `2026-q3-practitioner-design-partners`

> The bootstrap playbook for the autonomous marketing loop's **first manual touchpoint**. Per [`icp/selfprime-practitioner.md §2.5`](../icp/selfprime-practitioner.md) — the operator's only manual marketing action is 5 Zoom calls with design partners. This file pre-stages everything that surrounds those 5 calls so the operator's time is bounded to ~5 hours total.

> After 5 design partners onboard, the autonomous loop has the data substrate it needs (real usage, real voice patterns, real conversion signal) to run hands-off per [`MARKETING_PLAN.md`](../MARKETING_PLAN.md).

> **Operational successor:** [`operator-validation-sprint.md`](./operator-validation-sprint.md) — the 5-day playbook with interview script, scoring rubric, and decision tree. This bootstrap doc focuses on the *outputs* of the sprint; the sprint doc covers *how to run* it.

---

## 1. Why this is the first domino

Per [`icp/selfprime-practitioner.md §2.1`](../icp/selfprime-practitioner.md), the loop needs design partners before *anything else* compounds:

| What design partners unlock | Downstream impact |
|---|---|
| **Real usage data** | Which features matter; which sub-segment converts; which copy lands |
| **Voice corpus seeding** | The `prime_self:practitioner` voice gets anchored to *actual* practitioner language, not the operator's guess |
| **First nodes of referral graph** | Sole practitioners trust peer recs more than ads; each partner's first 5 peer mentions ≈ 5 leads |
| **Public testimonials** | First case studies that unblock The Astrology Podcast / Astrology Hub pitches |
| **Branded-shareable distribution** | Each partner sees ~30-200 clients/year → 30-200 branded-shareable distribution points |

Without the first 5 partners, **the autonomous loop has nothing to optimize against** — it would hill-climb on synthetic data, which is worse than hill-climbing on no data.

---

## 2. What the operator does (≤5 hours total)

| Step | Action | Time | When |
|---|---|---|---|
| 1 | Review [`first-domino-candidates.md`](./first-domino-candidates.md); remove names that don't fit; add 2–5 from your own network | 30 min | Day 0 (post-PR merge) |
| 2 | Verify public business email + Calendly link for Tier-1 candidates (10 people) | 60 min | Day 0–1 |
| 3 | Approve the candidate list — supervisor pulls Tier-1 into outreach queue | 5 min | Day 1 |
| 4 | Monitor daily Pushover digest for replies / meeting bookings (system handles outreach hands-off) | 5 min/day × 21 days | Day 1–22 |
| 5 | Five 30-minute Zoom calls with respondents who book through Calendly | 2.5 hrs | Day 7–22 |
| 6 | Approve onboarding 5 partners; supervisor activates `practitioner_paid_welcome_v1` sequence | 10 min | Day 22 |

**Total operator time:** ~5 hours over 3 weeks. Everything else is autonomous.

The detailed Mon-Fri sprint structure with interview script + scoring rubric lives in [`operator-validation-sprint.md`](./operator-validation-sprint.md).

---

## 3. What the system does

Once the operator approves the candidate list (step 3 above):

| Loop component | Action |
|---|---|
| `OutreachSender` agent | Reads Tier-1 from `first-domino-candidates.md`; enrolls each in `practitioner_design_partner_v1` sequence |
| `@lwt/email` sequencer | Sends step 0 immediately, step 1 at +5d, step 2 at +14d; honors suppression list at every step |
| `@lwt/copy` voice gate | Every send rendered through `prime_self:practitioner` voice; `validateAiOutput` gate blocks publication on `major`/`critical` issues |
| `TripwireMonitor` | Watches unsubscribe rate, spam complaints, reply sentiment; auto-pauses cohort on anomaly (tier-3 escalation) |
| `BudgetWatcher` | Caps LLM cost for this cohort at $4/day per [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) `selfprime:practitioner` allocation |
| `DigestComposer` | Surfaces meeting bookings + reply highlights in operator's daily digest |
| `RetroWriter` | Auto-writes retro at `playbooks/retros/2026-q3-practitioner-design-partners.md` after 30 days |

The operator never sees raw outbox or template editor. The system runs.

---

## 4. Inputs ready in this PR

| File | Purpose | Status |
|---|---|---|
| [`first-domino-candidates.md`](./first-domino-candidates.md) | Tier 1/2/3 candidate roster | Drafted by research agent; operator edits |
| [`../sequences/practitioner_design_partner_v1.yaml`](../sequences/practitioner_design_partner_v1.yaml) | 3-step outreach sequence config | Drafted; LLM renders final copy at send time per `prime_self:practitioner` voice |
| [`operator-validation-sprint.md`](./operator-validation-sprint.md) | 5-day sprint playbook | Drafted; includes interview script + scoring rubric |
| Operator signature block | Used in templates as `{{operator_signature_block}}` | ⏳ Operator provides via `tenant_secrets` after `@lwt/email` sequencer ships |
| Operator Calendly link | Used as `{{operator_calendar_link}}` | ⏳ Operator provides |

---

## 5. What the 30-minute Zoom call covers

See [`operator-validation-sprint.md §5`](./operator-validation-sprint.md) for the detailed demo script. Summary structure:

| Minute | Topic |
|---|---|
| 0–5 | Their workflow today — let them describe how they prep a chart |
| 5–15 | Demo: chart prep, AI draft + edit-in-front-of-them, voice profile, branded export |
| 15–25 | Friction probes (5 direct questions, silence after each) |
| 25–30 | The close — "12 months free, your edits become the product. Yes/no/maybe?" |

---

## 6. Success / failure criteria

Per [`practitioner_design_partner_v1.yaml`](../sequences/practitioner_design_partner_v1.yaml) and [`operator-validation-sprint.md §8`](./operator-validation-sprint.md):

**Success (cohort-level, 21 days post-launch):**
- ≥10% reply rate from Tier-1
- ≥5 `meeting_booked` events
- 0 spam complaints (CONSTITUTION §7 tripwire)
- Unsubscribe rate ≤2× baseline

**Failure modes:**

| Signal | Probable cause | Loop response |
|---|---|---|
| <5% reply rate | Wrong list OR wrong voice | Auto-pause + tier-2 escalation; RetroWriter opens retro |
| Reply rate OK, no meetings | Calendly link broken OR friction at booking | Tier-2 escalation; operator checks calendar |
| Spam complaint | Voice not landing OR list was actually cold | Auto-pause + tier-3; review consent records |
| All 5 partners say "no thanks" | Product not fit OR pricing wrong OR positioning wrong | Operator decision: revise ICP file vs revise product vs revise pricing |

---

## 7. After 5 partners onboard

The autonomous loop's behavior shifts:

1. **Voice corpus update** — practitioners' real language from their reading drafts feeds back into `prime_self:practitioner` voice profile per [`VOICES.md §6`](../VOICES.md#6-voice-example-bank)
2. **Channel state advancement** — `selfprime:practitioner` cell can graduate from `discovery` → `earned_active` once ≥1 owned channel produces ≥10 published artefacts (per [`CHANNEL_DOCTRINE.md §5`](../CHANNEL_DOCTRINE.md#5-readiness-gate-progression-constitution-5-operationalized))
3. **Funnel baseline** — [`LIFECYCLE.md`](../LIFECYCLE.md) per-cell baselines lock in from this cohort's data; future cohorts compared against
4. **Referral graph seeds** — `@lwt/referrals` issues each partner a unique invite code; cohort retention diff measured between partner-referred vs non-referred consumer signups (validates the prosumer flywheel hypothesis)
5. **Public reading library seeds** — partners publish first reads at `selfprime.net/r/{practitioner}/{reading}`; becomes SEO + distribution surface

**Next domino:** with 5 partners producing real signals, the supervisor's `TopicScout` gets enough engagement data to start the video factory + content publisher loop hands-off. That's when the autonomous loop becomes self-sustaining.

---

## 8. What to do if NONE of this works

The honest failure mode of an autonomous bootstrap is the same as any startup: nobody wanted what we built.

If the cohort fails (zero meetings, no replies that aren't bot-generated), the data tells us *something specific* — review [`KPI_DECOMPOSITION.md`](../KPI_DECOMPOSITION.md) decomposition for the relevant cell, look at sub-segment performance, look at first-touch source. The decomposition isolates which assumption broke:

- Wrong ICP → revise [`icp/selfprime-practitioner.md`](../icp/selfprime-practitioner.md)
- Wrong voice → revise [`VOICES.md`](../VOICES.md)
- Wrong positioning → revise [`MARKETING_PLAN.md §2`](../MARKETING_PLAN.md)
- Wrong product → revise the product itself (out of scope for marketing)

Per [`CONSTITUTION.md §11`](../CONSTITUTION.md#11-amendment-process), revisions land via ADR. The autonomous loop does NOT rewrite its own assumptions silently.

---

## 9. Cross-references

- [`icp/selfprime-practitioner.md`](../icp/selfprime-practitioner.md) — the ICP this bootstrap serves
- [`operator-validation-sprint.md`](./operator-validation-sprint.md) — detailed Mon-Fri sprint structure
- [`first-domino-candidates.md`](./first-domino-candidates.md) — candidate roster
- [`sequences/practitioner_design_partner_v1.yaml`](../sequences/practitioner_design_partner_v1.yaml) — outreach sequence
- [`MARKETING_SUPERVISOR.md`](../MARKETING_SUPERVISOR.md) — the loop that runs the campaign
- [`CONSTITUTION.md`](../CONSTITUTION.md) — every rule this bootstrap honors

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — operator workflow, system actions, success/failure criteria, post-bootstrap loop shift |
| 2026-05-18 (v1.1) | (same — recreated in PR 8) | Originally shipped in closed PR #810 (PR 4) → orphaned when PR 3 closed → resurrected because [`operator-validation-sprint.md`](./operator-validation-sprint.md) references it and was broken without it |
