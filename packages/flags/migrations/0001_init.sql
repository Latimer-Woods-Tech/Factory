-- @latimer-woods-tech/flags D1 migration 0001
-- wrangler d1 execute <FLAG_TELEMETRY_DB> --file=.../0001_init.sql
CREATE TABLE IF NOT EXISTS flag_evaluations (
  id          TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  flag_key    TEXT    NOT NULL,
  app         TEXT    NOT NULL,
  user_id     TEXT,
  plan        TEXT,
  env         TEXT    NOT NULL,
  result      TEXT    NOT NULL,
  default_hit INTEGER NOT NULL DEFAULT 0,
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fev_key_ts ON flag_evaluations (flag_key, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fev_app_ts ON flag_evaluations (app, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fev_ts ON flag_evaluations (ts DESC);
