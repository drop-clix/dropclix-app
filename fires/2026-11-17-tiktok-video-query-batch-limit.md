# FIRE: TikTok Sync Now fails on video_ids batch limit
**Date:** November 17, 2026
**Severity:** HIGH
**Status:** RESOLVED

## What Happened
TikTok Sync Now for Day 1 failed with:
`TikTok video/query failed (400): the length of filters.video_ids should be in the range [1, 20]`.
No TikTok metrics were updated for any linked video. Day 1's last successful TT poll was 2026-11-09.

## Root Cause
- `syncTikTokForClient()` passed every linked `pipeline_items.tt_video_id` to one `POST /v2/video/query/` call.
- TikTok accepts 1 to 20 IDs per request. Day 1 has 100 linked TikToks, so the whole sync failed once the client passed 20.
- One API failure aborted the entire sync, because the single call threw before any upsert ran.

## What Was Done
- `fetchTikTokVideoStats()` in `src/lib/tiktok-sync.ts` dedupes IDs, chunks them by `TIKTOK_VIDEO_QUERY_MAX_IDS = 20`, calls `video/query` per chunk (fields still a query param), and merges the results.
- A failed chunk is logged with its chunk index, size and first ID, then added to the sync result `errors`. Its IDs count as skipped, and the remaining chunks continue.
- Zero IDs makes no API call and returns synced 0 with no error.
- The internal per-request helper refuses to send more than 20 IDs, so a future caller cannot reintroduce the bug.
- Downstream mapping, upsert, ER%, Decision, saves, token refresh and OAuth state were not touched.

## Audit of other TikTok batching
- `syncSingleTTVideo()`: always one ID. Safe.
- Snapshot live refresh (`video-polling.ts`): calls `syncSingleTTVideo()` per item. Safe.
- `video/list` discovery: `max_count: 20` is TikTok's maximum. Safe. Capped at 5 pages (newest 100 videos); older videos are never discovered. Coverage gap, not fixed here.

## IG / YT check (no changes)
- IG: insights are one media per call. `/media?limit=100` does not paginate, so only the newest 100 media are matched. Coverage gap, not an API failure.
- YT: Analytics calls are one video each. Discovery `videos.list` receives at most 50 IDs per page, which is YouTube's limit.

## Verification
- `npx tsc --noEmit` clean.
- Mocked fetch test: 0 IDs makes 0 calls; 21 makes 20+1; 45 makes 20+20+5 and returns 45; a failed middle chunk returns 25 videos, 20 failed IDs, 1 error, and still runs all 3 chunks.
- Live Day 1 sync from the deployed commit: 100 IDs in 5 chunks, 100 returned, 100 `tt/live` rows written, 0 errors, 7 new unlinked discoveries.

## Prevention
- Every platform API that takes a list of IDs must be chunked to the documented per-request limit. Never pass an unbounded linked-video list into one request.
- One failed batch must not abort the whole sync. Record it and continue.
