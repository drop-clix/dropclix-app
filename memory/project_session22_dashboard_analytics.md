---
name: project-session22-dashboard-analytics
description: Session 22 dashboard overhaul, Analytics chart migration, AI suggestions route, and post ID cleanup
metadata:
  type: project
---

Session 22 completed 2026-06-06.

## Dashboard

- Removed all dashboard charts, the old status-strip boxes below the KPI row, and the recent content table.
- `src/components/portal/DashboardClient.tsx` now owns the new dashboard experience:
  - 4 KPI cards: Followers/Conversion toggle, Reach/Watch% toggle, ER%/Top Video toggle, Posts static.
  - 3 projection cards based on the last 10 posts for the selected platform.
  - Projection cards open a right-side AI Suggestions drawer.
  - 7-day calendar snapshot with event pills and post snapshot pop-up.
  - Pipeline snapshot linking to exact pipeline item.
  - Bottom AI suggestion cards generated from filtered performance context.
- Dashboard server fetch in `src/app/(dashboard)/page.tsx` now includes richer posts, pipeline rows, calendar events, and goals.

## AI suggestions

- Added `src/app/api/ai-suggestions/route.ts`.
- Uses `@anthropic-ai/sdk` with model `claude-sonnet-4-20250514` when `ANTHROPIC_API_KEY` exists.
- Returns deterministic, data-specific fallback suggestions when the key is missing. Fallbacks cite real post IDs, titles, pillars, hooks, ER, watch, reach, and follower data.
- Local env did not have `ANTHROPIC_API_KEY` during verification, so live Claude generation could not be verified locally. The route compiled and protected auth behavior was confirmed.

## Analytics

- Dashboard charts moved off the dashboard.
- `src/components/portal/AnalyticsClient.tsx` now renders 4 charts below the table:
  - Monthly Views / Reach by Post with Top / Last 10 / All toggle.
  - ER% Over Time with tier-colored points.
  - Posts Volume vs Growth %.
  - Avg ER% by Content Pillar.
- Chart cards use dark backgrounds, no white surfaces, platform glow only, gold controls, info icon, expand button, hover tooltips, and clickable post points.
- Analytics ER calculation now uses YouTube subscribers gained (`followers`) as the fourth metric for YT rows.

## Deep links

- `PipelineClient` reads `?item=<uuid>` and opens the exact item, setting the page when pagination would otherwise hide it.
- `CalendarClient` reads `?post=<post_id>` and selects/opens the matching calendar item.

## Supabase ID cleanup

- Added `scripts/normalize-pipeline-post-ids.mjs`.
- Ran against Supabase:
  - Pipeline: 154 rows scanned; 48 rows normalized.
  - Calendar notes: 111 rows scanned; 9 rows normalized.
  - Final audit: 0 pipeline changes remaining, 0 calendar note changes remaining.

## Verification

- `npm run build` passes with zero TypeScript errors.
- Browser verified:
  - Dashboard KPI toggles.
  - Projection drawer.
  - Calendar event post snapshot after calendar note normalization.
  - Dashboard pipeline deep link opens exact item expanded.
  - Analytics chart cards render below table.
  - Analytics Top/Last/All toggle works.
  - Chart bar click opens post snapshot.
- `npm run lint` still fails on pre-existing repo-wide lint issues in older files; build is clean.
