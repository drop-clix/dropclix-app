# FIRE: IG Analytics Platform Isolation
**Date:** June 16, 2026
**Severity:** HIGH
**Status:** RESOLVED — code fixed, migration file added

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
