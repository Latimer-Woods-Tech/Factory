# Scenario 03 — Cross-Product Flywheel: Practitioner → Client → Consumer → Referral

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative trace · **Owner:** @adrper79-dot

> A 90-day walk through the prosumer flywheel claim in [`icp/selfprime.md`](../icp/selfprime.md): one paying practitioner publishes a shareable, the recipient forwards it, a new consumer signs up, the consumer refers a friend. Traces every event through [`ATTRIBUTION.md`](../ATTRIBUTION.md), [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md), [`LIFECYCLE.md`](../LIFECYCLE.md), [`CHANNEL_DOCTRINE.md`](../CHANNEL_DOCTRINE.md), and [`CONSTITUTION.md`](../CONSTITUTION.md) — and surfaces every place the current specs disagree, leak, or hand-wave.

> Companion scenarios: `01-practitioner-cold-outreach.md` (forthcoming), `02-consumer-paid-acquisition.md` (forthcoming).

---

## Setup

**Cast:**

| Person | Role at scenario start | Final cell |
|---|---|---|
| **Sarah** | Paying Selfprime practitioner since day 31 (`crm_leads.user_id=sarah_uid`, `plan=practitioner`, `mrr=99`) | `selfprime:practitioner` |
| **Maria** | Sarah's client; **anonymous to Selfprime** — exists only as `published_readings.client_display='Maria L.'` per consent | none |
| **Tomás** | Will become paying consumer day 74 | `selfprime:consumer` |
| **Lucia** | Tomás's sister, referred day 90 | `selfprime:consumer` |

**Pre-state (day 60, 00:00 UTC):**

```sql
-- crm_leads
SELECT user_id, app_id, first_touch_source, first_touch_campaign, mrr
FROM crm_leads;
-- → ('sarah_uid', 'selfprime', 'linkedin', '2026-q3-practitioner-design-partners', 99)

-- published_readings  -- none yet
-- factory_events for tomas_distinct_id / lucia_distinct_id  -- none
```

**The link chain:** Sarah → publish → Maria → forward → Tomás → consumer signup → refer → Lucia.

---

## Timeline

### Day 60 — Sarah publishes a public reading for Maria

Sarah clicks "publish to library" inside the practitioner app. Maria checked the consent box at her session three weeks earlier (consent record lives on the reading, not the client).

```sql
INSERT INTO published_readings
  (id, slug, practitioner_user_id, client_display, body_md, consent_obtained, consent_record_id, published_at)
VALUES
  ('rd_abc123', 'abc-123-def-456', 'sarah_uid', 'Maria L.',
   '<reading body>', true, 'consent_xyz789', NOW());
```

Publish emits a `reading_published` event:

```json
{
  "event": "reading_published",
  "user_id": "sarah_uid",
  "properties": {
    "product": "selfprime", "icp": "practitioner",
    "channel": "owned_library", "surface": "selfprime.net/r/{slug}",
    "campaign_id": "2026-q3-practitioner-design-partners",
    "reading_id": "rd_abc123",
    "client_consent_record_id": "consent_xyz789"
  }
}
```

