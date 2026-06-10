-- Add yt_id column to posts table for direct YouTube video ID lookup.
-- Run once in the Supabase SQL Editor:
--   https://app.supabase.com/project/heqgynsyoxocyayzxguu/sql/new

ALTER TABLE posts ADD COLUMN IF NOT EXISTS yt_id text;

-- Backfill existing YT posts from post_analytics (takes the most recent yt_id per post)
UPDATE posts p
SET yt_id = pa.yt_id
FROM (
  SELECT DISTINCT ON (post_id) post_id, yt_id
  FROM post_analytics
  WHERE yt_id IS NOT NULL
  ORDER BY post_id, recorded_at DESC
) pa
WHERE pa.post_id = p.id
  AND p.yt_id IS NULL;
