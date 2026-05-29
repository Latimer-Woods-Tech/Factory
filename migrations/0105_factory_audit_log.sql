-- Migration: factory_audit_log — append-only operator action log (P2.13f)
-- Date: 2026-05-26
-- Neon project: THE_FACTORY (morning-dust-88304389)
-- Purpose: Records every mutating action taken by an operator or automation
--          against Factory-managed resources. Written by the @lwt/compliance
--          auditLog() middleware (P2.13g) via factory-core-api POST /v1/audit.
--
-- DESIGN:
--   - actor        who performed the action (JWT sub or service identity)
--   - action       verb: e.g. 'deploy', 'rollback', 'gate-override', 'secret-rotate'
--   - resource      dotted path: e.g. 'worker.factory-core-api', 'secret.JWT_SECRET'
--   - resource_id  optional stable identifier (e.g. run UUID, PR number)
--   - request_id   correlates to the Hono requestId header for log joins
--   - result       'success' | 'failure' | 'denied' | 'dry-run'
--   - payload      sanitised request data (secrets already redacted by middleware)
--   - evidence_url link to CI run, PR, deploy, or change review
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS factory_audit_log;

CREATE TABLE IF NOT EXISTS factory_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who
  actor           TEXT        NOT NULL,
  actor_type      TEXT        NOT NULL DEFAULT 'human',   -- 'human' | 'automation'

  -- What
  action          TEXT        NOT NULL,
  resource        TEXT        NOT NULL,
  resource_id     TEXT,

  -- Context
  request_id      TEXT,
  environment     TEXT        NOT NULL DEFAULT 'production',
  result          TEXT        NOT NULL DEFAULT 'success',
  detail          JSONB       NOT NULL DEFAULT '{}',
  evidence_url    TEXT,

  -- Timestamps
  acted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by actor (admin "what did I do?" queries)
CREATE INDEX IF NOT EXISTS ix_audit_log_actor
  ON factory_audit_log (actor, acted_at DESC);

-- Fast lookup by resource (audit trail for a specific resource)
CREATE INDEX IF NOT EXISTS ix_audit_log_resource
  ON factory_audit_log (resource, acted_at DESC);

-- Fast lookup by request_id for log correlation
CREATE INDEX IF NOT EXISTS ix_audit_log_request_id
  ON factory_audit_log (request_id)
  WHERE request_id IS NOT NULL;

COMMENT ON TABLE factory_audit_log IS
  'Append-only operator/automation action log (P2.13f). Written by @lwt/compliance auditLog() middleware.';
