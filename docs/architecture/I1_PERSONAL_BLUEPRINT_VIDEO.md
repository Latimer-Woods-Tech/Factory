# I1 — Energy Blueprint Video Engine: Final-State Design

> **Seam I1** from [`../PORTFOLIO_CAPABILITY_RECONCILIATION.md`](../PORTFOLIO_CAPABILITY_RECONCILIATION.md).
> Supersedes earlier "per-user personal film" drafts. Scope was deliberately expanded (see
> Decisions) from a one-time film into a **personalized, credit-metered, scheduled, multi-source
> video engine** with multi-channel delivery and an autopilot + exception-console operating model.
>
> **Design stance:** specify the **complete final state**, then build in **production-final, additive
> slices** — no MVP, no version-by-version reshaping, no "ship X then migrate to Y." Every decision is
> made once. Slices are sequenced so the marketing-claim-satisfying private film lands early, and
> every later slice is purely additive (no rework of earlier ones).
>
> **Effort (honest):** ~10–14 focused weeks for the full engine. The render *logic* exists and is
> reused; the build is the credit/billing meter, the scheduler, the modular multi-source composition,
> multi-channel delivery, the dedicated render service, and the exception console. The private film
> (the marketing claim) is satisfied by ~week 3–4; the rest is additive.

---

## 1. What we're building (final state)

A **personalized Energy Blueprint video engine**. A user composes **video objects** from selectable
**sources** (their blueprint, current transits, dream-journal reflection, milestones, personality
tests), on a **cadence they choose**, delivered through **channels they choose** (in-app, email, an
SMS deep-link). Generation is **metered by credits** (a monthly per-tier grant; overage = a credit
pack). Videos are **private by default**, with explicit, consented sharing to Capricast/Discord.

It has **three faces**:
1. **The product** — what the user configures, watches, and receives.
2. **The autopilot** — the system self-governs at hundreds/day: auto-retry with backoff, auto-throttle
   on a global spend ceiling, auto-screen + quarantine flagged shares, skip-and-notify on zero credits.
3. **The exception console** — the operator is pulled in *only by alerts* (failures, spend, abuse,
   moderation) into a triage queue. Not a control room; an alert-first cockpit.

## 2. Domain model

```
VideoObject            rendered asset; one per (subscription occurrence | on-demand request)
  id, userId, status: requested|metered|rendering|ready|failed, failureReason
  compositionSpecId, streamUid (private, signed playback), durationS, creditsSpent, createdAt, readyAt
  share: { visibility: private|unlisted|public, capricastVideoId?, discordAnnouncedAt? }   // default private

CompositionSpec        the recipe for a render
  sources: [blueprint, transits, dreamJournal, milestones, personality]   // user-selected subset
  format:  full_film | short_clip | narrated_stills                       // affects credit cost
  segments: ordered; each marked cacheable (blueprint, personality) | fresh (transits, dreamJournal, milestones)

VideoSubscription      a standing schedule (0..n per user)
  id, userId, cadence (rrule/cron), compositionSpec, channels: [in_app, email, sms], active, nextRunAt

CreditLedger           the meter (selfprime billing domain)
  userId, balance, monthlyGrant (by tier), rolloverCap (~1 month), txns: [grant|debit|purchase|refund]
  costFn(spec) -> credits   // base + per-source + format multiplier; operator-tunable config

AccountLink            cross-product identity (Slice 5)
  userId, provider: capricast|discord, externalId, verified, linkedAt

ModerationRecord       for shared videos
  videoObjectId, autoScreenResult, state: ok|flagged|removed, actor, reason
```

## 3. Architecture & data flow

```
selfprime (HumanDesign) ── product + meter + scheduler ──────────────┐
  on-demand "Generate" OR scheduler fires a VideoSubscription          │
   → resolve CompositionSpec, gather fresh source data                 │
   → CreditLedger.debit(costFn(spec))  ── insufficient? skip + notify(top-up upsell)
   → enqueue signed render request (idempotencyKey = videoObjectId)    │
                                                                       ▼
Factory ── Render Service (Cloud Run; Remotion + ffmpeg) ──────────────
   build modular composition from segments (cacheable reused; fresh rendered)
   author/attach narration (selfprime-supplied text; no Factory LLM)
   → Cloudflare Stream (private)  → signed callback ─▶ selfprime: store streamUid, status=ready, creditsSpent
                                                       │
selfprime ── deliver + surface ◀───────────────────────┘
   in-app film panel (signed playback) · Resend email · Telnyx SMS deep-link
   autopilot: retry/backoff · spend auto-throttle · zero-credit skip+notify

  ── explicit "Share" (consent + visibility) ─▶ Capricast import (visibility=chosen, creatorId=linked)
                                              → optional Discord announce        [Slice 5]

Cross-cutting: telemetry (Sentry + factory_events + cost/film) → autopilot alerts → Exception Console
```

