# First-Domino Bootstrap — 5 Design Partners

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Operator-staging · **Cell:** `selfprime:practitioner` · **Campaign:** `2026-q3-practitioner-design-partners`

> The bootstrap playbook for the autonomous marketing loop's **first manual touchpoint**. Per [`icp/selfprime-practitioner.md §2.5`](../icp/selfprime-practitioner.md) — the operator's only manual marketing action is 5 Zoom calls with design partners. This file pre-stages everything that surrounds those 5 calls so the operator's time is bounded to ~5 hours total.

> After 5 design partners onboard, the autonomous loop has the data substrate it needs (real usage, real voice patterns, real conversion signal) to run hands-off per [`MARKETING_PLAN.md`](../MARKETING_PLAN.md).

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

---

## 3. What the system does

Once the operator approves the candidate list (step 3 above):

| Loop component | Action |
|---|---|
| `OutreachSender` agent ([3e](../pr3-briefs/3e-supervisor-worker.md)) | Reads Tier-1 from `first-domino-candidates.md`; enrolls each in `practitioner_design_partner_v1` sequence |
| `@lwt/email` sequencer ([3a](../pr3-briefs/3a-email-drip.md)) | Sends step 0 immediately, step 1 at +5d, step 2 at +14d; honors suppression list at every step |
| `@lwt/copy` voice gate ([3c](../pr3-briefs/3c-voice-matrix.md)) | Every send rendered through `prime_self:practitioner` voice; `validateAiOutput` gate blocks publication on `major`/`critical` issues |
| `TripwireMonitor` ([3m](../pr3-briefs/3m-brand-safety-tripwire.md)) | Watches unsubscribe rate, spam complaints, reply sentiment; auto-pauses cohort on anomaly (tier-3 escalation) |
| `BudgetWatcher` ([3e](../pr3-briefs/3e-supervisor-worker.md)) | Caps LLM cost for this cohort at $4/day per [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) `selfprime:practitioner` allocation |
| `DigestComposer` ([3e](../pr3-briefs/3e-supervisor-worker.md)) | Surfaces meeting bookings + reply highlights in operator's daily digest |
| `RetroWriter` ([3e](../pr3-briefs/3e-supervisor-worker.md)) | Auto-writes retro at `playbooks/retros/2026-q3-practitioner-design-partners.md` after 30 days |

The operator never sees raw outbox or template editor. The system runs.

---

## 4. Inputs ready in this PR

| File | Purpose | Status |
|---|---|---|
| [`first-domino-candidates.md`](./first-domino-candidates.md) | Tier 1/2/3 candidate roster | Drafted by research agent; operator edits |
| [`../sequences/practitioner_design_partner_v1.yaml`](../sequences/practitioner_design_partner_v1.yaml) | 3-step outreach sequence config | Drafted; LLM renders final copy at send time per `prime_self:practitioner` voice |
| Operator signature block | Used in templates as `{{operator_signature_block}}` | ⏳ Operator provides via `tenant_secrets` after PR 3a ships |
| Operator Calendly link | Used as `{{operator_calendar_link}}` | ⏳ Operator provides |

---

## 5. What the 30-minute Zoom call covers

Pre-approved agenda (operator can replace; this is a starting template):

| Minute | Topic |
|---|---|
| 0–5 | Practitioner walks through how they currently prep a chart; what kills the most time |
| 5–15 | Operator demos one workflow — usually "draft a reading in your voice in 5 minutes" |
| 15–25 | Practitioner gives blunt feedback on what's wrong / missing / surprising |
| 25–30 | Operator: "12 months free, your edits become the product." Close (yes / no / I'll think about it). |

The "no fluff, peer-to-peer" framing reinforces the voice — the call IS the brand demo.

---

## 6. Success / failure criteria

Per [`practitioner_design_partner_v1.yaml`](../sequences/practitioner_design_partner_v1.yaml):

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
3. **Funnel baseline** — `LIFECYCLE.md` per-cell baselines lock in from this cohort's data; future cohorts compared against
4. **Referral graph seeds** — `@lwt/referrals` ([3j](../pr3-briefs/3j-referrals.md)) issues each partner a unique invite code; cohort retention diff measured between partner-referred vs non-referred consumer signups (validates the prosumer flywheel hypothesis)
5. **Public reading library seeds** — partners publish first reads at `selfprime.net/r/{practitioner}/{reading}` ([3h](../pr3-briefs/3h-shareables.md)); becomes SEO + distribution surface

**Next domino:** with 5 partners producing real signals, the supervisor's `TopicScout` ([3g](../pr3-briefs/3g-topic-queue.md)) gets enough engagement data to start the video factory + content publisher loop hands-off. That's when the autonomous loop becomes self-sustaining.

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
- [`sequences/practitioner_design_partner_v1.yaml`](../sequences/practitioner_design_partner_v1.yaml) — the outreach sequence
- [`first-domino-candidates.md`](./first-domino-candidates.md) — the candidate list
- [`pr3-briefs/3a-email-drip.md`](../pr3-briefs/3a-email-drip.md) — sequencer that consumes the YAML
- [`pr3-briefs/3c-voice-matrix.md`](../pr3-briefs/3c-voice-matrix.md) — voice gate
- [`pr3-briefs/3e-supervisor-worker.md`](../pr3-briefs/3e-supervisor-worker.md) — the loop that runs the campaign
- [`pr3-briefs/3m-brand-safety-tripwire.md`](../pr3-briefs/3m-brand-safety-tripwire.md) — tripwires that protect this cohort
- [`CONSTITUTION.md`](../CONSTITUTION.md) — every rule this bootstrap honors

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — operator workflow, system actions, success/failure criteria, post-bootstrap loop shift |
