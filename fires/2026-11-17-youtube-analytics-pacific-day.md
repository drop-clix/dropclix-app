# FIRE: YouTube sync dropped each video's publish day
**Date:** November 17, 2026
**Severity:** HIGH
**Status:** RESOLVED for live rows. Stored Decision and locked windows remain stale by decision.

## What Happened
Stored YouTube live views, likes and subscribers gained were lower than YouTube's lifetime totals for about half of Day 1's videos. YouTube ER% and the Analytics badge were wrong for those videos.

## Root Cause
- `sync-youtube` queried Analytics from `startDate = posts.date`.
- YouTube Analytics reports days in Pacific time. `posts.date` is the UTC date of `publishedAt`.
- A video published between 00:00 and 06:59 UTC is the previous day in Pacific time. Its `posts.date` is one day after its first Analytics day, so the publish day, usually the biggest day for a Short, was excluded.
- Day 1: 50 of 88 videos with a stored publish time fall in that window. 48 changed, all in that window: 42,257 views, 604 likes and 45 subscribers gained were missing.

## What Was Done
- `src/lib/youtube-analytics.ts`: one batched `dimensions=video` Analytics call per 200 IDs over a lifetime range, plus batched impressions/CTR.
- The route falls back per video only for IDs missing from the batch or in a 5xx batch. A 4xx batch failure skips those IDs.
- Live rows only, same fields. A transient failure still skips without overwriting. ER% formulas and thresholds unchanged.
- A read-only `dry_run` mode shipped first and was reviewed before the real sync ran.

## Verification
- Dry run vs Data API `viewCount`: all 48 changed videos within 0.26%, 45 exact.
- Real Day 1 sync: 92 synced, 0 skipped. All 48 changed live rows equal the dry run exactly.
- 687 locked rows and 304 `posts.decision` values were byte-identical before and after.
- IG (112 synced) and TikTok (100 synced) still work. `npx tsc --noEmit` clean, lint unchanged.

## Known Stale Data (left as is by owner decision, option 1)
- **`posts.decision` is stale on 10 of the 11 flipped videos.** Lifetime ER now gives Kill, but the stored value is still Iterate on #yt0014, #yt0016, #yt0029, #yt0035, #yt0041, #yt0045, #yt0058, #yt0061, #yt0075 and #yt0078. #yt0115 stores NULL. The sync does not write `posts.decision`, so every surface that shows the stored text still says Iterate. Only the Analytics tier badge moved.
- **Locked windows (eom, w7, w3, w24) carry truncated-query values for the affected videos.** Example: #yt0014 eom = 68 views, while w24/w3/w7 = 844 and lifetime = 847. Any Decision recomputed from locked windows by the eom → w7 → w3 → w24 rule will still read the truncated `eom`.
- **The YouTube manual-edit recompute uses the saves formula.** `updateAnalyticsMetric()` in `edit-actions.ts` recomputes Decision as (likes + comments + shares + saves) / views for every platform. YouTube's locked formula uses subscribers gained (`followers`). `saves` is NULL on YouTube rows.

## Prevention
- Never bound a YouTube Analytics query by `posts.date`. Use a lifetime range, or convert to Pacific time and subtract a day.
- Ship a read-only dry run before any sync change that can move ER% or Decision.
