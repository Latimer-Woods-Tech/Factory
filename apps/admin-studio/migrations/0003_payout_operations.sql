-- Migration: 0003_payout_operations.sql
-- Purpose: Add tables for batch-based payout operations, DLQ, and audit logging
-- Created: 2026-04-28

-- Table: payout_batches
-- Represents a daily/weekly payout run to creators
CREATE TABLE IF NOT EXISTS payout_batches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  period_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'partially_completed', 'failed')),
  creator_count INTEGER NOT NULL DEFAULT 0,
  total_amount_usd NUMERIC(16, 2) NOT NULL DEFAULT 0,
  succeeded_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_by TEXT,
  last_operator_action TEXT
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_period_date ON payout_batches(period_date DESC);
CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON payout_batches(status);
CREATE INDEX IF NOT EXISTS idx_payout_batches_created_at ON payout_batches(created_at DESC);

-- Table: payouts
-- Individual payout transaction to a creator within a batch
CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  batch_id TEXT NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL,
  amount_usd NUMERIC(16, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'manual_review')),
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  stripe_transfer_id TEXT,
  metadata JSONB DEFAULT '{}',
  CONSTRAINT fk_creator FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payouts_batch_id ON payouts(batch_id);
CREATE INDEX IF NOT EXISTS idx_payouts_creator_id ON payouts(creator_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_created_at ON payouts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_stripe_transfer_id ON payouts(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;

-- Table: payout_dlq (Dead Letter Queue)
-- Failed payouts awaiting operator intervention
CREATE TABLE IF NOT EXISTS payout_dlq (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  payout_id TEXT NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL,
  amount_usd NUMERIC(16, 2) NOT NULL,
  error_reason TEXT NOT NULL,
  creator_account_status TEXT,
  suggested_action TEXT,
  resolution_status TEXT CHECK (resolution_status IN ('pending', 'retrying', 'resolved', 'archived')) DEFAULT 'pending',
  resolved_by TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_payout_dlq_payout_id ON payout_dlq(payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_dlq_batch_id ON payout_dlq(batch_id);
CREATE INDEX IF NOT EXISTS idx_payout_dlq_creator_id ON payout_dlq(creator_id);
CREATE INDEX IF NOT EXISTS idx_payout_dlq_resolution_status ON payout_dlq(resolution_status);
CREATE INDEX IF NOT EXISTS idx_payout_dlq_created_at ON payout_dlq(created_at DESC);

-- Table: payout_audit_log
-- Every payout batch operation for compliance and reconciliation
CREATE TABLE IF NOT EXISTS payout_audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  batch_id TEXT NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
  operator_id TEXT,
  action TEXT NOT NULL CHECK (
    action IN (
      'batch_created',
      'batch_reviewed',
      'batch_executed',
      'batch_paused',
      'batch_completed',
      'batch_failed',
      'payout_succeeded',
      'payout_failed',
      'dlq_retry_started',
      'dlq_retry_succeeded',
      'dlq_resolved_manual',
      'dlq_archived'
    )
  ),
  affected_creator_count INTEGER,
  total_amount_usd NUMERIC(16, 2),
  description TEXT,
  reason TEXT,
  error_details JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_audit_log_batch_id ON payout_audit_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_payout_audit_log_operator_id ON payout_audit_log(operator_id);
CREATE INDEX IF NOT EXISTS idx_payout_audit_log_action ON payout_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_payout_audit_log_timestamp ON payout_audit_log(timestamp DESC);

-- Comments for documentation
COMMENT ON TABLE payout_batches IS 'Daily/weekly payout batches to creators. Each batch represents one execution cycle.';
COMMENT ON TABLE payouts IS 'Individual payouts within a batch. Many-to-one relationship with payout_batches.';
COMMENT ON TABLE payout_dlq IS 'Failed payouts awaiting operator intervention. Linked to both payout and batch for traceability.';
COMMENT ON TABLE payout_audit_log IS 'Complete audit trail of all payout operations for compliance and finance review.';

COMMENT ON COLUMN payout_batches.status IS 'Current status of the batch: pending (ready to execute), processing (executing), completed (all succeeded), partially_completed (some failed), failed (batch operation itself failed)';
COMMENT ON COLUMN payout_batches.creator_count IS 'Total creators in this batch (snapshot at creation time)';
COMMENT ON COLUMN payouts.retry_count IS 'Number of retry attempts made so far';
COMMENT ON COLUMN payouts.max_retries IS 'Maximum number of retries before escalation to DLQ';
COMMENT ON COLUMN payout_dlq.suggested_action IS 'Operator hint: "retry_now", "check_stripe_account", "manual_payment", "contact_creator"';

-- RLS policies removed: these used auth.jwt_get_claim() which is a
-- Supabase-only function. Factory runs Neon Postgres, which does not provide
-- the auth schema, so applying them stops the migration with
-- "schema 'auth' does not exist". Authorization is enforced at the Worker
-- application layer via JWT middleware. Re-introducing RLS as defense in
-- depth requires a Neon-native approach (current_setting('jwt.claims.*'))
-- and is tracked separately.
