# Marketing Constitution

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Conflicts:** [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) wins · **Owner:** @adrper79-dot

> These are the rules the autonomous marketing system **cannot break**. Every agent, every campaign, every generated artefact must conform. If a rule isn't here, it isn't a rule — but if a rule is here, it is non-negotiable until amended by an ADR in [`docs/decisions/`](../decisions/).

> Operating model: the operator is too busy to spearhead campaigns. The system runs hands-off; the operator approves what matters (per [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md)) and reviews escalations only.

---

## 1. North star

**Single optimization target:** *active paying subscribers retained ≥30 days, decomposed by `(product, icp)`.*

- MRR is a derivative — useful but never a target.
- Signups are a diagnostic — never a target.
- Cost of acquisition is a *constraint*, not an objective.

The system is forbidden from optimizing any other metric as a primary target. Diagnostics may be tracked freely; targets may not be moved without an ADR.

**Why this rule:** autonomous systems optimize what they can measure. Without a single fixed objective they hill-climb on whatever proxy is easiest to move — usually signups, usually with dark patterns. One target, immutable, decomposed for diagnostic visibility.

---

## 2. Brand voice gate

**Every** generated artefact destined for public surfaces — copy, email, social post, video script, landing page, ad creative — passes `validateAiOutput()` from [`@latimer-woods-tech/validation`](../../packages/validation/) before publication.

- `critical` or `major` issues → **block** publication; route to escalation queue.
- `minor` issues → log, allow publication, surface in weekly retro.
- Voice profile used = `(product, icp)` lookup from [`VOICES.md`](./VOICES.md).
- Profile must be registered in [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts) before the matrix cell can run a campaign.

**Why this rule:** autonomous content without a voice gate is how brands self-destruct. The gate is the killer prerequisite for hands-off operation.

---

## 3. Budget caps

All spend is enforced at three levels — per channel, per matrix cell, per portfolio. See [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) for current numbers.

- **Hard caps**, not soft. System refuses to spend past cap and routes to escalation.
- **Daily, weekly, monthly** windows — single-day spike protection plus rolling budgets.
- **No paid spend** on a matrix cell until that cell has ≥3 months of cohort retention data and the cell's ICP file has `paid_readiness_gate: met` (see §5 below).
- **LLM cost** is part of the budget (already gated org-wide at $50/day per [G8](../GAP_REGISTER.md); marketing system gets a sub-allocation).
- **Free-tier abuse** counts: rate-limit any growth hook (embed widget, free chart, referral signup) such that an attacker can't drain LLM budget through it.

**Why this rule:** autonomous + unbounded = bankruptcy. Hard caps make the failure mode "campaign paused" not "credit card maxed."

---

## 4. Approval tiers

The system acts autonomously within its tier; escalates above it. Tier-1 actions never wake the operator; tier-3 actions always wake them.

| Tier | Examples | Approval |
|---|---|---|
| **1 — Autonomous** | Publish to owned social (single post), send an email in an existing sequence, generate copy, render a video, create a draft campaign brief | None |
| **2 — Operator FYI** | Activate a new sequence, launch a video into a paid promotion slot, send to >10% of full list, post to a new channel for the first time, run an A/B test | Push notification + queue; operator can pause within 24h |
| **3 — Operator approval** | Any paid spend, any send to >50% of full list, any partnership outreach, any content touching a sensitive topic, anything tagged by brand-safety tripwire | Blocking; system waits |

Tier 3 actions wait indefinitely. Tier 2 actions auto-proceed after 24h unless paused.

**Why this rule:** without tiers, you're either over-cautious (every action waits) or you wake up to a $5k charge. The tiers map cost-of-mistake to friction-of-approval.

---

## 5. Channel allowlist + readiness gates

The system may publish only on **allowlisted channels**, and only after the channel passes the **readiness gate** for the relevant matrix cell.

**Allowlist** (org-level, growing):
- Owned: product itself, email, blog (Mintlify), Substack-equivalent
- Earned (free): X, LinkedIn, YouTube, TikTok, Instagram, Pinterest, Reddit (limited — see below), substack newsletter syndication
- Earned (events): podcast guest pitches, conference proposal submissions
- Paid: Google, Meta, LinkedIn, X — **only after readiness gate**

**Denylist** (forbidden until ADR superseding):
- Cold mass outbound (>10 recipients per day across all sequences) without prior consent on file
- Reddit *posting* outside of subs that explicitly allow promotion (replies/comments allowed in any sub)
- Influencer payola (pay-for-post arrangements)
- Astroturfing of any kind — every account is identifiable as Selfprime/LWT
- Any campaign targeting <16-year-olds
- Any campaign in regulated verticals (health claims, financial advice) without compliance review

**Readiness gate per cell:**
- `discovery`: cell has an ICP file in [`icp/`](./icp/) and a registered voice profile
- `earned_active`: discovery + ≥1 owned channel produced ≥10 published artefacts and is showing measurable engagement (cell-specific threshold from [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md))
- `paid_ready`: earned_active + ≥3 months of cohort retention data + cohort meets LTV:CAC target
- `paid_active`: paid_ready + operator approval recorded in the matrix

**Why this rule:** every "wait, are we doing X" failure in early-stage marketing traces to either no allowlist or no readiness gradient. Both required.

---

## 6. Data, consent, compliance

