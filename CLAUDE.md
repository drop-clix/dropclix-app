@AGENTS.md

# Drop CLIX — App

Next.js 16.2.6 + Supabase SSR + Tailwind 4. Source under `src/`. Path alias `@/*` → `src/*`.

## Sessions

### Session 1 — Project scaffold ✅
- Created `dropclix-app` with Next.js 16, Supabase SSR, Tailwind 4
- Wrote `supabase/schema.sql` (all tables) and `supabase/rls.sql` (all RLS policies)

### Session 2 — Auth layer ✅
- Created `src/lib/supabase/client.ts` — browser singleton via `createBrowserClient`
- Created `src/lib/supabase/server.ts` — async server client; `cookies()` must be awaited (Next.js 16)
- Created `src/proxy.ts` — Next.js 16 renamed `middleware.ts` → `proxy.ts`; export must be named `proxy` not `middleware`
- Created `src/app/(auth)/login/page.tsx` — client component login form
- Created `src/app/(dashboard)/layout.tsx` — server component dashboard shell with role badge
- Created `src/app/admin/page.tsx` — admin-only page (proxy + server-side double-check)

### Session 3 — Login + Dashboard ✅
- Deleted `src/app/page.tsx` (conflicted with `(dashboard)/page.tsx` for `/` route)
- Restyled login page — full Drop CLIX gold/black design; role-based redirect (admin→/admin, client→/)
- Restyled dashboard layout — 220px gold/black sidebar; admin role bounced to /admin from layout
- Created `src/app/(dashboard)/page.tsx` — KPI cards, pipeline status strip, recent posts table
- Created `src/components/portal/PortalNav.tsx` — `usePathname` active state
- Created `src/components/portal/SignOutButton.tsx` — `supabase.auth.signOut()` + router.push
- Added Tailwind 4 `@theme` tokens in `globals.css`

### Session 4 — Analytics tab ✅
- Created `src/app/(dashboard)/analytics/page.tsx` — server component; fetches posts joined with
  `post_analytics` in a single Supabase query, flattens into `PostRow[]`, passes to client
- Created `src/components/portal/AnalyticsClient.tsx` — fully interactive client component:
  - Platform tabs: IG / TT / YT (TT and YT show empty state gracefully)
  - Window tabs: 24 Hr / 3 Day / 7 Day / EOM — switches all metrics and KPIs live
  - Pillar filter: All / Sales Tips / Self Development / Service/Love / Volume/50-150 / Time Management / Other
  - Sortable columns: Views, Likes, Comments, Saves, Shares, ER%, Watch%, Date
  - ER% formula: `(likes + comments + shares + saves) / views × 100` — matches original portal
  - Tier badges: Elite ≥12% (green), Strong 7–12% (blue), Avg 4–7% (amber), Kill <4% (red)
  - Decision badges: Double Down (gold), Iterate (amber), Kill (red)
  - KPI strip: Posts in view, Total Views, Avg ER%, Avg Watch% — all reactive to filters
  - Tier legend + ER formula note at bottom
- Unlocked analytics link in `PortalNav.tsx` (removed `soon: true`)
- Named state variable `win` not `window` to avoid shadowing browser global
- TypeScript clean: zero errors in source files (pre-existing .next/types error from deleted page.tsx is unrelated)

### Session 8 — Nick data migration ✅
- Extracted all SEED_* data from `portal-nick-updated.html` via Python + Node (line 766+)
- Storage key confirmed: `dropclix_nick_v4`
- Wrote `scripts/migrate-nick.mjs` — idempotent; `--run` to insert, `--force` to wipe + re-insert
- Migrated: 43 posts, 176 analytics rows (4 windows each; eom = w7 data), 93 pipeline items,
  6 ad campaigns, 4 creatives, 4 audiences, 48 calendar events
- Verified: 676,307 total views, 22,733 likes live in eom window
- Portal status mapping: SCRIPT LAB→SCRIPTED, FILMED→FILMING, NEEDS REVISION→REVIEWING, DEAD→CANCELLED

## Key decisions / gotchas

- **Next.js 16 proxy**: `middleware.ts` is deprecated. Use `src/proxy.ts` with `export function proxy()`.
- **cookies() is async**: Always `const cookieStore = await cookies()` in server components.
- **Env var names**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY), `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY).
- **Role check in proxy AND page/layout**: Proxy handles redirect; layout re-checks to be safe.
- **Login redirect**: After sign-in, role fetched client-side → admin goes `/admin`, client goes `/`.
- **No `app/page.tsx`**: Deleted — `app/(dashboard)/page.tsx` owns the `/` route via route group.
- **Admin on dashboard**: Layout redirects admin role to `/admin`, so `/` is client-only.
- **Dashboard queries**: Use `metric_window = 'eom'` for aggregate totals. Pipeline active = not POSTED/CANCELLED.
- **Analytics data join**: `posts.select('..., post_analytics(...)')` — Supabase returns analytics as nested array keyed by `metric_window`.
- **ER formula**: `(likes + comments + shares + saves) / views × 100` — matches the original HTML portal.
- **State naming**: Use `win` not `window` for WindowKey state variables (avoids browser global shadowing).
- **Port**: Dev server falls back; check `.next/dev/logs/next-development.log` for actual port.
- **Tailwind 4 theme**: Colors in `globals.css` `@theme {}` block, not `tailwind.config.js`.
- **Nick client ID**: `913f1794-1506-4449-b56c-b683809cefc3` (slug: "nick", email: nick@spartasolar.com)
- **Test client**: `test@client.com` (role=client) linked to Nick's client_id — use for portal testing
- **Re-run migration**: `node scripts/migrate-nick.mjs --force` to wipe + re-insert

## Current file structure (src/)

```
src/
  app/
    (auth)/login/page.tsx          ← gold/black login
    (dashboard)/
      layout.tsx                   ← sidebar, auth guard, admin redirect
      page.tsx                     ← dashboard KPIs
      analytics/page.tsx           ← analytics page (server)  ← Session 4
    admin/page.tsx
    globals.css
    layout.tsx
  components/portal/
    PortalNav.tsx                  ← usePathname active state
    SignOutButton.tsx
    AnalyticsClient.tsx            ← interactive analytics table  ← Session 4
  lib/supabase/
    client.ts
    server.ts
  proxy.ts
