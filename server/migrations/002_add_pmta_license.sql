-- Migration: Add pmta_license column to pmta_configs
-- Version: 002
-- Description: Adds pmta_license field for storing PowerMTA license key

ALTER TABLE pmta_configs ADD COLUMN IF NOT EXISTS pmta_license TEXT;