The **on-demand and scheduled paths converge** on the same meter → render-request → render-service →
deliver pipeline. Recurring per-user schedules live on Factory's **schedule-worker**; **Cloud Run** is
the executor for *all* personal renders (CI `render-video.yml` stays only for scheduled *content*
videos — a genuinely different workload).

## 4. Mature engineering decisions (made once)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Video objects are private first-class assets** on selfprime Cloudflare Stream, **signed playback**; never public by default | Personal readings are private; sharing is an explicit act. |
| D2 | **Dedicated Cloud Run render service** for all personal renders; CI pipeline kept only for scheduled content; composition/scripts shared as a lib | Hundreds/day makes CI-as-render-farm untenable; correct workload placement, no rework. |
| D3 | **Modular composition** — each source is a segment with a credit cost, marked cacheable vs. fresh-per-render | Enables source selection + recurring freshness without re-rendering static content. |
| D4 | **Credit-metered** — per-tier monthly grant, `costFn(spec)` debit, overage = Stripe credit pack, zero-credit = skip+notify upsell | User-chosen flexibility (cadence × sources) with bounded, fair cost; clean upsell. |
| D5 | **Recurring schedules on schedule-worker**; the scheduler resolves spec, gathers fresh data, meters, enqueues | Reuse the platform scheduling infra; on-demand and scheduled share one path. |
| D6 | **selfprime authors narration** from real source data; Factory never LLM-generates personal narration | No-"AI"-wording governance at source; authentic; one fewer moving part. |
| D7 | **Multi-channel delivery**: in-app + Resend email + **Telnyx SMS as a deep-link** (SMS can't carry video) | All stacks exist; SMS links to signed playback. |
| D8 | **Autopilot + exception console** — system self-governs; humans triage alerts only | Matches "automated + exceptions only" operator model at scale. |
| D9 | **Two-layer cost governance** — per-user credits (user meter) + global spend ceiling with auto-throttle (platform safety) | Protects unit economics and the platform independently. |
| D10 | **Signed, idempotent async contract** end to end (HMAC, replay window, `idempotencyKey=videoObjectId`) | Mature service-to-service security; safe retries; exactly-once per occurrence. |
| D11 | **Capricast `visibility` made explicit** (param; default unlisted; never auto-public) — source-level fix for all callers | Fixes the latent privacy bug properly, not a skip-hack. |
| D12 | **First-class cross-product identity link** (selfprime ↔ Capricast ↔ Discord) | Real attribution for sharing/social; designed up front. |
| D13 | **Operator-tunable policy in config** (credit grants, `costFn`, spend ceiling, cadence limits) — editable without redeploy | The autopilot's knobs live where the operator can turn them. |

**Defaults set (flag to change):** credit **rollover** = monthly grant + capped carryover (~1 month);
sources in the catalog = **blueprint, transits, dream journal, milestones, personality tests**.

## 5. Reused vs net-new

**Reused:** the `EnergyBlueprintVideo` Remotion composition + render scripts (as a shared lib);
Cloudflare Stream; selfprime chart/synthesis/transits/dream-journal/psychometric data; Resend + Telnyx
+ in-app notifications; Stripe (one-time + agentic) for credit packs; schedule-worker scheduling;
atomic quota machinery; Sentry + factory_events.

**Net-new:** the Cloud Run render service; modular multi-source composition + per-source segment
renderers + `chartToScenes()`; CreditLedger + `costFn` + overage; VideoSubscription + scheduler
resolution; multi-channel delivery; signed render/callback contract; autopilot governance
(retry/throttle/skip/quarantine); the exception console; the Capricast `visibility` fix; the identity
link + sharing; the user configuration surface (sources × cadence × channels).

## 6. Build slices (production-final, additive — sequenced for early value)

Each slice is shippable and built to final quality; later slices add capability without reshaping
earlier ones.

- **Slice 0 — Foundations & contracts.** Domain schemas + migrations (VideoObject, CompositionSpec,
  CreditLedger, VideoSubscription, AccountLink, ModerationRecord); the signed render-request/callback
  contract (D10); `costFn` + credit-policy config (D13); extend shared types in `packages/video`.
  *Immutable source of truth for all later slices.*
- **Slice 1 — Render service + composition.** Cloud Run Remotion service (signed in/out); modular
  composition with the blueprint segment + `chartToScenes()`; private Stream upload; snapshot tests.
  *Verify:* signed request (fixture) → private Stream asset + valid signed callback.
- **Slice 2 — On-demand private film (satisfies the marketing claim).** selfprime narration authoring
  (D6); credit debit (D4) for a single on-demand render; `POST /api/profile/:id/video`; VideoObject
  state machine; signed-playback film panel (none/rendering/ready/failed+retry); in-app + email notify.
  *Verify:* generate → debit → pending → email → plays privately.
- **Slice 3 — Sources & composition catalog.** Add the remaining segment renderers (transits, dream
  journal, milestones, personality), cacheable/fresh handling, per-source credit costs, and the
  user's **source-selection** UI.
- **Slice 4 — Subscriptions, scheduling & delivery.** VideoSubscription config (cadence × sources ×
  channels); schedule-worker resolution → meter → enqueue; recurring freshness; Telnyx SMS deep-link
  delivery; zero-credit skip+notify+upsell.
- **Slice 5 — Credits & billing.** Per-tier grants, rollover, the credit-pack Stripe purchase + overage
  flow, ledger surfacing in-app.
- **Slice 6 — Autopilot & exception console.** Auto-retry/backoff, global spend ceiling + auto-throttle
  (D9), alerting, the operator triage console (failures, spend, abuse) with retry/cancel + credit-policy
  controls (D13).
- **Slice 7 — Social & moderation.** Capricast `visibility` fix (D11); identity link (D12); consented
  share → Capricast/Discord; auto-screen + moderation queue.

## 7. Contracts (authored in Slice 0, immutable thereafter)

**Render request** (selfprime → render service, signed):
```jsonc
{
  "videoObjectId": "<uuid>",          // == idempotency key
  "userId": "<uuid>",
  "callbackUrl": "https://api.selfprime.net/api/internal/video/callback",
  "spec": { "sources": ["blueprint","transits"], "format": "full_film",
            "segments": [ /* resolved: cacheable refs + fresh props + narration text */ ],
            "brandColor": "#c9a84c", "logoUrl": "..." }
}
```
Auth: `X-Signature` = HMAC-SHA256(rawBody, secret) + `X-Timestamp`; **±5-min replay window**; reject
duplicate `videoObjectId` in a terminal state. **Callback** (same scheme): `{ videoObjectId,
status: ready|failed, streamUid?, durationSeconds?, creditsSpent?, failureReason? }`.

**Segment interface:** `renderSegment(source, ctx) -> { props, narrationText, cacheable }` — the
contract every source implements; new sources are additive.

**Credit debit:** `costFn(spec) = base + Σ perSource(source) + formatMultiplier(format)` (config-driven);
debited atomically at enqueue; refunded on `failed`.

## 8. Risks & guardrails

- **Unit economics (top):** credits bound user cost; the global spend ceiling + auto-throttle bound
  platform cost; `costFn` is tuned from real cost-per-film telemetry. Refund credits on failed renders.
- **Privacy:** private-by-default + signed playback; sharing is opt-in with explicit visibility; the
  Capricast public default is removed at source (D11); SMS is a tokenized deep-link, not a public URL.
- **Render fidelity:** per-segment snapshot tests + a human review gate; segments must read correctly
  with real data.
- **No "AI" in copy:** narration + all UI/notification strings.
- **Security:** signed both directions (D10); render service least-privilege; secrets in GCP Secret
  Manager via WIF.
- **Abuse/moderation:** auto-screen shares; quarantine on flag; exception-queue takedown.
- **Workers constraints:** selfprime/worker code within platform hard constraints; the render service
  (Node + Chromium + ffmpeg) runs on Cloud Run, never in a Worker.

## 9. Effort (by slice, final-quality)

| Slice | Scope | Est. |
|---|---|---|
| 0 | Foundations & contracts | ~1 wk |
| 1 | Render service + composition (blueprint segment) | ~1.5–2 wk |
| 2 | On-demand private film — **marketing claim satisfied** | ~1.5 wk |
| 3 | Source catalog (transits, dream journal, milestones, personality) | ~1.5 wk |
| 4 | Subscriptions, scheduling & multi-channel delivery | ~1.5–2 wk |
| 5 | Credits & billing (grants, packs, overage) | ~1 wk |
| 6 | Autopilot & exception console | ~1.5 wk |
| 7 | Social & moderation (Capricast/Discord, identity) | ~1.5 wk |
| **Total (final state)** | Slices 0–7 | **~10–14 wk** |

**Bottom line:** medium-high effort, low technical risk (render logic proven). Designed as the
complete engine and built in production-final slices — the private film (Slice 2) satisfies the
marketing claim early, and subscriptions, credits, the console, and social are each additive with no
rework.