```

### Session 5 — Pipeline tab ✅
- Created `src/lib/supabase/admin.ts` — service-role client (bypasses RLS); server-only import
- Created `src/app/(dashboard)/pipeline/actions.ts` — `updatePipelineStatus` server action:
  - Validates status against allowlist
  - Verifies caller is authenticated + owns the item (non-admins restricted to their client_id)
  - Uses admin client to bypass the read-only RLS policy on pipeline_items
  - Calls `revalidatePath('/pipeline')` on success
- Created `src/app/(dashboard)/pipeline/page.tsx` — server component; typed `RawRow` cast needed
  because Supabase returns untyped rows without generated DB types (`as unknown as RawRow[]`)
- Created `src/components/portal/PipelineClient.tsx` — fully interactive client component:
  - Phase cards: Active (37) / Scripted / Planned / Filming / Reviewing / Posted / All — click to filter
  - Platform filter: All Platforms / IG / TT / YT
  - Pillar filter chips: All / Sales Tips / Self Development / Service/Love / Volume/50-150 / Other
  - Full-text search across title, ID, pillar, week, notes
  - Sortable columns: Title, Pillar, Week, Priority, Status
  - Priority color stripes + row tints: red=1 (urgent), amber=2-3, blue=4-5, green=6 (posted)
  - Inline status dropdown — optimistic UI update + server action; reverts on error
  - Script expand: "View" button on SCRIPTED items expands inline row with full script text
  - Status badge colors: SCRIPTED=gold, PLANNED=blue, FILMING=amber, REVIEWING=red, POSTED=green
- Unlocked pipeline link in `PortalNav.tsx`
- Default filter: ACTIVE (non-posted items) — most useful starting view with 37 active items
- TypeScript: zero source errors; sort comparator uses `priority` as numeric, others as string

## Key decisions / gotchas

- **Next.js 16 proxy**: `middleware.ts` is deprecated. Use `src/proxy.ts` with `export function proxy()`.
- **cookies() is async**: Always `const cookieStore = await cookies()` in server components.
- **Env var names**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY), `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY).
- **Role check in proxy AND page/layout**: Proxy handles redirect; layout re-checks to be safe.
- **Login redirect**: After sign-in, role fetched client-side → admin goes `/admin`, client goes `/`.
- **No `app/page.tsx`**: Deleted — `app/(dashboard)/page.tsx` owns the `/` route via route group.
- **Admin on dashboard**: Layout redirects admin role to `/admin`, so `/` is client-only.
- **Dashboard queries**: Use `metric_window = 'eom'` for aggregate totals. Pipeline active = not POSTED/CANCELLED.
- **Analytics data join**: `posts.select('..., post_analytics(...)')` returns analytics as nested array keyed by `metric_window`.
- **ER formula**: `(likes + comments + shares + saves) / views × 100` — matches the original portal.
- **State naming**: Use `win` not `window` for WindowKey state variables (avoids browser global shadowing).
- **Supabase untyped rows**: Without generated DB types, `.select()` returns generic type. Cast with `as unknown as RawRow[]`.
- **Pipeline RLS**: Clients have SELECT only on pipeline_items. Status updates use a server action with the admin client. Server action verifies ownership before updating.
- **admin.ts**: ONLY import in server actions / server components. Never in `'use client'` files.
- **Port**: Dev server falls back; check `.next/dev/logs/next-development.log` for actual port.
- **Tailwind 4 theme**: Colors in `globals.css` `@theme {}` block, not `tailwind.config.js`.
- **Nick client ID**: `913f1794-1506-4449-b56c-b683809cefc3` (slug: "nick", email: nick@spartasolar.com)
- **Test client**: `test@client.com` (role=client) linked to Nick's client_id — use for portal testing
- **Re-run migration**: `node scripts/migrate-nick.mjs --force` to wipe + re-insert

## Current file structure (src/)

```
src/
  app/
    (auth)/login/page.tsx
    (dashboard)/
      layout.tsx
      page.tsx                     ← dashboard KPIs
      analytics/page.tsx           ← Session 4
      pipeline/
        page.tsx                   ← Session 5
        actions.ts                 ← updatePipelineStatus server action
    admin/page.tsx
    globals.css
    layout.tsx
  components/portal/
    PortalNav.tsx
    SignOutButton.tsx
    AnalyticsClient.tsx            ← Session 4
    PipelineClient.tsx             ← Session 5
  lib/supabase/
    client.ts
    server.ts
    admin.ts                       ← Session 5 (service role, server-only)
  proxy.ts
```

