-- Entitlements v0.2 — Feature flags and access control schema.
-- Created as part of the unified entitlements system rollout.
-- This migration creates three tables:
--   1. entitlements — the master feature/tier catalog (immutable, operator-maintained)
--   2. user_entitlements — user-to-feature mappings with optional expiry
--   3. entitlement_audit_log — immutable audit trail of all grant/revoke/expire events

CREATE TABLE IF NOT EXISTS entitlements (
  id                TEXT         PRIMARY KEY,
  label             TEXT         NOT NULL UNIQUE,
  enabled           BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_entitlements (
  id                TEXT         PRIMARY KEY,
  user_id           TEXT         NOT NULL,
  entitlement_id    TEXT         NOT NULL,
  granted_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,
  app_scope         TEXT         NOT NULL,

  UNIQUE (user_id, entitlement_id, app_scope),
  FOREIGN KEY (entitlement_id) REFERENCES entitlements(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_scope
  ON user_entitlements(user_id, app_scope);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_expires
  ON user_entitlements(expires_at);

CREATE TABLE IF NOT EXISTS entitlement_audit_log (
  id                TEXT         PRIMARY KEY,
  user_id           TEXT         NOT NULL,
  entitlement_id    TEXT         NOT NULL,
  app_scope         TEXT         NOT NULL,
  action            TEXT         NOT NULL,
  operator_id       TEXT,
  expires_at        TIMESTAMPTZ,
  occurred_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entitlement_audit_app_scope
  ON entitlement_audit_log(app_scope, occurred_at DESC);
