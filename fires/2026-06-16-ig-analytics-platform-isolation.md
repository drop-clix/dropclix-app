# FIRE: IG Analytics Platform Isolation
**Date:** June 16, 2026
**Severity:** HIGH
**Status:** RESOLVED — code fixed, migration file added, IG sync/backfill completed

## What Happened

When the IG platform pill is active on the Analytics tab for the Day 1 / Chase client,
four bugs are observed simultaneously:

1. **`#ig0037` appears twice** in the analytics table
2. **KPI "Total Views" shows ~1.2K** — YT view counts bleeding into IG aggregate
3. **`#ig0033` appears with no metrics** (all `—`) despite being a YT-linked post
4. **`#ig0033` title shows a YouTube caption** instead of the pipeline title

## Confirmed Data State (SQL)

```
Day 1 client post_analytics distribution:
  ig / live  = 1
  yt / live  = 85
  yt / eom   = 84
  yt / w24   = 2
  tt / *     = 0

#ig0037 post_analytics rows: (yt, live), (yt, w24), (ig, live)
#ig0033 post_analytics rows: 0
```

## Root Causes

### Bug 1 — #ig0037 duplicate row

Two separate `posts` rows (different `posts.id` UUIDs) both have `posts.platform`
containing `'ig'`. Both pass `filterByPlatform('ig')`. Both resolve the same
`pipelinePostId` via the video-ID / post-segment lookup maps. `displayPostId` returns
`#ig0037` for both. React renders both because `key={post.uuid}` differs between them.

**Underlying cause:** No `UNIQUE (post_id, client_id)` constraint on the `posts` table.
`ensureIGPostsRow()` (S44) likely created a second `posts` row after a YT `posts` row
already existed for the same pipeline item — or a CSV import and a later
`ensureIGPostsRow()` call independently created rows for the same video.

**Code location:** `analytics/page.tsx:102` (mapping loop); `edit-actions.ts`
`ensureIGPostsRow` (insert-if-missing guard may not be airtight under concurrent calls).

### Bug 2 — KPI YT bleed

`resolveWin(post, 'ig', 'live')` at `AnalyticsClient.tsx:24–31`:

```ts
function resolveWin(post, platform, win) {
  if (platform !== 'all') {
    const platKey = platform === 'lf' ? 'yt' : platform
    const hit = post.byPlatformWindow[`${platKey}_${win}`]
    if (hit) return hit
  }
  return post[win]   // <-- fallback to flat window
}
```

For posts that pass `filterByPlatform('ig')` (because `posts.platform.includes('ig')`)
but have only YT analytics, `byPlatformWindow['ig_live']` is absent. `resolveWin`
falls back to `post.live` — the flat window, which is populated with YT data.

The KPI reduces over all `rows`: `rows.reduce((s, r) => s + resolveWin(r, 'ig', 'live').views, 0)`.
This sums YT views from every IG-filtered post that lacks an `ig_live` analytics row.

**Code location:** `AnalyticsClient.tsx:24–31` (`resolveWin`), `AnalyticsClient.tsx:848`.

### Bug 3 — #ig0033 appearing with no metrics

`filterByPlatform` at `usePortalFilters.ts:100`:

```ts
return items.filter(item => item.platform.includes(platform))
```

This is a metadata-only check — it does not verify whether any `post_analytics` rows
exist for that platform. `#ig0033` has `posts.platform` containing `'ig'`, so it passes.
Its analytics windows are all `EMPTY_WIN`. `resolveWin` finds no `ig_live` entry and
returns `post.live = EMPTY_WIN`, rendering all metrics as `'—'`.

**Code location:** `usePortalFilters.ts:88–101`; `AnalyticsClient.tsx:801–802` (rows memo).

### Bug 4 — #ig0033 title shows YT caption

Title resolution at `analytics/page.tsx:138`:

```ts
title: (resolvedPipelinePostId ? pipelineTitleByPostId.get(resolvedPipelinePostId) : null) ?? p.title,
```

`p.title` = `posts.title` = YT API caption (legitimate storage per CLAUDE.md). The
fallback fires when either:

- **Mode A:** No `pipeline_items` row is found for `#ig0033` — `pipelineByPostSegment.get('#ig0033')`
  returns undefined, `resolvedPipelinePostId = null`, title falls through to `posts.title`.

- **Mode B:** A pipeline item is found but `pipeline_items.title` is null. Line 86
  (`if (pipelineTitle) pipelineTitleByPostId.set(...)`) skips the entry. Lookup returns
  undefined. Falls through to `posts.title`.