### Session 6 — Ads tab ✅
- Created `src/app/(dashboard)/ads/page.tsx` — server component:
  - Fetches `ad_campaigns` + `ad_creatives` in parallel
  - Computes `effectiveRevenue = roas > 0 ? roas * spend : 0` (migration left `revenue = 0`)
  - Infers campaign end dates: end of campaign N = day before campaign N+1's start date
  - Builds `campaignNameById` map to join creatives → campaign names
  - Computes summary totals (totalSpend, totalRevenue, portfolioROAS, totalHires) server-side
- Created `src/components/portal/AdsClient.tsx` — interactive client component:
  - 4 KPI cards: Total Spend ($314.91), Estimated Revenue ($12.5K), Portfolio ROAS (39.7x), Total Hires (5)
  - Active / Completed / All status toggle
  - Sortable campaign table: Date, Spend, Revenue, ROAS, Leads, Hires, CPL, CPH, Status
  - Winner row highlighting: gold left border + tint when ROAS > 0 (Hat Toss only)
  - Revenue column: green when > 0, grey dash otherwise
  - Hires column: green when > 0
  - Meta platform badge (blue, #1778f2)
  - Date range column: "Mar 1, 2026 – Mar 7" using inferred end dates
  - Creatives expand: click row with creatives → inline panel shows creative names, type, status
  - Campaign Details secondary section: impressions, reach, clicks, CTR, CPM, CPC per campaign
  - Revenue footnote explaining ROAS × Spend estimation method
- Unlocked Ads nav link in PortalNav.tsx

## Key decisions / gotchas

- **Next.js 16 proxy**: `middleware.ts` is deprecated. Use `src/proxy.ts` with `export function proxy()`.
- **cookies() is async**: Always `const cookieStore = await cookies()` in server components.
- **Env var names**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY), `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY).
- **Role check in proxy AND page/layout**: Proxy handles redirect; layout re-checks to be safe.
- **Login redirect**: After sign-in, role fetched client-side → admin goes `/admin`, client goes `/`.
- **No `app/page.tsx`**: Deleted — `app/(dashboard)/page.tsx` owns the `/` route via route group.
- **Admin on dashboard**: Layout redirects admin role to `/admin`, so `/` is client-only.
- **Dashboard queries**: Use `metric_window = 'eom'` for aggregate totals. Pipeline active = not POSTED/CANCELLED.
- **Analytics data join**: `posts.select('..., post_analytics(...)')` returns analytics as nested array keyed by `metric_window`.
- **ER formula**: `(likes + comments + shares + saves) / views × 100` — matches the original portal.
- **State naming**: Use `win` not `window` for WindowKey state variables (avoids browser global shadowing).
- **Supabase untyped rows**: Without generated DB types, cast with `as unknown as RawRow[]`.
- **Pipeline RLS**: Clients have SELECT only. Status updates use `pipeline/actions.ts` server action + `admin.ts` service client after verifying ownership.
- **admin.ts**: ONLY import in server actions / server components. Never in `'use client'` files.
- **Ads revenue field**: The `revenue` column in `ad_campaigns` is 0 for all rows (migration limitation). Use `effectiveRevenue = roas * spend` for display. Hat Toss: 89.28 × $140 = $12,499.
- **Ads date range**: Only `date` (start) is in the schema. End dates inferred as day before next campaign's start. Last campaign has no inferred end date.
- **Port**: Dev server falls back; check `.next/dev/logs/next-development.log` for actual port.
- **Tailwind 4 theme**: Colors in `globals.css` `@theme {}` block, not `tailwind.config.js`.
- **Nick client ID**: `913f1794-1506-4449-b56c-b683809cefc3` (slug: "nick", email: nick@spartasolar.com)
- **Test client**: `test@client.com` (role=client) linked to Nick's client_id — use for portal testing
- **Re-run migration**: `node scripts/migrate-nick.mjs --force` to wipe + re-insert

## Current file structure (src/)

```
src/
  app/
    (auth)/login/page.tsx
    (dashboard)/
      layout.tsx
      page.tsx                     ← dashboard KPIs
      analytics/page.tsx           ← Session 4
      pipeline/
        page.tsx                   ← Session 5
        actions.ts                 ← updatePipelineStatus server action
      ads/page.tsx                 ← Session 6
    admin/page.tsx
    globals.css
    layout.tsx
  components/portal/
    PortalNav.tsx
    SignOutButton.tsx
    AnalyticsClient.tsx            ← Session 4
    PipelineClient.tsx             ← Session 5
    AdsClient.tsx                  ← Session 6
  lib/supabase/
    client.ts
    server.ts
    admin.ts                       ← Session 5 (service role, server-only)
  proxy.ts
