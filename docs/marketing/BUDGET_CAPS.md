# Budget Caps

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Owner:** @adrper79-dot · **Implements:** [`CONSTITUTION.md §3`](./CONSTITUTION.md#3-budget-caps)

> Hard numbers. The autonomous loop refuses to spend past these caps and routes to Tier-3 per [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md). Soft caps are not a thing here — soft caps are how autonomous systems go bankrupt.

> Conflicts: [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) wins. Org-wide LLM cap in [`GAP_REGISTER.md` G8](../GAP_REGISTER.md) supersedes the LLM line items in this file when stricter.

---

## 1. Purpose

Specify, per matrix cell and per channel, the maximum spend the system may incur without operator approval. Three enforcement layers; smallest cap wins. All numbers are in USD; all windows are calendar windows in `America/Mexico_City` (operator timezone).

This doc is the source of truth. The supervisor Worker ([PR 3e](./pr3-briefs/3e-supervisor-worker.md)) reads it on each cap check; any change requires an ADR per §9.

---

## 2. The three enforcement layers

| Layer | Scope | Why |
|---|---|---|
| **Per-channel** | One channel within one cell (e.g. Google Ads on `selfprime-practitioner`) | Channel-specific blowups (e.g. a runaway PPC auction) get contained before they drain the cell |
| **Per-cell** | All channels for one matrix cell (e.g. all spend on `selfprime-practitioner` across Google, Meta, LinkedIn, tools, LLM) | A cell that's not retaining shouldn't be allowed to scale spend just because no single channel is over |
| **Per-portfolio** | Sum across every cell (org-wide marketing total) | Total monthly marketing spend never exceeds this cap regardless of cell mix |

**Composition rule:** every spend attempt is checked against all three layers in order. **The smallest applicable cap wins.** Example: if a Google Ads auction wants $30 and the per-channel daily cap has $50 remaining but the per-cell daily cap has $5 remaining, the supervisor refuses the spend and routes to Tier 3. Cells and channels never share headroom across each other; portfolio headroom is the global ceiling, not a shared pool.

The supervisor's cap check is a fast-path against KV-cached counters reconciled hourly from `factory_events` (`marketing.tier1.cost_recorded` + `revenue.*` audit events). A reconciliation drift >5% between KV and `factory_events` raises a Tier-3 issue.

---

## 3. Cap table

Cells covered (current `discovery`+ from [`ICP_MATRIX.md`](./ICP_MATRIX.md)):

- `selfprime-practitioner` (first domino)
- `selfprime-consumer`
- `cypher-seeker`
- `cypher-practitioner` *(queued — caps reserved, no spend authorised yet)*
- `xicocity-creator`
- `factory-internal`

Channels: `llm` (Anthropic + Grok + Groq, per [`docs/STACK.md`](../STACK.md)), `paid-ads` (Google/Meta/LinkedIn/X), `partnership-event` (sponsorships, podcast guest fees, conference passes), `tools` (paid SaaS attributed to this cell — schedulers, analytics add-ons, design tools).

`paid-ads` is `$0` for every cell whose readiness state is below `paid_active`. This is enforced by the readiness gate in [`CONSTITUTION.md §5`](./CONSTITUTION.md#5-channel-allowlist--readiness-gates), not just by these numbers.

### 3.1 `selfprime-practitioner` (state: 🟡 `discovery`)

| Channel | Daily | Weekly | Monthly | Hard-cap behavior |
|---|---:|---:|---:|---|
| `llm` | $4.00 | $25.00 | $90.00 | Pause generation for cell; transactional retries from cache only; Tier-3 issue `tripwire/llm-cost` |
| `paid-ads` | $0 | $0 | $0 | Refuse spend; readiness gate not met |
| `partnership-event` | $0 | $0 | $0 | Refuse; Tier-3 approval required for any partnership ([`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) §2 Tier-3 #2) |
| `tools` | — | — | $50.00 | Cell-attributed tools (e.g. metrics add-on); breach = Tier-3 |
| **Cell total** | **$4.00** | **$25.00** | **$140.00** | Cell-level pause; Tier-3 |

### 3.2 `selfprime-consumer` (state: 🟡 `discovery`)

| Channel | Daily | Weekly | Monthly | Hard-cap behavior |
|---|---:|---:|---:|---|
| `llm` | $3.00 | $18.00 | $70.00 | Pause generation for cell; Tier-3 |
| `paid-ads` | $0 | $0 | $0 | Readiness gate not met |
| `partnership-event` | $0 | $0 | $0 | Tier-3 |
| `tools` | — | — | $30.00 | Tier-3 |
| **Cell total** | **$3.00** | **$18.00** | **$100.00** | |

### 3.3 `cypher-seeker` (state: 🟡 `discovery`)

| Channel | Daily | Weekly | Monthly | Hard-cap behavior |
|---|---:|---:|---:|---|
| `llm` | $2.00 | $12.00 | $45.00 | Pause; Tier-3 |
| `paid-ads` | $0 | $0 | $0 | Readiness gate not met *and* regulated-vertical disclosure requirement ([`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance)) not yet cleared |
| `partnership-event` | $0 | $0 | $0 | Tier-3; regulated vertical → compliance review precondition |
| `tools` | — | — | $20.00 | Tier-3 |
| **Cell total** | **$2.00** | **$12.00** | **$65.00** | |

### 3.4 `cypher-practitioner` (state: ⏳ queued)

Caps reserved but **no spend authorised** until the cell promotes to `discovery`. Any spend attempt routes to Tier 3 with rationale "cell not promoted." Reserved envelope (same shape as `cypher-seeker`):

| Channel | Daily | Weekly | Monthly |
|---|---:|---:|---:|
| `llm` | TBD ($2.00 placeholder) | TBD ($12.00) | TBD ($45.00) |
| Others | $0 | $0 | $0 |

### 3.5 `xicocity-creator` (state: 🟡 `discovery`)

| Channel | Daily | Weekly | Monthly | Hard-cap behavior |
|---|---:|---:|---:|---|
| `llm` | $2.50 | $15.00 | $55.00 | Pause; Tier-3 |
| `paid-ads` | $0 | $0 | $0 | Readiness gate not met |
| `partnership-event` | $0 | $0 | $0 | Tier-3 |
| `tools` | — | — | $20.00 | Tier-3 |
| **Cell total** | **$2.50** | **$15.00** | **$75.00** | |

### 3.6 `factory-internal` (state: 🟡 `discovery`, internal-only)

| Channel | Daily | Weekly | Monthly | Hard-cap behavior |
|---|---:|---:|---:|---|
| `llm` | $1.50 | $8.00 | $30.00 | Pause internal docs/dev-rel generation; Tier-3 |
| `paid-ads` | $0 | $0 | $0 | Org policy: Factory is not externally marketed in 2026 ([`ICP_MATRIX.md`](./ICP_MATRIX.md)) |
| `partnership-event` | $0 | $0 | $0 | Tier-3 |
| `tools` | — | — | $10.00 | Tier-3 |
| **Cell total** | **$1.50** | **$8.00** | **$40.00** | |

### 3.7 Cap summary (filled cells, 2026-05-18)

| Cell | Daily | Weekly | Monthly |
|---|---:|---:|---:|
| `selfprime-practitioner` | $4.00 | $25.00 | $140.00 |
| `selfprime-consumer` | $3.00 | $18.00 | $100.00 |
| `cypher-seeker` | $2.00 | $12.00 | $65.00 |
| `xicocity-creator` | $2.50 | $15.00 | $75.00 |
| `factory-internal` | $1.50 | $8.00 | $40.00 |
| **Sum of cells** | **$13.00** | **$78.00** | **$420.00** |

`cypher-practitioner` is queued; its envelope is reserved (not summed) until promoted.

---

## 4. Portfolio cap

| Window | Cap | Notes |
|---|---:|---|
| Daily | $15.00 | Exceeds sum-of-cells by $2 for transient bursts; never exceeds the org LLM cap |
| Weekly | $90.00 | |
| Monthly | $500.00 | Exceeds sum-of-cells by $80 to absorb portfolio-level tools (cross-cell analytics, monitoring) |

Portfolio total includes every cell *plus* portfolio-level tools that don't attribute to a single cell (e.g. PostHog seat cost shared across cells, monitoring add-ons). Portfolio-level tool spend is itself capped at `$80 / month`.

Once `paid-ads` opens for any cell (readiness gate `paid_active`), the operator must amend this doc via ADR with the new portfolio cap *before* the cell can spend. The supervisor refuses paid-ads spend against a portfolio cap of $0 — there is no implicit allocation.

---

## 5. Overflow rules

For each window (daily/weekly/monthly), at each layer (channel/cell/portfolio):

| Utilisation | System behavior | Operator behavior |
|---|---|---|
| 0–79% | Normal. No notification. | None expected. |
| 80% | Pushover FYI (Tier 2 priority 0): "cell X at 80% of {window} cap." Auto-proceed for in-flight actions; new actions evaluated normally. | None required. |
| 90% | Pushover FYI repeat + log to weekly retro. Supervisor switches the cell to *defensive mode*: new Tier-1 actions still publish; new Tier-2 actions require operator approval (escalated to Tier 3) for the rest of the window. | Optional: ack via single-click pause link if defensive mode should hold past the window. |
| 100% | **Hard cap.** Refuse spend. Open Tier-3 GitHub Issue tagged `tripwire/budget-cap` per [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) §6. In-flight rendered artefacts queue but do not publish if publishing would incur further spend. Transactional + Tier-1 cached-only operations continue. | `/approve` to lift cap for the remainder of the window (records as a documented overspend) OR `/reject` to hold the cap. |

The 80% / 90% thresholds use the *highest* utilisation across applicable windows. Example: a cell at 92% of the weekly cap but 35% of the monthly cap is treated as 92%.

---

## 6. Free-tier abuse protection

Per [`CONSTITUTION.md §3`](./CONSTITUTION.md#3-budget-caps) final bullet: *"Free-tier abuse counts: rate-limit any growth hook (embed widget, free chart, referral signup) such that an attacker can't drain LLM budget through it."*

| Hook | Rate limit | LLM cost per call (target) | Daily cap per IP | Daily cap global | Behavior on breach |
|---|---|---|---:|---:|---|
| Embed widget — chart calc ([PR 3i](./pr3-briefs/3i-embed-worker.md)) | 6 / min / IP, 60 / hour / IP | $0 (precomputed; no LLM call) | 200 calls | 50,000 calls | 429 with `Retry-After`; metric `embed.rate_limited` |
| Free chart endpoint (anonymous) | 3 / min / IP, 20 / hour / IP | ≤ $0.01 (cached for 24h on inputs hash) | 50 calls | 5,000 calls | 429 + soft-pause LLM tier for the cell; Tier-2 FYI if global cap hits |
| Referral signup ([PR 3j](./pr3-briefs/3j-referrals.md)) | 5 / hour / IP, 25 / day / IP, 1 / email | $0 directly; subsequent verification email = transactional | 25 signups | 1,000 signups | 429 + reject; spike triggers Tier-3 issue `tripwire/referral-abuse` |
| LLM-rank tracker external pings ([PR 3l](./pr3-briefs/3l-llm-rank.md)) | scheduler-only; no external trigger | budgeted under `llm` per cell | — | — | If externally pingable surface appears in code review, fail review |

Rate limits enforced via Cloudflare Workers rate-limiter bindings; the rate-limit ID registry lives in [`docs/runbooks/add-new-app.md`](../runbooks/add-new-app.md) (next free 1009 — confirm before allocating). Per-IP counters use the standard rate limiter; global counters use a Durable Object with hourly persistence to `factory_events`.

Anti-abuse heuristics layered on top: a single referral source contributing >50% of any day's signups auto-pauses the source and opens a Tier-3 issue.

---

## 7. LLM cost integration

Org-wide Anthropic spend is gated at **$50 / day** per [`GAP_REGISTER.md` G8](../GAP_REGISTER.md). Enforcement is *partial* today (visibility via `scripts/cost_digest.py` + `.github/workflows/cost-observability.yml`); blocking enforcement extends [`@lwt/llm-meter`](../../packages/llm/) and lands in G8's stage-2 milestone.

Marketing receives a **sub-allocation** of the $50/day:

| Window | Org Anthropic cap (G8) | Marketing sub-allocation | Headroom for the rest of the org |
|---|---:|---:|---:|
| Daily | $50.00 | $13.00 (sum of cells §3.7) | $37.00 |
| Monthly | ~$1,500 (proxy: 30 × $50) | $420.00 (sum of cells §3.7) + portfolio-level tools | balance |

When marketing approaches its sub-allocation, it does *not* eat into the rest of the org's headroom — the marketing-sub-cap is a hard cap independent of the org-wide cap. Conversely, if the org-wide cap fires first, marketing is paused along with everything else even if its sub-cap has headroom.

Cost attribution: every LLM call from marketing-tagged code paths attaches `tags: ['marketing', 'cell:{slug}', 'voice:{key}']` to the request — these tags drive the cost-digest roll-up and the cap counters.

---

## 8. Cost reporting

Spend rolls up to [`docs/cost/summary.md`](../cost/summary.md) (already auto-generated by [`scripts/cost_digest.py`](../../scripts/cost_digest.py); current rolling-30-day Anthropic total: $377.18 as of 2026-05-17). The digest will be extended (separate PR, tracked under G8) to:

- Add a `## Marketing — by cell` section summing tagged spend per cell against the caps in §3.
- Add a `## Marketing — overflow events` section listing days where any layer hit 80% / 90% / 100%.
- Emit `marketing.cost.rollup` event into `factory_events` once per digest run for trend analysis.

Existing digest sections (`## Provider totals (window)`, `## Daily totals`) are unchanged. No new tooling; same `cost_digest.py` machinery.

Operator-facing surface: the Pushover daily 06:00 digest already includes a one-line cost summary; this doc adds `marketing/{daily_total}/{cell_total_at_max}` to that line.

---

## 9. Amendment process

Caps are amended via ADR in [`docs/decisions/`](../decisions/) per [`CONSTITUTION.md §11`](./CONSTITUTION.md#11-amendment-process). Each cap-change ADR must:

- State the cell / channel / window being changed and the before/after numbers.
- Cite the cohort-data evidence (≥3 months retention data for `paid-ads` openings; readiness gate verification reference).
- Declare the rollback path (e.g. "revert to v1 cap if 30-day CAC > $X").
- Reference the supervisor Worker version that will pick up the new caps and the deployment timing.

**Tightening** (lowering a cap) ships same-day. **Loosening** (raising a cap, opening a new paid-channel allocation, raising portfolio cap) requires ≥1 week of operator-only review per [`CONSTITUTION.md §11`](./CONSTITUTION.md#11-amendment-process). Emergency tightening (e.g. mid-incident) bypasses the review and is recorded as a post-hoc ADR within 24h.

The cap values in §3, §4, and §6 are versioned with this doc — the version-history table is the audit trail. Each row in §3 also carries an implicit "amended-by-ADR" stamp once it changes; the ADR reference goes in the version-history row.

---

## 10. Cross-references

| Doc / code | Why |
|---|---|
| [`CONSTITUTION.md §3`](./CONSTITUTION.md#3-budget-caps) | The rule this doc operationalises |
| [`CONSTITUTION.md §5`](./CONSTITUTION.md#5-channel-allowlist--readiness-gates) | Readiness gates that hold `paid-ads` at $0 |
| [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) | Tier-3 behavior on cap breach |
| [`ICP_MATRIX.md`](./ICP_MATRIX.md) | Cell readiness states |
| [`VOICES.md`](./VOICES.md) | Cell keys consistent with this doc |
| [`MARKETING_PLAN.md §8`](./MARKETING_PLAN.md#8-who-owns-what) | "Budget enforcement" ownership |
| [`docs/GAP_REGISTER.md` G8](../GAP_REGISTER.md) | Org-wide Anthropic $50/day cap |
| [`docs/STACK.md`](../STACK.md) | LLM chain (Anthropic → Grok → Groq) for cost attribution |
| [`docs/cost/summary.md`](../cost/summary.md) | Roll-up surface (auto-generated) |
| [`scripts/cost_digest.py`](../../scripts/cost_digest.py) | Roll-up generator |
| [`docs/SLO.md`](../SLO.md) and [`docs/runbooks/slo.md`](../runbooks/slo.md) | Error-budget framing — cap breaches consume budget |
| [`docs/MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md) | Alert triggers feed conversion tripwire that interacts with caps |
| [`packages/llm/`](../../packages/llm/) | `@lwt/llm-meter` cost accounting; G8 enforcement extension lands here |
| [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts) | `marketing.tier1.cost_recorded`, `marketing.cost.rollup` event shapes |
| [`pr3-briefs/3e-supervisor-worker.md`](./pr3-briefs/3e-supervisor-worker.md) | Where cap-check logic lives |
| [`pr3-briefs/3i-embed-worker.md`](./pr3-briefs/3i-embed-worker.md) | Embed widget abuse surface |
| [`pr3-briefs/3j-referrals.md`](./pr3-briefs/3j-referrals.md) | Referral abuse surface |
| [`docs/runbooks/add-new-app.md`](../runbooks/add-new-app.md) | Rate-limiter ID registry |

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — three-layer enforcement, per-cell cap table, portfolio cap, overflow + abuse rules, LLM sub-allocation under G8 |