Either mode causes the YT caption to display, violating the
"pipeline_items.title is the ONLY display title source" invariant.

**Code location:** `analytics/page.tsx:86` (`pipelineTitleByPostId` population);
`analytics/page.tsx:138` (title fallback).

## What Was Done

Fixed in the global Analytics isolation session on June 17, 2026:

- `AnalyticsClient.resolveWin()` now returns an empty window when a platform-specific row is missing. It only falls back to the flat `post[win]` window when `platform='all'`.
- The Analytics rows memo now filters active platform views by actual `byPlatformWindow[platform_window]` existence, so posts tagged IG but missing `ig/live` no longer appear in the IG view.
- Search, KPI cards, chart ER%, snapshot modal, and slide-over windows now use platform-resolved window data.
- Inline metric edits now use the active platform pill for platform-specific views instead of `post.platform[0]`.
- `analytics/page.tsx` now merges `PostRow` objects that resolve to the same `pipeline_items.post_id`, preventing duplicate display rows such as `#ig0037`.
- `pipelineTitleByPostId` now maps both the full pipe-separated ID and every segment (`#ig0037`, `#tt0007`, `#yt0087`) to the pipeline title.
- If a pipeline item exists but has no title, Analytics displays `Untitled` instead of falling through to raw `posts.title`.
- Exact duplicate preview query for `(post_id, client_id)` returned 0 rows.
- Added migration file `supabase/migrations/session_47_posts_unique_post_id_client_id.sql` for `UNIQUE (post_id, client_id)`.

The migration file is committed with the fix. Production DDL still needs the normal Supabase migration/SQL application path because this repo does not include a Supabase CLI config or DB connection URL.

## Ranked Fix Plan

| Priority | Fix | Bugs | Status |
|----------|-----|------|--------|
| 1 | `resolveWin`: when `platform ≠ 'all'` and `byPlatformWindow[platKey_win]` is absent, return empty window instead of `post[win]` | 2, 3 | Done |
| 2 | Rows memo: after `filterByPlatform`, exclude posts with no active platform analytics row when `platform ≠ 'all'` | 3 | Done |
| 3 | Merge rows by resolved `pipeline_items.post_id`; add migration for `UNIQUE (post_id, client_id)` | 1 | Done in code and migration file |
| 4 | Title hardening: segment-key pipeline titles and never fall through to `posts.title` when a pipeline item exists | 4 | Done |

Fix 1 is highest leverage — it eliminates the bleed mechanism driving both bugs 2 and 3
in a single line change, with zero risk to YT or TT views when `platform='all'`.

## Prevention

- `posts.platform` and `post_analytics.platform` must be treated as independent axes.
  The analytics display platform filter must consult `byPlatformWindow` existence, not
  just `posts.platform` metadata.
- `resolveWin` should never silently fall back to a cross-platform window. The flat
  `post[win]` fallback is only safe for `platform='all'`.
- Enforce `UNIQUE (post_id, client_id)` on `posts` to prevent `ensureIGPostsRow` /
  `ensureYTPostsRow` / `ensureTTPostsRow` from creating duplicates under any call order.
- `pipelineTitleByPostId` lookup failing must never surface `posts.title` when a
  pipeline item exists — that is the YT caption, not the display title.

## Resolution

[x] RESOLVED

## Follow-Up Investigation — IG Sync Views + Missing Posts Rows

**Date:** June 17, 2026
**Scope:** Audit only. No code or data changes.

### What Was Checked

- `src/lib/instagram-sync.ts`
- `src/app/api/admin/sync-instagram/route.ts`
- `src/app/(dashboard)/edit-actions.ts`
- `src/components/portal/PipelineClient.tsx`
- Read-only Supabase checks for `#ig0061`, `#ig0031`, `#ig0033`, `#ig0037`
- Read-only Instagram Graph API checks with token values redacted from output

### Confirmed Data State

- `platform_connections` has a valid Day 1 Instagram connection:
  `_chasevans_`, `channel_id=17841404687918692`, token expiry `2026-08-14`,
  follower count `3641`, last synced `2026-06-17`.
- Pipeline items exist and have IG links:
  - `#ig0061` → `ig_video_id=DV3uKcijuWl`
  - `#ig0031 | #tt0001 | #yt0081` → `ig_video_id=DZlyOU8NMo1`
  - `#ig0033 | #tt0003 | #yt0083` → `ig_video_id=DZgas-3P05b`
  - `#ig0037 | #tt0007 | #yt0087` → `ig_video_id=DZjhk1-t59c`