```

### Session 6.7 — Goals tab ✅
- Seeded 9 default goals into Supabase `goals` table (5 monthly + 4 weekly), calibrated to best month
  (March: 22 posts, 313K views, 2332 followers) — `node scripts/...` equivalent run inline via Node
- Created `src/app/(dashboard)/goals/page.tsx` — pure server component:
  - Reads goals table + all posts+analytics in parallel
  - Computes monthly actuals from eom analytics window (posts, views, followers, avg ER%)
  - Falls back to most recent data month if current month has no data
  - `paceStatus()`: projects pace to end of month → Ahead/On Track/Behind badges
  - `GoalCard` component: actual value (in status colour), target, progress bar, % complete, status badge
  - 4 monthly goal cards: Posts, Total Views, Followers Gained, Avg ER%
  - Weekly targets strip: 4 boxes showing weekly targets
  - "What Needs to Happen This Week" callout: 3 data-driven action sentences
    - Posts item: calculates posts/week needed to hit monthly target
    - ER item: compares current ER to target, recommends Hard Statement/Volume hooks if behind
    - Views item: calculates gap, names Volume/50-150 pillar as the fastest path (37.5K avg views/post)
  - Monthly History table: Feb–May vs target — green (≥target), gold (≥80%), red (<80%)
  - Footnote explaining data source (eom window) and ER formula
- Added `/goals` to `PortalNav.tsx` — 7 tabs now live
- Note: goals table has no UPDATE RLS policy for clients; admin updates via Supabase dashboard for now

### Session 6.6 — Angles tab ✅
- Created `src/app/(dashboard)/angles/page.tsx` — pure server component (no client component needed):
  - Fetches posts + `post_analytics` (eom window) in one Supabase join
  - Computes `PostMetrics[]` with ER = (likes+comments+shares+saves)/views × 100
  - `computeBreakdown()` groups by pillar/hook/format → avgER, count, totalViews, sorted desc
  - 3 KPI cards: Best Pillar (Volume/50-150, 7.12% ER), Best Hook (Volume, 8.59%), Best Format (Podcast Clip, 5.40%)
  - Gold recommendation callout: dynamically generated from best pillar + best hook combo with
    usage percentage and overlap count. If the combination exists, shows avg ER of those posts.
  - `BreakdownBar` component: colour-coded bar scaled within category (max=100%), ER%, tier badge, post count, views
  - Pillar, Hook, Format breakdown sections — all sorted best→worst
  - Top 5 table (green heading) and Bottom 5 table (red heading), both using shared `PostTable`
    with tier badges, pillar tag, hook, format, ER%, views, decision columns
  - Tier legend at bottom (Elite ≥12%, Strong 7–12%, Avg 4–7%, Kill <4%)
- Added `/angles` to `PortalNav.tsx` between Analytics and Pipeline — all 6 tabs now live

### Session 6.5 — Calendar tab ✅
- Created `src/app/(dashboard)/calendar/page.tsx` — server component:
  - Fetches calendar_events + all pipeline_items in parallel
  - Parses notes JSON (stored as text in DB) for each event → postId, captionStatus, postTime, contentType, cta
  - Joins to pipeline via `notes.post_id` → `pipeline_items.post_id` (pipeline_item_id is null for all
    events; server-side join via post_id map is the workaround)
  - Passes enriched CalendarEvent[] + date bounds to client
- Created `src/components/portal/CalendarClient.tsx` — fully interactive:
  - **Calendar view**: 42-cell grid (6 rows × 7 cols, always); leading/trailing cells from prev/next month
    shown at 30% opacity; `buildGrid()` computes by firstDayOfWeek + daysInMonth
  - **Event pills**: platform-colored left border + tinted background; click pill → selects that date
  - **Selected date detail panel**: shows title, platform badge, post_id, content type, post time,
    caption status, CTA, pipeline status with color — numbered tab switcher when multiple events on same day
  - **Month navigation**: Prev / Next / Today buttons; month stat strip (post count + IG/YT breakdown)
  - **Agenda/list view toggle**: all 48 events grouped by month with colored left border + platform badge,
    title, content type, post ID, pipeline status columns
  - **Pipeline status colors**: POSTED=green, SCRIPTED=gold, FILMING=amber, REVIEWING=red, etc.
  - **IG**: gold, **YT**: blue, **TT**: purple (no TT events in data currently)
  - Default view: Calendar; default month: most recent event month (May 2026)
  - Today dot: gold dot next to date number
- Cleaned up `PortalNav.tsx` — removed all `soon` logic since every tab is now live; simplified to plain link list
- All 5 portal tabs now active: Dashboard / Analytics / Pipeline / Ads / Calendar

## Key decisions / gotchas

- **Next.js 16 proxy**: `middleware.ts` is deprecated. Use `src/proxy.ts` with `export function proxy()`.
- **cookies() is async**: Always `const cookieStore = await cookies()` in server components.
- **Env var names**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY), `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY).
- **Role check in proxy AND page/layout**: Proxy handles redirect; layout re-checks to be safe.
- **Login redirect**: After sign-in, role fetched client-side → admin goes `/admin`, client goes `/`.
- **No `app/page.tsx`**: Deleted — `app/(dashboard)/page.tsx` owns the `/` route via route group.
- **Admin on dashboard**: Layout redirects admin role to `/admin`, so `/` is client-only.
- **Dashboard queries**: Use `metric_window = 'eom'` for aggregate totals. Pipeline active = not POSTED/CANCELLED.
- **Analytics data join**: `posts.select('..., post_analytics(...)')` returns analytics as nested array keyed by `metric_window`.
- **ER formula**: `(likes + comments + shares + saves) / views × 100` — matches the original portal.
- **State naming**: Use `win` not `window` for WindowKey state variables (avoids browser global shadowing).
- **Supabase untyped rows**: Without generated DB types, cast with `as unknown as RawRow[]`.
- **Pipeline RLS**: Clients have SELECT only. Status updates use `pipeline/actions.ts` server action + `admin.ts` service client after verifying ownership.
- **admin.ts**: ONLY import in server actions / server components. Never in `'use client'` files.
- **Ads revenue field**: The `revenue` column in `ad_campaigns` is 0 for all rows. Use `effectiveRevenue = roas * spend`.
- **Ads date range**: Only `date` (start) in schema. End dates inferred as day before next campaign's start.
- **Goals seeding**: 9 goals seeded May 2026 (5 monthly + 4 weekly). Goals table has no client UPDATE policy — updates via Supabase dashboard or future admin UI.
- **Goals actuals**: computed from eom analytics window per post, grouped by month. Falls back to most recent data month if current month is empty.
- **Pace status**: `(actual / daysElapsed) * daysInMonth` projected to month end → ≥110%=Ahead, ≥80%=On Track, <80%=Behind.
- **Calendar notes field**: `notes` is a JSON string in a text column. Parse with `try { JSON.parse(notes) } catch {}`.
- **Calendar pipeline link**: `pipeline_item_id` is null for all events (migration gap). Join via `notes.post_id` → `pipeline_items.post_id` instead.
- **Calendar grid**: 42-cell fixed (6 rows × 7 cols). Leading cells from prev month, trailing from next month.
- **Port**: Dev server falls back; check `.next/dev/logs/next-development.log` for actual port.
- **Tailwind 4 theme**: Colors in `globals.css` `@theme {}` block, not `tailwind.config.js`.
- **Nick client ID**: `913f1794-1506-4449-b56c-b683809cefc3` (slug: "nick", email: nick@spartasolar.com)
- **Test client**: `test@client.com` (role=client) linked to Nick's client_id — use for portal testing
- **Re-run migration**: `node scripts/migrate-nick.mjs --force` to wipe + re-insert

