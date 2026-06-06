---
name: project-yt-import
description: YouTube video import for Nick — 53 videos, YT ER% formula, post ID scheme, and script location
metadata:
  type: project
---

Session 19 (2026-06-06): Imported all 53 Nick YouTube videos into Supabase.

**Why:** Nick has parallel YouTube activity (Shorts + Long-form) that needs tracking in the same portal as IG.

**How to apply:** When touching analytics, ER%, or decision logic — remember YouTube rows use a different formula and have `saves=null`. Filter by `platform` when querying. Use `ingest-yt-csv.mjs` for future YT monthly imports.

## Post ID scheme
- Shorts: `#yt0001`–`#yt0039` (39 posts, Jan–May 2026)
- Long-form: `#LF0001`–`#LF0014` (14 posts, Jan–May 2026)

## YouTube ER% formula
`(likes + comments + shares + subscribers_gained) / views × 100`

- `subscribers_gained` stored as `post_analytics.followers`
- `saves` is `null` for all YT rows (YouTube has no saves metric)
- Same decision thresholds as IG: ≥12% = Double Down, 4–11.9% = Iterate, <4% = Kill

## Storage details
- `posts.platform = ['yt']`
- `posts.format = 'Short' | 'Long-form'`
- `pipeline_items.yt_type = 'Short' | 'Long-form'`
- `post_analytics.yt_id` = YouTube Video ID (e.g., `Iw9q_xrF3tc`)
- `post_analytics.platform = 'yt'`
- `post_analytics.metric_window = 'eom'` (only EOM data in tracker)

## Script
`node scripts/ingest-yt-csv.mjs <path-to-csv> [--run]`
Dry-run by default. Idempotent (wipe + re-insert eom rows for platform=yt). Also creates pipeline_items and calendar_events.
