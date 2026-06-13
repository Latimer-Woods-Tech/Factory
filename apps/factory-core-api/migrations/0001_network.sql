-- Factory Network Layer — cross-app identity graph + event bus
-- ROLLBACK: DROP TABLE IF EXISTS factory_network_events, factory_network_links, factory_app_keys;

-- M2M app credentials. Stores only the SHA-256 hex hash of the bearer token;
-- the plaintext token is injected into each consumer app as a wrangler secret
-- and never stored in this database.
CREATE TABLE IF NOT EXISTS factory_app_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      TEXT NOT NULL,
  key_hash    TEXT NOT NULL,           -- SHA-256 hex of the bearer token
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  UNIQUE (app_id, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_app_keys_hash ON factory_app_keys (key_hash)
  WHERE revoked_at IS NULL;

-- Verified cross-app identity links established via OAuth handshake.
-- One row per (source_app, source_user_id, target_app) pair — a user can link
-- to at most one account per target app. Re-linking updates the row.
CREATE TABLE IF NOT EXISTS factory_network_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_app     TEXT NOT NULL,
  source_user_id TEXT NOT NULL,
  target_app     TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  verified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_app, source_user_id, target_app)
);

CREATE INDEX IF NOT EXISTS idx_network_links_target
  ON factory_network_links (target_app, target_user_id);

-- Cross-app event bus. Events are fire-and-forget (ctx.waitUntil); the app
-- posts its local user_id — cross-app resolution uses factory_network_links.
CREATE TABLE IF NOT EXISTS factory_network_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id         TEXT NOT NULL,
  user_id_local  TEXT NOT NULL,
  event_name     TEXT NOT NULL,
  properties     JSONB NOT NULL DEFAULT '{}',
  schema_version SMALLINT NOT NULL DEFAULT 1,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_network_events_app_time
  ON factory_network_events (app_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_network_events_user
  ON factory_network_events (app_id, user_id_local, occurred_at DESC);
