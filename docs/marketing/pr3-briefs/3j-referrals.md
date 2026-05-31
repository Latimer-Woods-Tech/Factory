# PR 3j — Referral Compounding (`@lwt/referrals`)

**Status:** Drafted · **Depends on:** 3b (cell + attribution columns on `crm_leads`)
**Owner package:** `@latimer-woods-tech/referrals` (NEW) · **Effort:** 3 days
**Branch:** `marketing/3j-referrals` · **Bottleneck:** NO

## 1. Goal

Build the peer-referral compounding mechanism from [`selfprime-practitioner.md §5`](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific): each practitioner (and consumer) gets a unique referral code; both referrer and referred get 3 months free on a paid plan; referrer earns 20% commission on net referred MRR for 12 months, paid via Stripe transfer.

This is the *flywheel mechanism* for the practitioner cell — "each paying practitioner = one new distribution node." It is cell-aware: the package records the cell of the referrer and the cell of the referred, so cross-cell flows (practitioner refers a consumer; consumer refers a practitioner) are visible to the loop.

## 2. Non-goals

- ❌ Multi-tier referrals (referrer A → B → C earns nothing on B's referrals). Single hop only.
- ❌ Referral leaderboards / gamification UI (defer; operator can query the table).
- ❌ Non-cash rewards (gift cards, swag). Cash via Stripe transfer or free months only.
- ❌ Custom commission rates per user. Single org-wide rate (20% / 12 months) settable via env.
- ❌ Referral codes for free-tier users (only paying users earn codes; prevents free-tier abuse per [`CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps)).
- ❌ Backfill of historical conversions. Pre-deploy customers do not retroactively get codes.

## 3. Dependencies

Files the executor MUST read:

- [`packages/stripe/src/index.ts`](../../../packages/stripe/src/index.ts) — Stripe client factory, checkout session creation, webhook handler
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `crm_leads` schema after PR 3b (provides `cell_key`)
- [`packages/neon/src/index.ts`](../../../packages/neon/src/index.ts) — `FactoryDb`, `withTenant`, `sql`
- [`packages/errors/`](../../../packages/errors/) — error classes, `ErrorCodes`
- [`packages/analytics/`](../../../packages/analytics/) — `factory_events` for `referral_redeemed` / `referral_paid` events
- [`CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps) — free-tier abuse caps
- [`CONSTITUTION.md §9`](../CONSTITUTION.md#9-honesty--truth) — affiliate/referral FTC disclosure
- [`selfprime-practitioner.md §5`](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific) — referral compounding mechanism spec
- [`ICP_MATRIX.md`](../ICP_MATRIX.md) — cross-product flywheel section (cell-aware tracking)
- [`CLAUDE.md`](../../../CLAUDE.md) — hard constraints (Workers runtime, ESM only, no `process.env`, no Node built-ins)

## 4. Migrations

```sql
-- 001_referrals.sql

-- Per-user unique referral code. One active code per (tenant_id, user_id, app_id).
CREATE TABLE IF NOT EXISTS referral_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  app_id          TEXT NOT NULL,
  code            TEXT NOT NULL,                -- 6-char alphanumeric, format SP-XXXXXX
  cell_key        TEXT NOT NULL,                -- referrer's cell at code-issue time
  stripe_coupon_id TEXT NOT NULL,               -- the Stripe Coupon that auto-applies for the referred user
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'revoked')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  UNIQUE(tenant_id, user_id, app_id),
  UNIQUE(code)
);

CREATE INDEX idx_referral_codes_code ON referral_codes (code) WHERE status = 'active';
CREATE INDEX idx_referral_codes_user ON referral_codes (tenant_id, user_id, app_id);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY referral_codes_tenant_isolation ON referral_codes
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- A redemption — the referred user has clicked the link or applied the code.
-- One row per (code, referred_user_id). status advances through the funnel.
CREATE TABLE IF NOT EXISTS referral_redemptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          TEXT NOT NULL,
  code               TEXT NOT NULL REFERENCES referral_codes(code),
  referrer_user_id   TEXT NOT NULL,
  referrer_cell_key  TEXT NOT NULL,             -- snapshot at redemption time
  referred_user_id   TEXT NOT NULL,
  referred_cell_key  TEXT NOT NULL,             -- snapshot; may differ from referrer
  app_id             TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'visited'
                       CHECK (status IN ('visited', 'signed_up', 'paid', 'refunded')),
  visited_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_up_at       TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  refunded_at        TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  UNIQUE(tenant_id, code, referred_user_id)
);

CREATE INDEX idx_referral_redemptions_code ON referral_redemptions (code, status);
CREATE INDEX idx_referral_redemptions_referrer ON referral_redemptions (referrer_user_id, app_id);
CREATE INDEX idx_referral_redemptions_referred ON referral_redemptions (referred_user_id, app_id);
CREATE INDEX idx_referral_redemptions_cells ON referral_redemptions (referrer_cell_key, referred_cell_key);

ALTER TABLE referral_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY referral_redemptions_tenant_isolation ON referral_redemptions
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- Commission ledger — one row per Stripe transfer attempt to the referrer.
CREATE TABLE IF NOT EXISTS referral_commissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          TEXT NOT NULL,
  redemption_id      UUID NOT NULL REFERENCES referral_redemptions(id),
  referrer_user_id   TEXT NOT NULL,
  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  referred_mrr_cents INTEGER NOT NULL,           -- net of refunds in the period
  commission_cents   INTEGER NOT NULL,           -- 20% of referred_mrr_cents
  stripe_transfer_id TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'paid', 'failed', 'skipped')),
  failure_reason     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at            TIMESTAMPTZ,
  UNIQUE(tenant_id, redemption_id, period_start)
);

CREATE INDEX idx_commissions_referrer ON referral_commissions (referrer_user_id, status);
CREATE INDEX idx_commissions_pending ON referral_commissions (status, period_end) WHERE status = 'pending';

ALTER TABLE referral_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY referral_commissions_tenant_isolation ON referral_commissions
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- ROLLBACK (in reverse FK order):
-- DROP TABLE referral_commissions CASCADE;
-- DROP TABLE referral_redemptions CASCADE;
-- DROP TABLE referral_codes CASCADE;
-- (CASCADE drops dependent indices, RLS policies, and foreign keys.)
```

## 5. API shape

```ts
// packages/referrals/src/index.ts
import type { FactoryDb } from '@latimer-woods-tech/neon';
import type Stripe from 'stripe';

/** Issued referral code record. */
export interface ReferralCode {
  code: string;                // SP-XXXXXX
  tenantId: string;
  userId: string;
  appId: string;
  cellKey: string;
  stripeCouponId: string;
  status: 'active' | 'revoked';
  createdAt: Date;
}

/** Status of a single redemption. */
export type RedemptionStatus = 'visited' | 'signed_up' | 'paid' | 'refunded';

export interface Redemption {
  id: string;
  code: string;
  referrerUserId: string;
  referrerCellKey: string;
  referredUserId: string;
  referredCellKey: string;
  appId: string;
  status: RedemptionStatus;
  visitedAt: Date;
  signedUpAt?: Date;
  paidAt?: Date;
  stripeSubscriptionId?: string;
}

/** Config. All values from Worker bindings — never `process.env`. */
export interface ReferralsConfig {
  commissionPercent: number;     // default 20
  commissionMonths: number;      // default 12
  freeMonths: number;            // default 3
  maxRedemptionsPer30d: number;  // default 50, per CONSTITUTION §3
  stripe: Stripe;
}

/** Idempotent per (tenantId, userId, appId). Creates a Stripe Coupon (100% off,
 *  duration='repeating', duration_in_months=freeMonths) and stores its id. */
export async function getOrIssueCode(
  db: FactoryDb,
  cfg: ReferralsConfig,
  opts: { tenantId: string; userId: string; appId: string; cellKey: string },
): Promise<ReferralCode>;

/** Used by the `/i/{code}` redirect Worker. Returns null when unknown/revoked/cap-exceeded. */
export async function resolveCode(
  db: FactoryDb, code: string,
): Promise<{ code: ReferralCode; capped: boolean } | null>;

/** Mark a redemption `visited` — call from the redirect handler before checkout. */
export async function recordVisit(
  db: FactoryDb,
  opts: { tenantId: string; code: string; referredUserId: string; referredCellKey: string; appId: string },
): Promise<Redemption>;

/** Advance to `signed_up` — call from auth signup hook when ?ref={code} is on the URL. */
export async function recordSignup(
  db: FactoryDb,
  opts: { tenantId: string; code: string; referredUserId: string; appId: string },
): Promise<void>;

/** Advance to `paid` — call from `subscription.created` webhook when subscription.metadata.referral_code is set. */
export async function recordPayment(
  db: FactoryDb,
  opts: { tenantId: string; code: string; referredUserId: string; stripeSubscriptionId: string; appId: string },
): Promise<void>;

/** Advance to `refunded` — call from `charge.refunded` webhook. */
export async function recordRefund(
  db: FactoryDb, opts: { tenantId: string; redemptionId: string },
): Promise<void>;

/** Run monthly. For each paid redemption within the 12-month window:
 *  commission_cents = (referred_mrr_cents - refunds) * commissionPercent / 100; insert
 *  a referral_commissions row; attempt a Stripe transfer. Idempotent via UNIQUE constraint. */
export async function runCommissionPayout(
  db: FactoryDb, cfg: ReferralsConfig,
  opts: { tenantId: string; period: { start: Date; end: Date } },
): Promise<{ paid: number; failed: number; skipped: number }>;

/** Auto-apply at checkout. Called from the checkout session builder. */
export function couponIdForCode(code: ReferralCode): string;
```

**Referral URL namespace decision:** `selfprime.net/r/{code}` collides with [PR 3h shareables](./3h-shareables.md) (`selfprime.net/r/{slug}/{reading-id}`). Canonical referral path is **`selfprime.net/i/{code}`** (`i` for *invite*); `/r/` stays with shareables. The `/i/{code}` redirect rewrites to `selfprime.net/?ref={code}`, which frontend session-capture middleware reads and persists to session metadata for checkout auto-apply.

**FTC disclosure (CONSTITUTION §9):** every public surface mentioning "earn money by referring" — landing page, dashboard CTA, in-product banner, transactional email body — MUST carry:

> "Selfprime pays a 20% commission on paid referrals you bring in for 12 months. We disclose this in compliance with FTC endorsement guides."

The package exports a `REFERRAL_DISCLOSURE_TEXT` constant; the brand-voice gate ([CONSTITUTION §2](../CONSTITUTION.md#2-brand-voice-gate)) treats absence of this string in any artefact tagged `topic:referrals` as a `critical` issue.

## 6. Test plan

- **Unit tests** (Vitest, 90%+ coverage, 85%+ branch):
  - `getOrIssueCode` idempotent; format `/^SP-[A-Z0-9]{6}$/`; rejects ambiguous chars (`0`/`O`, `1`/`I`)
  - Collision: on duplicate code, retry up to 5x then throw `InternalError`
  - `resolveCode` returns null for unknown / revoked / cap-exceeded
  - `recordVisit` idempotent per (code, referredUserId); rejects self-referral
  - `recordSignup` advances `visited` → `signed_up`; rejects out-of-order
  - `recordPayment` advances to `paid` and stamps subscription id
  - `recordRefund` advances to `refunded`; future commission rows `skipped`
  - 30-day cap: 51st redemption returns `capped: true`, no row inserted
  - `runCommissionPayout` idempotent per (redemption, period); skips refunded periods and post-12-month redemptions
  - Commission math: banker's rounding on cents
- **Integration tests** (`@cloudflare/vitest-pool-workers`):
  - End-to-end: issue → visit → signup → webhook → paid → payout (Stripe mocked)
  - Cross-cell: practitioner refers consumer; both `cell_key` columns correct
  - RLS isolation: tenant B cannot see tenant A's rows
- **Coverage:** ≥90% lines, ≥85% branches

## 7. Verification

After deploy to staging:

```bash
# 1. Issue a code (idempotent)
curl -X POST https://referrals.adrper79.workers.dev/codes \
  -H "Authorization: Bearer $WORKER_API_TOKEN" \
  -d '{"tenantId":"test","userId":"u-referrer","appId":"selfprime","cellKey":"selfprime:practitioner"}'
# Expect: 200 with {"code":"SP-XXXXXX",...}

# 2. Invite redirect — uses /i/ not /r/ (shareables collision avoided)
curl -I https://selfprime.net/i/SP-ABC123
# Expect: 302 to selfprime.net/?ref=SP-ABC123

# 3. Advance the funnel
for stage in visit signup payment; do
  curl -X POST "https://referrals.adrper79.workers.dev/redemptions/$stage" \
    -d '{"tenantId":"test","code":"SP-ABC123","referredUserId":"u-referred","referredCellKey":"selfprime:consumer","appId":"selfprime","stripeSubscriptionId":"sub_test"}'
done
psql $STAGING_DATABASE_URL -c "SELECT status, referrer_cell_key, referred_cell_key FROM referral_redemptions WHERE code = 'SP-ABC123';"
# Expect: status=paid; cells distinct

# 4. Payout run + 30-day cap
curl -X POST https://referrals.adrper79.workers.dev/payouts/run-now \
  -d '{"tenantId":"test","periodStart":"2026-06-01","periodEnd":"2026-06-30"}'
psql $STAGING_DATABASE_URL -c "SELECT status, commission_cents, stripe_transfer_id FROM referral_commissions;"
# Expect: status=paid, stripe_transfer_id non-null
# Cap test: create 50 redemptions then attempt 51st → expect 200 {"capped":true}, no row inserted
```

Expected `/health` endpoint on the referrals Worker: returns 200 with `{"referrals":"ok","activeCodes":N,"pendingCommissions":M}`.

## 8. Acceptance criteria

- [ ] DDL migrations land + idempotent + reversible
- [ ] RLS policies verified (cross-tenant access blocked)
- [ ] Codes match `/^SP-[A-Z0-9]{6}$/`; no ambiguous chars
- [ ] `getOrIssueCode` is idempotent
- [ ] `/i/{code}` redirect path implemented and decoupled from `/r/{slug}/{id}` shareables namespace
- [ ] Stripe Coupon (100% off, 3 months repeating) created on code issue
- [ ] Coupon auto-applies at checkout when `?ref={code}` is on session
- [ ] `recordPayment` stamps `crm_leads.last_touch_source = 'referral'`, `last_touch_campaign = 'referral:{code}'` (uses `@lwt/attribution.stampLastTouch` from PR 3k once landed; until then, direct DB write with a TODO comment)
- [ ] Commission payout idempotent per (redemption_id, period_start)
- [ ] 30-day cap enforced (51st redemption returns `capped: true`, no row inserted)
- [ ] Cell-aware: `referral_redemptions.referrer_cell_key` and `referred_cell_key` populated correctly on cross-cell flows
- [ ] `REFERRAL_DISCLOSURE_TEXT` exported and validated against by the brand-voice gate
- [ ] Test coverage ≥90% lines, ≥85% branches
- [ ] Zero `any` in public API; zero `process.env`; no Node built-ins; ESM only
- [ ] Verification curl sequence above succeeds end-to-end in staging
- [ ] CHANGELOG.md + semver bump (minor — new package)

## 9. File list

```
packages/referrals/
  package.json                       # NEW — declares deps on errors, neon, stripe, analytics
  tsup.config.ts
  src/
    index.ts                         # NEW — public API surface (re-exports)
    codes.ts                         # NEW — getOrIssueCode, resolveCode, generation + collision handling
    redemptions.ts                   # NEW — recordVisit/Signup/Payment/Refund
    commissions.ts                   # NEW — runCommissionPayout + Stripe transfer
    coupon.ts                        # NEW — Stripe Coupon creation
    disclosure.ts                    # NEW — REFERRAL_DISCLOSURE_TEXT constant
    types.ts                         # NEW — ReferralCode, Redemption, ReferralsConfig
  test/
    codes.test.ts                    # NEW
    redemptions.test.ts              # NEW
    commissions.test.ts              # NEW
    integration.test.ts              # NEW — end-to-end with mocked Stripe
  migrations/
    001_referrals.sql                # NEW
  CHANGELOG.md                       # NEW

apps/selfprime/                       # consumer app — minimal wiring, not core to this PR
  src/routes/invite.ts               # NEW — /i/{code} redirect handler
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Code collision under load | 6-char alphanumeric (~1B space minus ambiguous chars); retry up to 5x then throw |
| Self-referral abuse | `recordSignup` rejects when `referred_user_id == referrer_user_id` |
| Stripe transfer failure (insufficient balance / frozen account) | Commission marked `failed` + `failure_reason`; Sentry alert; retried on next monthly run |
| Refund after commission paid | No clawback in v1 (operator-handled); future commissions `skipped`; README documents |
| Free-tier abuse — attacker drains coupons via many referred accounts | 30-day cap per code (50) per CONSTITUTION §3; signup rate-limit |
| FTC violation — surface ships without disclosure | Voice gate treats missing `REFERRAL_DISCLOSURE_TEXT` in `topic:referrals` artefacts as critical |
| `/i/{code}` namespace collision | Registered in surface registry (PR 3d); registry rejects overlap |
| Referrer violates ToS post-payout | Operator `revoke`s code via admin tool; future commissions `skipped`; past out-of-band |

## 11. Cross-references

- [`CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps) — free-tier abuse caps
- [`CONSTITUTION.md §9`](../CONSTITUTION.md#9-honesty--truth) — FTC affiliate/referral disclosure
- [`selfprime-practitioner.md §5`](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific) — practitioner-specific growth hook mechanics
- [`ICP_MATRIX.md`](../ICP_MATRIX.md) — cross-product flywheel section
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) — `last_touch_campaign` convention used here
- [PR 3b — ICP dimension](./3b-icp-dimension.md) — `cell_key` source on `crm_leads`
- [PR 3h — shareables](./3h-shareables.md) — `/r/{slug}/{id}` namespace this PR avoids
- [PR 3k — attribution](./3k-attribution.md) — `stampLastTouch` consumed once landed
- [`packages/stripe/src/index.ts`](../../../packages/stripe/src/index.ts) — Stripe client + webhook pattern
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `crm_leads` after PR 3b
- [`CLAUDE.md`](../../../CLAUDE.md) — hard constraints + verification requirement
