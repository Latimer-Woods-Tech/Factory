# Attribution

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Owner:** @adrper79-dot · **ADR:** [`docs/decisions/2026-05-18-attribution-model.md`](../decisions/2026-05-18-attribution-model.md)

> The model for answering "where did this customer come from?" — UTM capture conventions, touch-stamping rules, source dedup, model selection per question. Implemented in [`@lwt/attribution`](../../packages/attribution/) (per [PR 3k brief](./pr3-briefs/3k-attribution.md)).

---

## 1. The decision

Two attribution models run side-by-side, used for different questions:

| Model | Used for | Calculation |
|---|---|---|
| **Last non-direct touch** | Operational reporting — "which channel produced this paying customer?" | The most recent non-direct (non-`direct`/`unknown`) source touch before `subscription_created` |
| **First touch** | ICP-fit analysis — "which channel found the right kind of customer?" | The earliest source touch in the user's full event history |

Multi-touch (Markov decay, time-decay, U-shape) is **Phase 2** — deferred until ≥6 months of touch data exists for a cell. Premature multi-touch attribution is mostly noise.

**Why both, not one:**
- Last-touch alone underweights top-of-funnel channels (SEO, YouTube)
- First-touch alone underweights closing channels (email lifecycle, retargeting)
- Reporting both keeps blame and credit honest

---

## 2. UTM capture

Every inbound URL the supervisor publishes gets UTM params. Standardized format:

| Param | Required? | Convention | Example |
|---|---|---|---|
| `utm_source` | ✅ | Lowercase platform slug from the deduped registry (§3 below) | `linkedin`, `x`, `astrology_podcast`, `email_practitioner_welcome_v1` |
| `utm_medium` | ✅ | One of: `social`, `email`, `podcast`, `display`, `cpc`, `partnership`, `referral`, `organic` | `social` |
| `utm_campaign` | ✅ | `campaign_id` from [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) | `2026-Q3-practitioner-design-partners` |
| `utm_content` | ✅ | Cell key (matrix routing) | `selfprime-practitioner` (URL-safe form per [`MARKETING_SUPERVISOR.md` cross-doc decision](./MARKETING_SUPERVISOR.md)) |
| `utm_term` | optional | Sub-segment or A/B arm | `arm_a`, `subseg_pure_astro` |

**Capture mechanism:**
- Frontend middleware reads UTM on first session event; persists to localStorage as `lwt_first_touch`
- All subsequent events in the session stamp the touch as `lwt_last_touch`
- Backend webhook handlers (Stripe, Resend, etc.) read both from session metadata

Implementation in [`@lwt/attribution`](../../packages/attribution/) per PR 3k. Schema added to [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts) per PR 3b.

---

## 3. Source dedup registry

Same source arrives under many names. The system normalizes via a host map.

| Canonical source | Hosts / aliases | utm_source values that map here |
|---|---|---|
| `x` | `twitter.com`, `t.co`, `x.com`, `mobile.twitter.com` | `twitter`, `x` |
| `linkedin` | `linkedin.com`, `lnkd.in`, `lnkdin.com` | `linkedin`, `li` |
| `youtube` | `youtube.com`, `youtu.be`, `m.youtube.com`, `music.youtube.com` | `youtube`, `yt`, `youtubeshorts` |
| `tiktok` | `tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com` | `tiktok`, `tt` |
| `instagram` | `instagram.com`, `instagr.am` | `instagram`, `ig` |
| `reddit` | `reddit.com`, `redd.it`, `old.reddit.com` | `reddit` |
| `substack` | `*.substack.com`, `substackcdn.com` | `substack` |
| `astrology_podcast` | `theastrologypodcast.com`, episode-specific subdomain | `astrology_podcast` |
| `astrology_hub` | `astrologyhub.com` | `astrology_hub` |
| `email_*` | (no host; email-specific) | Any `utm_source` starting `email_` |
| `direct` | No referrer header, no UTM | `direct` |
| `organic_search` | Search engine refs (`google.com/search`, `bing.com/search`, etc.) | `google_organic`, `bing_organic` |
| `paid_search` | Search engines + ad metadata | `google_cpc`, `bing_cpc` |

Full host map in [`packages/attribution/src/source-map.ts`](../../packages/attribution/src/) per PR 3k. The map is *additive* — when an unknown host produces ≥10 visits in 7 days, the supervisor opens a draft PR proposing classification.

---

## 4. Touch stamping rules

Stored on `crm_leads`:

```sql
ALTER TABLE crm_leads ADD COLUMN first_touch_source TEXT;
ALTER TABLE crm_leads ADD COLUMN first_touch_campaign TEXT;
ALTER TABLE crm_leads ADD COLUMN first_touch_at TIMESTAMPTZ;
ALTER TABLE crm_leads ADD COLUMN last_touch_source TEXT;
ALTER TABLE crm_leads ADD COLUMN last_touch_campaign TEXT;
ALTER TABLE crm_leads ADD COLUMN last_touch_at TIMESTAMPTZ;
ALTER TABLE crm_leads ADD COLUMN touch_history JSONB DEFAULT '[]';
```