- `posts` has a row for `#ig0037` only. It has no rows for `#ig0061`,
  `#ig0031`, or `#ig0033`.
- `post_analytics` has `ig/live` for `#ig0037` with `views=0`, `likes=325`,
  `comments=214`, `saves=0`.

### Finding 1 — Why IG Views Are 0

`instagram-sync.ts` requests these insight metrics for IG videos:

```txt
reach,saved,plays,impressions
```

The live Graph API response rejects the request because `plays` is not a valid
metric for these media objects. The error says valid metrics include `views`,
`reach`, `saved`, `shares`, `total_interactions`, `ig_reels_avg_watch_time`,
`ig_reels_video_view_total_time`, and `reels_skip_rate`.

Because the request fails as a whole, `fetchIGMediaInsights()` returns the empty
fallback:

```ts
{ reach: 0, saved: 0, plays: null, impressions: 0 }
```

The sync then stores `views = insights.reach || 0`, while likes/comments still
come from the separate `/media` response. That is why rows can show real likes
and comments but `views=0`.

A read-only replacement check against `#ig0037` using:

```txt
views,saved,reach,total_interactions,shares,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate
```

returned successfully with:

```txt
views=7735
reach=5585
saved=4
shares=4
reels_skip_rate=36.6
```

`impressions` is also unsupported for this media product type, so including it
in the same metric request causes the entire insights call to fail.

**Proposed fix:** Update IG sync to request Reels-safe metrics. Preserve the
locked portal formula by continuing to map portal `views` to `reach` unless
Chase explicitly changes the IG definition. Store `shares` and `saves` from the
insights response. If/when schema supports it, store Graph `views` separately
from portal `views/reach`.

### Finding 2 — Why Some IG Pipeline Items Have No Posts Row

Current code paths are correct for new actions:

- IG link modal save calls `ensureIGPostsRow(item.id)` after `updatePipelineItem()`
  when `ig_video_id` is parsed.
- Mark as Posted calls `ensureIGPostsRow(item.id)` when an IG URL/ID is present.
- `ensureIGPostsRow()` delegates to `ensureSocialPostsRow()`, which reads
  `pipeline_items`, extracts the `#ig` segment, checks existing `posts` rows by
  full pipe ID and segment, then inserts a stub row if missing.

The missing rows are almost certainly historical: the audited pipeline items
already had `ig_video_id` values but were created/linked before the S44
`ensureIGPostsRow()` wiring existed, or were updated through a path that did not
invoke the helper at the time. Since the sync resolver requires a matching
`posts` row after it finds the linked pipeline item, these items cannot receive
`post_analytics` rows until the missing stubs are backfilled.

**Proposed fix:** Run a scoped backfill for posted pipeline items where
`ig_video_id IS NOT NULL` and no `posts` row exists for the `#ig` segment. Do a
dry-run SELECT first and insert only missing stubs using the same logic as
`ensureIGPostsRow()`.

### Finding 3 — Platform Naming Consistency

The code intentionally uses full provider names in `platform_connections`:

```txt
instagram, youtube, tiktok
```

Content and analytics tables use portal platform IDs:

```txt
ig, yt, tt, lf
```

This is consistent in the audited IG path:

- `/api/admin/sync-instagram` loads `platform_connections.platform='instagram'`.
- `syncInstagramForClient()` writes `post_analytics.platform='ig'`.
- `ensureIGPostsRow()` inserts `posts.platform=['ig']`.

No lookup mismatch was found in this path. The naming split is intentional, but
future code should avoid mixing connection provider names with analytics/content
platform IDs.

## Final Follow-Up Resolution — IG Reels Metrics + Backfill

**Date:** June 17, 2026
**Status:** RESOLVED

### Final Root Cause

Two separate issues were blocking IG Analytics from becoming useful:

1. `src/lib/instagram-sync.ts` requested invalid/unsupported Reel insight
   metrics: `plays` and `impressions`. Instagram rejected the entire insights
   request, the sync returned an empty metrics object, and portal `views`
   became `0` even though likes/comments were present from `/media`.
2. Some linked + POSTED IG pipeline items were historical rows from before S44
   wired `ensureIGPostsRow()` into IG link save and Mark as Posted. They had
   `pipeline_items.ig_video_id` but no `posts` row, so IG sync could not write
   `post_analytics`.

### Final Fix

- Replaced the IG video/Reel insight request with Reels-safe metrics:

```txt
views,saved,reach,total_interactions,shares,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate
```

- Kept the locked portal formula intact by mapping `post_analytics.views` to
  Graph `reach`, not Graph `views`.
