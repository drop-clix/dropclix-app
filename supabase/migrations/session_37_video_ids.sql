-- Session 37: Per-platform video IDs
-- pipeline_items: used by Mark as Posted modal (Build 1)
ALTER TABLE pipeline_items
  ADD COLUMN IF NOT EXISTS ig_video_id text,
  ADD COLUMN IF NOT EXISTS tt_video_id text,
  ADD COLUMN IF NOT EXISTS yt_video_id text;

-- post_analytics: used by polling cron (Build 2)
-- yt_id already exists; yt_video_id added for consistency with ig/tt
ALTER TABLE post_analytics
  ADD COLUMN IF NOT EXISTS ig_video_id text,
  ADD COLUMN IF NOT EXISTS tt_video_id text,
  ADD COLUMN IF NOT EXISTS yt_video_id text;
