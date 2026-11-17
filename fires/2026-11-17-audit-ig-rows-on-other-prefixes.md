# AUDIT: Instagram analytics attached to #tt / #yt posts rows
**Date:** November 17, 2026
**Severity:** MEDIUM
**Status:** OPEN, audit only. The IG resolver is unchanged by owner decision.

## Finding
- 51 `#ig` posts rows have no `post_analytics` rows at all.
- 130 Instagram `post_analytics` rows, across all windows, sit on `#tt` or `#yt` posts rows. Day 1 live: 48 on `#tt` and 2 on `#yt`.
- The cause is `resolveIGPostsUUID()` in `instagram-sync.ts`. For a bundled pipeline `post_id` such as `#tt0012 | #ig0040`, it splits on `|` and uses the first segment that has a posts row, in written order, not the `#ig` segment.

## Effect
- The S78 Decision rule takes the platform from the posts row's own prefix, as the owner chose. A `#tt` row's Decision uses only its TikTok data. IG metrics attached to it never produce a stored Decision.
- The 51 empty `#ig` rows have a NULL Decision and no Analytics data.

## Options (not done)
1. Change the IG resolver to attach to the `#ig` segment's posts row, creating it if missing, then backfill or move the 130 rows.
2. Key Decision per pipeline item and platform instead of per posts row.
