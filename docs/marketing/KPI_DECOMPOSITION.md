# KPI Decomposition

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Owner:** @adrper79-dot

> The north star is *one* number: **active paying subscribers retained ≥30 days**. This doc decomposes it into the cell-level diagnostics that explain *why* the number moves. Diagnostics are reported; they are not targets. Optimizing a diagnostic without moving the north star is a policy violation per [`CONSTITUTION.md §1`](./CONSTITUTION.md#1-north-star).

---

## 1. Top-of-tree: the north star

**`active_paid_30d_retained` = COUNT(users WHERE subscription.status='active' AND days_since_first_paid ≥ 30)**

Reported daily in [`docs/STATE.md`](../STATE.md) and weekly in the Pushover digest. Decomposed by `(product, cell_key)`.

Target trajectory (illustrative — refined per cell at first quarterly gate):

| Month | Selfprime practitioner | Selfprime consumer | Cypher practitioner | Total active |
|---|---|---|---|---|
| 2026-06 | 5 (design partners) | 0 | 0 | 5 |
| 2026-07 | 12 | 50 | 0 | 62 |
| 2026-09 | 30 | 200 | 10 | 240 |
| 2026-12 | 60 | 600 | 30 | 690 |
| 2027-03 | 120 | 1500 | 80 | 1700 |

---

## 2. The decomposition tree

```
active_paid_30d_retained (north star)
│
├── new_paid_30d (new paid subs converted in the last 30 days)
│   ├── leads_30d (Cold → MQL transitions)
│   │   ├── visitors_30d (page views) by channel
│   │   │   ├── owned channel volume
│   │   │   ├── earned channel volume
│   │   │   └── paid channel volume
│   │   └── visitor → MQL conversion rate
│   ├── MQL → trial conversion rate
│   └── trial → paid conversion rate (D30)
│
└── retained_existing (paid subs from prior periods still active)
    ├── total_paid_existing
    └── 30d_retention_rate
        ├── product engagement frequency
        ├── support friction (Sentry user-facing error rate)
        └── pricing-tier match (downgrade vs cancel)
```

Each leaf is queryable from PostHog + `factory_events` (per [`LIFECYCLE.md §5`](./LIFECYCLE.md)).

---

## 3. Per-cell diagnostics

Every filled matrix cell reports the same 12 diagnostics on the daily dashboard. Numbers without context are noise; the table specifies the *baseline* and *red-flag thresholds* per cell.

### Diagnostic table template

| Diagnostic | What it measures | Baseline source | Red-flag threshold |
|---|---|---|---|
| `daily_visitors` | Page views landing on cell-tagged pages | Rolling 30d median | ↓ >50% WoW |
| `mql_conversion_rate` | Visitor → MQL on cell pages | Rolling 30d median | ↓ >30% WoW |
| `trial_conversion_rate` | MQL → trial in 7d window | Rolling 30d median | ↓ >25% WoW |
| `paid_conversion_rate` | Trial → paid in 30d window | Rolling 30d median | ↓ >20% WoW |
| `d30_retention_rate` | % paid still active at 30d | Cohort | ↓ >10pts WoW |
| `arpu` | Avg revenue per active user (cents) | Stripe rollup | ↓ >5% WoW |
| `churn_rate_30d` | (canceled + lapsed)/(active start period) | Cohort | ↑ >50% WoW |
| `cac_blended` | Acquisition spend ÷ new paid subs | Per-channel rollup | ↑ >50% over LTV/CAC target |
| `time_to_first_paid_event` | Cold → paid latency, median | Cohort | ↑ >50% WoW |
| `support_ticket_rate` | Tickets per active subscriber | Operator log + Sentry | ↑ >50% WoW |
| `voice_gate_block_rate` | % of generated artefacts blocked at brand-voice gate | [`@lwt/validation`](../../packages/validation/) | ↑ >5% absolute (CONSTITUTION §7) |
| `nps_or_satisfaction_proxy` | Email reply sentiment + retention proxy | Reply-NPS computation | ↓ >20pts WoW (CONSTITUTION §7) |

### Per-cell baselines (initial)

⏳ Numbers populated after first 30 days of cell activity. Initial table shipped with PR 2; baselines updated by the supervisor loop weekly. Template:

```yaml
# docs/marketing/baselines/{cell-key}.yaml
cell_key: selfprime:practitioner
last_updated: 2026-05-18
baselines:
  daily_visitors:
    p50: TBD
    p90: TBD
  mql_conversion_rate:
    p50: TBD
  # ... 12 entries
```

---

## 4. Cross-cell metrics (portfolio-level)

These aren't per-cell; they roll up across cells.

| Metric | Definition | Why portfolio-level |
|---|---|---|
| `portfolio_north_star` | SUM of `active_paid_30d_retained` across all cells | The number |
| `portfolio_paid_spend` | SUM of paid channel spend across all cells | Budget cap enforcement |
| `portfolio_llm_spend` | SUM of LLM cost attributed to marketing across all cells | Per [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) sub-cap allocation |
| `portfolio_voice_gate_block_rate` | Voice gate block rate across all generated content | Tripwire per [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires) |
| `flywheel_efficiency` | Practitioner-cell signups → consumer-cell signups (via shareables) | Quantifies the cross-cell flywheel per [`ICP_MATRIX.md` Cross-product flywheel](./ICP_MATRIX.md#cross-product-flywheel) |
| `escalation_volume_24h` | Tier-2 + Tier-3 escalations in trailing 24h | Operator load proxy |

---

## 5. What we deliberately don't track as a primary metric

To prevent the autonomous system from gaming its own measurement:

| Anti-metric | Why excluded |
|---|---|
| Signups (raw) | Gameable with bad-quality traffic |
| Trial starts (raw) | Same |
| Open rate / click rate | Email providers and bots inflate; better signals exist |
| Vanity reach (impressions, follower count) | Decorrelated from paid retention; observed as diagnostic only |
| MRR | Derivative of paid users × ARPU; tracked as derived not target |
| Reactivation rate | Tracked as diagnostic; not a target (creates incentive to over-engineer winback at the cost of acquisition) |

These are observed and logged; they are *not* on any agent's optimization objective.

---

## 6. Reporting cadence

| Window | Where | Audience | Detail level |
|---|---|---|---|
| Real-time | PostHog dashboards | Supervisor loop, on-call | All 12 diagnostics live per cell |
| Daily 06:00 | Pushover digest | Operator | North-star + top 3 escalations only |
| Daily | [`docs/STATE.md`](../STATE.md) | Anyone | North star + per-cell summary line |
| Weekly | Mon digest | Operator + agents | Full diagnostic table per cell + WoW deltas |
| Monthly | First-Mon retro | Operator | Trend analysis + decision points |
| Quarterly | Customer gate | Operator | Cell-level graduate/sunset decisions |

---

## 7. Diagnostic agent

Per the supervisor loop ([`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md)), the `DiagnosticAgent` is responsible for:

1. Running the 12 diagnostic queries per cell daily
2. Comparing against baselines + red-flag thresholds
3. Surfacing anomalies to the escalation queue per [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md)
4. Auto-updating baselines weekly (rolling 30d median)
5. Generating the weekly retro doc at `playbooks/retros/{date}.md`

Implementation in PR 3e (supervisor Worker).

---

## 8. Decomposition queries (reference)

For implementation in PR 3e — SQL templates against `factory_events`:

```sql
-- north star
SELECT COUNT(DISTINCT user_id)
FROM factory_events
WHERE event = 'subscription_renewed'
  AND occurred_at >= NOW() - INTERVAL '30 days'
  AND properties->>'cell_key' = $1;

-- d30 retention by cohort
SELECT
  date_trunc('week', first_paid.occurred_at) AS cohort_week,
  COUNT(DISTINCT first_paid.user_id) AS cohort_size,
  COUNT(DISTINCT CASE
    WHEN active.user_id IS NOT NULL
    THEN first_paid.user_id END) AS active_at_30d
FROM factory_events first_paid
LEFT JOIN factory_events active ON active.user_id = first_paid.user_id
  AND active.event IN ('subscription_renewed', 'product_engaged')
  AND active.occurred_at BETWEEN first_paid.occurred_at + INTERVAL '28 days'
                              AND first_paid.occurred_at + INTERVAL '32 days'
WHERE first_paid.event = 'subscription_created'
  AND first_paid.properties->>'cell_key' = $1
GROUP BY 1
ORDER BY 1 DESC;
```

Full query bank in [`docs/marketing/queries/`](./queries/) per PR 3e.

---

## 9. Cross-references

- [`MARKETING_PLAN.md §1`](./MARKETING_PLAN.md#1-north-star) — north star definition
- [`CONSTITUTION.md §1`](./CONSTITUTION.md#1-north-star) — north-star immutability rule
- [`LIFECYCLE.md`](./LIFECYCLE.md) — funnel definitions that produce these metrics
- [`ATTRIBUTION.md`](./ATTRIBUTION.md) — attribution model that decorates the metrics
- [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) — DiagnosticAgent owner
- [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) — caps enforced against `portfolio_*` metrics
- [`docs/STATE.md`](../STATE.md) — daily portfolio surface
- [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts) — event substrate

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — north-star decomposition tree; 12 per-cell diagnostics with baselines + red-flag thresholds; cross-cell rollups; anti-metrics list; SQL query templates |
