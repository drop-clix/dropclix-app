# FIRE: Instagram sync only saw the newest 100 media
**Date:** November 17, 2026
**Severity:** HIGH
**Status:** RESOLVED (runtime risk open)

## What Happened
Older linked Day 1 reels never got Instagram metrics. Unlinked discovery also missed every reel older than the newest 100.

## Root Cause
- `fetchIGMedia()` in `src/lib/instagram-sync.ts` requested `/media?limit=100` once and ignored `paging.next`.
- Day 1 has 152 media, so 52 were never listed.
- Both the full-client sync and `syncSingleIGVideo()` used that lister. Single-video sync, used by link actions and snapshot refresh, therefore also failed for older reels.

## What Was Done
- `fetchIGMedia()` follows the Graph cursor (`paging.next`) until the last page and merges all pages before the unchanged resolution, insights, upsert and discovery logic.
- A 50-page safety cap (5,000 media) logs a warning and adds it to the sync result errors.
- A failed page, including the first, is reported in the result instead of returning a silent partial or empty list.
- `syncSingleIGVideo()` stops paging once its target shortcode is found.
- `paging.next` URLs contain the access token and are never logged.
- ER%, Decision, the reach/client_views split, token refresh and OAuth state were not touched. No schema changes.

## Verification
- `npx tsc --noEmit` clean. Lint error count unchanged (5 pre-existing `no-explicit-any`).
- Mocked fetch test: 0, 100, 152 and 5,500 media; page cap; first-page and mid-page failure; early stop for single-video lookups. All passed.
- Live Day 1 IG sync from the deployed commit: 152 media in 2 pages, 112 synced, 40 unlinked, 0 errors. IG live rows went from 89 to 112. The 23 new rows all have nonzero reach.
- TikTok re-run: 100 of 100 synced, 0 errors. YouTube: Analytics call 200 and discovery ran cleanly.

## Open Risk: Runtime
- Full Day 1 IG sync took about 180s locally. Work is sequential per linked post.
- No route sets `maxDuration`, so Vercel's 300s default applies. Around 190+ linked IG posts could time out.
- Proposed fix: bounded concurrency over the per-post loop, `maxDuration = 300` on the route, and an elapsed-time guard that returns a resume cursor for chunked continuation.

## Same Pattern Elsewhere (not changed)
- TikTok `video/list` discovery: 5-page cap (100 videos). Day 1's last page still reports `has_more=true`. No warning is logged.
- YouTube discovery: 3-page cap (150 uploads). No warning. Day 1 has 94 uploads, so not truncating yet.

## Prevention
- Any list endpoint must follow its cursor to the end, with a logged and reported safety cap.
- A sync must never present a truncated list as complete.