- `first_touch_*` is set ONCE — on the user's first identifiable event. Never overwritten.
- `last_touch_*` updates on every event where the source is not `direct`. Direct touches don't displace a known source — that's the whole point of "last non-direct."
- `touch_history` is an array of `{source, campaign, at}` rows; capped at 50 entries; used for first/last verification + future multi-touch model.

DDL migration in [PR 3b — ICP dimension](./pr3-briefs/3b-icp-dimension.md) (paired with ICP dimension since both extend `crm_leads`).

---

## 5. Attribution queries

Reference for [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) implementations.

```sql
-- Last non-direct attribution for paid conversions in a window
SELECT
  l.last_touch_source AS source,
  l.last_touch_campaign AS campaign,
  COUNT(*) AS paid_conversions,
  SUM(l.mrr) AS mrr_attributed
FROM crm_leads l
WHERE l.status = 'active'
  AND l.converted_at BETWEEN $1 AND $2
  AND l.app_id = $3
GROUP BY 1, 2
ORDER BY mrr_attributed DESC;

-- First-touch attribution for ICP-fit (D30 retention by first source)
SELECT
  l.first_touch_source AS source,
  COUNT(*) AS cohort_size,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM factory_events e
      WHERE e.user_id = l.user_id
        AND e.event IN ('subscription_renewed', 'product_engaged')
        AND e.occurred_at BETWEEN l.converted_at + INTERVAL '28 days'
                                AND l.converted_at + INTERVAL '32 days'
    )
  ) AS retained_at_d30,
  ROUND(100.0 *
    COUNT(*) FILTER (... above ...) / NULLIF(COUNT(*), 0),
    1
  ) AS d30_retention_pct
FROM crm_leads l
WHERE l.status = 'active'
  AND l.first_touch_at BETWEEN $1 AND $2
GROUP BY 1
ORDER BY d30_retention_pct DESC;
```

---

## 6. Edge cases (handled in spec)

| Case | Handling |
|---|---|
| User clears cookies / localStorage | Server-side `crm_leads` row preserves touches; client-side capture re-stamps as `direct` for new session, but `crm_leads.first_touch_*` is immutable so cohort assignment is preserved |
| Multiple devices, same user | On `user_id` resolution, server-side merge — earliest non-direct first_touch wins; full `touch_history` is union |
| Email open with stripped UTMs | Email opens get `utm_source=email_*` from the link itself, not the page; emails always carry source in URL |
| Referrer spoofing | Trust source only when UTM is present; bare-referrer is downgraded to host-class-only (`linkedin` not `linkedin/campaign_X`) |
| Cross-product attribution | A `crm_leads` row is `(user_id, app_id)` unique; cross-product touches are joined on `user_id` for flywheel analysis but not collapsed |
| Bot traffic | Bot filter applied before stamping (`user_agent` deny list); flag `bot=true` in `factory_events` and exclude from rollups |
| Pre-launch backfill | Pre-2026-05-18 data is **not** retroactively attributed — explicitly out of scope per ADR |

---

## 7. Per-cell channel allocation reporting

The attribution surface produces a per-cell × channel monthly view:

```
| cell                       | source            | new_paid | d30_retention | cac     | ltv_cac_ratio |
|----------------------------|-------------------|----------|---------------|---------|---------------|
| selfprime:practitioner     | astrology_podcast | 8        | 92%           | $0      | ∞ (earned)    |
| selfprime:practitioner     | linkedin          | 12       | 87%           | $0      | ∞             |
| selfprime:practitioner     | email_*           | 5        | 95%           | $0      | ∞             |
| selfprime:consumer         | tiktok            | 47       | 38%           | $0      | ∞             |
| selfprime:consumer         | direct            | 22       | 41%           | $0      | ∞             |
```

This drives the per-cell channel state advancement (`earned_active` → `paid_ready` per [`CHANNEL_DOCTRINE.md §5`](./CHANNEL_DOCTRINE.md#5-readiness-gate-progression-constitution-5-operationalized)) and feeds [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) reweighting decisions.

---

## 8. Privacy + compliance

- All UTM data is non-PII; safe for PostHog
- `touch_history` stays in `factory_events` / `crm_leads` only (per [`packages/analytics/src/index.ts`](../../packages/analytics/src/index.ts) firewall)
- `do_not_contact` consent rows in `outreach_contacts` have `touch_history` zeroed on the next supervisor tick
- Cross-region: `first_touch_at` is stored UTC; cohorts are computed in operator local timezone (US Eastern by default)

---

## 9. Cross-references

- [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) — `campaign_id` convention
- [`LIFECYCLE.md`](./LIFECYCLE.md) — funnel stages this attribution decorates
- [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) — uses these queries
- [`CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md) — channel state machine that consumes attribution
- [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) — `crm_leads` table (gains attribution columns in PR 3b)
- [`packages/analytics/`](../../packages/analytics/) — PostHog firewall
- [PR 3k — attribution](./pr3-briefs/3k-attribution.md) — implementation brief
- [ADR 2026-05-18 — attribution model](../decisions/2026-05-18-attribution-model.md)

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — dual-model attribution (last non-direct + first touch); source dedup; touch stamping; edge cases; multi-touch deferred |
