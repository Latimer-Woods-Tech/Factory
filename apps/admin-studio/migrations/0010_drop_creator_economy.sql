-- 0010_drop_creator_economy.sql
--
-- Removes the orphaned creator-economy schema from admin-studio.
--
-- Rationale: admin-studio carried a third, unused Stripe Connect implementation
-- (Standard OAuth) that no UI consumed and that the live Stripe platform
-- (acct_1SlCcFAW1229TZte) never had a webhook pointing at. The mature Connect
-- flows live in Capricast (Express + transfers) and SelfPrime/HumanDesign
-- (Express + destination charges) on the SAME shared platform account, so this
-- copy was pure duplication. See migrations 0002/0003 for the original DDL
-- (kept for history) and the removal PR for the full audit.
--
-- Safety: all six tables were verified to hold 0 rows in production
-- (THE_FACTORY / morning-dust-88304389) before this migration was written.
-- DROP ... CASCADE is used defensively; there are no inbound FKs from retained
-- studio tables (studio_audit_log, studio_test_runs, function_catalog).

DROP TABLE IF EXISTS payout_audit_log CASCADE;
DROP TABLE IF EXISTS payout_dlq CASCADE;
DROP TABLE IF EXISTS payouts CASCADE;
DROP TABLE IF EXISTS payout_batches CASCADE;
DROP TABLE IF EXISTS creator_connections CASCADE;
DROP TABLE IF EXISTS creators CASCADE;
