# FIRE: Client Data Contamination
**Date:** June 15, 2026
**Severity:** CRITICAL
**Status:** RESOLVED

## What Happened
Day 1 | D 1 posts rows (posts table) were duplicated under
Nick Nascimento's client_id. Nick's portal displayed Chase's
personal brand videos as if they were Sparta Solar content.
89 post_analytics rows and 43 posts rows existed under the
wrong client.

## Root Cause
Unknown at time of writing — suspected to have occurred during
an early session when ensureYTPostsRow or a bulk import did not
correctly scope inserts to the active client_id. The function
may have used a hardcoded or incorrectly resolved client_id
instead of the pipeline item's actual client_id.

## What Was Done
1. Ran SELECT audit to confirm 43 duplicate post_id entries
   across two client_ids
2. Deleted 89 orphaned post_analytics rows under Nick's client_id
3. Deleted 43 duplicate posts rows under Nick's client_id
4. Confirmed zero cross-client duplicates remain

## Collateral Damage
Nick's legitimate posts rows were also deleted in the cleanup
because they shared post_id format with Day 1 posts. 57 posts
rows need to be rebuilt via ensureYTPostsRow. LF posts need
manual CSV re-import.

## Prevention
- [ ] Add client_id assertion to ensureYTPostsRow,
      ensureIGPostsRow, ensureTTPostsRow — verify the resolved
      client_id matches the pipeline_item's client_id before
      any insert
- [ ] Add a unique constraint or pre-insert check: never insert
      a posts row if that post_id already exists under a
      DIFFERENT client_id — log a warning instead
- [ ] Before any destructive SQL (DELETE), always run a SELECT
      preview filtered by BOTH client_id AND post_id to confirm
      only the intended rows are targeted
- [ ] Never filter on post_id alone — always include client_id
- [ ] Add a nightly SQL check that alerts if any post_id exists
      under more than one client_id
- [x] Always scope CSV imports by client_id — every insert row
      must carry client_id explicitly (added to restore script)
- [x] Restoration script scopes every read + write to Nick's
      client_id, with cross-contamination check in verify step

## Resolution
[x] COMPLETE — S46 deployed June 15, 2026

Recovery method:
- YouTube Studio CSV export (nick_yt_import.csv, 354 videos)
- Script: `scripts/restore-nick-yt-from-studio.mjs --run`
- Sorted chronologically (oldest first) for date-ordered #yt#### IDs
- New post_ids assigned: #yt0071 – #yt0411 (341 new pipeline items)
- pipeline_items: 341 inserted, 13 skipped (already existed), 0 failed
- posts:          343 inserted, 11 skipped (already existed), 0 failed
- post_analytics: 354 upserted (metric_window='live'), 0 failed
- Cross-contamination check: 0 Nick ytIds found in Day 1 client rows ✓

Final verified counts (Nick, YT):
- pipeline_items: 356
- posts:          355
- post_analytics: 354 (metric_window='live')

Verify final state in Supabase SQL Editor:
```sql
SELECT COUNT(*) FROM pipeline_items
WHERE client_id='913f1794-1506-4449-b56c-b683809cefc3'
AND platform @> ARRAY['yt'];

SELECT COUNT(*) FROM posts
WHERE client_id='913f1794-1506-4449-b56c-b683809cefc3'
AND platform @> ARRAY['yt'];

SELECT COUNT(*) FROM post_analytics
WHERE client_id='913f1794-1506-4449-b56c-b683809cefc3'
AND platform='yt' AND metric_window='live';
```
All three should be ≥ 354.

## Follow-up Discovery — June 18, 2026
A ghost `ig/live` row with 0 views and 74 likes was found on
posts row `#yt0083` (UUID: `d1fcdc2d-9217-41e8-9bc3-41ee37d19560`).
This row survived the original June 15 contamination cleanup. It was
overwriting `#ig0033`'s real `ig/live` analytics (1,124 views) during
the dedup merge introduced today.

Fix applied via SQL:
1. Updated `#yt0083` platform from `['ig','tt','yt']` to `['yt']`
2. Deleted ghost `post_analytics` row
   (`id: 4d0a0732-74d7-4483-9811-14911ac328ba`)

Prevention: The `UNIQUE (post_id, client_id)` constraint on `posts`
prevents new contamination but does not prevent a single row from
having an incorrect platform array. Future audits should check for
posts rows where platform array includes platforms that don't match
the `post_id` prefix.
