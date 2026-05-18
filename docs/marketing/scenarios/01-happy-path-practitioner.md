# Scenario 01 — Happy Path: Practitioner Acquisition + Retention

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Integration trace · **Owner:** @adrper79-dot

> Concrete walk of the [`selfprime:practitioner`](../icp/selfprime-practitioner.md) flywheel — Sarah Mendez, from her 23-day silent LinkedIn impression run to her D90 renewal — touching every system specified in [`MARKETING_SUPERVISOR.md`](../MARKETING_SUPERVISOR.md), [`LIFECYCLE.md`](../LIFECYCLE.md), [`ATTRIBUTION.md`](../ATTRIBUTION.md), [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md), and [`BUDGET_CAPS.md`](../BUDGET_CAPS.md). This file is the integration test no individual doc can perform — its purpose is to expose where the systems don't yet agree.

---

## Setup

| Field | Value |
|---|---|
| Cast | Sarah Mendez, 45, working Hellenistic astrologer (Demetra George lineage), 80 active clients/yr at $200/reading, podcast appearance on The Astrology Podcast 2024-08, business email `sarah@mendezastrology.com` |
| Cell | `selfprime:practitioner` (label form: `icp:selfprime-practitioner`) per [`ICP_MATRIX.md`](../ICP_MATRIX.md) |
| Sub-segment | `pure_astro` (sub-A) per [`icp/selfprime-practitioner.md §2`](../icp/selfprime-practitioner.md#2-customer-m1) |
| Voice served | `prime_self:practitioner` per [`VOICES.md`](../VOICES.md) and [`CHANNEL_DOCTRINE.md §3`](../CHANNEL_DOCTRINE.md#3-channel-to-voice-mapping) |
| Campaign | `selfprime/practitioner/linkedin/post-feed/2026-q3-practitioner-design-partners` per [`CAMPAIGN_TAGGING.md §7`](../CAMPAIGN_TAGGING.md#7-sample-campaign-annotation-worked-example) |
| Day 0 = | 2026-07-08T14:22:11Z (Sarah's click) |
| Starting state | Sarah has no row in `crm_leads`, `outreach_contacts`, `factory_events`, PostHog, or Stripe |

---

## Timeline

### Day -23 (2026-06-15) — silent impression #1

- **Trigger:** ChannelPublisher posted `selfprime/practitioner/linkedin/post-feed/2026-q3-practitioner-design-partners` at 09:00 ET, drafted earlier by ContentDrafter, gate-passed by CopyEditor (`voice_gate_status='clean'`, 1 minor logged).
- **Data writes:** `marketing_artefacts` row already exists from publish day; no Sarah-side write — impressions on LinkedIn are not exfiltrated to our PostHog. The only thing that lands in our systems is the post's *aggregate* impression count via the LinkedIn API poll (90-min cron in [`packages/social/`](../../../packages/social/)) — **Sarah is anonymous to us**.
- **Voice gate:** Already fired on publication 09:00 ET — `prime_self:practitioner`, 0 critical / 0 major / 1 minor (a slightly-too-corporate verb).
- **Budget:** This post's slice already accounted on Day -23 publish (~$0.027 ContentDrafter + $0.0006 CopyEditor verifier per [`COST_PROJECTION.md §3`](../COST_PROJECTION.md#3-per-loop-tick-cost)).
- **Agent activity:** None new — ChannelPublisher run already in `measured` state.
- **Operator visibility:** None. Tier 1.

⚠️ **Gap A1:** an impression is not an event we can attribute to. The funnel only starts at Step 1 (page view). First-touch attribution will mark her first touch as the *click* on Day 0, not the actual first contact 23 days earlier — making "earned channel saturation lift" invisible.

### Day -16 (2026-06-22) — silent impression #2

Same shape as Day -23. Different post in the same campaign (`...post-feed/...` artefact_id differs).

### Day 0, 14:22:11Z (2026-07-08) — Sarah clicks

- **Trigger:** Sarah clicks the LinkedIn link. Destination: `https://selfprime.net/practitioners?utm_source=linkedin&utm_medium=social&utm_campaign=2026-q3-practitioner-design-partners&utm_content=selfprime-practitioner&utm_term=subseg_pure_astro`.
- **Data writes:**
  - Frontend middleware (per [`ATTRIBUTION.md §2`](../ATTRIBUTION.md#2-utm-capture)) writes `lwt_first_touch` and `lwt_last_touch` to localStorage with `{source:'linkedin', campaign:'2026-q3-practitioner-design-partners', icp:'selfprime-practitioner', at:'2026-07-08T14:22:11Z'}`.
  - PostHog `$pageview` event with `distinct_id=anon_a1b2c3...`, properties carry the 5-tuple per [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives).
  - `factory_events` row: `event='page_viewed'`, `user_id=null`, `properties={...5-tuple, path:'/practitioners', referrer:'linkedin.com'}`.
- **Lifecycle stage:** `0 Unknown` per [`LIFECYCLE.md §1`](../LIFECYCLE.md#1-canonical-lifecycle-stages).
- **Voice gate:** N/A (no generation; the landing page was gate-passed at publish time).
- **Budget:** $0 (no LLM call).
- **Agent activity:** None — passive instrumentation.
- **Operator visibility:** None.

### Day 0, 14:23:02 — `signup_completed`

- **Trigger:** Sarah fills the signup form with `sarah@mendezastrology.com`, name "Sarah Mendez", checks the consent box.
- **Data writes:**
  - Selfprime auth (BetterAuth + D1 per [memory `project_betterauth_d1.md`](../../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_betterauth_d1.md)) creates `users` row, returns `user_id=usr_sarahm_001`.
  - PostHog `$identify({user_id: 'usr_sarahm_001', distinct_id: anon_a1b2c3..., $set: {email: ...}})`. ⚠️ PII routes through PostHog `$identify` — per [`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance) email must *not* land in PostHog beyond `user_id`. See **Gap B1**.
  - `factory_events` `event='signup_completed'`, `user_id='usr_sarahm_001'`, properties carry the 5-tuple from session.
  - `crm_leads` insert via `recordLeadEvent()` ([`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) line ~485):

  ```sql
  INSERT INTO crm_leads (user_id, app_id, source, status, mrr, created_at)
  VALUES ('usr_sarahm_001', 'selfprime', 'linkedin', 'lead', 0, NOW());
  ```

  ⚠️ **Gap A2:** the current schema has *no* `first_touch_source`/`last_touch_source`/`touch_history`/`first_touch_campaign`/`icp`/`sub_segment`/`cell_key` columns. [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules) describes them but they don't exist until [`pr3-briefs/3b-icp-dimension.md`](../pr3-briefs/3b-icp-dimension.md) lands. So today the row's `source='linkedin'` is single-valued, immutable, *and* there's no campaign id. Attribution is structurally broken until 3b.
  - `outreach_contacts` insert (only if Sarah ticked a marketing-opt-in checkbox; otherwise `consent_status='unknown'` and CRM is forbidden from emailing her — [`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance)):

  ```sql
  INSERT INTO outreach_contacts (tenant_id, first_name, last_name, phone, email, consent_status)
  VALUES ('selfprime', 'Sarah', 'Mendez', '', 'sarah@mendezastrology.com', 'opted_in');
  ```

  ⚠️ **Gap B2:** `outreach_contacts.phone` is `NOT NULL` ([`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) line 233). A web signup has no phone. Today this insert *fails*. See gaps section.
- **Lifecycle stage:** 0 → 1 (Cold, user_id resolved) → 2 (MQL, `signup_completed` per [`LIFECYCLE.md §2`](../LIFECYCLE.md#2-event-to-stage-transition-rules)).
- **Budget:** $0 (no LLM yet).
- **Agent activity:** None of the 10 — this is product-side instrumentation. The supervisor learns about it when PostHog webhook fires (see Day 0, 14:25).

### Day 0, 14:24:55 — `chart_calculated`

- **Trigger:** Sarah enters her birth data and her first client's birth data, hits "Calculate chart".
- **Data writes:** `factory_events` `event='chart_calculated'`, properties carry 5-tuple + `chart_subject:'client'`. ⚠️ `chart_calculated` is listed in [`LIFECYCLE.md §2`](../LIFECYCLE.md#2-event-to-stage-transition-rules) as a "new event to add to [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts) per PR 3b" — schema doesn't exist yet.
- **Lifecycle stage:** 2 → 3 (Trial / Active free — first product event after signup).
- **Budget:** Ephemeris is local (Swiss Ephemeris in-process); $0.

### Day 0, 14:25:14 — webhook fan-out

- **Trigger:** PostHog webhook to `https://marketing-supervisor.adrper79.workers.dev/webhook/posthog` fires on the new `signup_completed` event (per [`MARKETING_SUPERVISOR.md §4b`](../MARKETING_SUPERVISOR.md#4b-event-driven-cloudflare-queue-consumer) event table).
- **Cloudflare Queue:** `marketing-events` receives a `{kind:'signup', cell:'selfprime:practitioner', user_id:'usr_sarahm_001', tuple:{...}}` message.
- **Agent activity:**
  - Queue consumer matches to template `email-drip-step` ([`MARKETING_SUPERVISOR.md §4a`](../MARKETING_SUPERVISOR.md#4a-cron-tick-every-15-min-via-wranglerjsonc-triggerscrons) step 2).
  - **OutreachSender** enqueues `practitioner_welcome_v1` for Sarah.
  - `email_drip_state` insert (table proposed in [`DSR_HANDLING.md`](../DSR_HANDLING.md), not in [`packages/email/`](../../../packages/email/) yet — see **Gap C1**):

  ```sql
  INSERT INTO email_drip_state (user_id, sequence, step, enrolled_at, next_send_at)
  VALUES ('usr_sarahm_001', 'practitioner_welcome_v1', 0, NOW(), NOW());
  ```
  - **BudgetWatcher** pre-flight ([`MARKETING_SUPERVISOR.md §3`](../MARKETING_SUPERVISOR.md#3-agent-roster)): step 0 cost projection ~$0.020 LLM + $0.0004 Resend → check against `selfprime-practitioner.llm.daily` ($4.00 cap, today's spend ~$0.34) — pass.
- **Voice gate:** Will fire when the step 0 body is generated, see next.
- **Budget impact:** Reserved $0.0206; pending actual call.
- **Operator visibility:** None (Tier 1 — existing sequence step).

### Day 0, 14:25:18 — `practitioner_welcome_v1` step 0 fires

- **Trigger:** Drip cursor reads `step=0, next_send_at <= NOW()`.
- **Agent activity:**
  - **ContentDrafter** generates personalised body. Tier `balanced` (Sonnet) per [`COST_PROJECTION.md §3`](../COST_PROJECTION.md#3-per-loop-tick-cost). Prompt: voice profile + ICP context + Sarah's name + sub-segment hint (`pure_astro`). ~3,000 in / 1,200 out tokens → **$0.027**.
  - **CopyEditor** runs `validateAiOutput(body, profile='prime_self:practitioner')` ([`packages/validation/`](../../../packages/validation/)) — verifier tier (Groq llama-4-maverick) ~2,000 in / 400 out → **$0.0006**. Result: `clean` (0 critical, 0 major, 0 minor).
  - **ChannelPublisher** (via Resend) sends: subject "Sarah, two minutes on the prep-time problem", from `sarah@notifications.selfprime.net`. Resend tags: `[{name:'campaign', value:'2026-q3-practitioner-design-partners'}, {name:'cell', value:'selfprime-practitioner'}, {name:'sequence', value:'practitioner_welcome_v1'}, {name:'step', value:'0'}]` per [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives). Cost: **$0.0004**.
- **Data writes:**
  - `marketing_artefacts` row with the rendered body, voice gate result, LLM call log.
  - `email_drip_state` update `step=0 → 1`, `next_send_at = NOW() + 2 days`.
  - `factory_events` `event='email_sent', sequence='practitioner_welcome_v1', step=0`.
- **Budget:** $0.0280 against `selfprime-practitioner.llm.daily` ($4.00 cap).
- **Operator visibility:** None.

### Day 2 (2026-07-10), 11:14:09 — Sarah drafts a client reading

- **Trigger:** Sarah uses Selfprime's draft-reading feature on her first paying client of the week.
- **Data writes:**
  - `factory_events` `event='reading_drafted'`, properties `{draft_length_tokens, voice_profile:'prime_self:practitioner'}`.
  - Selfprime app records the draft + her edits (~38% of tokens changed — significant edit-rate, normal for first use).
- **Budget:** This is *product* LLM, not marketing LLM. Per [`COST_PROJECTION.md §2`](../COST_PROJECTION.md#2-cost-categories) row 1–4 and the cost-attribution rule in [`BUDGET_CAPS.md §7`](../BUDGET_CAPS.md#7-llm-cost-integration), product calls do not tag `marketing` and are not counted against the marketing sub-allocation. ⚠️ See **Gap D1** — there is no documented separation rule between product LLM and marketing LLM in [`packages/llm/`](../../../packages/llm/).
  - Estimated product-side cost: ~$0.06 (balanced tier, 3k in / 2k out).
- **Operator visibility:** None.

### Day 2 (2026-07-10), 14:25:18 — drip step 1 fires

- **Trigger:** `email_drip_state.next_send_at <= NOW()`.
- **Agent activity:** ContentDrafter ($0.027) + CopyEditor verifier ($0.0006) + Resend ($0.0004) per Day 0 step 0 pattern. Subject: "Did that first reading land?"
- **Budget:** $0.0280.
- **Data writes:** same shape as step 0 + `factory_events` `event='email_sent', step=1`.

### Day 5 (2026-07-13), 16:02 — Sarah drafts readings #2 and #3

- **Trigger:** Two `reading_drafted` events. Edit-rate drops to 19% on #2, 11% on #3 — Sarah is learning to trust the voice gate.
- **Data writes:** Two `factory_events` rows. The supervisor's `TopicScout` watches these aggregates (per [`MARKETING_SUPERVISOR.md §4b`](../MARKETING_SUPERVISOR.md#4b-event-driven-cloudflare-queue-consumer) event "`unlock_purchased` above-baseline" — but `reading_drafted` doesn't have this trigger wired, see **Gap E1**).
- **Operator visibility:** None.

### Day 7 (2026-07-15), 14:25:18 — drip step 2 fires

Same pattern. Subject: "The branded-shareable trick." Body links to PR 3h shareable demo. **$0.0280**.

### Days 9, 11, 14 — drip steps 3, 4, 5

Per [`LIFECYCLE.md §4`](../LIFECYCLE.md#4-drip-sequences-per-stage-transition) the sequence is 5 emails over 14 days. Days 9, 11, 14 fire steps 3, 4, 5. Each: **$0.0280**. Six emails total over 14 days × $0.0280 = **$0.168** total welcome cost. *(Per [`COST_PROJECTION.md §4a`](../COST_PROJECTION.md#4a-outreach-drip--3-emails--200-recipients) the per-recipient figure of ~$0.105 for a 5-email sequence aligns; one-recipient personalised math here is the same unit cost × steps.)*

### Day 17, Day 22 — open + click events

- `factory_events` rows for `email_opened` and `email_clicked` (Resend → webhook → `marketing-events` queue → write-through).
- ⚠️ **Gap F1:** when these events fire, frontend has no localStorage (email link arrives in inbox; click hits `selfprime.net/...?utm_source=email_practitioner_welcome_v1_step_4&...`). Attribution writes a new `last_touch_source='email_*'` per [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules) — but the schema columns don't exist yet (Gap A2). So today this is a *spec-only* write.

### Day 23–30 — Sarah uses chart prep on remaining clients of the week

Three more `reading_drafted` events, edit rate stabilises ~12%. Product is sticky. Total product-side LLM cost across Sarah's 6 draft sessions: ~6 × $0.06 = **~$0.36** in product LLM (separate from marketing budget).

### Day 31 (2026-08-08), 09:12:44 — `subscription_created` ($99/mo practitioner tier)

- **Trigger:** Sarah completes Stripe Checkout for the practitioner tier.
- **Data writes:**
  - Stripe webhook `customer.subscription.created` posts to `https://selfprime-api.adrper79.workers.dev/stripe/webhook`.
  - `Subscription.metadata` is set with `campaign_id='2026-q3-practitioner-design-partners'` *and* `first_touch_campaign='2026-q3-practitioner-design-partners'` per [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives). ⚠️ The Stripe Checkout init must read these from the user's session — see **Gap G1**: the only place the campaign id lives client-side is `localStorage.lwt_first_touch`, and Stripe Checkout opens in a new tab where that localStorage is *not* available unless we explicitly inject the metadata server-side from the session cookie.
  - `crm_leads` update:

  ```sql
  UPDATE crm_leads
     SET status = 'active',
         mrr = 99,
         converted_at = NOW()
   WHERE user_id = 'usr_sarahm_001'
     AND app_id  = 'selfprime';
  ```
  - `factory_events` `event='subscription_created'`, properties carry `plan='practitioner'`, MRR, the 5-tuple, plus `first_touch_campaign` from Stripe metadata.
  - PostHog `subscription_created` mirror (no PII).
- **Lifecycle stage:** 3 → 4 (Paid).
- **Voice gate:** N/A (transactional confirmation email is gate-exempt — it's product not marketing — but the *paid-welcome* sequence's bodies will gate).
- **Budget impact:** $0 LLM yet (subscription event itself is a Stripe webhook). Triggers the next sequence.
- **Agent activity:**
  - Queue consumer enqueues `practitioner_paid_welcome_v1` ([`LIFECYCLE.md §4`](../LIFECYCLE.md#4-drip-sequences-per-stage-transition)).
  - `email_drip_state` `practitioner_welcome_v1` row → `status='completed'`. New row for `practitioner_paid_welcome_v1` step 0.
- **Operator visibility:** None directly — but **DigestComposer** rolls this paid conversion into the next day's 06:00 digest as `north_star ++ 1 (selfprime:practitioner +1)`.

### Day 31 + step 0 — paid welcome step 0 fires

- ContentDrafter + CopyEditor + Resend send: **$0.0280**.

### Day 34, Day 38 — paid welcome steps 1, 2

Per [`LIFECYCLE.md §4`](../LIFECYCLE.md#4-drip-sequences-per-stage-transition) the paid sequence is 3 emails over 7 days. Total paid welcome cost: 3 × $0.0280 = **$0.084**.

### Day 45 (2026-08-22), 19:33 — Sarah uses "Get peer invite code"

- **Trigger:** Sarah sees the in-product "Refer a peer, both get 3 months free" hook ([`icp/selfprime-practitioner.md §5`](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific)) and clicks. She types in `tomas@duartereadings.com`, Tomás Duarte.
- **Data writes:**
  - Rate-limit check ([`BUDGET_CAPS.md §6`](../BUDGET_CAPS.md#6-free-tier-abuse-protection)): referral signup is 5/hr/IP, 25/day/IP, 1/email. Pass.
  - `factory_events` `event='referral_invited'`, properties `{referrer_user_id:'usr_sarahm_001', referred_email_hash:'...', cell_key:'selfprime:practitioner'}`.
  - Referral codes table (new — owned by [`pr3-briefs/3j-referrals.md`](../pr3-briefs/3j-referrals.md), not shipped): row with `{code, referrer_user_id, expires_at}`.
  - Resend transactional email to Tomás: "Sarah Mendez invited you to try Selfprime — both get 3 months free." Body is gate-required (it represents Sarah on a public surface) but `prime_self:practitioner` voice profile is the right key — Sarah's *brand*, our copy. ⚠️ **Gap H1:** [`VOICES.md`](../VOICES.md) and [`CHANNEL_DOCTRINE.md §3`](../CHANNEL_DOCTRINE.md#3-channel-to-voice-mapping) do not specify a voice key for *practitioner-as-channel* sends. Two valid candidates: `prime_self:practitioner` (Selfprime in its practitioner voice) or `prime_self:peer-referral` (doesn't exist). Today it would default to `prime_self:practitioner` — okay, but undocumented.
- **Lifecycle stage:** Sarah 4 → 6 (Advocate) per [`LIFECYCLE.md §2`](../LIFECYCLE.md#2-event-to-stage-transition-rules). ⚠️ The doc says transition is `5 → 6` (Retained → Advocate); Sarah is still on her *first* paid month so she's at stage 4 (Paid), not 5 (Retained). The lifecycle as written **forbids** stage 4 → 6 directly. See **Gap I1**.
- **Voice gate:** $0.0006 (single short body, verifier).
- **Budget:** ContentDrafter $0.020 + CopyEditor $0.0006 + Resend $0.0004 = **$0.0210**.
- **Agent activity:** ContentDrafter, CopyEditor, OutreachSender. Plus TopicScout receives the `referral_invited` signal as a "what made this convert?" trigger (per [`MARKETING_SUPERVISOR.md §4b`](../MARKETING_SUPERVISOR.md#4b-event-driven-cloudflare-queue-consumer) — though that table only names `unlock_purchased` today; `referral_invited` should be there too — **Gap E2**).

### Day 60 (2026-09-06), 11:18 — Sarah publishes a reading to the library

- **Trigger:** With client consent (modal: "Allow Selfprime to publish this anonymised reading to the public library?"), Sarah hits Publish.
- **Data writes:**
  - `published_readings` table (new — owned by [`icp/selfprime-practitioner.md §5`](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific) "Public reading library" hook):

  ```sql
  INSERT INTO published_readings (id, practitioner_user_id, slug, reading_id,
                                  consent_obtained, consent_obtained_at,
                                  client_anonymized_handle, published_at)
  VALUES (gen_random_uuid(), 'usr_sarahm_001', 'mars-saturn-square-mendez',
          'rdg_001abc', true, NOW(), 'anon_libra_sun', NOW());
  ```
  - URL becomes `selfprime.net/r/sarah-mendez/mars-saturn-square-mendez` — a *practitioner-branded* surface per [`CHANNEL_DOCTRINE.md §4`](../CHANNEL_DOCTRINE.md#4-channel-surface-conventions): cell `selfprime:practitioner` (owner), voice `prime_self:consumer` (visitor-facing rendering).
  - `factory_events` `event='reading_published_to_library'`, properties `{practitioner_user_id, reading_id, consent_obtained:true}`.
- **Voice gate:** Public surface → must gate. CopyEditor runs `validateAiOutput()` on the rendering. ⚠️ **Gap J1:** the published reading text is *Sarah's voice*, not Selfprime's. The voice gate profile is `prime_self:practitioner` per the surface table — but the gate is calibrated against Selfprime's brand voice, not Sarah's. A "practitioner-authored content gate" doesn't exist. Today the gate may *block* legitimate practitioner-authored text. See gaps section.
- **Budget:** Single CopyEditor verifier call ~$0.0006. If blocked → tier-3 escalation, freezing a real customer's publish flow.
- **Operator visibility:** None unless gate blocks → tier-3 with `escalation:voice-block`.

### Day 90 (2026-10-06), 09:12:44 — `subscription_renewed` (first renewal)

- **Trigger:** Stripe `invoice.paid` on the monthly subscription.
- **Data writes:**
  - `factory_events` `event='subscription_renewed'`, properties `{renewal_count:1, mrr_continuing:99}`.
  - `crm_leads.mrr` stays at 99 (no upgrade); `status` stays `active`.
- **Lifecycle stage:** Per [`LIFECYCLE.md §2`](../LIFECYCLE.md#2-event-to-stage-transition-rules), `subscription_renewed (#5) triggers 4 → 5 on N=2 (second renewal = retained)`. Sarah is on *first* renewal — the spec says she's still stage 4. ⚠️ **Gap I2:** the canonical funnel step 6 in [`LIFECYCLE.md §3`](../LIFECYCLE.md#3-per-cell-funnel-definitions) says "`subscription_renewed` ≥1 within 45 days" — but D90 is past 45 days and is the *first* renewal. Two different definitions of retention in the same doc. See gaps section.
- **Voice gate:** N/A (Stripe receipt is transactional).
- **Budget:** $0 (no LLM).
- **Operator visibility:** Aggregated into D90 cohort retention dashboard ([`LIFECYCLE.md §6`](../LIFECYCLE.md#6-dashboards)) — feeds the next monthly retro.

---

## Attribution at day 31

Per [`ATTRIBUTION.md §1`](../ATTRIBUTION.md#1-the-decision) — two models in parallel.

| Field | Value | Source |
|---|---|---|
| `crm_leads.first_touch_source` | `linkedin` | Day 0 click; immutable after |
| `crm_leads.first_touch_campaign` | `2026-q3-practitioner-design-partners` | Same |
| `crm_leads.first_touch_at` | `2026-07-08T14:22:11Z` | Same |
| `crm_leads.last_touch_source` | `email_practitioner_welcome_v1` | Day 22 click on the step-4 email — most recent non-direct |
| `crm_leads.last_touch_campaign` | `2026-q3-practitioner-design-partners` | Same campaign owns both — touches don't escape the campaign |
| `crm_leads.last_touch_at` | `2026-07-30T08:14:00Z` | Day 22 click |
| `touch_history` | `[{source:'linkedin', at:Day0}, {source:'email_*', at:Day7}, ...]` | Per [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules) |

**Credit assignment:**
- Last-non-direct model: `email_practitioner_welcome_v1` gets the conversion. Per [`ATTRIBUTION.md §7`](../ATTRIBUTION.md#7-per-cell-channel-allocation-reporting) row "email_* → new_paid +1".
- First-touch model: `linkedin` gets the conversion.
- Both models point to the *same* campaign id — that's the design, by [`CAMPAIGN_TAGGING.md §7`](../CAMPAIGN_TAGGING.md#7-sample-campaign-annotation-worked-example).
- Channel state advancement ([`CHANNEL_DOCTRINE.md §5`](../CHANNEL_DOCTRINE.md#5-readiness-gate-progression-constitution-5-operationalized)): LinkedIn × `selfprime:practitioner` accumulates one paid-conversion data point toward the `paid_ready` requirement.

---

## Attribution at day 90 (after the day-45 referral)

Tomás Duarte converts on Day 60 of his own clock — accepting Sarah's referral on Day 47 (= Sarah's Day 47, his Day 0), running through trial Day 0 → 23, converting Day 24, retained through Day 60. By Sarah's Day 90 he's a paying user with 30+ days retained.

**Tomás's `crm_leads` row:**

| Field | Value |
|---|---|
| `user_id` | `usr_tomasd_001` |
| `app_id` | `selfprime` |
| `first_touch_source` | `referral` |
| `first_touch_campaign` | `referral:from:usr_sarahm_001` (composite — see **Gap K1**) |
| `first_touch_at` | Day 47 from Sarah's clock |
| `last_touch_source` | `email_practitioner_welcome_v1` |
| `last_touch_campaign` | `referral:from:usr_sarahm_001` |
| `mrr` | 99 |

⚠️ **Gap K1:** the referral source is *also* a campaign in the kanban sense (it's a hook, not a campaign in the [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) 5-tuple sense). The 5-tuple `(product, icp, channel, surface, campaign_id)` doesn't have a "referrer_user_id" slot. Today either:
- (a) `channel='referral'` + `campaign_id='referral-from-anonymous'` → loses the flywheel attribution, OR
- (b) `campaign_id` encodes the referrer like `referral:from:usr_sarahm_001` → violates the 64-char + no-PII rule in [`CAMPAIGN_TAGGING.md §2`](../CAMPAIGN_TAGGING.md#2-campaign_id-naming).

The "flywheel attribution" the scenario brief asks about literally can't be expressed in the current tagging contract.

**The flywheel:**
- Sarah's first-touch = `linkedin` × `2026-q3-practitioner-design-partners` (immutable from Day 0).
- Tomás's first-touch = `referral` × (some campaign id) — *preserves Sarah's identity if Gap K1 is resolved*.
- The system can compute: "this LinkedIn campaign produced Sarah, who produced Tomás" — *only if* the join `tomas.first_touch_referrer_user_id → sarah.first_touch_campaign` is reachable. Today it's not in the schema.

---

## Total system cost for Sarah's first 90 days

Per [`COST_PROJECTION.md §2`](../COST_PROJECTION.md#2-cost-categories) unit rates, marketing-tagged spend only (product-side LLM is separate per [`BUDGET_CAPS.md §7`](../BUDGET_CAPS.md#7-llm-cost-integration)):

| Bucket | Calls | Unit | Subtotal |
|---|---:|---:|---:|
| Day -23 + -16 silent impressions — already-amortised post (allocated $0.0276 across many recipients; her share $0) | — | — | $0.00 |
| Drip `practitioner_welcome_v1` step 0 (Day 0) | 1 | $0.0280 | $0.0280 |
| Drip steps 1–5 (Days 2, 5, 7, 9, 12) | 5 | $0.0280 | $0.1400 |
| Drip `practitioner_paid_welcome_v1` steps 0–2 (Days 31, 34, 38) | 3 | $0.0280 | $0.0840 |
| Referral invite email (Day 45) | 1 | $0.0210 | $0.0210 |
| Published-reading voice-gate check (Day 60) | 1 | $0.0006 | $0.0006 |
| Stripe processing fee on conversion + 3 renewals (Day 31, 61, 91) — per [`COST_PROJECTION.md §2`](../COST_PROJECTION.md#2-cost-categories) row 9 | 3 | $0.30 + 2.9% | **$3.51** |
| Resend transactional (signup, paid welcome, referral) | ~10 | $0.0004 | $0.0040 |
| PostHog events stored (~25 events) | 25 | $0.00005 | $0.0013 |
| R2 storage for artefacts (Sarah's slice of monthly) | — | — | ~$0.01 |
| **Marketing-system spend (excl. Stripe)** | — | — | **~$0.28** |
| **Total all-in including Stripe processing** | — | — | **~$3.79** |

Sarah pays Selfprime **$99 × 3 = $297** through Day 90. **Gross margin contribution from Sarah at D90: $297 − $3.79 = ~$293.21**, or **~98.7% gross margin** before product-side LLM (~$0.36 across 6 readings) is netted. Net of product LLM: ~$292.85, ~98.6%. Tracks the [`icp/selfprime-practitioner.md §4`](../icp/selfprime-practitioner.md#4-pricing--economics) "85–90% target gross margin at scale" with room to spare at single-user scale.

**Sanity check vs [`COST_PROJECTION.md §4a`](../COST_PROJECTION.md#4a-outreach-drip--3-emails--200-recipients):** the doc projects ~$0.105/recipient for a 5-email sequence. Sarah's marketing spend across her *two* drip sequences (5 + 3 = 8 emails) is $0.224 — math is internally consistent ($0.028/email × 8 = $0.224).

---

## Integration gaps surfaced

The point of this walk. **15 concrete gaps** — anything marked ⚠️ above. Listed in order of severity for the autonomous-loop go-live.

### Severity tier 1 — blocks scenario at all (must fix before loop activation)

⚠️ **Gap B2 — `outreach_contacts.phone NOT NULL` blocks web signups.** [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) line 233 — a practitioner web signup has no phone. Today the row insert errors. **Fix:** make `phone` nullable, or split the table into `outreach_contacts_voice` and `outreach_contacts_web`. Until then the entire CRM pipeline starts in a half-broken state for Sarah.

⚠️ **Gap A2 — attribution columns don't exist on `crm_leads`.** [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules) declares `first_touch_*`, `last_touch_*`, `touch_history`; [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) line 210 has *none* of them. The current `source` is single-valued, immutable. Until [`pr3-briefs/3b-icp-dimension.md`](../pr3-briefs/3b-icp-dimension.md) ships, attribution literally cannot be computed.

⚠️ **Gap C1 — `email_drip_state` table is not implemented.** Referenced in [`DSR_HANDLING.md`](../DSR_HANDLING.md), [`LIFECYCLE.md §4`](../LIFECYCLE.md#4-drip-sequences-per-stage-transition), and this scenario. [`packages/email/`](../../../packages/email/) has no DDL for it. PR 3a is the carrier; it must ship before *any* drip can fire.

### Severity tier 2 — scenario completes but data is wrong

⚠️ **Gap B1 — PII leaks to PostHog on `$identify`.** [`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance) forbids PII beyond `user_id` in PostHog. Default PostHog `$identify` ships `email` in `$set`. Need an explicit allow-list filter in [`packages/analytics/`](../../../packages/analytics/).

⚠️ **Gap G1 — Stripe Checkout loses campaign id in new tab.** [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives) requires `Subscription.metadata.campaign_id`. Stripe Checkout opens a new tab; localStorage is not transferred. The fix is server-side: the Checkout session create must read the campaign from the user's session cookie and pass it via `success_url` / `metadata`. Not documented anywhere.

⚠️ **Gap I1 — invalid lifecycle transition 4 → 6 (referrer before retention).** [`LIFECYCLE.md §2`](../LIFECYCLE.md#2-event-to-stage-transition-rules) says `referral_invited` triggers `5 → 6`. But the realistic flywheel has practitioners referring on their first paid month (stage 4). Either (a) lifecycle must allow 4 → 6, or (b) the funnel must define "soft advocate" at stage 4 vs "retained advocate" at stage 6.

⚠️ **Gap I2 — two contradictory definitions of retention.** [`LIFECYCLE.md §2`](../LIFECYCLE.md#2-event-to-stage-transition-rules) says `4 → 5 on N=2 renewals (second renewal = retained)`. [`LIFECYCLE.md §3`](../LIFECYCLE.md#3-per-cell-funnel-definitions) practitioner funnel step 6 says "`subscription_renewed` ≥1 within 45 days." Sarah's Day 90 first renewal satisfies neither cleanly. North-star metric ("active paying subs retained ≥30 days") is yet a *third* definition. KPI reports against any of the three will disagree.

⚠️ **Gap K1 — referral attribution can't be expressed in the 5-tuple.** Either violates the no-PII rule or loses the referrer link. [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) needs either (a) a sixth field `referrer_user_id`, or (b) a sibling `referral_chain` JSONB on `crm_leads`.

### Severity tier 3 — design discrepancies the operator will hit

⚠️ **Gap A1 — impressions aren't attribution events.** 23 days of LinkedIn impressions are invisible to first-touch. This is consistent with the industry but worth flagging — "earned channel saturation" must be measured separately (LinkedIn API impression poll vs PostHog page-view ratio).

⚠️ **Gap D1 — no documented split between product LLM and marketing LLM spend.** [`BUDGET_CAPS.md §7`](../BUDGET_CAPS.md#7-llm-cost-integration) says marketing calls tag `marketing`. But [`packages/llm/`](../../../packages/llm/) has no enforcement that product calls *don't* accidentally tag `marketing`. A drift here silently eats marketing's sub-allocation.

⚠️ **Gap E1 — `reading_drafted` not in the supervisor event table.** [`MARKETING_SUPERVISOR.md §4b`](../MARKETING_SUPERVISOR.md#4b-event-driven-cloudflare-queue-consumer) lists only `unlock_purchased` for TopicScout signal. Practitioner-cell signals (draft, publish, refer) need adding.

⚠️ **Gap E2 — `referral_invited` not in the supervisor event table.** Same problem; the highest-value signal for flywheel learning isn't wired to TopicScout.

⚠️ **Gap F1 — email open/click attribution writes pre-date the schema.** Sarah's Day 22 email click *would* update `last_touch_source` — but the columns don't exist. Until Gap A2 fixes ship, last-touch is always `source` on the lead row, which never moves.

⚠️ **Gap H1 — voice key for practitioner-as-channel sends not registered.** Referral emails fire from Selfprime but represent Sarah's relationship to Tomás. [`VOICES.md`](../VOICES.md) does not declare a `prime_self:peer-referral` profile. Today the loop defaults to `prime_self:practitioner` — works, but undocumented and may drift.

⚠️ **Gap J1 — published-reading voice gate is calibrated to the wrong voice.** When a practitioner publishes to `selfprime.net/r/{slug}`, the content is *their* voice, not Selfprime's. Running `validateAiOutput()` with `prime_self:practitioner` profile against a Hellenistic-traditional practitioner may produce false positives. Need either (a) a "practitioner-authored content" gate that checks *minimum* brand standards (no claims, no PII, no profanity) rather than voice-match, or (b) a per-practitioner voice profile registered at the practitioner tier.

### Race conditions

⚠️ **Race R1 — concurrent `signup_completed` webhooks.** PostHog webhook + Selfprime app webhook both target the marketing supervisor queue. If signup happens at the queue consumer's tick boundary, both messages enqueue `practitioner_welcome_v1` step 0. **Fix:** idempotency key `(user_id, sequence, step)` on `email_drip_state` insert (per [`COST_PROJECTION.md §8c`](../COST_PROJECTION.md#8c-batching--idempotency)).

⚠️ **Race R2 — `subscription_created` arrives before `email_drip_state` completes Day-7 step 2.** If Sarah converts on Day 6 instead of Day 31, the welcome sequence is still mid-flight when the paid-welcome sequence enrols. Today there's no "graceful unenrol" rule documented — Sarah would get *both* sequence steps simultaneously. Need an unenrol rule in [`LIFECYCLE.md §4`](../LIFECYCLE.md#4-drip-sequences-per-stage-transition).

### Budget check timing

⚠️ **Budget Q1 — voice gate fires *after* LLM call.** ContentDrafter calls Anthropic (~$0.027) then CopyEditor reads the output and gates. If the gate blocks, the $0.027 is sunk cost. For practitioner-cell drips at scale this is fine (~$0.0006 wasted per block-rate %); for higher-tier campaigns it argues for a *pre-flight* prompt-side gate (system prompt declares constraints) in addition to post-hoc validation. Not flagged anywhere today.

---

## Cross-references

- [`MARKETING_PLAN.md`](../MARKETING_PLAN.md) — index
- [`CONSTITUTION.md`](../CONSTITUTION.md) — rules cited per-event
- [`MARKETING_SUPERVISOR.md`](../MARKETING_SUPERVISOR.md) — 10 agents
- [`LIFECYCLE.md`](../LIFECYCLE.md) — funnel
- [`ATTRIBUTION.md`](../ATTRIBUTION.md) — touch stamping
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) — 5-tuple
- [`CHANNEL_DOCTRINE.md`](../CHANNEL_DOCTRINE.md) — channel × cell matrix
- [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) — caps
- [`COST_PROJECTION.md`](../COST_PROJECTION.md) — per-call costs
- [`icp/selfprime-practitioner.md`](../icp/selfprime-practitioner.md) — Sarah's ICP cell
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `crm_leads`, `outreach_contacts`, `outreach_campaigns`
- [`packages/email/`](../../../packages/email/) — Resend client; sequencer pending PR 3a
- [`packages/copy/`](../../../packages/copy/) — voice profiles
- [`packages/analytics/`](../../../packages/analytics/) — PostHog + `factory_events`
- [`packages/validation/`](../../../packages/validation/) — `validateAiOutput()` voice gate
- [`pr3-briefs/3a-email-drip.md`](../pr3-briefs/3a-email-drip.md) · [`3b-icp-dimension.md`](../pr3-briefs/3b-icp-dimension.md) · [`3j-referrals.md`](../pr3-briefs/3j-referrals.md) — the unbuilt pieces this scenario exposes

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — happy-path practitioner walk; 17 events; 15 gaps; $3.79 all-in cost across 90 days; surfaces missing drip table, attribution schema, referral attribution shape, lifecycle stage 4→6, retention definition collisions |
