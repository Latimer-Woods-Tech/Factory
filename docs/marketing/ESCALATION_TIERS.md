# Escalation Tiers

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Owner:** @adrper79-dot · **Implements:** [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers), [`§7`](./CONSTITUTION.md#7-brand-safety-tripwires), [`§10`](./CONSTITUTION.md#10-operator-escalation-rights)

> Operator time is the scarcest resource in the loop. This document specifies, action-by-action, what reaches the operator, how fast, and by which channel. Anything not listed runs Tier 1 by default.

> Conflicts: [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) wins. Operator override per [`CONSTITUTION.md §10`](./CONSTITUTION.md#10-operator-escalation-rights) wins next.

---

## 1. Purpose

The autonomous marketing loop must be cheap-by-default and loud-when-it-matters. Tiers map *cost-of-mistake* to *friction-of-approval*:

- Tier 1 — reversible, narrow blast radius, no money out → no human in the loop.
- Tier 2 — wider blast radius, slow-reversible → FYI + auto-proceed timer.
- Tier 3 — money, partnerships, or brand-safety risk → blocking on operator approval.

The tier of any action is determined by the action *itself*, not by the agent proposing it. The supervisor ([`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md)) enforces tier routing before publication. Tier escalation is one-way: any agent may raise an action's tier; only the operator may lower it.

---

## 2. The three tiers

### Tier 1 — Autonomous

**Definition:** Action is fully reversible within 24h, touches ≤10% of the audience for a single matrix cell, and spends no money beyond the LLM sub-allocation in [`BUDGET_CAPS.md`](./BUDGET_CAPS.md).

**Example actions (≥10):**

1. Publish a single owned-social post (X, LinkedIn personal, Pinterest, Substack) using a registered voice profile.
2. Send one transactional email triggered by a `factory_events` row (welcome, receipt, password reset).
3. Send the next step of an *already-activated* email sequence to an opted-in contact.
4. Generate copy via [`@latimer-woods-tech/copy`](../../packages/copy/) for any artefact, including blog drafts, ad creative drafts, video scripts.
5. Render a video using the [pipeline in `CLAUDE.md`](../../CLAUDE.md) (GitHub Actions `render-video.yml`).
6. Create a draft campaign brief in the kanban backlog.
7. Move a kanban card between non-published columns.
8. Run `validateAiOutput()` and route a failing artefact to the brand-voice escalation queue.
9. Score and prioritise the topic queue ([PR 3g](./pr3-briefs/3g-topic-queue.md)).
10. Refresh a cell's diagnostic KPIs in [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) (read-only).
11. Add a contact to a suppression list because they unsubscribed.
12. Open an issue or draft PR proposing a content fix.

**Notify behavior:** None. Surfaced only in the daily 06:00 Pushover digest summary (counts + north-star number) and in the auto-generated weekly retro ([`playbooks/retros/{date}.md`](./playbooks/)).

**Response SLA:** N/A.

**Override mechanism:** Operator may rollback any Tier-1 action after the fact via the `pause-marketing` CLI (see §7), the supervisor's `revoke` API, or by direct edit of the kanban. Unsend is best-effort where physically possible (email cancelable up to dispatch; social posts deletable; published video disable via Cloudflare Stream `requireSignedURLs` flip).

---

### Tier 2 — Operator FYI

**Definition:** Action is slow-reversible, touches 10–50% of a cell's audience, opens a new surface or sequence, or pertains to an A/B test design.

**Example actions (≥10):**

1. Activate a *new* email sequence (first send of a sequence that has never run).
2. Send a single email to >10% of the full opted-in list for a cell.
3. Post to a channel for the first time for a given cell (e.g. first LinkedIn post for `cypher-practitioner`).
4. Launch a rendered video into a *promotion* slot (cross-posting to LinkedIn + X + YouTube simultaneously).
5. Start an A/B test (declares hypothesis + primary metric + sample size per [`CONSTITUTION.md §8`](./CONSTITUTION.md#8-experimentation-discipline)).
6. Stop an A/B test before its declared minimum duration.
7. Promote a matrix cell from `discovery` → `earned_active` based on the [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) threshold.
8. Register or update a voice profile in [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts) (touches [`VOICES.md`](./VOICES.md)).
9. Add a new lifecycle stage to [`LIFECYCLE.md`](./LIFECYCLE.md) for a cell.
10. Open a new attribution surface (UTM convention change per [`ATTRIBUTION.md`](./ATTRIBUTION.md)).
11. Run the practitioner-branded shareable generator ([PR 3h](./pr3-briefs/3h-shareables.md)) for a new cell.
12. Adjust the topic-queue priority weights ([PR 3g](./pr3-briefs/3g-topic-queue.md)).

**Notify behavior:** Pushover notification with `priority=0` (normal) at action-queued time, plus an entry in the daily 06:00 digest. The Pushover payload contains: action summary, cell key, projected reach, scheduled-proceed timestamp (now + 24h), and a single-link "pause" URL hitting the supervisor's `revoke` endpoint.

**Response SLA:** The operator has 24h to pause. After 24h, the action auto-proceeds. Pushover delivery channel is the same one used by `scripts/cost_digest.py` and the supervisor digest — reuse, not reinvent (per [`docs/runbooks/incident-response-playbook.md`](../runbooks/incident-response-playbook.md) channels).

**Override mechanism:**
- Single-click "pause" link in the Pushover notification calls `POST /marketing/actions/{id}/revoke` on the supervisor Worker (see [PR 3e](./pr3-briefs/3e-supervisor-worker.md)).
- CLI: `pause-marketing action {id}`.
- After-the-fact rollback: same as Tier 1, plus the operator may demote the cell back to `discovery` per [`CONSTITUTION.md §10`](./CONSTITUTION.md#10-operator-escalation-rights).

---

### Tier 3 — Operator approval (blocking)

**Definition:** Action moves money out, touches >50% of a cell's audience in a single send, alters a constitutional surface, or is auto-tagged by a brand-safety tripwire.

**Example actions (≥10):**

1. Any paid ad spend, of any amount, in any network (Google, Meta, LinkedIn, X).
2. Any partnership or co-marketing outreach to a third-party brand or person.
3. Sending an email or DM blast to >50% of any cell's opted-in list.
4. Activating a *new channel* in the org-level allowlist (per [`CONSTITUTION.md §5`](./CONSTITUTION.md#5-channel-allowlist--readiness-gates)).
5. Publishing content that touches a sensitive topic (health claims, financial advice, regulated-vertical disclosure) per [`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance).
6. Promoting a cell from `paid_ready` → `paid_active` (first paid spend on the cell).
7. Anything auto-tagged by a brand-safety tripwire from [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires).
8. Amending [`CONSTITUTION.md`](./CONSTITUTION.md), [`BUDGET_CAPS.md`](./BUDGET_CAPS.md), or [`VOICES.md`](./VOICES.md) (requires ADR in [`docs/decisions/`](../decisions/)).
9. Overriding a hard budget cap from [`BUDGET_CAPS.md`](./BUDGET_CAPS.md).
10. Influencer outreach of any kind (even unpaid mentions request).
11. Adding a new region to the consent + suppression footer set ([`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance)).
12. Reactivating a campaign that was previously paused by a tripwire.

**Notify behavior:** Pushover notification with `priority=1` (high), plus a GitHub Issue opened in the [Factory repo](https://github.com/Latimer-Woods-Tech/Factory) per §3. No auto-proceed. Optional Slack mirror (incident channel parity) configurable per cell.

**Response SLA:** Indefinite wait. The supervisor blocks the action until the approval label is applied. Operator response target: T+24h for routine, T+1h for tripwire-fired Tier-3 (matches P2 detect SLA in [`docs/runbooks/incident-response-playbook.md`](../runbooks/incident-response-playbook.md)).

**Override mechanism:** Only the operator can approve. Sub-agents cannot approve their own Tier-3 requests, nor each other's. Approval is recorded as a comment on the GitHub Issue (see §3) and on the kanban card.

---

## 3. Tier-3 approval queue mechanics

Tier-3 requests live as **GitHub Issues** in the [`Latimer-Woods-Tech/Factory`](https://github.com/Latimer-Woods-Tech/Factory) repo. Rationale: GitHub Issues are the canonical engineering kanban for the org per [`feedback_kanban_canonical.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/feedback_kanban_canonical.md). No ClickUp, no separate queue, no email-based approval.

**Issue template** (auto-generated by the supervisor Worker):

```
Title: [tier-3] {action_kind}: {cell_key} — {one-line summary}
Labels: marketing, tier-3, awaiting-approval, cell/{cell_key}, kind/{action_kind}
Assignees: @adrper79-dot
Body:
  ## Action
  - Cell: {cell_key} (e.g. selfprime-practitioner)
  - Kind: {paid-spend | partnership | mass-send | tripwire | ...}
  - Projected reach / spend: {numbers}
  - Voice profile + gate result: {pass | minor:N}
  - Linked kanban card: {url}

  ## Why now
  {agent rationale, ≤200 words}

  ## Rollback path
  {one-line description of how this is undone if it fails}

  ## To approve
  Comment `/approve` (operator only). Comment `/reject` to close.
```

**Labels used:**

| Label | Meaning |
|---|---|
| `marketing` | Top-level routing |
| `tier-3` | Approval gate active |
| `awaiting-approval` | Removed on `/approve` or `/reject` |
| `approved` | Added on `/approve` |
| `rejected` | Added on `/reject` |
| `cell/{slug}` | Matrix cell key, e.g. `cell/selfprime-practitioner` |
| `kind/{type}` | Action kind, e.g. `kind/paid-spend` |
| `tripwire/{name}` | Present when a tripwire from [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires) opened the issue |

**Timeout behavior:** Tier-3 issues do not auto-proceed. Issues open for >7 days are surfaced in the weekly retro and again in the monthly retro until resolved or closed. Stale `awaiting-approval` issues do not block other work; they accumulate.

**Who can approve:** `@adrper79-dot` only. The supervisor verifies the approving comment's author against the GitHub username and rejects approvals from any other account, including other repo collaborators or bot accounts. This is enforced server-side in the supervisor Worker — a manual `approved` label without the matching `/approve` comment from the operator is ignored.

---

## 4. Tier-2 FYI queue mechanics

Tier-2 actions do *not* open GitHub Issues (would be too noisy). They live in the supervisor Worker's KV-backed queue ([PR 3e](./pr3-briefs/3e-supervisor-worker.md)) and surface via:

- **Pushover** push at queue time (channel: `marketing-fyi`, priority 0).
- **Daily digest** at 06:00 local — counts of Tier-2 actions queued in the last 24h, with the top 5 by projected reach.
- **24h auto-proceed timer** — the supervisor Worker schedules a Cloudflare `scheduled` event at `queued_at + 24h`; on fire, it re-checks the action is still pending and not cancelled, then advances it to publish.
- **Single-click pause URL** in the Pushover body — calls `POST /marketing/actions/{id}/revoke`, which freezes the action and reroutes it to Tier 3 with a `kind/operator-flagged` label.

If a Tier-2 action would happen *during* the 24h window for another Tier-2 action on the same surface (e.g. two new LinkedIn sequences for `selfprime-practitioner` queued within 24h), the second one is held until the first auto-proceeds or is paused — prevents back-to-back surprises.

---

## 5. Tier-1 audit trail

Every Tier-1 action is logged to `factory_events` via [`packages/analytics/src/index.ts`](../../packages/analytics/src/index.ts). Event names follow the existing schema pattern in [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts):

- `marketing.tier1.action_taken` — required: `action_id`, `cell_key`, `action_kind`, `voice_key`, `surface`
- `marketing.tier1.voice_gate_passed` — required: `action_id`, `voice_key`, `severity_minor_count`
- `marketing.tier1.cost_recorded` — required: `action_id`, `provider`, `amount_usd`

**Weekly digest sample** (auto-generated Sunday 18:00 to [`playbooks/retros/{date}.md`](./playbooks/)):

```
## Week of 2026-05-11 — Tier-1 summary

- 412 owned-social posts published (X: 187, LinkedIn: 124, Pinterest: 56, Substack: 45)
- 1,847 transactional + sequence emails sent (open: 38%, click: 6.2%)
- 14 videos rendered + auto-published (avg watch-through: 41%)
- 89 draft briefs created; 12 promoted to Tier-2 queue
- Voice gate: 4,128 artefacts validated, 21 blocked (0.5%), 187 minor flags (4.5%)
- LLM cost: $42.18 (cap $50/day org, marketing sub-allocation: see BUDGET_CAPS.md)
- 0 Tier-1 actions rolled back by operator
```

Audit answers the question in [`CONSTITUTION.md §10`](./CONSTITUTION.md#10-operator-escalation-rights): *"Request a full audit trail of any generated artefact (LLM call log, prompt, output, gate result, who/what/when published)."*

---

## 6. Special escalations

| Trigger | Detection | Tier | Channel | Auto-action | Reactivation |
|---|---|---|---|---|---|
| Tripwire fires ([`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires)) | [`packages/validation/`](../../packages/validation/) extensions ([PR 3m](./pr3-briefs/3m-brand-safety-tripwire.md)) | 3 | Pushover high + GitHub Issue + Slack incident-mirror | Pause cell publication; new actions for cell queued behind approval | Operator `/approve` on issue + write postmortem |
| Brand-voice failure rate spike | >5% blocks in 24h per [`§7`](./CONSTITUTION.md#7-brand-safety-tripwires) | 3 | Pushover high + GitHub Issue tagged `tripwire/brand-voice` | Pause publication for affected voice key; topic queue keeps generating but holds | Operator amends voice rules in [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) + `/approve` |
| LLM cost spike | >2× budget allocation per [`§7`](./CONSTITUTION.md#7-brand-safety-tripwires); reuses `anthropic_over_cap` warning from [G8](../GAP_REGISTER.md) | 3 | Pushover high + GitHub Issue tagged `tripwire/llm-cost` | Pause generation org-wide for the marketing sub-allocation; transactional + tier-1 retry-from-cache only | Operator confirms loop is healthy; cost digest returns to baseline; `/approve` |
| Conversion crash | conversion drops >50% in 24h per [`§7`](./CONSTITUTION.md#7-brand-safety-tripwires); detected from PostHog funnel + `factory_events` cohort | 3 | Pushover high + GitHub Issue tagged `tripwire/conversion` | Pause new acquisition pushes; in-flight sequences continue | Operator diagnoses funnel; `/approve` after fix or after declared "not a regression" |
| Spam complaint / unsubscribe spike | >0.1% complaint OR >2× rolling-14d unsubscribe per [`§7`](./CONSTITUTION.md#7-brand-safety-tripwires) | 3 | Pushover high + GitHub Issue tagged `tripwire/list-health` | Pause the implicated sequence; add affected contacts to suppression | Operator `/approve` after content review |
| Negative mention surge | >3σ negative-sentiment mentions in 24h | 3 | Pushover high + GitHub Issue tagged `tripwire/mentions` | Pause all proactive social posting for the cell; replies still allowed | Operator `/approve` after the mention cluster is triaged |

Tripwire thresholds and handlers are codified in [`packages/validation/`](../../packages/validation/) per [PR 3m brief](./pr3-briefs/3m-brand-safety-tripwire.md). The thresholds in this doc are the authoritative source; code is the implementation.

---

## 7. Operator pause-everything command

The operator's nuclear option per [`CONSTITUTION.md §10`](./CONSTITUTION.md#10-operator-escalation-rights):

```
pause-marketing all                       # pause everything
pause-marketing cell {cell_key}           # pause one cell
pause-marketing action {action_id}        # revoke one queued action
pause-marketing surface {surface_key}     # pause one surface (e.g. linkedin)
```

**What it does:**

- Sets a `marketing_paused` flag in the supervisor Worker's KV namespace, scoped to the level invoked (all / cell / surface / single action).
- Cancels all in-flight Tier-2 timers within scope.
- Closes all `awaiting-approval` Tier-3 issues within scope with comment `paused by operator` (does not delete; can be reopened).
- Drains the topic-queue dispatcher for the scope (new generations halt; in-flight finish and are held, not published).

**What it preserves:**

- All `factory_events` history (audit trail intact).
- All drafted artefacts (returnable to queue on recovery).
- All A/B test assignment records (no contamination on reactivation).
- Transactional email (receipts, password resets, unsubscribe confirmations) — these are NOT paused; per [`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance) they must continue.
- Consent + suppression list (always honoured).

**Recovery:**

```
resume-marketing all                      # un-pause everything
resume-marketing cell {cell_key}
```

On resume, the supervisor re-evaluates every held action against current caps and tripwire state before publishing. Held Tier-2 actions get a fresh 24h auto-proceed timer. Held Tier-3 issues reopen with label `previously-paused`. The recovery action is itself a Tier-3 action if pause was triggered by a tripwire (forces the operator to acknowledge the postmortem first).

CLI wraps a `POST` on the supervisor Worker at `https://api.marketing.{branded-domain}/pause` (never a `.workers.dev` URL — per [`CLAUDE.md`](../../CLAUDE.md) Hard Constraints).

---

## 8. Cross-references

| Doc / code | Why |
|---|---|
| [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers) | The three tiers (this doc is the spec) |
| [`CONSTITUTION.md §7`](./CONSTITUTION.md#7-brand-safety-tripwires) | Tripwire definitions |
| [`CONSTITUTION.md §10`](./CONSTITUTION.md#10-operator-escalation-rights) | Operator rights this doc operationalises |
| [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) | The cap that escalates to Tier 3 on breach |
| [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) | The loop that routes by tier |
| [`MARKETING_PLAN.md §8`](./MARKETING_PLAN.md#8-who-owns-what) | Ownership table — escalation channels per function |
| [`pr3-briefs/3e-supervisor-worker.md`](./pr3-briefs/3e-supervisor-worker.md) | Supervisor Worker implementation |
| [`pr3-briefs/3m-brand-safety-tripwire.md`](./pr3-briefs/3m-brand-safety-tripwire.md) | Tripwire implementation |
| [`docs/runbooks/incident-response-playbook.md`](../runbooks/incident-response-playbook.md) | Pushover + Slack channel reuse |
| [`docs/MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md) Part 6 | Alert triggers feed conversion-crash tripwire |
| [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts) | Tier-1 audit-event schemas |
| [`packages/validation/`](../../packages/validation/) | Voice gate + tripwire implementation |
| [`feedback_kanban_canonical.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/feedback_kanban_canonical.md) | GitHub Issues are the queue; no ClickUp |

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — three-tier spec, queue mechanics, special escalations, pause command |
