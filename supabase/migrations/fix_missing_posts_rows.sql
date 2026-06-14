-- fix_missing_posts_rows.sql
-- Finds pipeline items with yt_video_id set that have no matching posts row,
-- then creates stub posts rows so the cron can write to post_analytics.
--
-- Run in Supabase SQL Editor.
-- Safe to re-run — only inserts rows where none exist.
--
-- Step 1: DIAGNOSTIC — run this SELECT first to see what's missing.

/*
SELECT
  pi.id           AS pipeline_item_id,
  pi.post_id,
  pi.client_id,
  pi.title,
  pi.platform,
  pi.posted_at,
  pi.yt_video_id
FROM pipeline_items pi
WHERE pi.yt_video_id IS NOT NULL
  AND NOT EXISTS (
    -- exact post_id match
    SELECT 1 FROM posts p
    WHERE p.post_id = pi.post_id
      AND p.client_id = pi.client_id
  )
  AND NOT EXISTS (
    -- yt_id fallback match
    SELECT 1 FROM posts p
    WHERE p.yt_id = pi.yt_video_id
      AND p.client_id = pi.client_id
  );
*/

-- Step 2: FIX — insert stub posts rows for each gap.
-- Generates next available #ytNNNN per client.

DO $$
DECLARE
  rec     RECORD;
  max_num INT;
  new_pid TEXT;
BEGIN
  FOR rec IN
    SELECT
      pi.id           AS pipeline_item_id,
      pi.post_id,
      pi.client_id,
      pi.title,
      pi.platform,
      pi.posted_at,
      pi.yt_video_id
    FROM pipeline_items pi
    WHERE pi.yt_video_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM posts p
        WHERE p.post_id = pi.post_id
          AND p.client_id = pi.client_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM posts p
        WHERE p.yt_id = pi.yt_video_id
          AND p.client_id = pi.client_id
      )
  LOOP
    -- Find the next available #ytNNNN for this client
    SELECT COALESCE(MAX(CAST(REPLACE(p.post_id, '#yt', '') AS INTEGER)), 0) + 1
    INTO max_num
    FROM posts p
    WHERE p.client_id = rec.client_id
      AND p.post_id ~ '^#yt[0-9]+$';

    new_pid := '#yt' || LPAD(max_num::TEXT, 4, '0');

    -- Avoid collision if that ID already exists
    WHILE EXISTS (SELECT 1 FROM posts WHERE post_id = new_pid AND client_id = rec.client_id) LOOP
      max_num := max_num + 1;
      new_pid := '#yt' || LPAD(max_num::TEXT, 4, '0');
    END LOOP;

    INSERT INTO posts (client_id, post_id, title, platform, date, yt_id)
    VALUES (
      rec.client_id,
      new_pid,
      COALESCE(rec.title, '(YouTube video)'),
      COALESCE(rec.platform, ARRAY['yt']),
      CASE WHEN rec.posted_at IS NOT NULL
        THEN rec.posted_at::date
        ELSE NULL
      END,
      rec.yt_video_id
    );

    RAISE NOTICE 'Created % (yt_id=%) for pipeline item %', new_pid, rec.yt_video_id, rec.pipeline_item_id;
  END LOOP;
END $$;
