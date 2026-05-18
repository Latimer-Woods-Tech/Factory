# Cost Projection

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative analysis · **Owner:** @adrper79-dot · **Supersedes:** none · **Pairs with:** [`BUDGET_CAPS.md`](./BUDGET_CAPS.md), [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md)

> The cost shape of an autonomous marketing loop is *not* the cost shape of a human marketer. This doc models the actual LLM + send + tooling cost of running the system specified in [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md), compares it against the caps in [`BUDGET_CAPS.md`](./BUDGET_CAPS.md), and surfaces where current caps are plausibly too tight. Numbers marked ⚠️ are best-effort estimates pending real metering data from [`@latimer-woods-tech/llm-meter`](../../packages/llm-meter/).

> Conflicts: [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) wins. Org-wide LLM cap in [`GAP_REGISTER.md` G8](../GAP_REGISTER.md) is the hard ceiling.

---

## 1. Purpose

Translate the autonomous loop spec into dollars so the operator can:

- Validate that [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) numbers are actually feasible against the workload [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) implies.
- Identify the cost controls that *must* land before the supervisor goes live (otherwise day-one will trip the G8 cap).
- Maintain honest headroom analysis against the org-wide $50/day Anthropic cap.

This doc is descriptive, not authoritative-on-caps — [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) remains the enforced ceiling. When this projection and that cap disagree, the cap wins until amended by ADR.

---

## 2. Cost categories

