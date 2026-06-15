-- session_42_fix_post_ids.sql
-- Priority 1: Fix posts.post_id to match pipeline_items.post_id for same yt_video_id.
--
-- Root cause: ensureYTPostsRow (S41) generated sequential #ytNNNN IDs instead of
-- reading pipeline_items.post_id as source of truth. This caused posts.post_id to
-- diverge from pipeline_items.post_id, breaking the Analytics tab display.
--
-- Safe to re-run: only touches rows where post_id strings actually differ.
-- UUID (posts.id) is unchanged — post_analytics FK is unaffected.
--
-- Run Step 1 first to preview, then Step 2 to apply.

-- ── Step 1: PREVIEW — see which rows will be updated ────────────────────────

/*
SELECT
  p.post_id   AS current_posts_post_id,
  pi.post_id  AS pipeline_post_id,
  p.yt_id,
  p.title
FROM posts p
JOIN pipeline_items pi ON pi.yt_video_id = p.yt_id
                       AND pi.client_id  = p.client_id
WHERE p.post_id != pi.post_id
  AND pi.post_id NOT LIKE '%|%'   -- skip pipe-separated pipeline IDs
ORDER BY p.client_id, p.post_id;
*/

-- ── Step 2: FIX — update posts.post_id to match pipeline_items.post_id ─────

UPDATE posts p
SET post_id = pi.post_id
FROM pipeline_items pi
WHERE pi.yt_video_id = p.yt_id
  AND pi.client_id   = p.client_id
  AND p.post_id     != pi.post_id
  AND pi.post_id NOT LIKE '%|%';  -- skip pipe-separated; those are handled separately

-- ── Step 3: Handle pipe-separated pipeline post_ids ─────────────────────────
-- Extracts the #yt* or #LF* part from pipe-separated values like "#ig0037 | #yt0087"

UPDATE posts p
SET post_id = (
  SELECT TRIM(part)
  FROM UNNEST(STRING_TO_ARRAY(pi.post_id, '|')) AS part
  WHERE TRIM(part) LIKE '#yt%'
     OR TRIM(part) LIKE '#LF%'
  LIMIT 1
)
FROM pipeline_items pi
WHERE pi.yt_video_id = p.yt_id
  AND pi.client_id   = p.client_id
  AND p.post_id     != pi.post_id
  AND pi.post_id     LIKE '%|%'
  AND EXISTS (
    SELECT 1
    FROM UNNEST(STRING_TO_ARRAY(pi.post_id, '|')) AS part
    WHERE TRIM(part) LIKE '#yt%'
       OR TRIM(part) LIKE '#LF%'
  );

-- ── Step 4: BACKFILL — copy eom → live for videos with no live row ──────────
-- Historical videos (imported before S40 live window was added) have eom rows
-- but no live rows. This gives them data to display in the live Analytics view.

INSERT INTO post_analytics (
  post_id, client_id, platform, metric_window,
  views, likes, comments, shares, saves, followers, watch_pct,
  yt_id, yt_video_id,
  recorded_at, last_polled_at
)
SELECT
  eom.post_id,
  eom.client_id,
  eom.platform,
  'live'           AS metric_window,
  eom.views,
  eom.likes,
  eom.comments,
  eom.shares,
  eom.saves,
  eom.followers,
  eom.watch_pct,
  eom.yt_id,
  eom.yt_video_id,
  eom.recorded_at,
  eom.last_polled_at
FROM post_analytics eom
WHERE eom.metric_window = 'eom'
  AND NOT EXISTS (
    SELECT 1 FROM post_analytics live
    WHERE live.post_id      = eom.post_id
      AND live.client_id    = eom.client_id
      AND live.platform     = eom.platform
      AND live.metric_window = 'live'
  )
ON CONFLICT (post_id, platform, metric_window) DO NOTHING;

-- ── Result: run SELECTS to verify ───────────────────────────────────────────

/*
-- Mismatched rows remaining (should be 0 after fix):
SELECT COUNT(*) AS remaining_mismatches
FROM posts p
JOIN pipeline_items pi ON pi.yt_video_id = p.yt_id AND pi.client_id = p.client_id
WHERE p.post_id != pi.post_id;

-- Live rows created:
SELECT COUNT(*) AS live_rows FROM post_analytics WHERE metric_window = 'live';
*/