- **Tenant isolation:** every campaign, contact, lead, and event is tenant-scoped per [`PLATFORM_STANDARDS §2`](../PLATFORM_STANDARDS.md). RLS enforced at the DB (see [`packages/crm/src/index.ts` ENABLE_OUTREACH_RLS](../../packages/crm/src/index.ts)).
- **Consent gates:** outreach to a contact requires `consent_status IN ('opted_in')` per [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts). `unknown` is not a green light.
- **Unsubscribe:** every email contains a one-click unsubscribe; the `unsubscribe()` API in [`packages/email/src/index.ts`](../../packages/email/src/index.ts) tags the contact and the system honours suppression list before *any* send.
- **PII handling:** events sent to PostHog must not include PII beyond `user_id`. Revenue / billing events go to `factory_events` only (already firewalled in [`packages/analytics/src/index.ts`](../../packages/analytics/src/index.ts)).
- **DSR:** subject-access / deletion requests handled per Stage-5 process (queued; ADR-pending). System does not store data that can't be deleted.
- **Regional compliance:** GDPR (EU), CCPA (CA), CAN-SPAM (US email), CASL (CA email) — enforced via consent + suppression + footer fields. No new region opens until compliance footer fields added.

**Why this rule:** compliance is the failure mode that's most expensive *and* most autonomous-system-vulnerable. Codify, don't rely on judgment.

---

## 7. Brand-safety tripwires

The system auto-pauses publication on any matrix cell when any tripwire fires. Operator escalation, tier-3.

| Tripwire | Threshold | Why |
|---|---|---|
| Unsubscribe spike | >2× rolling 14-day median in any sequence | Either bad content or wrong list — both need human eyes |
| Spam complaint rate | >0.1% in any send | Resend / inbox provider thresholds; account at risk |
| Reply-sentiment crash | NPS-equivalent on inbound replies drops >20pts WoW | The voice profile is misfiring |
| Mention surge (negative) | >3σ negative-sentiment mentions on monitored handles in 24h | Either a bug, a screenshot gone wrong, or a coordinated pile-on |
| LLM cost spike | >2× budget allocation | Loop is in a bad state |
| Conversion crash | conversion rate on a live campaign drops >50% in 24h | Funnel broken, fix before continuing |
| Brand-voice failure rate | >5% of generated artefacts blocked at gate in 24h | The generator is drifting |

Each tripwire's exact threshold + handler is specified in [`packages/validation/`](../../packages/validation/) extensions (per [PR 3m brief](./pr3-briefs/3m-brand-safety-tripwire.md)).

**Why this rule:** the autonomous system needs a "kill switch" that fires before damage compounds. Tripwires are that switch.

---

## 8. Experimentation discipline

- **A/B tests** must declare hypothesis + primary metric + minimum sample size **before** the test starts. No post-hoc primary metric changes.
- **A/B winners** require statistical significance at p<0.05 on the pre-declared metric. No declaring winners on secondaries.
- **Multi-arm** tests OK; 4 arms max. Beyond 4, run sequential A/Bs.
- **Test duration:** minimum 7 days unless event-windowed; max 30 days. No indefinite tests.
- **Negative results** are publishable internally — the loop logs every test and outcome to a campaign retro doc.

**Why this rule:** autonomous A/B testing without discipline is hill-climbing on noise. The pre-declaration rule is the only thing that makes results trustworthy.

---

## 9. Honesty + truth

- **No fake scarcity** — "only 3 spots left" must be true.
- **No fake social proof** — testimonials must be real, dated, attributable on request.
- **No misleading claims** — the LLM must not generate efficacy claims for health/wellness products beyond what the legal page allows.
- **AI disclosure** — content produced primarily by the LLM must say so where the platform requires it (e.g. Substack AI tag).
- **Affiliate / referral disclosure** — any earned commission disclosed in compliance with FTC + equivalents.

**Why this rule:** the cost of getting caught lying at scale is unbounded. Cost of disclosure is zero.

---

## 10. Operator escalation rights

The operator **always** has these rights, no exceptions:

- Pause any campaign instantly via a single `pause-marketing` CLI / API call
- Inspect the queue at any time
- Override any tier-1 or tier-2 decision after the fact (rollback / unsend where physically possible)
- Demote any matrix cell back to `discovery` readiness
- Replace any voice profile mid-flight
- Request a full audit trail of any generated artefact (LLM call log, prompt, output, gate result, who/what/when published)

**Why this rule:** the autonomous system is a delegated authority, not a sovereign one. Operator can always reclaim control.

---

## 11. Amendment process

This constitution is amended by ADR in [`docs/decisions/`](../decisions/). Each ADR must:

- State the rule being changed
- State the incident or strategic shift motivating the change
- Cite at least one concrete failure or opportunity the current rule produced
- Declare the rollback path

Changes that **soften** a rule require ≥1 week of operator-only review. Changes that **tighten** a rule may ship same-day.

---

## Cross-references

| Doc | Why |
|---|---|
| [`MARKETING_PLAN.md`](./MARKETING_PLAN.md) | Canonical index |
| [`ICP_MATRIX.md`](./ICP_MATRIX.md) | Product × ICP grid |
| [`VOICES.md`](./VOICES.md) | Voice profile registration |
| [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) | Numeric caps |
| [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) | Tier mechanics |
| [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) | The loop |
| [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) | Org-wide non-negotiables (supersede this doc) |
| [`packages/validation/`](../../packages/validation/) | The voice gate |
| [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) | Consent enforcement |

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — initial constitution for autonomous marketing loop |