- Started writing real `shares`, `saves`, and `skip_rate` from Instagram
  insights into `post_analytics`.
- Added Graph API error logging with the requested metric list plus
  message/code/type, so future metric changes do not silently collapse to
  `views=0`.
- Added `scripts/backfill-ig-posts-rows.mjs`, dry-run by default. The script
  mirrors `ensureIGPostsRow()` logic with service-role Supabase access because
  the server action itself depends on request cookies/auth and cannot be safely
  imported into a standalone script.

### Preview Before Insert

The exact requested preview query returned 4 rows:

```txt
#ig0061
#ig0031 | #tt0001 | #yt0081
#ig0033 | #tt0003 | #yt0083
#ig0037 | #tt0007 | #yt0087
```

`#ig0037` was a false positive because the query only checked exact full
`pipeline_items.post_id` and did not consider the existing segment row
`posts.post_id = '#ig0037'`.

The segment-aware preview returned the true missing set:

```txt
#ig0061 -> #ig0061
#ig0031 | #tt0001 | #yt0081 -> #ig0031
#ig0033 | #tt0003 | #yt0083 -> #ig0033
```

### Backfill Result

Ran:

```bash
node scripts/backfill-ig-posts-rows.mjs --run
```

Created exactly 3 rows:

```txt
#ig0061
#ig0031
#ig0033
```

Post-backfill dry run reported:

```txt
No missing IG posts rows found.
```

### Sync Verification

Corrected IG sync populated `ig/live` rows for all four target posts:

| Post ID | Views (Reach) | Likes | Comments | Shares | Saves | Skip Rate |
|---|---:|---:|---:|---:|---:|---:|
| `#ig0031` | 2,338 | 128 | 6 | 2 | 7 | 45.7 |
| `#ig0033` | 1,093 | 75 | 2 | 23 | 2 | 63.4 |
| `#ig0037` | 5,585 | 325 | 214 | 4 | 4 | 36.5 |
| `#ig0061` | 221,671 | 15,680 | 190 | 4,616 | 4,623 | 36.3 |

Graph `views` is available separately from reach, but it is not currently stored
because the locked IG formula defines portal views as reach.

## Final Resolution Addendum — Reach vs Client-Facing Views Split

**Date:** June 17, 2026
**Status:** RESOLVED

### What Changed

The portal now stores Instagram Reach and Instagram Views separately:

- `post_analytics.views` remains the locked formula metric for IG and means
  Reach / unique accounts reached.
- `post_analytics.client_views` is a new display-only column for Instagram
  Graph API `views` / total plays.
- YouTube and TikTok continue to use `post_analytics.views` as their real
  views metric. They do not use `client_views`.

### Schema

Added migration:

```sql
alter table post_analytics
add column if not exists client_views integer;
```

Production Supabase was updated manually through SQL Editor because this repo
does not include a direct DB URL, `psql`, Supabase CLI config, or an SQL
execution RPC.

### Sync Verification

The Day 1 Instagram sync wrote both metrics correctly:

| Post ID | Reach (`views`) | Client Views (`client_views`) | ER Source |
|---|---:|---:|---|
| `#ig0031` | 2,341 | 3,768 | Reach |
| `#ig0033` | 1,098 | 1,783 | Reach |
| `#ig0037` | 5,593 | 7,746 | Reach |
| `#ig0061` | 221,671 | 301,492 | Reach |

For `#ig0061`, ER remained `11.33%` using Reach:

```txt
(15,681 likes + 190 comments + 4,616 shares + 4,623 saves) / 221,671 reach
= 11.33%
```

That keeps the decision at `Iterate`. If the new client-facing Views value were
used by mistake, ER would change, so this was explicitly verified.

### Code Resolution

- `src/lib/instagram-sync.ts` writes `client_views: insights.views || 0` while
  preserving `views: insights.reach || 0`.
- `src/app/(dashboard)/analytics/page.tsx` selects and maps `client_views`.
- `src/components/portal/AnalyticsClient.tsx` uses `client_views` only for
  IG display surfaces: Views column, Total Views KPI, search/sort by views,
  snapshot modal, slide-over data handoff, and chart view counts.
- `src/components/portal/PostSlideOver.tsx` displays IG `client_views` in the
  metric window grid while its ER calculation still uses Reach.

### Prevention

- Never rename `post_analytics.views`; for IG it means Reach.
- Never feed `client_views` into ER%, Decision, or threshold logic.
- Any future admin edit path for client-facing IG Views must write
  `client_views` and must not recompute Decision.
