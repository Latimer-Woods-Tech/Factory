-- Migration: Factory read-layer tables
-- Date: 2026-05-25
-- Neon project: THE_FACTORY (morning-dust-88304389)
-- Purpose: Immutable raw-event log + gate + artifact read models for the
--          factory-core-api ingest layer (Admin Build Plan P1.2).
--
-- Tables created:
--   1. factory_events_ingest — append-only raw event log; payload immutable via trigger
--   2. factory_gates          — append-only gate state transitions; views for latest + blocking
--   3. factory_artifacts      — append-only catalog of run outputs
--
-- ROLLBACK:
--   DROP VIEW IF EXISTS factory_gates_blocking;
--   DROP VIEW IF EXISTS factory_gates_latest;
--   DROP TRIGGER IF EXISTS enforce_events_immutability_t ON factory_events_ingest;
--   DROP FUNCTION IF EXISTS enforce_events_immutability();
--   DROP TABLE IF EXISTS factory_artifacts;
--   DROP TABLE IF EXISTS factory_gates;
--   DROP TABLE IF EXISTS factory_events_ingest;

-- ============================================================================
-- 1. factory_events_ingest — immutable raw-event log (§2.0 of tech guide)
-- ============================================================================
-- Every ingest endpoint writes here BEFORE running any derivation.
-- Failed derivations leave derivation_status='failed'; replay picks them up.

CREATE TABLE IF NOT EXISTS factory_events_ingest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHERE the event came from
  source_system TEXT NOT NULL,
  source_event_type TEXT NOT NULL,
  source_event_id TEXT,

  -- THE RAW PAYLOAD (immutable after insert — enforced by trigger below)
  payload JSONB NOT NULL,
  payload_size_bytes INTEGER GENERATED ALWAYS AS (octet_length(payload::text)) STORED,
  payload_sha256 TEXT GENERATED ALWAYS AS (encode(sha256(payload::text::bytea), 'hex')) STORED,

  -- AUTH context
  ingest_actor TEXT NOT NULL,

  -- DERIVATION status
  derivation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (derivation_status IN ('pending', 'derived', 'failed', 'replayed')),
  derivation_targets TEXT[],
  derivation_error TEXT,
  derivation_at TIMESTAMPTZ,

  -- TEMPORAL
  observed_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_events_pending
  ON factory_events_ingest (ingested_at DESC)
  WHERE derivation_status = 'pending';

CREATE INDEX IF NOT EXISTS ix_events_source
  ON factory_events_ingest (source_system, source_event_type, ingested_at DESC);

CREATE INDEX IF NOT EXISTS ix_events_actor
  ON factory_events_ingest (ingest_actor, ingested_at DESC);

-- Immutability trigger: only derivation columns may be updated.
CREATE OR REPLACE FUNCTION enforce_events_immutability() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.source_system IS DISTINCT FROM OLD.source_system
     OR NEW.source_event_type IS DISTINCT FROM OLD.source_event_type
     OR NEW.source_event_id IS DISTINCT FROM OLD.source_event_id
     OR NEW.ingest_actor IS DISTINCT FROM OLD.ingest_actor
     OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
     OR NEW.ingested_at IS DISTINCT FROM OLD.ingested_at THEN
    RAISE EXCEPTION 'factory_events_ingest rows are immutable — only derivation_status, derivation_at, derivation_error, and derivation_targets may be updated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_events_immutability_t
  BEFORE UPDATE ON factory_events_ingest
  FOR EACH ROW EXECUTE FUNCTION enforce_events_immutability();

-- ============================================================================
-- 2. factory_gates — append-only gate state transitions (§2.2 of tech guide)
-- ============================================================================
-- Never UPDATE; every state change is a new row.
-- Current state: factory_gates_latest view (DISTINCT ON most recent per subject).

CREATE TABLE IF NOT EXISTS factory_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to the raw event that produced this row
  ingest_event_id UUID NOT NULL REFERENCES factory_events_ingest(id),

  gate_type TEXT NOT NULL CHECK (gate_type IN (
    'ci', 'canary', 'codeowner-review', 'budget',
    'verifier', 'claude-review', 'constraints', 'reliability',
    'capability-check', 'migration-drift', 'stuck-detection'
  )),

  source_system TEXT NOT NULL CHECK (source_system IN (
    'github-actions', 'github-review', 'sentry',
    'wrangler-canary', 'supervisor-d1', 'llm-meter',
    'factory-cross-repo', 'factory-stuck-watcher'
  )),
  source_ref TEXT NOT NULL,

  subject_type TEXT NOT NULL CHECK (subject_type IN (
    'pr', 'issue', 'deploy', 'supervisor-run', 'video-render'
  )),
  subject_repo TEXT,
  subject_ref TEXT NOT NULL,

  state TEXT NOT NULL CHECK (state IN (
    'pending', 'passed', 'failed', 'skipped', 'override', 'expired'
  )),
  evidence_url TEXT,
  evidence_summary JSONB NOT NULL DEFAULT '{}',

  observed_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_gates_subject
  ON factory_gates (subject_repo, subject_type, subject_ref, observed_at DESC);

CREATE INDEX IF NOT EXISTS ix_gates_state
  ON factory_gates (state, observed_at DESC);

CREATE INDEX IF NOT EXISTS ix_gates_type
  ON factory_gates (gate_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS ix_gates_event
  ON factory_gates (ingest_event_id);

-- Latest state per (subject_type, subject_ref, gate_type, source_ref)
CREATE OR REPLACE VIEW factory_gates_latest AS
SELECT DISTINCT ON (subject_type, subject_ref, gate_type, source_ref)
  id, ingest_event_id, gate_type, source_system, source_ref,
  subject_type, subject_repo, subject_ref,
  state, evidence_url, evidence_summary,
  observed_at, ingested_at
FROM factory_gates
ORDER BY subject_type, subject_ref, gate_type, source_ref, observed_at DESC;

-- Blocking view: pending + failed gates for Command Center
CREATE OR REPLACE VIEW factory_gates_blocking AS
SELECT *
FROM factory_gates_latest
WHERE state IN ('pending', 'failed')
ORDER BY
  CASE state WHEN 'failed' THEN 0 ELSE 1 END,
  observed_at DESC;

-- ============================================================================
-- 3. factory_artifacts — append-only catalog of run outputs (§2.3 of tech guide)
-- ============================================================================

CREATE TABLE IF NOT EXISTS factory_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'video', 'audio', 'thumbnail', 'transcript',
    'deploy-url', 'build-artifact', 'preview',
    'lighthouse', 'audit-report', 'logs', 'report'
  )),

  producer_type TEXT NOT NULL CHECK (producer_type IN (
    'github-workflow', 'supervisor-run', 'video-pipeline',
    'cloudflare-deploy', 'manual'
  )),
  producer_ref TEXT NOT NULL,

  subject_app TEXT,
  subject_repo TEXT,
  subject_ref TEXT,

  uri TEXT NOT NULL,
  uri_scheme TEXT GENERATED ALWAYS AS (split_part(uri, ':', 1)) STORED,

  checksum TEXT,
  size_bytes BIGINT,
  mime_type TEXT,
  duration_ms BIGINT,

  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,

  CHECK (uri ~ '^[a-z0-9+.-]+:')
);

CREATE INDEX IF NOT EXISTS ix_artifacts_subject
  ON factory_artifacts (subject_app, subject_ref);

CREATE INDEX IF NOT EXISTS ix_artifacts_type
  ON factory_artifacts (artifact_type, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_artifacts_producer
  ON factory_artifacts (producer_type, producer_ref);
