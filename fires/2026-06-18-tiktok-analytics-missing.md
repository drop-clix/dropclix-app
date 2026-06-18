# FIRE: TikTok Analytics Missing
**Date:** June 18, 2026
**Severity:** MEDIUM
**Status:** RESOLVED

## What Happened
TikTok videos linked in pipeline after being posted do
not appear in Analytics tab. No TikTok metrics showing
anywhere even with sandbox API connected.

## Confirmed From Prior Sessions
- TikTok OAuth working (connect/reconnect/disconnect)
- ensureTTPostsRow() built in S44
- No tiktok-sync.ts ever built
- Sandbox returns empty/mock data only
- Videos linked before S44 may have no posts row

## Root Cause
- TikTok OAuth existed, but no TikTok analytics sync service or admin sync route had been built. There was no `src/lib/tiktok-sync.ts`, no `/api/admin/sync-tiktok`, and no writer for `post_analytics.platform='tt'`.
- Videos linked before S44 could also be missing `posts` rows, which meant analytics had no UUID target even if metrics were available.
- `runDueSnapshots()` hardcoded locked window writes to `platform='yt'`, so IG/TT live rows could not lock into `w24`, `w3`, `w7`, or `eom`.

## What Was Done
- Added `src/lib/tiktok-sync.ts` using the confirmed TikTok v2 API shape:
  `POST /v2/video/query/?fields=id,title,view_count,like_count,comment_count,share_count,cover_image_url`
  with `{ filters: { video_ids: [...] } }` in the JSON body.
- Added `/api/admin/sync-tiktok` with admin auth, `client_id` parsing, sync execution, and `last_synced_at` update.
- Added TikTok Admin "Sync Now" button matching the Instagram/YouTube pattern.
- TikTok sync now creates missing `#tt` posts stubs from linked `pipeline_items.tt_video_id` rows before writing analytics.
- TikTok sync writes `tt/live` rows with:
  `views=view_count`, `client_views=view_count`, `likes=like_count`,
  `comments=comment_count`, `shares=share_count`, `saves=0`.
- `runDueSnapshots()` now copies each live row with its own platform instead of hardcoding `yt`.

## Prevention
- Any platform with OAuth must have three pieces before it is considered analytics-ready: a sync service, an admin sync route/button, and a posts-row creation/backfill path.
- TikTok fields must remain query params. Putting `fields` in the JSON body causes TikTok API errors.
- Locked window code must treat `post_analytics.platform` as the source of truth and never hardcode YouTube.

## Resolution
[x] RESOLVED

## Verification
- Live Day 1 TikTok sync returned real data from TikTok:
  - `#tt0001` / `7651453807410334989`: 553 views, 28 likes, 3 comments, 0 shares
  - `#tt0003` / `7650669676942380302`: 629 views, 31 likes, 1 comment, 1 share
- Supabase now has two `post_analytics` rows for Day 1 with `platform='tt'` and `metric_window='live'`.
- `npx tsc --noEmit` passed before deploy.