- **Identity:** Sarah is `sarah_uid` (known user).
- **Touch stamping:** none — Sarah's `crm_leads.first_touch_*` already set (day 31).
- **Lifecycle:** Sarah was already at stage 5 (Retained). `referral_invited` is NOT fired (publishing is not a referral). Per [LIFECYCLE.md §2](../LIFECYCLE.md#2-event-to-stage-transition-rules) the advocate transition (5→6) needs `referral_invited`. ⚠️ **Gap:** a practitioner publishing public-library content is arguably advocacy. The current event taxonomy doesn't capture it. See *Integration gap #6*.
- **Voice gate:** the reading body is practitioner-authored (with LLM assist) but the *render template* — including the discreet "powered by Selfprime" footer — is voice-gated as `prime_self:practitioner`. Pass.
- **Budget:** ~1 Anthropic call for reading-draft assist (already counted at draft time, not publish time).
- **Operator visibility:** daily digest, "design partner output."

### Day 60 (later) — SEO crawler hits the public URL

Googlebot/Bingbot/Perplexity-bot fetch the URL. Per the bot filter ([ATTRIBUTION.md §6](../ATTRIBUTION.md#6-edge-cases-handled-in-spec)), `factory_events` row gets `bot=true` and is excluded from rollups. No touch stamping.

### Day 62 — Maria opens the link

Maria opens the email from Sarah in Gmail. Browser fetch with `Referer: https://mail.google.com/`.

- **Identity:** Maria is **not a Selfprime user**. A `distinct_id=maria_anon_xxx` is generated client-side.
- **First-touch stamping:** none server-side; **no `crm_leads` row** for a public-reading viewer (per [`packages/crm/`](../../../packages/crm/src/index.ts) — leads come from explicit signal, not page views). PostHog gets the page view only.
- **Voice gate:** the public reading renders in `prime_self:consumer` per [CHANNEL_DOCTRINE §4](../CHANNEL_DOCTRINE.md#4-channel-surface-conventions); Sarah's branding overlays as header.
- **Lifecycle:** Maria stays at stage 0 (Unknown) — she never identifies.

### Day 62 — Maria forwards via WhatsApp

WhatsApp strips `Referer`; only the URL + UTM tail survive (`utm_source=shareable&utm_campaign=2026-q3-practitioner-design-partners&utm_content=practitioner&utm_term=client_share`).

⚠️ **Integration gap #4:** [ATTRIBUTION.md §6](../ATTRIBUTION.md#6-edge-cases-handled-in-spec) discusses "Email open with stripped UTMs" but says nothing about messenger forwards. WhatsApp forwarding is the dominant viral path for client-to-friend on this product; the spec assumes referrer is more reliable than it is. Add a §6 row: "Messenger forward — `referrer` null; trust UTM at face value."

### Day 63 — Tomás clicks the WhatsApp link

Tomás taps the link on mobile Safari. First identifiable event for Tomás:

```json
{
  "event": "$pageview",
  "distinct_id": "tomas_distinct_xxx",
  "user_id": null,
  "properties": {
    "$current_url": "https://selfprime.net/r/sarah-astrology/abc-123-def-456?utm_source=shareable&utm_campaign=2026-q3-practitioner-design-partners&utm_content=practitioner&utm_term=client_share",
    "$referrer": null,
    "utm_source": "shareable",
    "utm_medium": null,
    "utm_campaign": "2026-q3-practitioner-design-partners",
    "utm_content": "practitioner",
    "utm_term": "client_share",
    "product": "selfprime", "icp": "consumer",
    "channel": "shareable", "surface": "selfprime.net/r/{slug}",
    "bot": false
  }
}
```

- **Identity:** Tomás is anonymous; `distinct_id` is client-generated.
- **First-touch stamping:** the frontend middleware writes `lwt_first_touch` to localStorage. **But no `crm_leads` row exists yet** (no `user_id`). The first-touch will be **promoted to `crm_leads.first_touch_*`** at the moment of signup (day 74). Until then, the touch lives only in localStorage + `factory_events`.

⚠️ **Integration gap #1 (the big one):** `utm_content=practitioner` is on the shareable URL because that's Sarah's cell campaign. But Tomás is a consumer. Two possible policies:
- **(a) UTM as-recorded:** `first_touch_campaign='2026-q3-practitioner-design-partners'`, `first_touch_content='practitioner'`. Tomás's $9/mo gets attributed to the **practitioner cell campaign**, polluting practitioner-cell CAC and LTV math.
- **(b) Inferred-icp rewrite:** the surface registry knows `selfprime.net/r/*` is bi-cell ([CHANNEL_DOCTRINE §4](../CHANNEL_DOCTRINE.md#4-channel-surface-conventions)). The middleware should rewrite `utm_content` to the *recipient* cell (`consumer`) while preserving `utm_campaign` (so practitioner gets flywheel credit) and stamping `acquisition_via='shareable_from_practitioner'`.

**Current spec is ambiguous.** [ATTRIBUTION.md §2](../ATTRIBUTION.md#2-utm-capture) and [CAMPAIGN_TAGGING.md §3](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives) both treat UTM as immutable on capture. [LIFECYCLE.md §5](../LIFECYCLE.md#5-cohort-dimensions) defines `cell_key` per event but doesn't say how it's derived when UTM disagrees with the recipient's eventual cell. **Recommendation:** policy (b), explicit rewrite, with both raw and derived fields preserved. Open an ADR.

- **Voice gate:** rendered in `prime_self:consumer` (the visitor-side voice for the bi-modal surface).
- **Lifecycle:** Tomás enters stage 0 (Unknown).
- **Budget:** zero LLM (cached render).
- **Operator visibility:** none yet (volume too low for digest).

### Day 63 — Tomás clicks "get your own chart →"

CTA routes him to the bi-modal landing fork:

```
selfprime.net/?utm_source=shareable
  &utm_campaign=2026-q3-practitioner-design-partners
  &utm_content=consumer
  &utm_term=embed_referral
```

⚠️ **Integration gap #2:** [CHANNEL_DOCTRINE §4](../CHANNEL_DOCTRINE.md#4-channel-surface-conventions) says `selfprime.net/find` is the bi-modal directory landing fork — but the *root* `selfprime.net/` is "consumer default." The CTA on the public reading correctly routes to the consumer side. **However**, the doc never specifies *what the fork forks on*. UTM hint? Geo? Device class? First-touch source? Currently each landing-page handler has to invent its own policy. Codify in CHANNEL_DOCTRINE §4.

A second `$pageview` fires. `utm_content` is now `consumer`, `utm_term` is `embed_referral`. **Last-touch updates** (still anonymous, still localStorage-only). **First-touch does not update** — the day-63 first click is sticky.

### Day 63 — Tomás does a free chart calc, no signup

`chart_calculated` event fires:

```json
{
  "event": "chart_calculated",
  "distinct_id": "tomas_distinct_xxx",
  "properties": { "cell_key": "selfprime:consumer", "free_tier": true, "campaign_id": "2026-q3-practitioner-design-partners" }
}
```

- **Lifecycle:** Per [LIFECYCLE.md §2](../LIFECYCLE.md#2-event-to-stage-transition-rules), `chart_calculated` triggers 1 → 2 (Cold → MQL) "for Selfprime cells." But Tomás is **stage 0** (no `user_id`). ⚠️ **Integration gap #7:** the stage transition rules in LIFECYCLE.md §2 read "1 → 2 if `user_id` resolves" for new-distinct-id events but apply `chart_calculated` to "stage 1 → 2" without saying what happens when the distinct_id is anonymous. Resolution: Tomás stays stage 0 in `crm_leads` (he isn't in it) but PostHog should show a 0 → 2 transition cohort entry. Spec needs an "anonymous MQL" definition.

### Day 63 → Day 67 — undecided

No further Tomás events. He's stage 0/MQL-ish, anonymous.

### Day 67 — Tomás sees a Selfprime TikTok ad ⚠️ CONSTITUTION VIOLATION

He's scrolling TikTok; a Selfprime ad plays. He doesn't tap. Ad-impression beacon fires server-side.

⚠️ **CONSTITUTION §3 + §5 violation.** Per [icp/selfprime-consumer.md §3.3](../icp/selfprime-consumer.md), consumer cell `paid_readiness_gate: NOT MET`. Per [CONSTITUTION.md §3](../CONSTITUTION.md#3-budget-caps) + [§5](../CONSTITUTION.md#5-channel-allowlist--readiness-gates), no paid spend allowed.

**How it likely fired:** legacy TikTok ad account predating CONSTITUTION, or a Phase-7 adapter turned on without reading channel state.

**Prevention gap:** the `paid_active` readiness gate is *doc-stated, not code-enforced* in [`packages/social/`](../../../packages/social/). [`docs/marketing/channel-state.yaml`](../channel-state.yaml) (per [CHANNEL_DOCTRINE §5](../CHANNEL_DOCTRINE.md#5-readiness-gate-progression-constitution-5-operationalized)) doesn't exist yet — PR 3e ships it.

**Missing tripwire:** "any paid-spend API call with `cell.readiness_state != paid_active`" → tier-3 pause. [CONSTITUTION §7](../CONSTITUTION.md#7-brand-safety-tripwires) "LLM cost spike" watches LLM spend, not ad spend. File as PR 3m extension.

**Operator response:** tier-3 escalation; pause TikTok account per [CONSTITUTION §10](../CONSTITUTION.md#10-operator-escalation-rights); ADR.

### Day 71 — Tomás receives a marketing email ⚠️ CONSTITUTION §6 VIOLATION

Subject: "Your chart is ready — see what your transits say this week." Sender: `welcome@selfprime.net`. Tomás doesn't remember signing up.

⚠️ **CONSTITUTION §6 violation:** "Outreach to a contact requires `consent_status IN ('opted_in')`. `unknown` is not a green light." Tomás did a free chart calc but never opt-ed in. He's `consent_status='unknown'` at best, or doesn't exist in `outreach_contacts` at all.

**Most likely cause:** the free chart calc handler at some point auto-inserts a row into `outreach_contacts` with `consent_status='implied'` to enable transactional + welcome sequences. **There is no `'implied'` value in the schema.** Either:
- (a) The handler is using `'opted_in'` incorrectly (treating "submitted email for chart PDF" as opt-in for marketing). This is the GDPR violation.
- (b) The email is *transactional* (the chart PDF) but uses a marketing template — a §9 honesty violation (misleading framing).
- (c) A different table (`email_drip_state`) was populated by a previous incident and not cleaned up.

**Tripwire that catches:**
- [CONSTITUTION.md §7](../CONSTITUTION.md#7-brand-safety-tripwires) "Unsubscribe spike" — fires only after damage.
- A *missing* tripwire: pre-send audit. Every send should verify `consent_status='opted_in' AND consent_record_id IS NOT NULL` and tier-3-pause on any send that fails. File as a PR 3m extension.
- The weekly audit query `SELECT count(*) FROM outreach_contacts WHERE consent_status NOT IN ('opted_in','do_not_contact')` should be a tripwire; today it isn't.

**Operator response:**
1. Pause the sequence.
2. Audit how many recipients besides Tomás got the same send (`SELECT COUNT(*) FROM email_drip_state WHERE sequence='consumer_welcome_v1' AND ...`).
3. If >0 EU residents, file an internal incident per [DSR_HANDLING.md](../DSR_HANDLING.md) regional matrix.
4. Suppress the affected list and send a regulator-compliant apology / opt-in confirmation.

### Day 74 — Tomás clicks the email, signs up

Now the system has a `user_id`.

```sql
-- pseudo, ordered
INSERT INTO crm_leads
  (user_id, app_id, status,
   first_touch_source, first_touch_campaign, first_touch_at,
   last_touch_source,  last_touch_campaign,  last_touch_at,
   touch_history, converted_at, mrr)
VALUES
  ('tomas_uid', 'selfprime', 'active',
   -- promoted from localStorage:
   'shareable', '2026-q3-practitioner-design-partners', '2026-day63T...',
   -- last non-direct before subscription_created:
   'email_consumer_welcome_v1', '2026-q3-practitioner-design-partners', '2026-day74T...',
   '[
     {"source":"shareable",      "campaign":"2026-q3-practitioner-design-partners","at":"day63"},
     {"source":"shareable",      "campaign":"2026-q3-practitioner-design-partners","at":"day63"},
     {"source":"tiktok_ad_view", "campaign":null,                                  "at":"day67"},
     {"source":"email_consumer_welcome_v1","campaign":"2026-q3-practitioner-design-partners","at":"day74"}
   ]'::jsonb,
   NOW(), 9);
```

Events fired: `signup_completed`, `subscription_created` (#4 in [MONETIZATION_FUNNEL_INSTRUMENTATION](../../MONETIZATION_FUNNEL_INSTRUMENTATION.md)).

**Attribution model outputs:**

| Question | Model | Answer |
|---|---|---|
| Which channel **found** Tomás? | First touch | `shareable` (Sarah's day-60 publish) |
| Which channel **closed** Tomás? | Last non-direct | `email_consumer_welcome_v1` (the unauthorized email) |

⚠️ **Integration gap #5 (consent vs. attribution):** The last-non-direct stamp **records the channel that closed the deal even when that channel violated consent**. This is mechanically correct (the email did close Tomás) but the rollup dashboard will show "email closed +1 paid" — making the bad behavior look successful. **Recommendation:** when a touch's source is later audit-flagged (consent violation, paid-readiness violation), the `crm_leads` row gets a `last_touch_invalid=true` flag and the touch is *not counted* in the channel-allocation report ([ATTRIBUTION.md §7](../ATTRIBUTION.md#7-per-cell-channel-allocation-reporting)). Append the §7 row with an `invalid_touch_count` column.

- **Lifecycle:** stage 3 → 4 (`subscription_created`), and per the rules, `chart_calculated` retroactively transitions to MQL the moment `user_id` resolves — so Tomás's stage history compresses to 0 → 1 → 2 → 3 → 4 in a single transaction.
- **Cell:** `selfprime:consumer` (the rewrite from gap #1 matters here — see below).
- **Budget:** 1 webhook handler call, 0 LLM.
- **Operator visibility:** appears in the day-74 supervisor digest as a "first paid from shareable" line — *this is the flywheel signal*.

### Day 90 — Tomás invites Lucia

Tomás goes to "Invite a friend, both get 30 days extra" and shares his referral link `selfprime.net/?ref=SP-XYZ123`. Lucia clicks the same day. She signs up the same day.

```sql
-- referral_codes table (per packages/referral, PR 3j)
INSERT INTO referral_codes (code, user_id, stripe_account_id, created_at)
VALUES ('SP-XYZ123', 'tomas_uid', 'acct_tomas', '2026-day90T...');

-- referral_attribution (proposed) — referrer → referee mapping
INSERT INTO referral_attribution (referrer_user_id, referee_user_id, code, claimed_at)
VALUES ('tomas_uid', 'lucia_uid', 'SP-XYZ123', NOW());
```

Lucia's `crm_leads` row:

```sql
INSERT INTO crm_leads
  (user_id, app_id, status,
   first_touch_source, first_touch_campaign, first_touch_at,
   last_touch_source,  last_touch_campaign,  last_touch_at,
   touch_history, converted_at, mrr)
VALUES
  ('lucia_uid', 'selfprime', 'active',
   'referral', 'referral_organic_2026',  -- ??? — see gap #3
   '2026-day90T...',
   'referral', 'referral_organic_2026',
   '2026-day90T...',
   '[{"source":"referral","campaign":"referral_organic_2026","ref_code":"SP-XYZ123","at":"day90"}]'::jsonb,
   NOW(), 9);
```

⚠️ **Integration gap #3 (the second-biggest):** [PR 3j brief — referrals](../pr3-briefs/3j-referrals.md) and [PR 3k brief — attribution](../pr3-briefs/3k-attribution.md) are *siblings but not co-designed*. Today there is no documented join policy:

1. Should Lucia's `first_touch_source` be `referral` (the mechanism that brought her), or should it be **whatever Lucia's session UTM said** (e.g. she happened to click from a Pinterest pin Tomás posted)?
2. Should `first_touch_campaign` be a synthetic referral-campaign id, or the original `2026-q3-practitioner-design-partners` (inheriting through Tomás)?
3. Should the system record **two touch chains** — the marketing-attribution chain (Lucia → ??? touches) and the referral-graph chain (Lucia → Tomás → Sarah-as-source-not-as-referrer)?

**Recommendation:** add a `referral_chain` JSONB column on `crm_leads`:

```sql
ALTER TABLE crm_leads ADD COLUMN referral_chain JSONB DEFAULT '[]';
-- Lucia:
-- [{"referrer_user_id":"tomas_uid","via_code":"SP-XYZ123","at":"day90"},
--  {"referrer_user_id":"sarah_uid","via":"shareable","at":"day63", "depth":2}]
```

The marketing-attribution columns stay focused on "where did the click come from"; the referral-graph column answers "who do we credit." They serve different rollups and shouldn't be collapsed. Codify in an ADR.

- **Lifecycle (Lucia):** 0 → 1 → 4 in one transaction (`signup_completed` + `subscription_created`).
- **Lifecycle (Tomás):** 4 → 6 (Advocate) via `referral_invited` per [LIFECYCLE.md §2](../LIFECYCLE.md#2-event-to-stage-transition-rules).
- **Voice gate:** the referral landing rendered in `prime_self:consumer`. Pass.
- **Budget:** the referral payout (per practitioner ICP §5 says practitioner-tier gets commission; consumer-tier referral is "30 days free for both" per [icp/selfprime-consumer.md §5](../icp/selfprime-consumer.md). ⚠️ **Sub-gap #3a:** the prompt cites "20%/12mo commission on consumer referrals per icp/selfprime-practitioner.md §5" — that text does not appear in the file. §5 lists hooks; commission rates are not specified. **The referral commission economics are unspecified** — file as gap. See *Integration gap #8*.
- **Operator visibility:** day-90 digest shows "referral-driven signup, second-generation downstream from sarah_uid."

---

## Attribution rollup at day 90

Per the dual-model rule in [ATTRIBUTION.md §1](../ATTRIBUTION.md#1-the-decision):

| Person | Cell | First-touch source | First-touch campaign | Last-touch source | Last-touch campaign |
|---|---|---|---|---|---|
| Sarah | `selfprime:practitioner` | `linkedin` | `2026-q3-practitioner-design-partners` | `linkedin` | `2026-q3-practitioner-design-partners` |
| Tomás | `selfprime:consumer` | `shareable` | `2026-q3-practitioner-design-partners` *(inherited from Sarah's cell campaign — see gap #1)* | `email_consumer_welcome_v1` *(flagged `invalid_touch=true` — see gap #5)* | `2026-q3-practitioner-design-partners` |
| Lucia | `selfprime:consumer` | `referral` *(per recommended policy in gap #3)* | `referral_organic_2026` *(synthetic id — spec'd nowhere today)* | `referral` | `referral_organic_2026` |

**What the spec says happens today:** Tomás gets `first_touch_campaign='2026-q3-practitioner-design-partners'` literally, with `utm_content='practitioner'`. His paid signup pollutes the practitioner-cell campaign's CAC/LTV math.

**What should happen:** the surface-routing middleware rewrites `utm_content` to `consumer` while preserving `utm_campaign`, and stamps a `cross_cell_arrival=true` flag so reporting can separate "intra-cell signups" from "flywheel arrivals."

---

## Flywheel credit at day 90

How much MRR descends from Sarah's day-60 publish?

| Person | MRR | Why attributable to Sarah |
|---|---|---|
| Sarah | $99/mo | Her own subscription (not flywheel — counted only in baseline) |
| Tomás | $9/mo | First-touch = shareable; the shareable came from Sarah's day-60 publish |
| Lucia | $9/mo | Referred by Tomás (depth-2 from Sarah) |
| **Total downstream from Sarah's publish** | **$18/mo** | Consumer-tier MRR |

Per [icp/selfprime.md](../icp/selfprime.md) ("Practitioner clients → consumer-tier signups for their friends/family") — this scenario is the claim made concrete. **This is what the prosumer-flywheel KPI measures.**

⚠️ **Integration gap #8:** Practitioner referral commission economics. The prompt asserts "20%/12mo per icp/selfprime-practitioner.md §5" — that text is **not in the file** (§5 lists hooks without rates). The hook ([icp/selfprime-practitioner.md §5](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific)) says "commission on referred paid signups" — but does Sarah earn commission when Tomás (Sarah did NOT refer Tomás — Tomás found Sarah via Maria's forward, not Sarah's referral code) pays? **Probably not** under a strict referral-graph reading. **But** under a "flywheel credit" reading, Sarah arguably should. **Recommendation:** define two concepts:
- **Referral commission** (legal/Stripe Connect) — only paid when `referral_attribution.referrer_user_id` is set; pays Sarah only on direct referrals (Sarah didn't refer Tomás via code).
- **Flywheel credit** (internal KPI only) — Sarah gets ICP-fit / cohort credit for Tomás because her shareable was Tomás's first touch; not a money payout.

Codify in ADR + `icp/selfprime-practitioner.md §5`.

---

## Constitution violations surfaced

### 1. TikTok paid ad fired without `paid_active` (CONSTITUTION §3 + §5)

| Question | Answer |
|---|---|
| What in the system *should* have prevented it | Programmatic readiness-gate check in [`packages/social/`](../../../packages/social/) adapters reading [`docs/marketing/channel-state.yaml`](../channel-state.yaml) |
| What was the gap | (a) channel-state.yaml doesn't exist yet (PR 3e); (b) adapters don't read it (PR 3f); (c) legacy ad accounts predate the constitution and aren't gated |
| Tripwire that catches | **None exists today.** Recommended: new tripwire — "any paid-spend API call with `readiness_state != paid_active`" → tier-3 pause |
| Operator response | Tier-3 escalation, pause TikTok account, ADR documenting incident, audit log for any other affected impressions |

### 2. Marketing email sent without consent (CONSTITUTION §6)

| Question | Answer |
|---|---|
| What *should* have prevented it | Pre-send `consent_status='opted_in'` check in [`packages/email/`](../../../packages/email/) `sendDripEmail()` |
| What was the gap | Free chart calc handler likely auto-promoted Tomás to `consent_status='opted_in'` (or the check is bypassed for "welcome" sequences); the implicit-consent doctrine is GDPR-noncompliant |
| Tripwire that catches | **None exists today.** Recommended: pre-send audit (block) + weekly audit query (alert) |
| Operator response | Tier-3 escalation; suppress affected list; regulator-readiness review per [DSR_HANDLING.md §8](../DSR_HANDLING.md#8-regional-considerations); ADR + code change |

---

## Integration gaps surfaced (summary)

| # | Gap | Severity | Recommendation |
|---|---|---|---|
| 1 | `utm_content=practitioner` on a shareable URL pollutes practitioner-cell math when a consumer clicks | **High** | Surface registry rewrites `utm_content` to recipient cell at capture time; preserves `utm_campaign` for flywheel credit; adds `cross_cell_arrival=true` flag |
| 2 | `selfprime.net/` bi-modal landing fork mechanism is undefined | **High** | Codify fork policy in [CHANNEL_DOCTRINE §4](../CHANNEL_DOCTRINE.md#4-channel-surface-conventions): UTM hint > device class > geo > sticky cookie |
| 3 | Referral graph (PR 3j) and touch-attribution (PR 3k) are siblings but not co-designed | **High** | Add `crm_leads.referral_chain` JSONB; keep marketing-attribution columns focused on click origin; ADR + dual-rollup reporting |
| 4 | WhatsApp / messenger forwarding strips `Referer`; spec assumes referrer is more reliable than it is | **Medium** | Add row to [ATTRIBUTION.md §6](../ATTRIBUTION.md#6-edge-cases-handled-in-spec) edge cases |
| 5 | Last-non-direct attribution records consent-violating touches as if they were valid | **High** | Add `invalid_touch` flag; exclude from `ATTRIBUTION.md §7` rollups; require `consent_status='opted_in'` for any source row counted |
| 6 | Reading-published is arguably advocacy; current LIFECYCLE §2 doesn't capture it | **Low** | Add `reading_published` to events that can transition 5→6 (Retained → Advocate) when the practitioner has consent on file |
| 7 | LIFECYCLE §2 stage transitions are silent on what happens to anonymous distinct_ids | **Medium** | Define "anonymous MQL" stage in [LIFECYCLE.md §2](../LIFECYCLE.md#2-event-to-stage-transition-rules); PostHog cohort, no `crm_leads` row, promoted on signup |
| 8 | Practitioner referral commission economics are unspecified; "flywheel credit" vs "referral commission" are conflated | **Medium** | Split the two concepts in `icp/selfprime-practitioner.md §5`; ADR for commission rate + Stripe Connect mechanics |

---

## Cross-references

- [`ATTRIBUTION.md`](../ATTRIBUTION.md) — dual-model rule that this scenario stress-tests
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) — 5-tuple integrity
- [`CHANNEL_DOCTRINE.md`](../CHANNEL_DOCTRINE.md) — bi-modal landing fork + voice routing
- [`LIFECYCLE.md`](../LIFECYCLE.md) — stage transitions for Tomás + Lucia
- [`CONSTITUTION.md`](../CONSTITUTION.md) §3 §5 §6 §7 — the gates this scenario violates
- [`DSR_HANDLING.md`](../DSR_HANDLING.md) — `published_readings` consent + cascade
- [`ICP_MATRIX.md`](../ICP_MATRIX.md) — flywheel diagram that this scenario instantiates
- [`icp/selfprime.md`](../icp/selfprime.md) — prosumer-flywheel claim
- [`icp/selfprime-consumer.md`](../icp/selfprime-consumer.md) — Tomás's cell, sub-segment D
- [`icp/selfprime-practitioner.md`](../icp/selfprime-practitioner.md) — Sarah's cell
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `crm_leads`, consent
- [`packages/email/src/index.ts`](../../../packages/email/src/index.ts) — drip + suppression
- [`packages/analytics/src/index.ts`](../../../packages/analytics/src/index.ts) — `factory_events` firewall
- [`packages/attribution/`](../../../packages/attribution/) (proposed, PR 3k) — touch stamping

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — Sarah → Maria → Tomás → Lucia flywheel trace; 8 integration gaps; 2 constitution violations |
