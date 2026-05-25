-- factory-supervisor 0.1.0 — verifications table for post-execution acceptance gates

CREATE TABLE IF NOT EXISTS supervisor_verifications (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  verifier_query TEXT NOT NULL,
  tool_response TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES supervisor_steps(run_id)
);
CREATE INDEX IF NOT EXISTS ix_verifications_run_id ON supervisor_verifications(run_id);
CREATE INDEX IF NOT EXISTS ix_verifications_verified_at ON supervisor_verifications(verified_at DESC);
