# ADR — Attribution Model: Dual Last-Non-Direct + First-Touch

**Status:** Accepted · **Date:** 2026-05-18 · **Decider:** @adrper79-dot · **Supersedes:** none

> **TL;DR:** Run **two attribution models in parallel** — *last non-direct touch* for operational reporting, *first touch* for ICP-fit analysis. Defer multi-touch (Markov / time-decay / U-shape) to Phase 2 once ≥6 months of touch data exists per cell. Lock the choice now so the autonomous loop has a stable substrate.

---

## Context

The marketing maturation plan ([`docs/marketing/`](../marketing/)) introduces an autonomous loop that operates across a product × ICP matrix. The loop needs to answer:

- **Which channel produced this paying customer?** — for budget allocation
- **Which channel finds the right kind of customer?** — for ICP-fit / sub-segment learning
- **What's the LTV/CAC by channel?** — for the `paid_ready` readiness gate per [`CONSTITUTION.md §5`](../marketing/CONSTITUTION.md#5-channel-allowlist--readiness-gates)

A single attribution model under-serves these questions:

- **Last-touch alone** underweights top-of-funnel channels (SEO, YouTube, podcast guests) — they get blamed when last-touch is `email_*` or `direct`.
- **First-touch alone** underweights closing channels (email lifecycle, retargeting) — they get blamed when first-touch is a single TikTok view that happened 6 months ago.
- **Multi-touch (Markov, time-decay, U-shape)** is the academically correct answer but is **mostly noise without ≥6 months of cell-level touch data** — you're fitting decay curves to ~30 conversions, results swing wildly.

The current codebase has zero attribution capture — UTMs not propagated, `crm_leads.source` is a free-text first-touch value with no dedup. [G34 in GAP_REGISTER](../GAP_REGISTER.md) flags this.

---

## Decision

### 1. Run **two models in parallel**

| Model | Used for | Stored as |
|---|---|---|
| **Last non-direct touch** | Operational reporting — "which channel produced this customer in the last 30 days?" Budget reweighting decisions. Channel-state advancement. | `crm_leads.last_touch_source`, `last_touch_campaign`, `last_touch_at` |
| **First touch** | ICP-fit analysis — "which channel found the right customer?" Cohort retention by first source. Strategic channel doctrine. | `crm_leads.first_touch_source`, `first_touch_campaign`, `first_touch_at` |

Both models read from a shared event substrate (UTM-tagged events stamped in [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts)). The distinction is *purely* in how `crm_leads` columns are populated:

- **`first_touch_*`** — set exactly once, on the user's first identifiable non-bot event. Never overwritten.
- **`last_touch_*`** — updated on every non-direct event. Direct touches don't displace a known source (the *non-direct* in "last non-direct" is load-bearing).

### 2. Standardize UTM convention

Five-field convention per [`docs/marketing/CAMPAIGN_TAGGING.md`](../marketing/CAMPAIGN_TAGGING.md):

```
?utm_source={channel}&utm_medium={class}&utm_campaign={campaign_id}&utm_content={icp}&utm_term={subsegment_or_arm}
```

### 3. Implement source dedup registry

Same source arrives under many host names (`twitter.com` / `t.co` / `x.com` → `x`). A canonical mapping lives in [`packages/attribution/src/source-map.ts`](../../packages/attribution/src/) per [PR 3k brief](../marketing/pr3-briefs/3k-attribution.md). The map is additive — unknown hosts producing ≥10 visits in 7 days auto-open a classification PR.

### 4. Defer multi-touch attribution to Phase 2

Multi-touch is **not** implemented in PR 3k. Triggers for Phase 2 work:
- A cell has ≥6 months of touch data
- That cell has ≥200 paying conversions in the period
- A specific decision (e.g. paid budget reallocation, channel sunset) requires the model

When triggered, the Phase 2 work is a separate ADR; not pre-decided here.

### 5. Lock the schema in [PR 3b — ICP dimension](../marketing/pr3-briefs/3b-icp-dimension.md)

The new `crm_leads` columns are added in PR 3b (alongside the ICP dimension migration) so the attribution package (PR 3k) has a stable substrate to read from.

---

## Alternatives considered

### A. Last-touch only

**Why rejected:** SEO + long-form video are the highest-leverage compounding channels per [`CHANNEL_DOCTRINE.md §1`](../marketing/CHANNEL_DOCTRINE.md). They almost never get last-touch attribution. Running last-touch alone biases the autonomous loop to defund the channels that actually find customers, in favor of channels that close them. Predictable failure.

