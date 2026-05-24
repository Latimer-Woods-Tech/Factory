-- Migration 0006: Capability handoff + staging provision request persistence
--
-- Stage B of the Capability Design Studio Golden Design requires durable,
-- content-addressable handoff artifacts. Stage C adds an audited
-- staging-provision-request channel that references those handoffs.
--
-- Both tables live in the same Neon database the studio_audit_log already
-- uses; ensureCapabilityHandoffSchema() in handoff-store.ts mirrors this DDL
-- as a defensive CREATE IF NOT EXISTS path for fresh deploys.

CREATE TABLE IF NOT EXISTS capability_handoffs (
  id            UUID PRIMARY KEY,
  hash          TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL,
  concept_id    TEXT NOT NULL,
  recipe_id     TEXT NOT NULL,
  parameters    JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan          JSONB NOT NULL,
  preview       TEXT NOT NULL,
  next_action   JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT NOT NULL,
  env           TEXT NOT NULL CHECK (env IN ('local','staging','production'))
);

CREATE INDEX IF NOT EXISTS idx_capability_handoffs_concept ON capability_handoffs (concept_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capability_handoffs_recipe  ON capability_handoffs (recipe_id,  created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capability_handoffs_created ON capability_handoffs (created_at DESC);

CREATE TABLE IF NOT EXISTS capability_provision_requests (
  id            UUID PRIMARY KEY,
  handoff_id    UUID NOT NULL REFERENCES capability_handoffs(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL CHECK (status IN ('requested','acknowledged','dispatched','succeeded','failed','withdrawn')),
  proof_gates   JSONB NOT NULL,
  requested_by  TEXT NOT NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  env           TEXT NOT NULL CHECK (env IN ('local','staging','production')),
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_capability_provision_requests_handoff ON capability_provision_requests (handoff_id);
CREATE INDEX IF NOT EXISTS idx_capability_provision_requests_status  ON capability_provision_requests (status, requested_at DESC);
