-- Migration: Add unique constraint on pmta_configs user_id
-- Version: 003
-- Description: Ensures one PMTA config per user for ON CONFLICT upsert support

CREATE UNIQUE INDEX IF NOT EXISTS idx_pmta_configs_user_id ON pmta_configs(user_id);
