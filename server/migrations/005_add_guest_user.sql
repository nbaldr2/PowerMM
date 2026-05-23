-- Create guest user for no-login mode
INSERT INTO users (id, email, password_hash, name, role, quota_daily)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'guest@local',
  '',
  'Guest',
  'admin',
  10000000
) ON CONFLICT (id) DO NOTHING;