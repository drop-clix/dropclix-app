---
name: project-html-audit-posts
description: Audit comparing portal-nick-updated.html SEED_VIDS against Supabase posts/post_analytics (Session 14e, 2026-06-01)
metadata:
  type: project
---

Compared all IG posts in `SEED_VIDS` from `portal-nick-updated.html` against Supabase `posts` + `post_analytics`.

**Why:** Verify data integrity after post ID rename and confirm Supabase matches the source HTML.

**How to apply:** Use this to know what's in-sync and what needs follow-up before adding new data.

## Results

| Check | Result |
|-------|--------|
| HTML IG posts | 44 (includes 1 duplicate ID) |
| Supabase IG posts | 43 |
| Missing from Supabase | **1** |
| Extra in Supabase (not in HTML) | 0 |
| Metric differences (w24/w3/w7/eom) | **0** |

## Missing post

**`#0052` (2026-02-26) — "Everyone can sell"**

Root cause: the HTML has two posts with ID `#0052`:
- `#0052` 2026-02-26 "Everyone can sell" (w7 reach=4,378) ← **MISSING**
- `#0052` 2026-03-23 "Everyone can sell" (w7 reach=2,904) ← now `#ig0030` in Supabase

The original `migrate-nick.mjs` used `upsert` with `onConflict: 'client_id,post_id'`. Since both had the same `post_id`, the second one silently overwrote the first.

Full metrics for missing post:
```json
{
  "id": "#0052", "date": "2026-02-26", "title": "Everyone can sell",
  "pillar": "Self Development", "hook": "Authority", "format": "Podcast Clip",
  "decision": "Kill",
  "w24": { "reach": 1722, "likes": 41, "comments": 2, "shares": 2, "saves": 6, "followers": 0, "watch": 0.26 },
  "w3":  { "reach": 2349, "likes": 38, "comments": 1, "shares": 6, "saves": 10, "followers": 1, "watch": 0.21 },
  "w7":  { "reach": 4378, "likes": 87, "comments": 7, "shares": 37, "saves": 21, "followers": 5, "watch": 0.33 }
}
```

**Status:** Inserted as `#ig0044` in Session 14f (2026-06-01). Supabase now has 44 IG posts, matching the HTML exactly.

## All HTML IG posts (ID mapping reference)

All 43 matched posts had zero metric discrepancies across all windows (w24, w3, w7, eom).
See [[project-post-id-mapping]] for the old→new ID table.
