# FIRE: IG Analytics Platform Isolation
**Date:** June 16, 2026
**Severity:** MEDIUM
**Status:** OPEN — fix planned for next global session

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

## What Was NOT Done

No code was changed in this session. This is an audit-only incident report.

## Ranked Fix Plan

| Priority | Fix | Bugs | Location |
|----------|-----|------|----------|
| 1 | `resolveWin`: when `platform ≠ 'all'` and `byPlatformWindow[platKey_win]` is absent, return `EMPTY_WIN` instead of `post[win]` | 2, 3 | `AnalyticsClient.tsx:24–31` |
| 2 | Rows memo: after `filterByPlatform`, exclude posts with no `byPlatformWindow[platKey_live]` entry when `platform ≠ 'all'` | 3 | `AnalyticsClient.tsx:801` |
| 3 | DB migration: add `UNIQUE (post_id, client_id)` to `posts`; add client-side dedup in page.tsx mapping as short-term guard | 1 | `analytics/page.tsx:102` + Supabase SQL editor |
| 4 | Title hardening: when `resolvedPipelinePostId` is non-null but title lookup returns undefined, render `resolvedPipelinePostId` (never fall through to `posts.title`) | 4 | `analytics/page.tsx:138` |

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
