-- Session 40: Live analytics window + video thumbnails
--
-- live = latest API pull, overwritten by cron/manual sync.
-- w24/w3/w7/eom = locked capture windows, written only when snapshot jobs are due
-- or when an admin manually edits the value.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'post_analytics'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%metric_window%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE post_analytics DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE post_analytics
  ADD CONSTRAINT post_analytics_metric_window_check
  CHECK (metric_window IN ('live', 'w24', 'w3', 'w7', 'eom'));

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

ALTER TABLE pipeline_items
  ADD COLUMN IF NOT EXISTS thumbnail_url text;
