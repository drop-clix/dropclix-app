# FIRE: Full Instagram sync close to the 300s function limit
**Date:** November 17, 2026
**Severity:** MEDIUM (preventive)
**Status:** RESOLVED

## What Happened
After S75 made Instagram sync read all 152 Day 1 media, a full sync took about 180s. The work ran one post at a time, and the route had no `maxDuration`, time budget or resume path. Around 190 linked posts would have hit Vercel's 300s limit mid-sync.

## Root Cause
- `syncInstagramForClient()` processed posts sequentially. Each post makes one Graph insights call plus several Supabase calls.
- No Graph rate-limit handling existed. A rate-limited insights call returned an empty result, which then overwrote the live row with zeros.
- A thrown error inside the loop, such as a network failure, aborted the whole sync.

## What Was Done
- `src/lib/concurrency.ts`: shared `runPool()` with bounded concurrency, in-order starts, a synchronous stop check and per-item error isolation.
- `src/lib/graph-rate-limit.ts`: `graphFetch()` reads `x-app-usage` and `x-business-use-case-usage`, slows or pauses at high usage, and retries codes 4, 17, 32 and 613 exactly once.
- Instagram sync runs 4 posts in parallel. A transient insights failure skips the post and keeps the existing row. Each failed post is logged and counted in `failed`.
- `/api/admin/sync-instagram` sets `maxDuration = 300`, stops starting posts after 230s or when Graph reports the quota exhausted, and returns a resume cursor. Sync Now continues automatically for time-budget stops.
- TikTok's per-item DB loop runs 4 in parallel. YouTube's loop uses the helper at concurrency 1, for isolation only.
- ER%, Decision, the reach/client_views split, token refresh, OAuth state and schema were not touched.

## Verification
- `npx tsc --noEmit` clean. Lint error counts unchanged in every touched file.
- Mocked tests (15 checks): pool bound and order, error isolation, exact stop index, single retry then stop, recovery on retry, no retry on other codes, usage-header blocking, resume cursor by ID, by timestamp and past the end.
- Vercel API: Hobby + Fluid, `functionDefaultTimeout = 300`, region `iad1`.
- Day 1 live, run locally against production: IG ~180s → ~39s with 112 rows written. Budget test: 19 posts, then cursor resume of 93 with no overlap. TikTok ~63s → ~27s with 100 rows. YouTube route (auth stubbed) 91 synced, 1 skipped on a YouTube 500.

## Prevention
- New per-item sync loops use `runPool()`, never unbounded `Promise.all`.
- Every Graph call goes through `graphFetch()`. Never retry in a loop.
- A transient API failure must never overwrite stored metrics with zeros.
- Long syncs return a resume cursor instead of running into the platform time limit.
