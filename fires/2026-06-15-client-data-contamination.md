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
- Starting post_id: #yt0071 (floor), actual = max(existing Nick #yt####) + 1
- pipeline_items: skipped existing rows (yt_video_id match), inserted new
- posts: skipped existing rows (yt_id match), inserted new
- post_analytics: upserted all 354 rows as metric_window='live'
- Cross-contamination check confirmed 0 Nick ytIds leaked into Day 1 client

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
