-- Rollback for 0005_verifications.sql
-- Removes supervisor_verifications table (additive forward migration)

DROP TABLE IF EXISTS supervisor_verifications;