### B. First-touch only

**Why rejected:** First-touch alone underweights nurture. A user's first touch might be a 6-month-old TikTok video; their actual conversion was driven by a Selfprime email that ran 12 paragraphs of practitioner-relevant copy. Defunding email would be catastrophic.

### C. Markov / time-decay multi-touch from day one

**Why rejected:**
- Insufficient data — the models fit to noise below ~200 conversions per cell, which we won't have for ≥6 months
- Black-box outputs — operator can't sanity-check a Markov chain's allocation; trust degrades
- Implementation cost — Markov requires the full touch graph for every user, including cross-session linking. Schema + privacy complexity. Defer until value clearly exceeds cost.

### D. UTM-only attribution (no first-touch / last-touch columns)

**Why rejected:** UTMs are session-scoped. We need user-lifetime attribution to answer "what channel found this customer who paid 3 months later." Permanent columns on `crm_leads` are mandatory.

### E. Third-party attribution platform (Singular, AppsFlyer, Branch)

**Why rejected:**
- Cost — these tools charge per MAU; not justified at our scale
- Privacy — we firewall revenue events off PostHog ([`packages/analytics/src/index.ts`](../../packages/analytics/src/index.ts)); third-party attribution platforms would re-introduce the leak we deliberately closed
- Lock-in — once integrated, switching cost is high
- Not needed — last-non-direct + first-touch is straightforward to implement in [`@lwt/attribution`](../../packages/attribution/), under our control

---

## Consequences

### Positive

- Two clean answers to two distinct questions
- Cell-level decomposition works ([`KPI_DECOMPOSITION.md §3`](../marketing/KPI_DECOMPOSITION.md))
- Channel state machine ([`CHANNEL_DOCTRINE.md §5`](../marketing/CHANNEL_DOCTRINE.md)) gets real data to advance/retreat states
- Privacy maintained — touch data stays in Neon, not PostHog
- Source dedup is *additive* — unknown sources surface for review rather than disappear silently

### Negative

- Two models means two reports per channel. Mild cognitive overhead; mitigated by labeling.
- First-touch immutability means manual fix-ups (e.g. a known bot mis-attribution) require a script, not a UI. Acceptable for now; revisit if frequent.
- Per [`ATTRIBUTION.md §6`](../marketing/ATTRIBUTION.md#6-edge-cases-handled-in-spec), some edge cases (cookies cleared, cross-device) require server-side merge logic in PR 3k.

### Neutral

- Pre-2026-05-18 data is **not** retroactively attributed. Acceptable — pre-PR-1 traffic was largely operator-direct anyway.
- Multi-touch deferral creates a known-known. Phase-2 trigger is specified; no surprise.

---

## Rollback path

If the dual model proves unworkable (operator can't decide between conflicting answers, or one report consistently misleads the loop):

1. Pick whichever single model produces more decision-useful output
2. ADR superseding this one; update [`ATTRIBUTION.md`](../marketing/ATTRIBUTION.md) accordingly
3. Schema columns remain (forward-compatible)
4. [`@lwt/attribution`](../../packages/attribution/) gains a config flag; supervisor reads it

Estimated rollback time: 1 day if the dual model is the issue. Schema is forward-compatible so no migration needed either way.

---

## Cross-references

- [`docs/marketing/ATTRIBUTION.md`](../marketing/ATTRIBUTION.md) — operational doc this ADR locks
- [`docs/marketing/CAMPAIGN_TAGGING.md`](../marketing/CAMPAIGN_TAGGING.md) — 5-field UTM convention
- [`docs/marketing/CHANNEL_DOCTRINE.md`](../marketing/CHANNEL_DOCTRINE.md) — channel state machine that consumes attribution
- [`docs/marketing/KPI_DECOMPOSITION.md`](../marketing/KPI_DECOMPOSITION.md) — decomposition queries that read the columns
- [`docs/marketing/pr3-briefs/3b-icp-dimension.md`](../marketing/pr3-briefs/3b-icp-dimension.md) — schema migration
- [`docs/marketing/pr3-briefs/3k-attribution.md`](../marketing/pr3-briefs/3k-attribution.md) — `@lwt/attribution` package
- [`docs/GAP_REGISTER.md`](../GAP_REGISTER.md) — G34 partially resolved by this work; closure in PR 2

---

## Authors

- Drafted by Claude (Opus 4.7) at 2026-05-18 based on operator's autonomous-marketing-loop ask
- Accepted by @adrper79-dot on commit
