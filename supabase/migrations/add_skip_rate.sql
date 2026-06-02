-- Add skip_rate column to post_analytics
-- Run this in the Supabase SQL Editor once, then it's done.
ALTER TABLE post_analytics
  ADD COLUMN IF NOT EXISTS skip_rate numeric;
