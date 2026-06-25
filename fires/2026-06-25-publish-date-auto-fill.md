# FIRE: Publish Date Auto-Fill Missing
**Date:** June 25, 2026
**Severity:** MEDIUM
**Status:** RESOLVED

## What Happened
Instagram, TikTok, and YouTube linked/synced videos did not consistently save the real original platform publish date. Analytics reads `posts.date`, while Pipeline reads `pipeline_items.posted_at`, so new links could leave one or both date displays blank or dependent on portal-entered dates.

## Root Cause
Each platform had a different missing piece:
- Instagram already fetched Graph API `timestamp` but discarded it.
- YouTube fetched `snippet` from the Data API, which includes `publishedAt`, but `youtube-public.ts` did not expose it.
- TikTok did not request `create_time` in the `video/query` fields list.

## What Was Done
- Added shared `src/lib/publish-date.ts` to normalize publish timestamps and fill `pipeline_items.posted_at` plus `posts.date` only when missing.
- Instagram full sync and single-video sync now map Graph `timestamp`.
- YouTube public fetch now returns `publishedAt`, and YT link/poll/ensure paths map it.
- TikTok live API test confirmed `create_time` returns Unix seconds; TT full sync and single-video sync now request and map it.

## Prevention
Future platform syncs must identify the platform's real publish timestamp and route it through the shared null-only helper. Do not overwrite manually set dates, and do not treat link date as publish date.

## Resolution
[x] RESOLVED
