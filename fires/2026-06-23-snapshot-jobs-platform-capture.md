# FIRE: Snapshot Jobs Platform Capture
**Date:** June 23, 2026
**Severity:** HIGH
**Status:** RESOLVED

## What Happened
Locked snapshot windows could be skipped for IG, TT, or YT on multi-platform posts. The cron runner treated `snapshot_jobs.captured` as a single job-level boolean even though `post_analytics` stores platform-specific windows.

## Root Cause
`runDueSnapshots()` marked a job `captured=true` when any platform row already existed or was written for that post/window. For a multi-platform post, that allowed one platform to close the job and permanently skip missing platform windows.

## What Was Done
- Kept the existing schema. No migration was needed because `post_analytics(post_id, platform, metric_window)` already represents per-platform completion.
- Updated `runDueSnapshots()` so a job remains open until every applicable platform has the locked window.
- Refreshed live data before copying snapshots:
  - YouTube uses the existing `pollPipelineItem()` path.
  - Instagram uses `syncSingleIGVideo()`.
  - TikTok uses `syncSingleTTVideo()`.
- Increased the due snapshot processing cap from 20 to 30 jobs per cron invocation.

## Verification
- `npx tsc --noEmit` passed.
- Local `/api/cron/poll-fresh` completed with `snapshots=30`.
- Local verification exposed a separate environment issue: `.env.local` YouTube API key returned `API_KEY_INVALID / API key expired`, so YT live refresh skipped and copied existing live rows. This was not caused by the snapshot fix.
- Pending backlog after the test still contained IG/TT jobs behind the YT backlog; do not brute-force production data just to reach them. The new runner will process them as the backlog drains.

## Prevention
- Future snapshot changes must treat platform completion as `post_analytics` rows, not the single `snapshot_jobs.captured` boolean alone.
- Never mark a due job captured until every applicable platform for that post has its locked `metric_window`.
- Do not add a `captured_platforms` column unless the existing row-based completion state becomes insufficient.

## Resolution
[x] RESOLVED
