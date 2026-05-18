# Marketing Supervisor

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative spec · **Owner:** @adrper79-dot · **Conflicts:** [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) wins; [`CONSTITUTION.md`](./CONSTITUTION.md) governs

> The autonomous marketing loop. A peer to the engineering supervisor — same kanban substrate (GitHub Issues + Projects v2), same tier discipline, different agents, different gates. This file specifies what the loop is, what fires on a tick, what state a campaign moves through, and where it surfaces to the operator. Implementation lands in [PR 3e — supervisor worker](./pr3-briefs/3e-supervisor-worker.md).

> If a behaviour isn't in this file, [`CONSTITUTION.md`](./CONSTITUTION.md), or a referenced brief, the loop must not do it. New behaviours require an ADR in [`docs/decisions/`](../decisions/).

---

## 1. Purpose

The marketing supervisor advances campaigns through their lifecycle — draft, voice-gated, queued, published, measured, retro — on every cell of [`ICP_MATRIX.md`](./ICP_MATRIX.md) that has cleared the readiness gate, hands-off, within the constraints of [`CONSTITUTION.md`](./CONSTITUTION.md). It does **not** decide strategy, write the constitution, change matrix readiness states, set budgets, register new voice profiles, or open new channels — those are operator acts. It executes the plan the operator's docs have already written; it surfaces escalations when execution can't proceed; it never substitutes its own judgement for an unmet gate.

---

## 2. Architecture overview

```
                   ┌───────────────────────────────────────────┐
                   │     ICP_MATRIX × CONSTITUTION (rules)     │
                   └─────────────────────┬─────────────────────┘
                                         │
            ┌────────────────────────────┴────────────────────────────┐
            │                                                         │
   ┌────────▼────────┐   GitHub Issues   ┌──────────────────┐   PostHog +
   │ Marketing Kanban│◄──(per ICP cell)─►│  Agent Roster    │◄──factory_events
   │ (Projects v2)   │                   │  (10 agents)     │   (12 events)
   └────────┬────────┘                   └────────┬─────────┘
            │                                     │
            │   Cloudflare Queue (event bus)      │
            │   ┌─────────────────────────────────┘
            │   │
   ┌────────▼───▼──────┐   ┌────────────────┐   ┌──────────────────┐
   │ Gates (4):        │   │ Data stores:   │   │ Surfaces:        │
   │ - voice           │   │ - Neon         │   │ - email          │
   │ - budget          │   │ - PostHog      │   │ - social         │
   │ - tier            │   │ - factory_evts │   │ - blog/Mintlify  │
   │ - tripwire        │   │ - R2 artefacts │   │ - paid (gated)   │
   └────────┬──────────┘   └────────────────┘   └──────────────────┘
            │
   ┌────────▼──────────┐
   │ Pushover digest   │  (≤3 escalations/day, 06:00 local)
   └───────────────────┘
```

**Components:**

| Component | Lives in | Notes |
|---|---|---|
| Supervisor Worker | [`apps/marketing-supervisor/`](../../apps/marketing-supervisor/) (post PR 3e) | Cloudflare Worker on cron; mirror of [`apps/supervisor/`](../../apps/supervisor/) |
| Kanban | GitHub Projects v2 `PVT_kwDOEL0sNc4BWWtg`, area label `area:marketing` | Same board as engineering — peer lanes, not separate boards |
| Issue templates | [`.github/ISSUE_TEMPLATE/marketing-*.yml`](../../.github/ISSUE_TEMPLATE/) | One per campaign archetype; mirror of `docs/supervisor/plans/` shape |
| Event queue | Cloudflare Queue `marketing-events` | Carries triggers from PostHog webhooks, Stripe webhooks, GitHub Issue events |
| Data stores | Neon (`marketing_campaigns`, `marketing_artefacts`, `marketing_runs`), R2 (`marketing-artefacts` bucket), PostHog, `factory_events` | RLS per [PLATFORM_STANDARDS §2](../PLATFORM_STANDARDS.md); revenue events firewalled in `factory_events` |
| LLM chain | [`@latimer-woods-tech/llm`](../../packages/llm/) | Anthropic → Grok → Groq per [`docs/STACK.md`](../STACK.md); voice gate runs after every generation |

