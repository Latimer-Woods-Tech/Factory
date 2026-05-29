# PR 3m — Brand-Safety Tripwire

**Status:** Drafted · **Depends on:** 3c (voice-gate data), 3e (supervisor worker as the runner)
**Owner package(s):** `@latimer-woods-tech/validation` (extension), `apps/marketing-supervisor` (runner)
**Effort:** 2 days
**Branch:** `marketing/3m-brand-safety-tripwire`

## 1. Goal

Implement the **7 tripwires** from [`CONSTITUTION.md §7`](../CONSTITUTION.md#7-brand-safety-tripwires). Each auto-pauses publication for the affected scope (cell or voice key) when fired and opens a **Tier-3 GitHub Issue** per [`ESCALATION_TIERS.md §3`](../ESCALATION_TIERS.md#3-tier-3-approval-queue-mechanics) + [`§6`](../ESCALATION_TIERS.md#6-special-escalations). Some tripwires auto-recover when their signal returns to baseline; the rest require operator `/approve` to resume. Extends [`@lwt/validation`](../../../packages/validation/) with a `tripwires/` module; the runner is the supervisor Worker from [PR 3e](./3e-supervisor-worker.md).

## 2. Non-goals

- ❌ New tripwires beyond the 7 in [`CONSTITUTION.md §7`](../CONSTITUTION.md#7-brand-safety-tripwires) (amendment = ADR)
- ❌ ML-based anomaly detection — deterministic thresholds vs rolling baselines
- ❌ Replacing `validateAiOutput` per-artefact gate (this is the aggregate-drift layer)
- ❌ Per-platform mention API integration beyond LLM classifier (uses [`@lwt/social`](../../../packages/social/) feeds)
- ❌ Auto-rollback of published artefacts — tripwires pause forward publication only
- ❌ Operator UI — escalations live in GitHub Issues per [`ESCALATION_TIERS.md §3`](../ESCALATION_TIERS.md#3-tier-3-approval-queue-mechanics)

## 3. Dependencies

Files the executor MUST read:

- [`packages/validation/src/index.ts`](../../../packages/validation/src/index.ts) — `validateAiOutput`, severity model
- [`packages/email/src/index.ts`](../../../packages/email/src/index.ts) — `email_drip_state` (PR 3a) read by unsubscribe monitor
- [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts) — `factory_events` cost + conversion rollups
- [`packages/llm/src/index.ts`](../../../packages/llm/src/index.ts) — `complete({ tier:'fast' })` for sentiment classification
- [`CONSTITUTION.md §7`](../CONSTITUTION.md#7-brand-safety-tripwires) — the 7 tripwires; THIS PR IMPLEMENTS THEM
- [`VOICES.md §5`](../VOICES.md#5-voice-drift-detection) — drift detection spec
- [`ESCALATION_TIERS.md §3`](../ESCALATION_TIERS.md#3-tier-3-approval-queue-mechanics) + [`§6`](../ESCALATION_TIERS.md#6-special-escalations) — issue template + per-tripwire routing
- [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) · [`CLAUDE.md`](../../../CLAUDE.md)

## 4. Migrations

```sql
-- 001_tripwire_state.sql
CREATE TABLE IF NOT EXISTS tripwire_state (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          TEXT NOT NULL DEFAULT 'lwt-internal',
  cell_key           TEXT NOT NULL,
  tripwire_name      TEXT NOT NULL
                       CHECK (tripwire_name IN (
                         'unsubscribe_spike',
                         'spam_complaint',
                         'reply_sentiment',
                         'mention_surge',
                         'llm_cost_spike',
                         'conversion_crash',
                         'voice_failure_rate'
                       )),
  state              TEXT NOT NULL
                       CHECK (state IN ('clear', 'fired', 'resolved')),
  value              NUMERIC NOT NULL,             -- current observed value
  threshold          NUMERIC NOT NULL,             -- threshold at time of fire
  baseline           NUMERIC,                      -- rolling baseline at fire (if applicable)
  fired_at           TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  resolution_mode    TEXT
                       CHECK (resolution_mode IS NULL OR resolution_mode IN ('auto', 'operator')),
  escalation_issue   TEXT,                         -- GitHub issue URL when fired
  details            JSONB NOT NULL DEFAULT '{}',  -- evidence: examples, links, ids
  evaluated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, cell_key, tripwire_name)
);

CREATE INDEX idx_tripwire_fired ON tripwire_state (state, fired_at DESC)
  WHERE state = 'fired';
CREATE INDEX idx_tripwire_cell ON tripwire_state (cell_key, tripwire_name);

ALTER TABLE tripwire_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY tripwire_tenant_isolation ON tripwire_state
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- ROLLBACK:
-- DROP POLICY tripwire_tenant_isolation ON tripwire_state;
-- ALTER TABLE tripwire_state DISABLE ROW LEVEL SECURITY;
-- DROP INDEX idx_tripwire_cell;
-- DROP INDEX idx_tripwire_fired;
-- DROP TABLE tripwire_state;
```

## 5. API shape

```ts
// packages/validation/src/tripwires/types.ts

export type TripwireName =
  | 'unsubscribe_spike' | 'spam_complaint' | 'reply_sentiment' | 'mention_surge'
  | 'llm_cost_spike' | 'conversion_crash' | 'voice_failure_rate';

export type TripwireRecovery = 'auto' | 'operator';

export interface TripwireDefinition {
  name: TripwireName;
  /** Constitution-mandated threshold, e.g. '>2× rolling 14-day median'. */
  thresholdDescription: string;
  recovery: TripwireRecovery;
  pauseScope: 'cell' | 'voice_key';
}

export interface TripwireEvaluation {
  name: TripwireName;
  cellKey: string;
  value: number;
  threshold: number;
  baseline?: number;
  fired: boolean;
  details: Record<string, unknown>;
}

export interface TripwireReport {
  evaluatedAt: Date;
  evaluations: TripwireEvaluation[];
  newlyFired: TripwireEvaluation[];
  autoResolved: TripwireEvaluation[];
}
```

```ts
// packages/validation/src/tripwires/index.ts

/** Constitution-mandated definitions; immutable. */
export const TRIPWIRE_DEFINITIONS: Record<TripwireName, TripwireDefinition>;

/** Run all 7 monitors for a window. Idempotent; called by supervisor cron every hour. */
export async function evaluateTripwires(
  db: FactoryDb,
  env: TripwireEnv,
  period: { start: Date; end: Date },
): Promise<TripwireReport>;

/** Pauses the affected scope, writes `tripwire_state` row, opens GitHub issue. */
export async function pauseCellOnTripwire(
  db: FactoryDb,
  env: TripwireEnv,
  cellKey: string,
  tripwire: TripwireName,
  reason: { value: number; threshold: number; details: Record<string, unknown> },
): Promise<{ issueUrl: string; pauseScope: 'cell' | 'voice_key' }>;

/** Operator-driven resume. Verifies operator identity (GitHub username) per
 *  ESCALATION_TIERS §3 enforcement. */
export async function resumeCellAfterReview(
  db: FactoryDb,
  env: TripwireEnv,
  cellKey: string,
  tripwire: TripwireName,
  operatorDecision: { operator: string; comment: string; issueUrl: string },
): Promise<void>;

/** Auto-clear path for the 3 auto-recoverable tripwires (see §6 of this brief). */
export async function autoResolveIfBelowThreshold(
  db: FactoryDb,
  cellKey: string,
  tripwire: TripwireName,
  currentValue: number,
): Promise<boolean>;
```

```ts
// packages/validation/src/tripwires/env.ts
export interface TripwireEnv {
  DB: Hyperdrive;
  AI_GATEWAY_BASE_URL: string;
  ANTHROPIC_API_KEY: string;
  GROQ_API_KEY: string;
  GITHUB_TOKEN: string;            // fine-grained PAT, repo scope
  GITHUB_REPO: string;             // "Latimer-Woods-Tech/Factory"
  PUSHOVER_USER_KEY: string;
  PUSHOVER_APP_TOKEN: string;
  RESEND_WEBHOOK_SECRET: string;   // for unsubscribe + complaint ingestion
}
```

Each monitor in `packages/validation/src/tripwires/monitors/` exports a uniform `evaluate(db, env, cellKey, period) → Promise<TripwireEvaluation>`.

| File | Reads | Threshold |
|---|---|---|
| `unsubscribe-spike.ts` | `email_drip_state` + Resend `email.unsubscribed` in `factory_events` | >2× rolling 14-day median per sequence |
| `spam-complaint.ts` | Resend `email.complained` events | >0.1% of sends in 24h |
| `reply-sentiment.ts` | CRM inbound replies; sentiment via `@lwt/llm` `tier:'fast'` | NPS-equivalent drops >20pts WoW |
| `mention-surge.ts` | `social_mentions` (X/LinkedIn/Reddit/Mastodon via [`@lwt/social`](../../../packages/social/)); LLM-classified sentiment | Negative count >3σ above rolling 7-day mean |
| `llm-cost-spike.ts` | `marketing.tier1.cost_recorded` rolled per cell+day | >2× per-cell `llm` cap in [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) |
| `conversion-crash.ts` | `factory_events` funnel rollups per campaign+day | Live-campaign conversion drops >50% in 24h vs 7-day baseline |
| `voice-failure-rate.ts` | `marketing.tier1.voice_gate_passed` + block events per voice key+day | `blocked / (blocked + passed)` >5% in 24h ([`CONSTITUTION.md §7`](../CONSTITUTION.md#7-brand-safety-tripwires), [`VOICES.md §5`](../VOICES.md#5-voice-drift-detection)) |

## 6. Recovery model — auto vs operator

Mapped from the 7 tripwires in [`CONSTITUTION.md §7`](../CONSTITUTION.md#7-brand-safety-tripwires):

| # | Tripwire | Recovery | Why |
|---|---|---|---|
| 1 | `unsubscribe_spike` | **operator** | Spike implies bad content / wrong list — human eyes must read the content before resume |
| 2 | `spam_complaint` | **operator** | Complaints are reputational + provider-account risk; resume requires content review |
| 3 | `reply_sentiment` | **operator** | Voice mis-fire; requires voice-rules update, not waiting |
| 4 | `mention_surge` | **operator** | Crisis comms posture; never auto-resume |
| 5 | `llm_cost_spike` | **auto** | Mechanical; once daily spend drops back below `1.5× cap` for a clean 24h window, auto-clear (still logs a `marketing.tripwire.auto_resolved` event) |
| 6 | `conversion_crash` | **auto** | If conversion rate recovers within 50% of baseline for 48h continuously, auto-clear; if not, stays fired until operator triages |
| 7 | `voice_failure_rate` | **auto** | If rolling 24h failure rate drops below `3%` (hysteresis under the 5% trigger), auto-clear; voice rules may have stabilised after a recent change |

Hysteresis rule (applies to all auto-recovering tripwires): the clear-threshold is materially below the fire-threshold so a value oscillating around the trigger does not flap. Auto-resolution still writes a `tripwire_state` row with `resolution_mode='auto'` and `resolved_at` set; the original GitHub issue is closed with a system comment `auto-resolved` (NOT deleted — full audit trail per [`CONSTITUTION.md §10`](../CONSTITUTION.md#10-operator-escalation-rights)).

Operator-only recoveries require `/approve` from `@adrper79-dot` on the open GitHub issue (verified server-side per [`ESCALATION_TIERS.md §3`](../ESCALATION_TIERS.md#3-tier-3-approval-queue-mechanics)); approvals from any other account are ignored.

## 7. Verification

```bash
pnpm --filter @lwt/neon migrate

# Supervisor worker hosts the runner endpoint per PR 3e
curl https://marketing-supervisor.adrper79.workers.dev/tripwires/health
# Expect: 200 {"status":"ok","lastEvaluatedAt":"...","fired":0,"clear":7}

# Force-evaluate (admin auth)
curl -X POST .../tripwires/evaluate -H "Authorization: Bearer $WORKER_API_TOKEN" \
  -d '{"cellKey":"selfprime-practitioner"}'
# Expect: 200 with TripwireReport (7 evaluations)

# Simulate cost spike (staging-only endpoint)
curl -X POST .../tripwires/simulate -H "Authorization: Bearer $WORKER_API_TOKEN" \
  -d '{"cellKey":"selfprime-practitioner","tripwire":"llm_cost_spike","value":12.00}'
# Expect: tripwire fires; GitHub issue created; pause flag set

curl .../cells/selfprime-practitioner/state
# Expect: {"paused":true,"reason":"tripwire/llm_cost_spike","issueUrl":"..."}

# Auto-recovery: simulate value drop back; with ?forceClear=true in test
curl -X POST .../tripwires/simulate \
  -d '{"cellKey":"selfprime-practitioner","tripwire":"llm_cost_spike","value":2.50}'

# Operator-only recovery: GH /approve as @adrper79-dot triggers resume webhook
curl .../cells/selfprime-practitioner/state
# Expect: {"paused":false}
```

## 8. Acceptance criteria

- [ ] Migration applies + idempotent; RLS verified
- [ ] All 7 monitors implemented + callable through `evaluateTripwires()`; thresholds match [`CONSTITUTION.md §7`](../CONSTITUTION.md#7-brand-safety-tripwires) (assertion test catches drift)
- [ ] `pauseCellOnTripwire` opens a Tier-3 GitHub Issue with labels `marketing`, `tier-3`, `awaiting-approval`, `cell/{slug}`, `tripwire/{name}` matching [`ESCALATION_TIERS.md §3`](../ESCALATION_TIERS.md#3-tier-3-approval-queue-mechanics) template
- [ ] Pause flag honoured by supervisor publish path; publication for affected scope blocks until resume
- [ ] Auto-recovery for `llm_cost_spike`, `conversion_crash`, `voice_failure_rate` works with hysteresis (no flapping in tests)
- [ ] Operator-only recovery for `unsubscribe_spike`, `spam_complaint`, `reply_sentiment`, `mention_surge` requires verified `/approve` from `@adrper79-dot`; bot-account approvals rejected server-side
- [ ] `mention-surge` + `reply-sentiment` LLM calls use `tier:'fast'` (Haiku)
- [ ] Voice-gate failure rate aggregation matches [`VOICES.md §5`](../VOICES.md#5-voice-drift-detection)
- [ ] Test coverage ≥90% lines, ≥85% branches; zero `any`; no `console.*`; no `process.env`
- [ ] CHANGELOG.md updated in `@lwt/validation`; minor version bump
- [ ] `/tripwires/health` returns 200 via `curl` in staging (per [`CLAUDE.md`](../../../CLAUDE.md) Verification Requirement)

## 9. File list

```
packages/validation/
  src/
    index.ts                              # re-export tripwires/* surface
    tripwires/
      index.ts                            # evaluateTripwires, pauseCellOnTripwire, resumeCellAfterReview
      definitions.ts                      # TRIPWIRE_DEFINITIONS constant
      types.ts · env.ts
      github-issue.ts                     # issue creation + close
      pushover.ts                         # high-priority push
      monitors/{unsubscribe-spike,spam-complaint,reply-sentiment,mention-surge,llm-cost-spike,conversion-crash,voice-failure-rate}.ts
      auto-resolve.ts                     # hysteresis + auto-clear
  test/
    tripwires/{evaluate,auto-resolve,github-issue}.test.ts
    tripwires/monitors/{one .test.ts per monitor}        # × 7
  migrations/003_tripwire_state.sql

apps/marketing-supervisor/
  src/routes/tripwires.ts                 # /tripwires/health, /evaluate, /simulate (test-only)
  src/routes/cells.ts                     # extend — /cells/:key/state honours pause flag
  src/cron/tripwire-tick.ts               # hourly evaluateTripwires() invocation
  wrangler.jsonc                          # extend — GITHUB_TOKEN, PUSHOVER_* bindings, cron trigger
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| False positive on low-volume sequence | Floor: ≥50 sends OR ≥3 mentions before rate is computed; below floor → `fired:false`, `details.below_floor:true` |
| LLM sentiment classifier biased | `tier:'fast'` Haiku; borderline (-0.2 to +0.2) cross-checked with `'balanced'`; disagreement → weekly retro |
| GitHub API rate-limit during storm | Coalesce: one issue per (cell, tripwire); same key updates existing issue rather than spawning new ones |
| Auto-recovery clears prematurely | `marketing.tripwire.auto_resolved` logged; weekly retro reviews; pattern → move to operator-recovery via ADR |
| Operator pause interacts with tripwire pause | Pause flag is union: cell paused if {operator OR tripwire} set; resume requires clearing both sources |
| Spam-complaint fires on single complaint | Floor ≥3 complaints OR ≥1000 sends in 24h before rate computed |
| `conversion_crash` on weekend dip | Trailing 7-day rolling baseline; weekend variance smooths out |
| GitHub PAT rotation breaks issue creation | Token via GCP Secret Manager + WIF (zero-downtime); see `reference_gcp_secret_manager_wiring.md` |
| Mention-surge depends on social listener not yet shipped | Monitor no-ops if `social_mentions` empty (`details.no_data:true`); no false positives during PR 3f rollout |

## 11. Cross-references

- [`CONSTITUTION.md §7`](../CONSTITUTION.md#7-brand-safety-tripwires) — the 7 tripwires this PR implements
- [`VOICES.md §5`](../VOICES.md#5-voice-drift-detection) — drift-detection spec → `voice-failure-rate.ts`
- [`ESCALATION_TIERS.md §3`](../ESCALATION_TIERS.md#3-tier-3-approval-queue-mechanics) + [`§6`](../ESCALATION_TIERS.md#6-special-escalations) — issue template, labels, per-tripwire routing
- [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) — per-cell `llm` cap drives `llm-cost-spike`
- [PR 3a](./3a-email-drip.md) — `email_drip_state` + suppression (unsubscribe + complaint monitors)
- [PR 3c](./3c-voice-matrix.md) — voice keys + gate signal for `voice-failure-rate`
- [PR 3e](./3e-supervisor-worker.md) — host for cron + `/tripwires/*` endpoints
- [`packages/validation/`](../../../packages/validation/) · [`packages/llm/`](../../../packages/llm/) · [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts) — extended with `marketing.tripwire.*` events; see also [`docs/runbooks/incident-response-playbook.md`](../../runbooks/incident-response-playbook.md), [`CLAUDE.md`](../../../CLAUDE.md)
