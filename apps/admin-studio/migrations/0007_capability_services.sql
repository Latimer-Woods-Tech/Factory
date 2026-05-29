-- Migration 0007: capability_services lineage table (Stage 3)
--
-- Records one row per provisioned service: links the deployed worker back to
-- the handoff + provision-request that produced it. This is the foundation
-- for drift detection (Stage 5+) and the upgrade-candidate loop: any service
-- whose manifest_hash diverges from the current compiled plan is a candidate
-- for re-provisioning.
--
-- Schema is mirrored in `apps/admin-studio/src/lib/handoff-store.ts` via
-- ensureSchema() so fresh deploys auto-create the table.
--
-- Fields:
--   service_id            — stable, human-readable identifier for the worker
--                           (e.g. "media-room", "outbound-dialer"); unique so
--                           re-provision UPSERT is safe.
--   handoff_id            — FK to the capability_handoffs row that defines
--                           what this service should look like.
--   provision_request_id  — FK to the capability_provision_requests row that
--                           triggered the scaffold run (nullable: allows
--                           manual registrations where no formal request exists).
--   deployed_sha          — git SHA of the Factory Core repo at deploy time;
--                           used to detect if the shared-infra layer drifted.
--   manifest_hash         — content hash of wrangler.jsonc at deploy time;
--                           compare against the handoff's plan hash to detect
--                           in-place drift.
--   last_drift_check_at   — timestamp of the most recent automated drift check;
--                           NULL until the first check runs.

CREATE TABLE IF NOT EXISTS capability_services (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id            TEXT NOT NULL,
  handoff_id            UUID NOT NULL REFERENCES capability_handoffs(id) ON DELETE RESTRICT,
  provision_request_id  UUID REFERENCES capability_provision_requests(id) ON DELETE SET NULL,
  deployed_sha          TEXT NOT NULL,
  manifest_hash         TEXT NOT NULL,
  last_drift_check_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per service: re-provision replaces the row via UPSERT.
CREATE UNIQUE INDEX IF NOT EXISTS idx_capability_services_service_id
  ON capability_services (service_id);

CREATE INDEX IF NOT EXISTS idx_capability_services_handoff
  ON capability_services (handoff_id);

CREATE INDEX IF NOT EXISTS idx_capability_services_provision_request
  ON capability_services (provision_request_id)
  WHERE provision_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_capability_services_drift_check
  ON capability_services (last_drift_check_at DESC NULLS FIRST);