**Gates (in order — failure short-circuits):**

| # | Gate | Source of truth | Failure routes to |
|---|---|---|---|
| 1 | **Voice** | `validateAiOutput()` in [`packages/validation/`](../../packages/validation/) with profile from [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts) | `critical`/`major` → escalation queue (tier-3); `minor` → log + publish |
| 2 | **Budget** | [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) — per-channel, per-cell, per-portfolio | Hard refuse + tier-3 escalation; never silent overrun |
| 3 | **Tier** | [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers) + [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) | T2 → operator FYI (auto-proceed at +24h); T3 → block + wait |
| 4 | **Tripwire** | [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires) thresholds | Auto-pause the cell + tier-3 escalation |

---

## 3. Agent roster

Each agent is a single-purpose function the supervisor invokes per tick. Inputs come from kanban issues or the event queue; outputs are state transitions or new artefacts; every agent's tier is the *maximum* tier of action it can take without escalating.

| Agent | Scope | Inputs | Outputs | Gate | Max tier |
|---|---|---|---|---|---|
| **TopicScout** | Mine signal for campaign topics per cell | PostHog top-events, `factory_events` revenue deltas, support replies, [`@latimer-woods-tech/llm`](../../packages/llm/) rank tracker (PR 3l) | GitHub Issue with template `marketing-campaign-draft`, labels `area:marketing` + `icp:{cell_key}` | None (drafts only) | T1 |
| **ContentDrafter** | Generate copy, scripts, landing-page text, email bodies | Issue body + ICP file + voice key per [`VOICES.md`](./VOICES.md) | Draft artefact rows in `marketing_artefacts` + LLM call log | Voice (downstream, by CopyEditor) | T1 |
| **CopyEditor** | Run the voice gate and apply minor edits | Draft artefact | Artefact with `voice_gate_status ∈ {clean, minor_logged, blocked}` and validation issues array | **Voice** (gate-of-record) | T1 (clean) / T3 (blocked) |
| **ChannelPublisher** | Publish to allowlisted owned/earned channels | Gate-clean artefact + cell readiness + channel config from [`packages/social/`](../../packages/social/) | Posted artefact + UTM + run row | Tier (T1 single post, T2 new sequence/channel-first), allowlist per [`CONSTITUTION.md §5`](./CONSTITUTION.md#5-channel-allowlist--readiness-gates) | T1–T2 |
| **OutreachSender** | Send email / CRM outreach within consent rules | Contact list filtered by `consent_status='opted_in'`, gate-clean script via [`CampaignService.generateCampaignScript`](../../packages/crm/src/index.ts) | Sends through [`packages/email/`](../../packages/email/) sequencer (PR 3a); writes `call_logs` / `email_sends` | Tier (T2 for activate-new-sequence, T2 for >10% of list, T3 for >50%), consent | T1–T2 |
| **ExperimentRunner** | Run pre-declared A/B tests per [`CONSTITUTION.md §8`](./CONSTITUTION.md#8-experimentation-discipline) | Hypothesis + primary metric + min sample (declared in issue) | Assignment buckets in `marketing_experiments`, daily significance check, winner declaration | Tier (T2 to launch, T1 to extend within declared window) | T2 |
| **RetroWriter** | Auto-generate weekly retros | Last 7d of runs + experiments + tripwire firings | `docs/marketing/playbooks/retros/{date}.md` | None | T1 |
| **BudgetWatcher** | Pre-flight every spend against caps; daily reconcile against Stripe / ad APIs | Spend events from queue, [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) | Allow/refuse decision; tier-3 escalation on hard-cap hit | **Budget** | T3 escalation-only |
| **TripwireMonitor** | Evaluate the 7 tripwires from [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires) | Rolling windows over PostHog + Resend bounce/complaint + sentiment over mentions | Auto-pause matrix cell + tier-3 escalation issue | **Tripwire** | T3 escalation-only |
| **DigestComposer** | Build the operator's daily digest | Last 24h escalation queue + north-star number + open T3 actions | Pushover notification + `playbooks/digests/{date}.md` | None | T1 |

**Boundaries:** no agent reaches outside its scope. ContentDrafter does not publish. ChannelPublisher does not generate copy. BudgetWatcher cannot approve overruns — only refuse and escalate. Adding a new agent requires an ADR.

---

## 4. Loop tick

The supervisor runs three concurrent loops, mirroring how [`apps/supervisor/`](../../apps/supervisor/) layers cron, webhook, and signal triggers:

### 4a. Cron tick (every 15 min via `wrangler.jsonc` `triggers.crons`)

1. List kanban issues with `area:marketing` and label `supervisor:approved-source` and not (`agent:claimed:*` ∪ `status:done` ∪ `supervisor:no-template`).
2. For each, match against templates in [`docs/marketing/plans/*.yml`](./plans/) (compiled to `apps/marketing-supervisor/src/planner/templates.generated.json`). One template per campaign archetype: `owned-social-post`, `email-drip-step`, `landing-page-refresh`, `video-topic`, `experiment-launch`, etc.
3. Run the matched agent. Claim with `agent:claimed:marketing` label.
4. On success, advance state machine (§5). On failure, follow §8.
5. Stale claims (>7 days, no linked artefact) released by `releaseStaleClaimedIssues()` adapted from [`.github/scripts/supervisor-core.mjs`](../../.github/scripts/supervisor-core.mjs).

### 4b. Event-driven (Cloudflare Queue consumer)

Events that fire agents out-of-band:

| Event source | Triggers | Agent |
|---|---|---|
| PostHog webhook: `checkout_started` drop >50% 24h | Tripwire check | TripwireMonitor |
| `subscription_canceled` event from [`docs/MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md) #7 | Win-back drip enqueue | OutreachSender (T2 — auto in 24h) |
| `unlock_purchased` (#8) above-baseline | Topic mining — what made this convert? | TopicScout |
| Resend webhook: bounce rate / complaint > [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires) | Pause channel + escalate | TripwireMonitor |
| Stripe webhook: spend on a paid surface | Reconcile against [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) | BudgetWatcher |
| GitHub Issue label change (`area:marketing` added) | Triage and template-match | (supervisor core) |
| GitHub PR merged touching `packages/copy/src/voice-corpus/*.json` | Voice corpus reload | (supervisor core) |

### 4c. Matrix-signal (every 6h, slow loop)

For each filled cell in [`ICP_MATRIX.md`](./ICP_MATRIX.md):

1. Read readiness state. If `discovery` → only TopicScout + ContentDrafter run, no publication.
2. Compute the cell's diagnostic decomposition from [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md). If any diagnostic crosses a `readiness-progression` threshold, open an FYI issue tagged `escalation:matrix-shift`.
3. Compute the cell's voice-drift score per [`VOICES.md §5`](./VOICES.md#5-voice-drift-detection). If above threshold, open a draft PR against [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) `BRAND_PROFILES`.

---

## 5. Campaign state machine

Per `(product, icp)` cell. Persisted in `marketing_campaigns.state`. Transitions are explicit; no skipping.

```
   draft ──voice gate──> review ──tier check──> queued ──publish──> published
                              │                                          │
                              │                                          v
                              │                                       measured
                              │                                          │
                              ▼                                          v
                          escalation                                   retro
                       (tier-3 wait)                                     │
                                                                         v
                                                                       archived
```

| State | Entered when | Exited when | Owner agent |
|---|---|---|---|
| `draft` | TopicScout opens issue + ContentDrafter produces artefact | Voice gate run | ContentDrafter |
| `review` | Artefact exists, gate run pending or gate-passed awaiting tier eval | Tier check passes, or operator approves T3 | CopyEditor |
| `queued` | Tier + budget cleared; awaiting scheduled publish time | Channel publish API called | ChannelPublisher / OutreachSender |
| `published` | Surface acknowledges (e.g. Resend `accepted`, social adapter post-id) | First 24h elapses or first metric event lands | ChannelPublisher |
| `measured` | ≥24h post-publish; PostHog + factory_events attribution computed per [`ATTRIBUTION.md`](./ATTRIBUTION.md) | Retro picked up by RetroWriter on next Sunday | (no owner; passive) |
| `retro` | Weekly Sunday tick consumes the campaign | Retro doc written and committed | RetroWriter |
| `escalation` | Voice block, budget block, tripwire fire, or tier-3 trigger | Operator decision recorded (proceed / pause / kill) | (operator + DigestComposer) |
| `archived` | Retro complete OR campaign killed | terminal | (none) |

**Per-cell concurrency caps** (per [`BUDGET_CAPS.md`](./BUDGET_CAPS.md)):
- Max 3 concurrent campaigns in `queued` per cell.
- Max 1 concurrent A/B test per cell ([`CONSTITUTION.md §8`](./CONSTITUTION.md#8-experimentation-discipline)).
- Max 10 `draft` issues per cell — TopicScout backs off above this.

**Example transition** for `prime_self:practitioner`:
```
TopicScout — "practitioner client-prep workflow"
  → draft (issue #4812, area:marketing icp:prime_self-practitioner)
  → ContentDrafter generates: 250-word LinkedIn post + 4-tweet thread
  → CopyEditor: voice gate clean (0 critical, 0 major, 1 minor logged)
  → review
  → tier check: T1 (single owned-social post) → auto
  → queued
  → ChannelPublisher posts LinkedIn 09:00 + X 09:00 with UTM per CAMPAIGN_TAGGING
  → published
  → 24h later: 1.2k impressions, 14 clicks, 1 signup → measured
  → Sunday: RetroWriter appends to playbooks/retros/2026-05-24.md
  → archived
```

---

## 6. Integration with the engineering supervisor

The marketing supervisor is a **peer**, not a subordinate, of [`apps/supervisor/`](../../apps/supervisor/). Same kanban board (`PVT_kwDOEL0sNc4BWWtg`), same auto-triage script (`.github/scripts/auto-triage.mjs`), same label vocabulary, same escalation pipeline. The two loops share signals via four interfaces:

| Interface | Direction | Example |
|---|---|---|
| **GitHub Issues** | Both ways | Eng issue labelled `area:marketing-blocker` (e.g. checkout broken) pauses any campaign whose state machine reads that cell's monetization path. Marketing issue labelled `area:eng-needed` (e.g. need new email template DDL) opens an eng work item. |
| **PostHog events** | Eng → Mkt (read-only) | Marketing reads the 12 events from [`docs/MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md); no write-back. |
| **Sentry** | Eng → Mkt (read-only) | If Sentry alert fires on a domain a campaign is currently driving traffic to, ChannelPublisher pauses sends to that surface and opens a `escalation:sentry-traffic-block` issue. |
| **factory_events** | Mkt → factory_events (write) | Every published artefact emits a `marketing_artefact_published` row tagged per [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md). Engineering retros can join on these. |

**Hard rule:** marketing never writes to engineering's data stores beyond `factory_events`, and engineering never writes to `marketing_campaigns` / `marketing_artefacts`. Cross-cutting changes go through GitHub Issues, not direct DB writes.

**Labels reserved for marketing (mirror eng convention):**
- `area:marketing` — pickup label for the marketing loop
- `agent:claimed:marketing` — claim dedup
- `escalation:voice-block` / `escalation:budget-block` / `escalation:tripwire-{name}` / `escalation:matrix-shift`
- `icp:{cell_key}` — e.g. `icp:prime_self-practitioner`, `icp:cypher_seeker` (note: dash-form for label compat; canonical `voice` key in code uses colon)
- `tier:1` / `tier:2` / `tier:3` — matches [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers)

---

## 7. Daily operator digest

Sent via Pushover at 06:00 local, composed by DigestComposer. Mirror of the engineering 5-question frame in [`docs/STATE.md`](../STATE.md).

**Hard rule per [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md):** **maximum 3 escalations.** If the queue has more, DigestComposer batches them and surfaces only the top 3 by tier + age + cell priority (from [`ICP_MATRIX.md` §"Priority order"](./ICP_MATRIX.md#priority-order-rolling)). The remainder are visible at the queue endpoint but do not fire a notification.

**Format:**

```
LWT Marketing — 2026-05-19 06:00

NORTH STAR: 47 paying subs ≥30d (Δ +3 WoW)
  prime_self:practitioner: 12 (Δ +2)
  prime_self:consumer: 21 (Δ +1)
  cypher_seeker: 9 (Δ 0)
  xicocity_creator: 5 (Δ 0)

ESCALATIONS (3 of 7 — see /queue for rest):
  [T3] Budget-block: prime_self paid LinkedIn 92% of weekly cap. Reply 'proceed' or 'pause'.
  [T3] Tripwire: cypher_seeker unsubscribe spike 2.3× baseline last 24h. Auto-paused.
  [T2 expires 14h] New sequence "practitioner-onboarding-v2" queued; auto-launch at 20:00 unless paused.

LOOP HEALTH: 142 ticks last 24h, 0 stale claims, voice-gate pass rate 96%, LLM spend $11.20 / $50 cap
```

**What it surfaces:**
- North-star number with decomposition
- Top 3 escalations (T3 always wins over T2; within tier, age + priority)
- Loop health one-liner (ticks, stale claims, gate pass rate, LLM spend vs G8 cap)

**What it doesn't surface:**
- Tier-1 actions (none, ever — operator does not see normal publication)
- Tier-2 auto-proceed actions unless within 6h of their 24h window expiring
- Minor voice violations (counted in pass rate, not enumerated)
- Per-artefact metrics (live in retros, not the digest)

**Operator response surface:** Pushover reply or `pause-marketing` CLI hits the [`apps/marketing-supervisor/`](../../apps/marketing-supervisor/) `/control` endpoint. Replies are idempotency-keyed by escalation id.

---

## 8. Failure modes + recovery

Every failure mode below has an auto-recovery path. Escalation is the path of last resort, never first.

| Failure | Detection | Auto-recovery | Escalation |
|---|---|---|---|
| **Loop stuck** (no successful agent run in 60 min during business hours, 6h overnight) | Cloudflare cron heartbeat → `marketing_runs` table; missing row triggers self-check | Worker auto-redeploys via `wrangler deploy`; replays last unfinished claim from kanban | If 2 redeploys fail or heartbeat missed >2h business hours → tier-3 issue with `escalation:loop-stuck` |
| **Voice profile drift** (voice gate block rate > 5% / 24h per [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires)) | TripwireMonitor rolling window over `marketing_artefacts.voice_gate_status` | Pause publication on the affected cell; freeze ContentDrafter outputs for that voice key; auto-open draft PR against [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) `BRAND_PROFILES` proposing rule updates per [`VOICES.md §5`](./VOICES.md#5-voice-drift-detection) | Tier-3 with diff and the 3 worst offending artefacts attached |
| **Budget breach** (cell-cap or portfolio-cap exceeded within tick window) | BudgetWatcher pre-flight check before any spend; daily reconcile against Stripe/Ads APIs | Refuse the spend, leave campaign in `queued`, mark with `escalation:budget-block`; backoff TopicScout for that cell for 24h | Tier-3 always — budget breaches do not auto-resolve |
| **Tripwire fired** (one of 7 in [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires)) | Per-tripwire rolling window in TripwireMonitor | Auto-pause publication on affected cell; suspend OutreachSender to the offending sequence; preserve in-flight artefacts in `paused` not `archived` | Tier-3 with tripwire name, threshold, and current value |
| **LLM provider outage** | [`@latimer-woods-tech/llm`](../../packages/llm/) chain falls through Anthropic → Grok → Groq | Chain handles transparently; ContentDrafter retries with degraded tier flagged | Only if all 3 providers fail in 30 min → tier-3 with `escalation:llm-chain-fail` |
| **Channel adapter failure** (e.g. LinkedIn 401, X rate-limited, Resend 5xx) | Adapter raises in [`packages/social/`](../../packages/social/) or [`packages/email/`](../../packages/email/) | Exponential backoff up to 3 retries; on persistent failure, mark artefact `publish_failed` and re-queue with cool-down | If same channel fails 5× in 1h → tier-3 with `escalation:channel-down` |
| **Consent gate hit unexpectedly** (large send filtered to near-zero recipients) | OutreachSender pre-flight count vs declared audience size | Pause send; flag for operator review — likely list-quality bug | Tier-3 with `escalation:consent-anomaly` and recipient-count delta |
| **Stale claim** (agent claimed issue >7d, no linked artefact) | `releaseStaleClaimedIssues()` adaptation from `.github/scripts/supervisor-core.mjs` | Strip claim label; issue re-enters pool on next tick | None unless same issue restales 3× → tier-2 |
| **Voice corpus poisoning** (new gate-clean artefact pushes corpus median engagement down) | RetroWriter weekly diff over `packages/copy/src/voice-corpus/*.json` | Auto-veto the bottom-decile entries from corpus | Tier-2 FYI in next digest with diff |
| **Tier-3 backlog growth** (>10 unresolved T3 escalations) | DigestComposer pre-check | Throttle TopicScout by 50% until backlog ≤5 | Tier-2 FYI; do not page operator twice for backlog |

**Recovery telemetry:** every auto-recovery emits a `marketing_recovery` row to `factory_events` so engineering retros can spot patterns.

### 8.1 Race conditions + ordering rules (T3-7)

The 3 concurrent loops + 10 agents introduce real concurrency. Explicit rules:

| Race | Resolution |
|---|---|
| **Signup → drip enrollment ordering** | Signup is the durable event in `factory_events`; drip enrollment is a fire-and-forget message to the `marketing-events` Cloudflare Queue. The supervisor processes the queue in arrival order; idempotency key `(user_id, sequence_name)` prevents double-enroll if the queue retries |
| **Concurrent voice-gate evaluations on the same artefact** | The voice gate uses optimistic locking on `marketing_artefacts.voice_gate_status`. Two agents trying to gate the same artefact: the second sees the first's result via cache lookup keyed by `hash(body, voice_profile_version)`; only one LLM call fires |
| **Two agents claim the same kanban issue** | `LockDO` (Durable Object) serializes claim attempts per issue; second agent gets `already_claimed` error and moves on |
| **Touch stamping race** (multiple events arrive for the same user near-simultaneously) | `first_touch_*` writes use `INSERT ... ON CONFLICT (user_id, app_id) DO NOTHING` — first arrival wins. `last_touch_*` writes use `UPDATE` with a `last_touch_at < $new_timestamp` predicate — older events cannot overwrite newer |
| **Tripwire fire while supervisor mid-tick** | Tripwire pause is applied at the *cell* level, not the *tick* level — in-flight tick completes for already-claimed artefacts but no new claims start on a paused cell |
| **DSR erasure mid-send** | Email sequencer checks suppression list as part of the send transaction (read in the same DB tx that records the send); if user was added to suppression between enqueue and send, the send aborts and rolls back |

These rules are spec — implementation lives in [PR 3a (sequencer)](https://github.com/Latimer-Woods-Tech/Factory/pull/810) (now closed; will resurrect) + [PR 3e (supervisor worker)](https://github.com/Latimer-Woods-Tech/Factory/pull/810) + each agent's contract.

### 8.2 Budget check ordering (T3-8)

**Hard rule:** BudgetWatcher's `preflight()` runs **before** any LLM dispatch. Order within a single agent action:

1. `preflight_budget_check(cell, channel, estimated_cost)` — if breach → refuse, mark `escalation:budget-block`, end
2. Voice gate (if generating content) — preloaded brand profile, no LLM call yet
3. LLM dispatch (Anthropic/Grok/Groq chain)
4. Voice gate evaluation on output — possible re-dispatch if minor issues + auto-fix path
5. `record_actual_cost(cell, channel, actual_cost)` — diff vs estimate, alert if >20% under-estimate pattern

The audit found the prior implementation hint (in [`docs/marketing/scenarios/01-happy-path-practitioner.md`](./scenarios/01-happy-path-practitioner.md) Gap F1) suggested the check was happening *after* dispatch in places. That is wrong. **Spend that exceeds the cap should never happen** — the loop refuses; it does not reconcile after.

---

## 9. Cross-references

| Doc / code | Why |
|---|---|
| [`CONSTITUTION.md`](./CONSTITUTION.md) | Rules — esp. [§3 budget caps](./CONSTITUTION.md#3-budget-caps), [§4 tiers](./CONSTITUTION.md#4-approval-tiers), [§5 allowlist](./CONSTITUTION.md#5-channel-allowlist--readiness-gates), [§7 tripwires](./CONSTITUTION.md#7-brand-safety-tripwires), [§10 operator rights](./CONSTITUTION.md#10-operator-escalation-rights) |
| [`ICP_MATRIX.md`](./ICP_MATRIX.md) | Cells the loop operates on; readiness states |
| [`VOICES.md`](./VOICES.md) | Voice keys and the gate's source rules |
| [`MARKETING_PLAN.md`](./MARKETING_PLAN.md) | Canonical index + cadence (§7) + ownership (§8) |
| [`ROADMAP.md`](./ROADMAP.md) | This spec is firepower item #7 |
| [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) *(PR 2 sibling)* | Tier mechanics + digest rules |
| [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) *(PR 2 sibling)* | Numeric per-channel, per-cell, per-portfolio caps |
| [`LIFECYCLE.md`](./LIFECYCLE.md) *(PR 2 sibling)* | Per-ICP funnel stages — input to TopicScout and ExperimentRunner |
| [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) *(PR 2 sibling)* | `(product, icp, channel, surface, campaign_id)` keys emitted to `factory_events` |
| [`ATTRIBUTION.md`](./ATTRIBUTION.md) *(PR 2 sibling)* | How `measured` state is computed |
| [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) *(PR 2 sibling)* | Matrix-signal loop thresholds |
| [`CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md) *(PR 2 sibling)* | Per-cell channel choices ChannelPublisher honours |
| [`pr3-briefs/3e-supervisor-worker.md`](./pr3-briefs/3e-supervisor-worker.md) | Implementation brief for this spec |
| [`pr3-briefs/3m-brand-safety-tripwire.md`](./pr3-briefs/3m-brand-safety-tripwire.md) | TripwireMonitor implementation |
| [`docs/MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md) | The 12 events the loop reads |
| [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) | `CampaignService.generateCampaignScript` + `transitionCampaignStatus` — the voice-gate integration the loop reuses |
| [`packages/schedule/src/index.ts`](../../packages/schedule/src/index.ts) | Existing autonomous loop pattern (video factory) the supervisor mirrors |
| [`packages/validation/`](../../packages/validation/) | `validateAiOutput()` — the voice gate |
| [`apps/supervisor/`](../../apps/supervisor/) | Peer engineering supervisor — same kanban, same patterns |
| [`.github/scripts/supervisor-core.mjs`](../../.github/scripts/supervisor-core.mjs) | Stale-claim release + template-matching code marketing reuses |
| [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) | Org-wide non-negotiables; supersede this doc |
| [`.claude/.../memory/feedback_kanban_canonical.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/feedback_kanban_canonical.md) | GitHub Issues are canonical — no ClickUp |
| [`.claude/.../memory/project_supervisor_architecture.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_supervisor_architecture.md) | Engineering supervisor architecture — this spec mirrors it |

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — initial spec for the autonomous marketing supervisor loop; 10-agent roster; 4-gate sequence; peer to `apps/supervisor/`; mirror of GitHub Issues kanban; ≤3 escalations/day operator digest |
