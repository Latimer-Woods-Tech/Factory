# PR 3a — Real Drip Sequencer in `@lwt/email`

**Status:** Drafted · **Depends on:** PR 1 (CONSTITUTION, ICP_MATRIX), PR 2 (LIFECYCLE, CAMPAIGN_TAGGING)
**Owner package:** `@latimer-woods-tech/email` · **Effort:** 3 days
**Branch:** `marketing/3a-email-drip` · **Bottleneck:** YES — blocks 3e, 3h

## 1. Goal

Replace today's fake `enrollDrip` (single send tagged with sequence name; see [`packages/email/src/index.ts`](../../../packages/email/src/index.ts) lines 129–146) with a real multi-step sequencer that:

- Holds per-user state across days/weeks
- Fires step transitions on cron OR on event-driven triggers (per [`LIFECYCLE.md §4`](../LIFECYCLE.md#4-drip-sequences-per-stage-transition))
- Honors suppression list (per [`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance))
- Carries the [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) 5-tuple on every send
- Passes [`CONSTITUTION.md §2`](../CONSTITUTION.md#2-brand-voice-gate) brand-voice gate

## 2. Non-goals

- ❌ Visual sequence builder (operator edits sequence JSON; UI defer)
- ❌ A/B testing within sequences (orthogonal; PR 3e handles experiments)
- ❌ Migration of existing tagged single-sends — they continue to work via deprecation shim
- ❌ Multi-language sends (English only)
- ❌ Per-user send-time optimization (defer; v1 fires at cron tick)

## 3. Dependencies

Files the executor MUST read:

- [`packages/email/src/index.ts`](../../../packages/email/src/index.ts) — current EmailClient
- [`packages/neon/src/index.ts`](../../../packages/neon/src/index.ts) — DB types, `withTenant`
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — outreach pattern; consent gates
- [`packages/validation/`](../../../packages/validation/) — voice gate API
- [`CLAUDE.md`](../../../CLAUDE.md) — hard constraints (especially: Workers runtime, no Node built-ins, no `process.env`, ESM only)
- [`LIFECYCLE.md §4`](../LIFECYCLE.md#4-drip-sequences-per-stage-transition) — sequence definitions
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) — tag propagation rules

## 4. Migrations

```sql
-- 001_drip_state.sql
CREATE TABLE IF NOT EXISTS email_drip_state (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  email            TEXT NOT NULL,
  sequence_name    TEXT NOT NULL,
  step_index       INTEGER NOT NULL DEFAULT 0,
  next_send_at     TIMESTAMPTZ NOT NULL,
  state            TEXT NOT NULL DEFAULT 'active'
                     CHECK (state IN ('active', 'paused', 'completed', 'cancelled')),
  cell_key         TEXT NOT NULL,
  campaign_id      TEXT NOT NULL,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id, sequence_name)
);

CREATE INDEX idx_drip_next_send ON email_drip_state (state, next_send_at)
  WHERE state = 'active';

CREATE INDEX idx_drip_tenant_user ON email_drip_state (tenant_id, user_id);

-- RLS for tenant isolation per PLATFORM_STANDARDS §2
ALTER TABLE email_drip_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY drip_tenant_isolation ON email_drip_state
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- ROLLBACK:
-- DROP POLICY drip_tenant_isolation ON email_drip_state;
-- ALTER TABLE email_drip_state DISABLE ROW LEVEL SECURITY;
-- DROP INDEX idx_drip_tenant_user;
-- DROP INDEX idx_drip_next_send;
-- DROP TABLE email_drip_state;
```

```sql
-- 002_email_suppression.sql (extends Resend tagging with a queryable suppression list)
CREATE TABLE IF NOT EXISTS email_suppression (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  email            TEXT NOT NULL,
  reason           TEXT NOT NULL
                     CHECK (reason IN ('unsubscribed', 'bounced', 'spam_complaint', 'invalid')),
  suppressed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_suppression_lookup ON email_suppression (tenant_id, email);

ALTER TABLE email_suppression ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppression_tenant_isolation ON email_suppression
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- ROLLBACK:
-- DROP POLICY suppression_tenant_isolation ON email_suppression;
-- ALTER TABLE email_suppression DISABLE ROW LEVEL SECURITY;
-- DROP INDEX idx_suppression_lookup;
-- DROP TABLE email_suppression;
```

## 5. API shape

```ts
// packages/email/src/sequencer.ts

/** A single step in a drip sequence. */
export interface DripStep {
  /** 0-indexed step number; must be sequential per sequence. */
  step: number;
  /** Delay from previous step (or enrollment if step=0). Min 0, max 90 days. */
  delayDays: number;
  /** Subject line — can be a template string with `{{var}}` placeholders. */
  subject: string;
  /** HTML body — same templating. */
  html: string;
  /** Optional plaintext fallback. */
  text?: string;
  /** Voice profile key per VOICES.md (e.g. `prime_self:practitioner`). */
  voiceKey: string;
  /** Optional event filter — only send if user has fired this event since enrollment. */
  requireEvent?: string;
  /** Optional event filter — skip if user has fired this event. */
  skipIfEvent?: string;
}

/** A named drip sequence definition (config-as-code). */
export interface DripSequence {
  name: string;
  cellKey: string;
  campaignId: string;
  steps: DripStep[];
}

/** Enrollment input. */
export interface EnrollOpts {
  tenantId: string;
  userId: string;
  email: string;
  sequenceName: string;
  metadata?: Record<string, unknown>;
}

/** Cron-driven step advancement. Idempotent. */
export async function tickDripSequences(
  db: FactoryDb,
  email: EmailClient,
  now: Date,
): Promise<{ sent: number; suppressed: number; failed: number }>;

/** Enroll a user; sends step 0 immediately if delayDays=0. */
export async function enrollInSequence(
  db: FactoryDb,
  email: EmailClient,
  opts: EnrollOpts,
): Promise<{ enrolled: boolean; reason?: 'already_enrolled' | 'suppressed' | 'consent_missing' }>;

/** Pause without unsubscribing. */
export async function pauseSequence(
  db: FactoryDb,
  tenantId: string,
  userId: string,
  sequenceName: string,
): Promise<void>;

/** Add to suppression list; any active sequences cancel. */
export async function suppress(
  db: FactoryDb,
  tenantId: string,
  email: string,
  reason: 'unsubscribed' | 'bounced' | 'spam_complaint' | 'invalid',
): Promise<void>;

/** Check before sending — returns true if email is suppressed. */
export async function isSuppressed(
  db: FactoryDb,
  tenantId: string,
  email: string,
): Promise<boolean>;

/** Load a sequence config by name. Reads from `docs/marketing/sequences/{name}.yaml`
 * (bundled at build time) or DB override. */
export function getSequence(name: string): DripSequence;
```

Sequence configs live at `docs/marketing/sequences/{name}.yaml` — checked in, reviewable. The package bundles them at build time.

## 6. Test plan

- **Unit tests** (Vitest, 90%+ coverage):
  - `enrollInSequence` happy path
  - Already-enrolled returns `already_enrolled` (idempotent)
  - Suppressed email returns `suppressed`
  - No consent returns `consent_missing`
  - `tickDripSequences` advances exactly due rows, no overruns
  - `tickDripSequences` skips suppressed mid-sequence
  - `pauseSequence` halts future ticks; resume re-sets `next_send_at`
  - `suppress` cancels all active sequences for that email
  - Voice-gate blocking is honored (rejected sends don't advance step counter)
  - Tenant isolation: another tenant's data is invisible
- **Integration tests** (`@cloudflare/vitest-pool-workers`):
  - End-to-end enroll → tick → tick → tick advancing through a 3-step sequence
  - Resend API mocked; verify tags + metadata propagation
- **DB tests:** RLS works (other tenant insert/select fails)

## 7. Verification

After deploy to staging:

```bash
# Enroll a test user (via marketing-supervisor or curl)
curl -X POST https://marketing-supervisor.adrper79.workers.dev/sequencer/enroll \
  -H "Authorization: Bearer $WORKER_API_TOKEN" \
  -d '{"tenantId":"test","userId":"u1","email":"test@example.com","sequenceName":"practitioner_welcome_v1"}'

# Verify step 0 sent immediately (Resend dashboard or logs)

# Force advance (test endpoint)
curl -X POST https://marketing-supervisor.adrper79.workers.dev/sequencer/tick-now

# Verify step 1 sent

# Unsubscribe
curl -X POST https://marketing-supervisor.adrper79.workers.dev/sequencer/unsubscribe \
  -d '{"tenantId":"test","email":"test@example.com"}'

# Force advance again
curl -X POST https://marketing-supervisor.adrper79.workers.dev/sequencer/tick-now

# Verify NO send (suppression honored)
```

Expected `/health` endpoint on the package's consumer worker: returns 200 with `{ "sequencer": "ok", "lastTickAt": "2026-..." }`.

## 8. Acceptance criteria

- [ ] DDL migrations land + idempotent
- [ ] RLS policies verified (cross-tenant access blocked)
- [ ] `tickDripSequences` is idempotent (running it twice with no new due rows is a no-op)
- [ ] Voice gate failures don't advance step counter (rejected send → step retains)
- [ ] Suppression list honored at enrollment AND at every step
- [ ] Resend tags carry CAMPAIGN_TAGGING 5-tuple
- [ ] Test coverage ≥90% lines, ≥85% branches
- [ ] Zero `any` in public API; zero `console.*` (per PLATFORM_STANDARDS §2)
- [ ] Verification curl sequence above succeeds end-to-end in staging
- [ ] `email_drip_state` queryable in admin-studio for operator visibility
- [ ] CHANGELOG.md updated; semver bumped (minor — additive API)
- [ ] 6 initial sequence configs committed: practitioner_welcome_v1, practitioner_paid_welcome_v1, practitioner_winback_v1, consumer_welcome_v1, consumer_paid_welcome_v1, cypher_practitioner_welcome_v1

## 9. File list

```
packages/email/
  src/
    index.ts                     # extend EmailClient with sequencer hooks
    sequencer.ts                 # NEW — DripSequence, enrollInSequence, tickDripSequences
    suppression.ts               # NEW — suppress, isSuppressed
    sequences.ts                 # NEW — getSequence loader
  test/
    sequencer.test.ts            # NEW
    suppression.test.ts          # NEW
    sequencer.integration.test.ts # NEW
  migrations/
    001_drip_state.sql           # NEW
    002_email_suppression.sql    # NEW

docs/marketing/sequences/
  practitioner_welcome_v1.yaml   # NEW
  practitioner_paid_welcome_v1.yaml
  practitioner_winback_v1.yaml
  consumer_welcome_v1.yaml
  consumer_paid_welcome_v1.yaml
  cypher_practitioner_welcome_v1.yaml
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Race condition on `tickDripSequences` from multiple workers | Use `SELECT ... FOR UPDATE SKIP LOCKED` on the due rows |
| Voice profile not yet registered for a sequence's `voiceKey` | Block at enrollment; surface to escalation queue per [`ESCALATION_TIERS.md`](../ESCALATION_TIERS.md) |
| Resend API rate limit (10 req/sec free tier) | Built-in rate limiter; queue + retry per `withRetry` from [`@lwt/errors`](../../../packages/errors/) |
| Suppression race (user unsubscribes between tick and send) | Double-check in send path; transactional with `email_drip_state` update |
| Sequence config bug → mass-spam | Voice gate + per-cell daily send cap per [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) |

## 11. Cross-references

- [`CONSTITUTION.md`](../CONSTITUTION.md) — §2 voice gate, §6 consent, §4 tier-2 sequence activation
- [`LIFECYCLE.md §4`](../LIFECYCLE.md#4-drip-sequences-per-stage-transition) — sequence definitions
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) — 5-tuple
- [`VOICES.md`](../VOICES.md) — voice key lookup
- [`BUDGET_CAPS.md`](../BUDGET_CAPS.md) — daily send caps
- [`packages/email/src/index.ts`](../../../packages/email/src/index.ts) — current state
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — pattern for tenant-scoped DB
- [`CLAUDE.md`](../../../CLAUDE.md) — hard constraints + verification requirement
