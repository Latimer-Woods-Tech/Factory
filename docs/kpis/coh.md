# coh (CypherOfHealing) KPI brief

**Repo:** [`Latimer-Woods-Tech/coh`](https://github.com/Latimer-Woods-Tech/coh)
**Live:** [cypherofhealing.com](https://cypherofhealing.com)
**Priority:** Stage 4
**Worker name:** `cypher-of-healing-api` (consistent across `wrangler.jsonc`, `package.json`, `deploy.yml`)
**Domains:** `api.cypherofhealing.com` AND `api.cipherofhealing.com` (both point to same worker — intentional)
**Neon project:** `curly-tree-61268761`

---

## Purpose

CypherOfHealing is a personal-brand platform for "The Cypher" — a healing practitioner offering five distinct revenue and engagement streams. All interactions unify through a single Stripe customer record and membership tier system (Free / VIP / Inner Circle). Neon Postgres is the source of truth; Cloudflare Workers is the API tier.

---

## The 5 streams

| Stream | Function | Tables |
|--------|----------|--------|
| **The Chair** (Booking) | In-person consultations, deposit-based, SMS reminders (Telnyx) | `appointments`, `bookings`, `appointment_reminders` |
| **The Vault** (Store) | Physical products (hair care), digital downloads, merch | `products`, `orders`, `order_items`, `inventory` |
| **The Academy** (Learning) | Video + text lessons with ElevenLabs narration, drip-feed modules | `courses`, `lessons`, `enrollments`, `lesson_progress` |
| **The Stage** (Podcast) | Podcast episodes via Cloudflare Stream, membership-gated, R2 audio fallback | `episodes`, `seasons`, `subscriptions` |
| **The Inner Circle** (Events + Membership) | Webinars / workshops with Telnyx RTC video rooms, tiered membership | `events`, `event_registrations`, `subscriptions`, `users.membership_tier` |

---

## Summary by category

| Category | Count | Notes |
|----------|-------|-------|
| user-facing HTTP | 15 | booking, store, academy, events, subscriptions, show, auth (18 endpoints) |
| integrations | 8 | Stripe (4 event types), Telnyx SMS / RTC, ElevenLabs TTS, email |
| data / CRM | 7 | `activity_log` (cross-stream), unified `users`, `membership_tier`, `coupons` |
| content | 5 | lessons (audio), episodes (Stream), courses, videos |
| monitoring | 5 | Sentry (PII-scrubbed), `/health`, DB health checks |
| infra / devops | 4 | KV (`SESSIONS`), R2 (`MEDIA`), hourly cron, worker deploy |
| **DB schema** | 29 tables, 8 enums | 40+ indexed columns |

See [`inventory.tsv`](inventory.tsv) (rows `F-COH-001` through `F-COH-045`).

**Worker name agreement check: ✓ no disagreement found.** All files consistently use `cypher-of-healing-api`. R2 bucket `cypher-healing-media` consistent. Both domain aliases route to same worker by design.

---

## Content engagement KPIs

| Signal | Measurement | Current KPI |
|--------|-------------|------------|
| **Lesson completion** | `enrollments.progress_percent` (0–100) | None; should target >60% |
| **Time-on-stream** | `lesson_progress.watch_time_seconds` | None; should track ratio to lesson duration |
| **Podcast completion** | `episodes.view_count` (incremented on `POST /:slug/view`) | None; should be >40% of registered listeners |
| **Audio engagement** | `lessons.audio_narration_url` presence + playback (no playback tracking) | **Blind spot** — no player analytics |
| **Course enrollment source** | `enrollments.source_event_id` foreign key | None; should track event → enrollment >10% |
| **Subscription retention** | `subscriptions.status` (active / past_due / cancelled / paused) | None; should target <5% monthly churn |
| **Appointment no-show** | `appointments.status = 'no_show'` | None; should be <15% |
| **Membership tier upgrade** | `users.membership_tier` transitions | None; should track tier conversion rates |

**Blind spot.** No player-level analytics (pause, rewind, skip, replay). All engagement is transactional, not behavioral.

---

## Telnyx + ElevenLabs KPIs

| Integration | Signal | Proposed KPI |
|-------------|--------|--------------|
| Telnyx SMS | `appointments.reminder_sent_at` + `telnyx_message_id` | >90% delivery, <5 min latency |
| SMS opt-in | `users.sms_opt_in` | >70% adoption |
| Telnyx RTC rooms | `events.telnyx_room_id`, token lifetime | 100% room creation success, <500ms token gen |
| Call recording | `TelnyxRTCRoomOptions.recordingEnabled` | >80% of webinars recorded |
| ElevenLabs cost | (no cost tracking table) | $0.30/hr audio estimate; track monthly |
| Audio narration | `lessons.audio_narration_url` + duration | >80% curriculum covered |
| Dropped calls | no explicit tracking | <2% abandonment during RTC join |
| Phone verification | `users.phone` + `telnyxContactId` | >60% verified |

---

## Top 5 highest-value KPIs not measured

1. **Video / audio playback completion rate** — `lesson_progress` tracks if a lesson was watched, not duration or pause patterns. ElevenLabs audio is offered but no playback telemetry. Can't identify engagement drop-off ("students stop at lesson 3, minute 5").
2. **Cross-stream revenue attribution** — `orders.source_appointment_id` + `enrollments.source_event_id` exist but no aggregated funnel view. Can't optimize which stream drives highest LTV.
3. **Subscription tier churn cohort** — `subscriptions.status` tracked but no cohort retention curves. Can't identify tier-specific retention drivers.
4. **Telnyx SMS delivery audit** — SMS sent (logged) but no read / click tracking. Can't measure reminder effectiveness.
5. **Email campaign funnel** — `email_campaigns` table exists (`status`, `sent_count`, `open_count`, `click_count`) but no automation; email triggered via webhook but not tracked per-user.

---

## Surprising findings

1. **No `.bootstrap/cypher-healing/` leakage.** The legacy multi-tenant spec is not in this repo. coh is clean.
2. **Cron runs hourly (`0 * * * *`) but only for appointment reminders.** No event reminders, no email follow-ups, no upsell nudges. Scheduling system is minimal.
3. **ElevenLabs audio generated but no cost tracking.** At ~$0.30/hr, a 50-lesson course (10 hrs) costs ~$3. No monthly spend aggregation.
4. **Stripe webhook idempotency is clever.** KV `SESSIONS` with 14-day TTL. But only 4 event types handled: `checkout.session.completed`, `customer.subscription.updated`, `charge.refunded`, generic fallback. **Missing:** `invoice.payment_failed`, `charge.dispute.created` (chargebacks).
5. **No analytics SDK on backend.** Frontend has `VITE_POSTHOG_KEY`. Backend has zero event emission. All signals are DB-based, not real-time.
6. **R2 cache 1-year (max-age=31536000)** — audio + media immutable. Correct, but no invalidation if a lesson is re-narrated.
7. **Podcast gating is membership-tier-aware.** But courses + events use Stripe subscription status, not membership tier. Inconsistent entitlement model.

---

## Blind spots

1. **No video player telemetry.** Cloudflare Stream embeds have built-in analytics; coh doesn't consume them. Watch time, seek patterns, bitrate, buffer — all invisible.
2. **No form abandonment tracking.** Booking form has steps; enrollment has upsell. No dropoff metrics.
3. **No referral tracking despite `users.referral_code`.** Code generated but no `referral_conversions` table or `referred_by` chain. Referral source only on `orders.referral_code` as a string, not UUID.
4. **`activity_log` is insert-only.** Records all events but never queried by handlers.
5. **No A/B testing infrastructure.** No variant or experiment tracking in schema or middleware.
6. **`appointments.products_used` is JSONB, not relational.** Can't easily query "which products were used in which appointments". Limits cross-sell analytics.
7. **Email open / click tracking is manual.** `email_campaigns.open_count` and `click_count` are counters, not time-series events. No webhook ingest for "user X opened email Y at time Z".
8. **No NPS / CSAT survey schema.** Can't measure brand loyalty beyond churn.

---

## Recommended next actions

1. **Wire Cloudflare Stream analytics consumer.** Pull watch time / buffer events into D1 or a new analytics table.
2. **Track `email_deliveries` open / click via Resend webhooks.** Convert counter columns to time-series events.
3. **Add `invoice.payment_failed` + `charge.dispute.created` to Stripe webhook handler.** Currently silent on dunning and disputes.
4. **Add `referral_conversions` table + `referred_by` chain.** Referral system is half-built.
5. **Add ElevenLabs cost aggregation.** Without a monthly spend rollup, COGS is invisible.
