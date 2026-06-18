# FIRE: IG Posts Disappeared After TikTok Sync Build
**Date:** June 18, 2026
**Severity:** HIGH
**Status:** RESOLVED

## What Happened
After building TikTok sync (commit 791f3f8), IG Analytics
tab dropped from 4 posts to 2. #ig0031 and #ig0033
disappeared from the IG pill view.

## Confirmed Data State
- #ig0031 and #ig0033 have both ig/live AND yt/live rows
- posts rows exist with platform=['ig'] for both
- No null platform rows confirmed

## Suspected Cause
Client-side dedup logic introduced earlier today may be
collapsing #ig0031/#ig0033 with their YT counterparts
(#yt0081/#yt0083) since they share the same pipeline item.

## Root Cause
`analytics/page.tsx` deduped rows by resolved pipeline post ID, but the
merge kept the first row's platform/title/date identity. After TikTok sync,
TikTok `posts` rows with `date=null` sorted before the IG/YT rows and won
the dedup for shared pipeline items like `#ig0031 | #tt0001 | #yt0081`.
The merged row still carried IG/YT analytics, but its platform array stayed
`['tt']`, so the IG and YT pill filters hid it.

The same first-row-wins merge could also allow an API caption from
`posts.title` to survive instead of the curated `pipeline_items.title`.

## Resolution
[x] RESOLVED

- Rebuilt the Analytics dedup merge so one merged row represents the full
  pipeline item across IG, TT, and YT.
- Merged platform arrays from all rows instead of keeping the winner's
  platform metadata.
- Merged all platform/window analytics into `byPlatformWindow` so IG, TT,
  and YT pills can each resolve their own live/window rows.
- Added `uuidByPlatform` so inline metric edits target the correct
  platform-specific `posts.id` inside a merged row.
- Forced display title resolution back to `pipeline_items.title` after
  merge; `posts.title` is only fallback for truly unlinked posts.
- Added auto-sync on link save / Mark as Posted for IG, TT, and YT through
  `syncLinkedVideoNow()`.
