-- Session 25: Per-client platform and tab configuration
-- Run in Supabase SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS enabled_platforms text[]
    DEFAULT ARRAY['ig'];

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS enabled_tabs text[]
    DEFAULT ARRAY['dashboard','analytics','angles','pipeline','studio','ads','calendar','goals'];
