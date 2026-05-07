-- Initial schema: creator accounts and Stripe Connect state.
-- Must run before all other migrations.

CREATE TABLE IF NOT EXISTS creators (
  id                          TEXT         PRIMARY KEY,
  email                       TEXT         NOT NULL,
  display_name                TEXT         NOT NULL DEFAULT '',
  stripe_connected_account_id TEXT,
  created_at                  TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creators_email ON creators (email);

CREATE TABLE IF NOT EXISTS creator_connections (
  creator_id                  TEXT         PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,
  stripe_account_id           TEXT,
  onboarding_status           TEXT         NOT NULL DEFAULT 'not_started',
  submitted_at                TIMESTAMPTZ,
  verified_at                 TIMESTAMPTZ,
  last_verification_attempt   TIMESTAMPTZ,
  verification_attempts       INTEGER      DEFAULT 0,
  error_message               TEXT
);

CREATE INDEX IF NOT EXISTS idx_creator_connections_stripe ON creator_connections (stripe_account_id);