| # | Category | Where it lives | Unit cost (best estimate) | Notes |
|---|---|---|---:|---|
| 1 | LLM — `smart` tier (Claude Opus 4.7) | [`packages/llm/`](../../packages/llm/) | ~$15.00 / MTok in · $75.00 / MTok out | Reserved for TopicScout deep-mining + ExperimentRunner declaration. Most calls avoid this tier. |
| 2 | LLM — `balanced` tier (Claude Sonnet) | same | ~$3.00 / MTok in · $15.00 / MTok out | Default for ContentDrafter, CopyEditor edit-pass, RetroWriter. ~80% of generation volume. |
| 3 | LLM — `fast` tier (Groq llama-3.3-70b) | same | ~$0.59 / MTok in · $0.79 / MTok out ⚠️ | DigestComposer, BudgetWatcher pre-flight rationales, simple summarisation. Extremely cheap. |
| 4 | LLM — `verifier` tier (Groq llama-4-maverick) | same | ~$0.20 / MTok in · $0.60 / MTok out ⚠️ | Voice-gate grounding check on every gate-clean artefact. High call volume, tiny tokens. |
| 5 | Email sends (Resend) | [`packages/email/`](../../packages/email/) | $20 / 50k sends ≈ $0.0004 / send | Plus a one-time domain + dedicated-IP fee not modelled here. |
| 6 | Channel APIs — owned-social | [`packages/social/`](../../packages/social/) | $0 (free posting) | Rate-limited by platform, not by us. |
| 7 | Channel APIs — paid-ads | n/a yet | $0 today; spec only | Gated to $0 until readiness gate `paid_active` ([`CONSTITUTION.md §5`](./CONSTITUTION.md#5-channel-allowlist--readiness-gates)). |
| 8 | LLM-rank tracker (per PR 3l) | [`packages/llm/`](../../packages/llm/) | ~$0.02–$0.05 / ping ⚠️ | Scheduler-only; ~6 prompts × 4 providers × daily = ~24 calls/day org-wide. Modelled as a fixed daily line item. |
| 9 | Stripe processing fees | [`packages/stripe/`](../../packages/stripe/) | 2.9% + $0.30 / txn | Revenue-side, not a marketing-system spend, but the autonomous loop *triggers* checkouts so it lands here for honesty. |
| 10 | Image generation | TBD | ⚠️ Not modelled yet | Stable Diffusion via Workers AI is roughly free per inference; OpenAI DALL-E or Anthropic Vision-edits cost real money. Decision-pending — track under [`GAP_REGISTER.md`](../GAP_REGISTER.md) before any cell uses it. |
| 11 | R2 storage (marketing artefacts) | bucket `marketing-artefacts` | $0.015 / GB-month | A year of artefacts ≈ 50 GB ≈ $0.75/mo. Negligible. |
| 12 | Hyperdrive (marketing DB connections) | Neon via Hyperdrive | $0 for free tier today | If we exceed free tier, ~$5/mo for the first paid bucket. |
| 13 | PostHog events | hosted PostHog | ~$0.00005 / event @ scale tier ⚠️ | At 100k events/mo for marketing ≈ $5. Free tier 1M events/mo currently covers it. |
| 14 | Sentry events | [`packages/monitoring/`](../../packages/monitoring/) | $0 at current volume | Existing team plan covers marketing-supervisor errors. |

Excluded by design (not marketing-system spend even though they're costs the org bears): Cloudflare Workers requests, Workers KV reads, GitHub Actions minutes — all rolled into org platform spend and not attributable to a single matrix cell.

---

## 3. Per-loop-tick cost

The cron loop runs every 15 min ⇒ **96 ticks/day**. Not every tick fires every agent — most ticks only progress in-flight work. Modelling the *expected* agent invocations per tick:

| Agent | Invocations / tick (expected) | Avg tokens in / out | Tier | $ / invocation ⚠️ |
|---|---:|---:|---|---:|
| TopicScout | 0.3 | 4,000 / 1,500 | balanced | $0.034 |
| ContentDrafter | 1.5 | 3,000 / 1,200 | balanced | $0.027 |
| CopyEditor (voice gate) | 1.5 | 2,000 / 400 | verifier | $0.0006 |
| CopyEditor (minor edits) | 0.4 | 1,500 / 500 | balanced | $0.012 |
| ChannelPublisher | 1.0 | 0 / 0 | n/a (no LLM call; templating) | $0 |
| OutreachSender | 0.6 (script-gen) | 2,500 / 800 | balanced | $0.020 |
| ExperimentRunner | 0.05 | 1,500 / 600 | balanced | $0.014 |
| RetroWriter | 0.05 (weekly) | 10,000 / 3,000 | balanced | $0.075 |
| BudgetWatcher | 0.2 (rationale only) | 1,000 / 200 | fast | $0.0008 |
| TripwireMonitor | 0.1 (analysis only on fire) | 2,000 / 500 | fast | $0.0015 |
| DigestComposer | 0.04 (1/day across 96 ticks) | 4,000 / 800 | fast | $0.003 |
| **Per-tick total LLM cost** | — | — | — | **~$0.106 ⚠️** |

**Per-day cron LLM cost:** 96 ticks × $0.106 ≈ **$10.18 / day org-wide** before any campaign work.

Notes on this estimate:
- "Expected invocations" assumes a steady-state load with 5 filled cells (per [`ICP_MATRIX.md`](./ICP_MATRIX.md)), 3 queued campaigns per cell on average.
- TopicScout is throttled by the 10-draft-per-cell cap from [`MARKETING_SUPERVISOR.md §5`](./MARKETING_SUPERVISOR.md#5-campaign-state-machine), so it doesn't run hot.
- CopyEditor *gate* runs cheap; CopyEditor *edits* (when minor issues are found) run on balanced.
- The 3 concurrent loops (cron, event, matrix-signal) overlap on agent calls but rarely *add* invocations — the event-driven loop usually replaces a cron invocation rather than duplicating it.

---

## 4. Per-campaign cost

Two reference campaigns from [`LIFECYCLE.md`](./LIFECYCLE.md):

### 4a. Outreach drip — 3 emails × 200 recipients

Per [`LIFECYCLE.md §4`](./LIFECYCLE.md#4-drip-sequences-per-stage-transition) the `practitioner_welcome_v1` sequence is 5 emails over 14 days; using a smaller 3-email proxy here:

| Line item | Volume | Unit | Subtotal ⚠️ |
|---|---:|---:|---:|
| Personalised body generation (balanced tier) | 600 (3 × 200) | $0.020 | $12.00 |
| Voice gate verifier check | 600 | $0.0006 | $0.36 |
| Resend send | 600 | $0.0004 | $0.24 |
| Suppression-list + consent-gate DB read | 600 | $0 (Neon free-tier) | $0 |
| **Per-campaign total** | — | — | **~$12.60** |

**Per-recipient cost:** ~$0.063. At a typical 5-emails-over-14d sequence, ~$0.105 / recipient.

### 4b. Landing-page refresh + 3-post social drip (single cell)

| Line item | Volume | Unit | Subtotal ⚠️ |
|---|---:|---:|---:|
| Landing page hero + 3 sections (balanced) | 4 generations × 2.5k/1k tokens | $0.022 | $0.088 |
| Voice gate | 4 | $0.0006 | $0.0024 |
| Social posts (X, LinkedIn, blog teaser) | 3 × balanced | $0.027 | $0.081 |
| Voice gate × 3 | 3 | $0.0006 | $0.0018 |
| **Per-campaign total** | — | — | **~$0.17** |

Owned-social is structurally cheaper than outreach by ~75× because the recipient count is "audience" not "personalised message."

---

## 5. Per-month aggregate

Three scenarios. All assume current `discovery`-stage workload (no paid-ads), 5 filled cells.

### 5a. Conservative — workload at the *low* end of §3

- Cron loop: $10.18/day × 30 = **$305/mo**
- 6 outreach drips/mo (1 per cell + 1 win-back): 6 × $12.60 = **$76**
- 40 owned-social/landing refreshes/mo: 40 × $0.17 = **$7**
- LLM-rank tracker (24 pings/day × 30 days × $0.03): **$22**
- Resend (200 transactional emails/day × 30 × $0.0004): **$2**
- R2 + PostHog + Hyperdrive: **~$6**
- **Conservative monthly total: ~$418 ⚠️**

### 5b. Aggressive — workload at the *high* end (full ~3× concurrent loops firing, no caching)

- Cron loop: $10.18 × 3 (no caching, all 3 loops independent) × 30 = **$916**
- 15 outreach drips/mo (3 cells × full 5-email sequences × 200 recipients each, monthly): 15 × $21 = **$315**
- 120 owned-social/landing refreshes/mo: 120 × $0.17 = **$20**
- Experiment generation overhead (5 A/B tests × multiple variants): **$50 ⚠️**
- LLM-rank tracker: **$22**
- Resend (10k sends across all sequences/mo): **$4**
- R2 + PostHog + Hyperdrive: **~$10**
- **Aggressive monthly total: ~$1,337 ⚠️**

### 5c. Worst case — a stuck-loop / runaway agent before tripwires fire

Scenario: TopicScout-equivalent enters a loop generating drafts at the per-cell concurrency cap (10 drafts × 5 cells = 50 issues), each triggers a full ContentDrafter + CopyEditor pass, no caching, no tripwire fires for the first 24h.

- 50 issues × ContentDrafter $0.027 × ~20 retries (no idempotency): ~$27/day
- + cron loop $10/day
- + downstream voice-gate amplification
- **Worst-case day spike: ~$50–80 in a single day** before TripwireMonitor's "LLM cost spike >2× budget allocation" rule ([`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires)) fires.

This is the failure mode caps are designed to catch *and why* the per-cell daily cap matters more than the monthly cap.

---

## 6. Comparison to current `BUDGET_CAPS.md` — gap analysis

| Metric | Current cap | Conservative projection | Aggressive projection | Worst-case day |
|---|---:|---:|---:|---:|
| Daily LLM (sum-of-cells) | **$13.00** | $13.95 (= $418/30 mostly LLM) | $44.57 ($1,337/30) | $50–80 |
| Daily LLM (portfolio) | **$15.00** | $14.30 | $45.20 | $80+ |
| Monthly LLM (sum-of-cells) | **$420.00** | $418 | $1,337 | n/a |
| Monthly portfolio | **$500.00** | $437 | $1,357 | n/a |
| Per-tick LLM cost | implicit ($0.14 = $13/96) | $0.106 | $0.32 (3× loops) | spike |

**Findings:**

1. **Daily caps are at the conservative-projection ceiling.** [`BUDGET_CAPS.md §3.7`](./BUDGET_CAPS.md#37-cap-summary-filled-cells-2026-05-18) sum-of-cells $13/day is functionally the same as the conservative scenario's $13.95/day. There is *no headroom* for the system to absorb a single bad day. Day one of the loop going live, the cap will likely fire.
2. **Monthly caps cannot absorb the aggressive scenario.** $420/month sum vs. $1,337 projected aggressive. Either the loop spec needs cost controls (§8) or the caps need to ~3× — but ~3× would breach G8 if the rest of the org also scales.
3. **Worst-case day already exceeds G8.** $50/day org cap vs. a worst-case day of $50–80 marketing alone. The tripwire-2×-budget rule and the verifier-tier demotion (§8) are *load-bearing*; without them, the org cap is the failure mode.
4. **Per-cell allocations look defensible.** The relative shape ($4 practitioner > $3 consumer > $2.50 creator > $2 seeker > $1.50 internal) tracks the priority order in [`MEMORY.md project_priority_order.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_priority_order.md). The *absolute* numbers are too low.
5. **Current spend is the baseline, not the ceiling.** The $377/month rolling Anthropic figure from [`STATE.md`](../STATE.md) is *before* the marketing loop turns on. Adding the conservative projection alone would roughly double this.

---

## 7. Recommended cap revisions

To be ratified by ADR per [`BUDGET_CAPS.md §9`](./BUDGET_CAPS.md#9-amendment-process). Numbers below assume the cost controls in §8 ship *before* the loop activates:

| Cell | Current daily | Recommended daily | Current monthly | Recommended monthly |
|---|---:|---:|---:|---:|
| `selfprime-practitioner` | $4.00 | **$6.00** | $90 | **$160** |
| `selfprime-consumer` | $3.00 | **$4.50** | $70 | **$120** |
| `cypher-seeker` | $2.00 | **$3.00** | $45 | **$80** |
| `xicocity-creator` | $2.50 | **$3.50** | $55 | **$95** |
| `factory-internal` | $1.50 | **$2.00** | $30 | **$45** |
| **Sum of cells** | **$13.00** | **$19.00** | **$420** | **$500** |

Recommended portfolio caps:

| Window | Current | Recommended | Rationale |
|---|---:|---:|---|
| Daily | $15.00 | **$22.00** | Sum + ~$3 portfolio-tools buffer; still under G8 $50/day with 56% headroom. |
| Monthly | $500.00 | **$580** | Sum + $80 portfolio tools, unchanged. |

These revisions are deliberately *below* the aggressive projection ($1,337/mo) — the design says: cap forces the loop to operate in the cost-controlled regime, not the runaway one. If the operator chooses to accept higher spend, they amend the cap with an ADR citing evidence.

**Do not raise the caps without first landing §8 controls.** Raising them blind is how you spend $1,300 in a month for the same output the conservative scenario produces for $418.

---

## 8. Cost controls beyond caps

These are *required* infrastructure, not optional optimisations. Without them, the recommended caps in §7 are insufficient.

### 8a. Tier demotion for high-volume agents

High-volume + low-stakes agents should drop a tier:

| Agent | Current implied tier | Demoted tier | Expected $ saving |
|---|---|---|---:|
| CopyEditor (voice gate) | balanced (if drifting) | **verifier** only (Groq) | ~95% per gate call |
| BudgetWatcher rationales | balanced | **fast** (Groq llama-3.3) | ~95% |
| DigestComposer | balanced | **fast** | ~95% |
| TripwireMonitor analysis | balanced | **fast** | ~95% |
| OutreachSender personalisation | balanced | **balanced for prompts, verifier for QA** | 30–50% via two-pass |

For the highest-volume agents (CopyEditor at ~144 gate calls/day, BudgetWatcher at ~20/day), the Haiku-class equivalent on Anthropic or Groq fast tier saves the bulk of the cron-loop cost. Implementation: `tier: 'fast'` parameter in [`@latimer-woods-tech/llm`](../../packages/llm/) `complete()` calls; lands as a one-line change per agent.

### 8b. Aggressive prompt caching

Anthropic prompt caching cuts repeat-prefix costs by ~90% on Sonnet/Opus. The voice profile prompt is identical across every ContentDrafter call for a given cell × voice — this is the textbook caching case.

- ContentDrafter: cache the voice profile + ICP context prefix → saves ~$0.018 per call (~67% of the call cost).
- CopyEditor (when running balanced): cache the rubric → saves ~$0.008 per call.
- RetroWriter: cache the retro template → saves ~$0.05 per weekly call.

Aggregate saving: ~50–60% of the §3 per-tick LLM cost in steady state.

Track under: [`packages/llm/`](../../packages/llm/) `cacheControl` parameter; enforce ≥90% cache hit-rate via dashboard.

### 8c. Batching + idempotency

- **Batching:** group adjacent ContentDrafter calls on the same cell within a tick into a single LLM call with multiple completions. Saves the input-token cost of repeated context. ~20–30% on ContentDrafter.
- **Idempotency keys:** per `(campaign_id, artefact_type)` so retries don't re-invoke the LLM. This is the *single biggest worst-case-day mitigation* — see §5c, where the runaway scenario costs hit because retries hit fresh. Idempotency caps retries at one effective LLM call.

### 8d. Hard daily LLM cost circuit-breaker (separate from caps)

Even with caps and tier-demotion, the loop should self-terminate hard on a runaway. Add a top-of-file circuit-breaker in [`apps/marketing-supervisor/`](../../apps/marketing-supervisor/): if `llm_spend_today > 1.5 × daily_portfolio_cap` regardless of cell distribution, halt *all* generation and open a Tier-3 issue. This is the layer below tripwires — a "this run is structurally broken, stop generating" rule, not a "this content is bad, stop publishing" rule.

---

## 9. Headroom analysis vs G8 $50/day org cap

Org-wide Anthropic cap from [`GAP_REGISTER.md` G8](../GAP_REGISTER.md): **$50/day**, enforcement currently visibility-only.

| Scenario | Marketing daily | Rest of org daily (est.) | Total | G8 headroom |
|---|---:|---:|---:|---:|
| Today (no loop) | ~$0.30 | ~$12.50 ($377/30) | ~$12.80 | **74% under cap** |
| Conservative + recommended cap | ~$14.00 | ~$15.00 (grows w/ Factory work) | ~$29 | **42% under cap** |
| Aggressive + cost controls | ~$22 | ~$15 | ~$37 | **26% under cap** |
| Aggressive + no cost controls | ~$45 | ~$15 | **~$60** | **OVER CAP — G8 fires** |
| Worst-case day | ~$50–80 | ~$15 | $65–95 | **OVER CAP — tripwire must catch it** |

Conclusions:

1. With recommended caps + §8 controls, the loop fits comfortably under G8.
2. Without §8 controls, the recommended caps still risk breaching G8 on an aggressive day.
3. The org-wide growth path (more Factory engineering work, more Sauna/Capricast LLM use) eats into shared headroom. Marketing should *not* assume static co-tenants.
4. G8 enforcement (blocking, not visibility) is a prerequisite for the marketing loop activation — track in G8 stage-2 milestone.

---

## 10. Cross-references

| Doc / code | Why |
|---|---|
| [`CONSTITUTION.md §3`](./CONSTITUTION.md#3-budget-caps) | The budget rule this doc costs out |
| [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires) | LLM-cost-spike tripwire (worst-case-day catch) |
| [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) | Current caps — this doc recommends revisions per §7 |
| [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) | 10 agents × 96 ticks/day model lives here |
| [`LIFECYCLE.md`](./LIFECYCLE.md) | Drip sequence volumes for §4 |
| [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) | What "cap fires" means in operator terms |
| [`docs/STACK.md`](../STACK.md) | LLM tier names and provider routing |
| [`docs/STATE.md`](../STATE.md) | Current $377/mo Anthropic baseline |
| [`docs/GAP_REGISTER.md` G8](../GAP_REGISTER.md) | Org-wide $50/day Anthropic cap |
| [`docs/cost/summary.md`](../cost/summary.md) | Auto-generated rolling cost digest |
| [`scripts/cost_digest.py`](../../scripts/cost_digest.py) | Roll-up generator |
| [`packages/llm/`](../../packages/llm/) | Tier routing + caching parameters |
| [`packages/llm-meter/`](../../packages/llm-meter/) | Where blocking enforcement lands (G8 stage-2) |
| [`packages/email/`](../../packages/email/) | Resend send volume + per-send cost |
| [`packages/social/`](../../packages/social/) | Channel adapters (free posting) |
| [`apps/marketing-supervisor/`](../../apps/marketing-supervisor/) | Where §8d circuit-breaker lands |
| [`pr3-briefs/3e-supervisor-worker.md`](./pr3-briefs/3e-supervisor-worker.md) | Implementation brief |

---

## 11. Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — initial projection: per-tick / per-campaign / per-month models; finds current `BUDGET_CAPS.md` daily caps at conservative-projection ceiling (no headroom); recommends $13→$19 daily / $420→$500 monthly with §8 controls as prerequisite; worst-case day exceeds G8 $50/day, gated by tripwire + §8d circuit-breaker |