## Current file structure (src/)

```
src/
  app/
    (auth)/login/page.tsx
    (dashboard)/
      layout.tsx
      page.tsx                     ← dashboard KPIs
      analytics/page.tsx           ← Session 4
      pipeline/
        page.tsx                   ← Session 5
        actions.ts
      ads/page.tsx                 ← Session 6
      calendar/page.tsx            ← Session 6.5
    admin/page.tsx
    globals.css
    layout.tsx
  components/portal/
    PortalNav.tsx                  ← all 5 tabs live, soon logic removed
    SignOutButton.tsx
    AnalyticsClient.tsx            ← Session 4
    PipelineClient.tsx             ← Session 5
    AdsClient.tsx                  ← Session 6
    CalendarClient.tsx             ← Session 6.5
  lib/supabase/
    client.ts
    server.ts
    admin.ts
  proxy.ts
```

## Current file structure (src/)

```
src/
  app/
    (auth)/login/page.tsx
    (dashboard)/
      layout.tsx
      page.tsx                     ← dashboard KPIs
      analytics/page.tsx           ← Session 4
      angles/page.tsx              ← Session 6.6
      pipeline/
        page.tsx                   ← Session 5
        actions.ts
      ads/page.tsx                 ← Session 6
      calendar/page.tsx            ← Session 6.5
      goals/page.tsx               ← Session 6.7
      report-card/page.tsx         ← Session 7
      studio/page.tsx              ← Session 7
    admin/
      page.tsx                     ← Session 9 (View Portal → buttons)
      actions.ts                   ← Session 9 (impersonateClient, exitImpersonation)
    globals.css
    layout.tsx
  components/portal/
    PortalNav.tsx          ← 9 tabs: Dashboard/Analytics/Angles/Pipeline/Studio/Ads/Calendar/Goals/Report Card
    SignOutButton.tsx
    AnalyticsClient.tsx
    PipelineClient.tsx
    AdsClient.tsx
    CalendarClient.tsx
    ReportCardClient.tsx   ← Session 7
    StudioClient.tsx       ← Session 7
  lib/supabase/
    client.ts
    server.ts
    admin.ts
    portal.ts              ← Session 9 (getPortalContext helper)
  proxy.ts
```

### Session 7 — Report Card + Studio tabs ✅
- Created `src/app/(dashboard)/report-card/page.tsx` — server component:
  - Fetches goals + posts+analytics in parallel; builds week/month grade maps
  - `computeWeekGrade()`: 4 components (Posts 25, Views/Reach 30, Avg ER% 35, Elite Videos 10)
  - `computeMonthGrade()`: 5 components (Posts 20, Total Views 25, Avg ER% 30, Followers 15, Elite 10)
  - Scores project against weekly/monthly goals from goals table
  - Generates wins[], misses[], strategy[] as data-driven sentences per period
  - Exports types WeekGrade, MonthGrade, PostSummary, ScoreComponents for client component
- Created `src/components/portal/ReportCardClient.tsx` — interactive client component:
  - Monthly / Weekly toggle tab (left sidebar)
  - Period list: grade chip (letter + score/100) + label — newest first, click to select
  - Detail panel: large grade tile, stats strip, score breakdown bars (green/amber/red)
  - Wins (green ✓) + Misses (red ↓) in two-column layout
  - Top posts table: post ID, title, views, ER%, decision
  - Monthly only: "Next Period Focus" callout with → strategy bullets
- Created `src/app/(dashboard)/studio/page.tsx` — server component:
  - Fetches all non-POSTED/CANCELLED pipeline items ordered by priority
  - Passes to StudioClient with count stats in header
- Created `src/components/portal/StudioClient.tsx` — interactive client component:
  - Phase funnel strip: PLANNED → SCRIPTED → FILMING → REVIEWING → POSTED (counts)
  - Tabs: Scripts to Review | In Production | Planned
  - Script cards: expandable "Read Script" button reveals full script_content with pre-wrap
  - Production rows: compact rows for FILMING/REVIEWING items grouped by status
  - Cards sorted by priority ascending; URGENT badge for priority=1
