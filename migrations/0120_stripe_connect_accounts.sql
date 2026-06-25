-- Migration 0120: stripe_connect_accounts
-- Creates the stripe_connect_accounts relation that the node-cloudflare-pages
-- production bundle queries. Sentry 7554532994 (latwood-tech/node-cloudflare-pages)
-- has fired DatabaseError against this relation 8 times since June 16, last seen
-- 2026-06-25 02:00 ET. Block for both the migration and the Stripe Connect
-- loss-management dashboard acceptance (Sentry 7567006177).

CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_account_id               text NOT NULL UNIQUE,
  display_name                    text,
  email                           text,
  country                         text,
  default_currency                text,
  business_type                   text,
  charges_enabled                 boolean NOT NULL DEFAULT false,
  payouts_enabled                 boolean NOT NULL DEFAULT false,
  details_submitted               boolean NOT NULL DEFAULT false,
  requirements_disabled_reason    text,
  metadata                        jsonb NOT NULL DEFAULT '{}'::jsonb,
  loss_management_accepted_at     timestamptz,
  controller_dashboard_url        text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_connect_accounts_stripe_id_idx
  ON stripe_connect_accounts (stripe_account_id);

CREATE INDEX IF NOT EXISTS stripe_connect_accounts_charges_enabled_idx
  ON stripe_connect_accounts (charges_enabled)
  WHERE charges_enabled = true;
