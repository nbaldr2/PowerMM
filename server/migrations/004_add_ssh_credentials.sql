-- Add SSH credential storage columns
ALTER TABLE pmta_configs 
ADD COLUMN IF NOT EXISTS ssh_pass_encrypted TEXT,
ADD COLUMN IF NOT EXISTS ssh_key_encrypted TEXT;