- Updated `PortalNav.tsx` — 9 tabs: added Studio (between Pipeline and Ads) + Report Card (at end)
- **Report Card type note**: `ScoreComponents` is exported as a named array type from the page; client imports it
- **Studio note**: no write operations; read-only view of pipeline items (no approval API needed for MVP)

### Session 9 — Admin portal view + Next.js branding removal ✅
- Created `src/lib/supabase/portal.ts` — `getPortalContext()` helper:
  - Returns `{ supabase, clientId, userEmail, isImpersonating }`
  - If admin with impersonation cookie set → returns impersonated clientId
  - If admin with no cookie → redirects to /admin
  - All 9 dashboard pages now call this instead of doing their own auth/profile fetch
- Created `src/app/admin/actions.ts` — two server actions:
  - `impersonateClient(formData)` — validates admin role, sets `dropclix_impersonate_client_id` cookie (8h), redirects to `/`
  - `exitImpersonation()` — deletes cookie, redirects to `/admin`
- Updated `src/app/admin/page.tsx`:
  - Each client row now has a "View Portal →" button (form action calling `impersonateClient`)
  - Removed the stale "Session 3 complete" status box
- Updated `src/app/(dashboard)/layout.tsx`:
  - Admins with impersonation cookie → portal loads for that client, sidebar shows "← Exit Portal" button
  - Admins without cookie → still redirected to /admin
- Updated `next.config.ts` — `devIndicators: false` removes the Next.js N icon from all pages
- Updated all 9 dashboard pages to use `getPortalContext()` (analytics, angles, pipeline, ads, calendar, goals, report-card, studio, dashboard)

## Key decisions / gotchas (Session 9)
- **Admin impersonation**: Cookie-based, 8h TTL, server-only (`httpOnly: true`). Cookie name: `dropclix_impersonate_client_id`.
- **getPortalContext()**: Import from `@/lib/supabase/portal`. Returns supabase client + clientId + userEmail + isImpersonating. Do NOT use separate `createClient()` + profile fetch in dashboard pages.
- **Exit Portal**: Sidebar shows "← Exit Portal" form button when `isImpersonating = true`. Calls `exitImpersonation()` action → clears cookie → /admin.
- **devIndicators**: Set to `false` in `next.config.ts`. Removes the N triangle overlay in dev mode.
- **No cookie clearing on /admin load**: Cookie is only cleared via "Exit Portal" action. Admin page shows normally regardless of cookie state (cookie only matters in dashboard layout).

### Session 9b — Nick real auth user ✅
- Wrote `scripts/create-nick-user.mjs` — idempotent; dry-run by default, `--run` to create
- Created Supabase auth user for nick@spartasolar.com (auth ID: `893475d0-f0ba-4570-a1f6-5110cd2c9e18`)
- Inserted `public.users` row: id=auth ID, email=nick@spartasolar.com, role=client, client_id=Nick's
- email_confirm: true — no confirmation email needed; Nick can log in immediately
- Temp password: `DropClix2026!` — Nick should change after first login

## Nick login credentials
- **Email**: nick@spartasolar.com
- **Password**: DropClix2026! *(temporary — change after first login)*
- **Auth user ID**: `893475d0-f0ba-4570-a1f6-5110cd2c9e18`
- **Client ID**: `913f1794-1506-4449-b56c-b683809cefc3`

