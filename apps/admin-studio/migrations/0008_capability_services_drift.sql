-- Stage 4: Drift detection fields for capability_services
ALTER TABLE capability_services
  ADD COLUMN IF NOT EXISTS worker_url         TEXT,
  ADD COLUMN IF NOT EXISTS drift_detected     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drift_first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS live_manifest_hash TEXT;

COMMENT ON COLUMN capability_services.worker_url IS 'Staging worker URL (e.g. https://foo-staging.adrper79.workers.dev) for manifest polling.';
COMMENT ON COLUMN capability_services.drift_detected IS 'True if the last automated drift check found the live manifest hash differs from the provisioned manifest_hash.';
COMMENT ON COLUMN capability_services.drift_first_seen_at IS 'Timestamp when drift was first detected; null until drift occurs.';
COMMENT ON COLUMN capability_services.live_manifest_hash IS 'SHA-256 hex of the /manifest response observed during the last drift check.';
