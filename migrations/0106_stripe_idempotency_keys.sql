-- Migration: stripe_idempotency_keys — Stripe call dedup table (P2.13f)
-- Date: 2026-05-26
-- Neon project: THE_FACTORY (morning-dust-88304389)
-- Purpose: Persists Stripe idempotency keys before each Stripe API call so
--          that a Worker crash mid-call never double-charges. The
--          @lwt/stripe transferOrIdempotent() helper (P2.13h) checks/inserts
--          here before making the Stripe call.
--
-- DESIGN:
--   - idempotency_key  the UUID passed to Stripe's Idempotency-Key header
--   - stripe_operation  e.g. 'transfer', 'refund', 'subscription.create'
--   - stripe_response   nullable; set after Stripe responds (success or error)
--   - status            'pending' → 'success' | 'failed'
--   - tenant_id / run_id  optional attribution for cost accounting
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS stripe_idempotency_keys;

CREATE TABLE IF NOT EXISTS stripe_idempotency_keys (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  idempotency_key  TEXT        NOT NULL UNIQUE,
  stripe_operation TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',

  -- Optional attribution
  tenant_id        TEXT,
  run_id           TEXT,
  actor            TEXT,

  -- Stripe response (set after the call completes or errors)
  stripe_response  JSONB,
  stripe_error     TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);

-- Unique index on idempotency_key already enforced by the UNIQUE constraint above.
-- Additional index for pending-cleanup queries.
CREATE INDEX IF NOT EXISTS ix_stripe_idem_status
  ON stripe_idempotency_keys (status, created_at DESC)
  WHERE status = 'pending';

COMMENT ON TABLE stripe_idempotency_keys IS
  'Stripe idempotency key dedup table (P2.13f). Written by @lwt/stripe transferOrIdempotent() before each Stripe call.';
