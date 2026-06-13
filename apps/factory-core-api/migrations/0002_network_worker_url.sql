-- Factory Network Layer: Phase 5 signal relay
-- Adds worker_url to factory_app_keys so factory-core-api can deliver
-- inbound signals to registered target apps via POST /api/internal/signal.
-- Applied directly to factory-network Neon project (cool-grass-57951356).

ALTER TABLE factory_app_keys
  ADD COLUMN IF NOT EXISTS worker_url TEXT;

-- Populate known app URLs (idempotent UPDATE — safe to re-run)
UPDATE factory_app_keys SET worker_url = 'https://api.selfprime.net'       WHERE app_id = 'selfprime' AND worker_url IS NULL;
UPDATE factory_app_keys SET worker_url = 'https://api.capricast.com'        WHERE app_id = 'capricast' AND worker_url IS NULL;
UPDATE factory_app_keys SET worker_url = 'https://api.cipherofhealing.com'  WHERE app_id = 'coh'       AND worker_url IS NULL;