### Session 10 — Vercel deploy + custom domain ✅
- Authenticated Vercel CLI as `drop-clix` org
- Created Vercel project `dropclix/dropclix-app` (linked via `vercel link --yes`)
- Added all 3 env vars to production environment:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SECRET_KEY`
- Deployed to production — build succeeded, all 12 routes (10 dynamic, 2 static)
- Added custom domain `portal.drop-clix.com` to Vercel project
- DNS: domain is on Cloudflare — requires A record `portal → 76.76.21.21` (or CNAME `portal → cname.vercel-dns.com`) with proxy OFF (DNS only / grey cloud)
- Confirmed no Next.js branding in source (`devIndicators: false` already set in Session 9, title = "Drop CLIX Portal")

## Deployment

- **Production URL**: https://dropclix-app.vercel.app
- **Custom domain (pending DNS)**: https://portal.drop-clix.com
- **Vercel project**: https://vercel.com/dropclix/dropclix-app
- **GitHub auto-deploy**: Not yet connected — do via Vercel dashboard → Settings → Git → connect `drop-clix/dropclix-app` (requires Vercel GitHub App authorization on the repo)

## DNS setup for portal.drop-clix.com (Cloudflare)

In Cloudflare DNS for `drop-clix.com`, add:
- Type: **A** (or CNAME → `cname.vercel-dns.com`)
- Name: `portal`
- Value: `76.76.21.21`
- Proxy: **OFF** (DNS only — grey cloud, NOT orange) — required for Vercel SSL

## Bugfixes

- **PipelineClient key prop**: `rows.map()` returned a bare `<>...</>` fragment — React requires the key on the fragment itself, not the inner `<tr>`. Fixed by importing `Fragment` from react and using `<Fragment key={item.id}>`. The `key` on both inner `<tr>` elements was removed as redundant.
- **AdsClient key prop**: Same Fragment shorthand issue — fixed with `<Fragment key={c.id}>` in campaign rows.map().

### Session 11 — Inline editing across all portal tabs ✅

**New files:**
- `src/app/(dashboard)/edit-actions.ts` — Centralized server actions for all CRUD operations (pipeline, goals, analytics, ads, calendar). All actions: verify auth + ownership, use admin client to bypass RLS, revalidate path.

**Modified files:**
- `src/components/portal/PipelineClient.tsx` — Full inline editing: click any row to expand an edit panel with title, status, priority, platform checkboxes, pillar, week, script textarea. 2-second debounced auto-save per field (field stays focused). Hover shows ✎ / × buttons. Delete with confirmation.
- `src/components/portal/AnalyticsClient.tsx` — Click any metric cell (Views, Likes, Comments, Saves, Shares, Watch%) to edit inline; saves on blur. ER% is computed (not directly editable). Optimistic local state update.
- `src/components/portal/GoalsClient.tsx` (new) — Client component for editable goal targets. Click "target X" text → inline input → 2-second debounce auto-save. Progress bar and pace badge recalculate live from updated target.
- `src/app/(dashboard)/goals/page.tsx` — Fetches goals with `id`, passes to `GoalsEditableCards` client component.
- `src/components/portal/AdsClient.tsx` — Campaign rows click to expand full edit panel (name, objective, status, start date, spend, leads, hires). Creative inline editing (type, status, impressions, CTR). Hover shows ✎ / × on all rows. Fixed Fragment key bug.
- `src/components/portal/CalendarClient.tsx` — Click ✎ on selected event in calendar view to open edit panel (title, platform, date, postId, postTime, captionStatus, contentType, CTA). Agenda view: hover shows ✎ / × per row, edit panel expands inline below.
- `src/app/(dashboard)/analytics/page.tsx` — Added `uuid` (posts.id) to PostRow type and select query, used as the key to target post_analytics rows for updates.

**Patterns:**
- 2-second debounce: `useRef` timer per field, cleared on each keystroke. Field stays focused after save — no blur() called. SaveDot indicator (yellow=saving, green=saved, red=error).
- Blur-save: analytics cells only — more appropriate for tabular data entry.
- Immediate save: dropdowns and checkboxes (no debounce needed).
- Hover buttons: `hoveredId` state + `onMouseEnter`/`onMouseLeave`, opacity 0→1 transition.
- React 19 `useRef`: must pass initial value — `useRef<T | undefined>(undefined)` not `useRef<T>()`.
- Goals server component: kept server-side for data fetching; client `GoalsEditableCards` receives computed actuals + goals-with-IDs, manages target edits locally.

### Session 12 — HTML portal audit ✅

Full gap analysis between `/Users/chaseevans/Downloads/portal-nick-updated.html` and the Next.js app.
Full report saved to `memory/project_html_portal_audit.md`. Summary of the 50 gaps found:

**Critical missing features (not present in Next.js at all):**
- **Charts** — HTML has 15 Chart.js charts total (Dashboard: 4, Analytics: 5, Ads: 6). Next.js has zero.
- **Update Modal** — HTML's primary interaction: click any video row in Analytics/Angles/Report Card → modal with cross-window summary (24hr/3-Day/7-Day all visible) + all metric inputs + Decision + Delete. Replaces per-cell inline edit for the video update flow.
- **AI Suggestions** — Dashboard section with 6 data-driven action bullets (best video to replicate, pillar analysis, kill-tier pattern, posting cadence).
- **30-Day Projection** — Dashboard section: 3 KPI cards (projected followers, reach, ER%) based on last 10 videos, expandable detail panel.
- **Ads Audience tab** — Audience tracking with name, location, targeting, budget, spend, leads, CPL, hires, CPhire. 4 seeded audiences in DB never shown. Charts, best-audience card, + Add Audience modal.
- **Ads Monthly Summary tab** — MoM trend cards + historical table.
- **Ads charts** — Spend vs Leads (bar+line), CPL trend, Creative Hook Rate, Hold Rate, Audience CPL/Leads.
- **Ads Auto Suggestion banner** — CPL comparison, creative testing status, active ad count, zero-leads alert.
- **+ Add Campaign / Creative / Audience buttons** — HTML has modal forms to log new records. Next.js edit only; no create.
- **Studio video logging form** — Full form to log a new posted video: ID, Title, Platform, Date, Pillar, Hook Type, Format, CTA, 24hr metrics (reach/likes/comments/shares/saves/followers/watch), auto-calc ER%, Notes, Decision. Completely missing.
- **Monthly totals entry** — Form to set month's Posts, Total Views, Start/End Followers. Missing from Next.js.
- **Angles pillar expand** — Each pillar in Angles is an accordion that expands to a grid of all videos in it (ER-sorted, each clickable to open Update Modal). Next.js shows breakdown bars only.
- **Pillar bars on Dashboard** — Clickable horizontal bars that expand to show all videos in that pillar (same grid pattern).
- **Overused/Opportunity tags** — Auto-badges on pillars/hooks/formats based on usage count vs avg ER.

**Analytics differences:**
- HTML has "All" platform tab (shows all platforms combined). Next.js starts on IG only.
- HTML table has Followers column; Next.js doesn't.
- HTML table has tier filter chips (All/Elite/Strong/Average/Kill) above the table.
- HTML has er-bar (50px mini bar next to ER% value).
- HTML table has sub-tabs: Top 10 / This Week / This Month / All Posts.

**Goals differences:**
- HTML has 6 metrics (Posts, Followers, Reach, ER%, Elite Videos, Watch% Avg); Next.js has 4.
- HTML computes weekly actuals from last 7 days; Next.js doesn't.

**Visual:**
- HTML uses border-radius 4-8px on cards; Next.js uses square corners.
- HTML has global save-pill in navbar; Next.js has per-field save dots only.
- HTML has inline ER bar visualization in table rows.

**Metric naming note:** HTML uses `reach` (Instagram "Reach" = unique accounts) as primary metric; migration imported it as `views` in the DB. Same data, different label.

### Session 13 — Design system spacing pass ✅

Applied consistent spacing rules globally across all portal tabs. No new features — pure spacing fix.

**Rules applied:**
- KPI cards: `22px 20px 18px` → `28px 24px 22px` padding; label `mb-3` → `mb-4`; value font size `clamp(24px…40px)` → `clamp(26px…42px)`
- Table rows (th + td): 12px vertical → 16px (`py-3` → `py-4`, `px-3` → `px-4` on pipeline; `px-4` → `px-5` on analytics/ads/angles/goals)
- Filter tabs/buttons: `px-3 py-1.5` → `px-4 py-2.5`; gap `gap-1` → `gap-2`
- Pillar chips: `px-2.5 py-1` → `px-3 py-2`
- Phase cards (Pipeline): `py-3` → `py-4`; number size 22 → 26px
- Nav items: `py-2.5` → `py-3`; `gap-1` → `gap-0.5` (items closer but taller)
- Client badge in sidebar: `py-5` → `py-6`; nav section `py-4` → `py-6`
- Section gaps: KPI grid `mb-6` → `mb-8`; filter row `mb-4/5` → `mb-6/8`; KPI-to-table `mb-6` → `mb-8`
- Edit panels (pipeline, ads): `20px 24px` → `28px 32px`
- Report Card sidebar period items: `10px 14px` → `14px 16px`; ScoreBar `mb-12` → `mb-16`; PostsTable rows `6px` → `10px` padding
- Calendar cells: `minHeight: 82` → `minHeight: 100`; event detail card `16px 18px` → `22px 24px`
- Studio phase funnel: `14px 18px` → `20px 24px`; tab buttons `7px 14px` → `10px 18px`
- Campaign Details cards (Ads): `20px 20px` → `28px 24px`

**Files changed:** PortalNav.tsx, layout.tsx, AnalyticsClient.tsx, PipelineClient.tsx, AdsClient.tsx, CalendarClient.tsx, GoalsClient.tsx, goals/page.tsx, angles/page.tsx, ReportCardClient.tsx, StudioClient.tsx

### Session 14 — Recharts charts + collapsible sidebar ✅

**Charts installed:** `recharts@3.8.1` (React 19 compatible)

**Dashboard charts** (`DashboardCharts.tsx` — new client component):
- Follower growth by month (BarChart, gold bars, followers gained from post_analytics.followers per month)
- Monthly views by month (LineChart, gold line)
- Posts volume + Followers gained (ComposedChart, dual axis: posts bars gold + followers line green)
- Avg ER% by content pillar (BarChart layout="vertical", bars colored by tier: green/blue/amber/red)
- Data computed server-side in `dashboard/page.tsx` from a new `chartPostsRes` query (posts + eom analytics, grouped by month and by pillar)

**Analytics charts** (added inline in `AnalyticsClient.tsx`):
- Reach by Post (BarChart, bars colored by ER tier, Top 10 / Last 10 / All toggle)
- ER% Over Time (LineChart, each dot colored by tier, filtered to current platform + window)
- Charts appear between KPI strip and pillar filter chips

**Recharts v3 type notes:**
- `content` prop in `<Tooltip>`: use `(props: any) => ...` wrapper to avoid label type conflicts
- `LabelList formatter`: cast as `any` — v3 expects `(value: RenderableText) => RenderableText`
- `payload` in tooltip content is `readonly any[]` not `any[]`

**Collapsible sidebar** (`SidebarShell.tsx` — new client component):
- Collapsed: 56px wide, icon-only nav items, hamburger at top, client initials badge
- Expanded: 220px wide with full labels, client name, email
- Expands on hover OR on hamburger click (pinned state)
- Smooth 200ms ease transition on `width` and `min-width`
- Label opacity fades 0→1 with 50ms delay during expansion
- `layout.tsx` simplified to just fetch data + render `<SidebarShell>` with props
- `SignOutButton` updated to accept `iconOnly` prop (icon-only in collapsed state)
- SVG icons defined inline for all 9 nav items (no icon library required)
- Uses `usePathname()` for active state (moved from `PortalNav.tsx` into `SidebarShell.tsx`)
- `PortalNav.tsx` now unused — all nav rendering is in `SidebarShell.tsx`

**Design tokens for charts:**
- Grid: `rgba(255,255,255,.04)` (nearly invisible)
- Tick: `#333` (muted)
- Background: `#0a0a0a` (card bg)
- Gold: `#c9a96e`
- Tier colors: Elite `#39ff88`, Strong `#4cc9ff`, Avg `#fbbf24`, Kill `#ff3b5f`
- Tooltip: dark `#0d0d0d` bg, `#1e1e1e` border

## Next sessions
- Session 15: Update Modal + Studio video-logging form
- Session 16: Ads sub-views (Audience tab, Monthly Summary, charts, suggestions, Add buttons)
