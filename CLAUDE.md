@AGENTS.md

# Drop CLIX — App

Next.js 16.2.6 + Supabase SSR + Tailwind 4. Source under `src/`. Path alias `@/*` → `src/*`.

## Sessions

### Sessions 1–3 ✅ — Scaffold, auth, login + dashboard
Next.js 16, Supabase SSR, Tailwind 4. Auth via `src/proxy.ts` (not middleware.ts). Gold/black login + dashboard. Supabase schema + RLS in `supabase/`. Tailwind 4 `@theme` tokens in `globals.css`.

### Session 4 ✅ — Analytics tab
Interactive table with platform/window/pillar filters, sortable columns, ER% formula, tier + decision badges, KPI strip.

### Session 5 ✅ — Pipeline tab
Phase cards, filters, full-text search, inline status dropdown (optimistic + server action), script expand. `admin.ts` + `pipeline/actions.ts` for RLS bypass.

### Session 6 ✅ — Ads tab
4 KPI cards, sortable campaign table, creatives expand, Campaign Details. `effectiveRevenue = roas * spend` (revenue column is 0 in DB). End dates inferred from next campaign's start.

### Session 6.5 ✅ — Calendar tab
42-cell grid calendar + agenda view. Event pills, date detail panel, month nav. Notes is JSON string in text column — parse with try/catch. `pipeline_item_id` is null; join via `notes.post_id` instead.

### Session 6.6 ✅ — Angles tab
ER breakdown by pillar/hook/format. Breakdown bars, Top/Bottom 5 tables. Pure server component — no client needed.

### Session 6.7 ✅ — Goals tab
9 goals seeded (5 monthly + 4 weekly). Goal cards with pace projection, "What Needs to Happen" callout, `GoalsClient` for editable targets. No client UPDATE RLS — admin updates via Supabase dashboard.

### Session 7 ✅ — Report Card + Studio tabs
Report Card: weekly/monthly grades (4–5 score components), wins/misses/strategy, top posts table. Studio: phase funnel, script expand, production rows. Read-only.

### Session 8 ✅ — Nick data migration
`scripts/migrate-nick.mjs` — idempotent; `--force` to wipe + re-insert. Migrated: 43 posts, 176 analytics rows (4 windows; eom = w7), 93 pipeline items, 6 campaigns, 4 creatives, 4 audiences, 48 calendar events. 676,307 total views.

### Session 9 ✅ — Admin impersonation + branding removal
`getPortalContext()` in `portal.ts` — all dashboard pages use this instead of direct auth calls. Cookie-based impersonation (`dropclix_impersonate_client_id`, 8h, httpOnly). "← Exit Portal" sidebar button. `devIndicators: false` in `next.config.ts`.

### Session 9b ✅ — Nick real auth user
Created Supabase auth user nick@spartasolar.com. Temp password: `DropClix2026!`.

### Session 10 ✅ — Vercel deploy + custom domain
Deployed to `dropclix-app.vercel.app`. Custom domain `portal.drop-clix.com` added to Vercel. DNS: Cloudflare A record `portal → 76.76.21.21`, proxy OFF.

### Session 11 ✅ — Inline editing across all tabs
`edit-actions.ts` — centralized CRUD server actions (all tabs). 2-second debounce auto-save; blur-save for analytics cells; immediate-save for dropdowns/checkboxes. SaveDot indicator (yellow/green/red). `useRef<T | undefined>(undefined)` required in React 19.

### Session 12 ✅ — HTML portal audit (50 gaps)
Full report in `memory/project_html_portal_audit.md`. Critical missing: Update Modal, 15 charts, AI Suggestions, 30-Day Projection, Ads Audience/Monthly Summary/auto-suggestion, Add buttons, Studio video-logging form, monthly totals entry, Angles pillar accordion, Dashboard pillar bars, Overused/Opportunity tags. Metric note: HTML `reach` = DB `views` (same data, different label).

### Session 13 ✅ — Design system spacing pass
Global spacing applied. KPI cards: `28px 24px 22px`; table rows: `py-4`; filter tabs: `px-4 py-2.5`; section gaps: `mb-8`. No new features.

### Session 14 ✅ — Recharts charts + collapsible sidebar
`recharts@3.8.1`. Dashboard: 4 charts (follower growth bar, monthly views line, posts+followers composed, ER% by pillar vertical bar). Analytics: 2 charts (Reach by Post bar, ER% Over Time line). Collapsible sidebar via `SidebarShell.tsx` (56px collapsed / 220px expanded, hover + pin). `PortalNav.tsx` now unused.

### Session 18-pre ✅ — Decision logic audit + auto-calculation everywhere

**Problem:** Decision (`posts.decision`) was write-once at creation, never updated from ER% after that. ER% tier badges and Decision labels were completely disconnected — could contradict each other.

**Shared utility:** `src/lib/decision.ts` — `erToDecision(er)` and `computeDecision(likes, comments, shares, saves, views)`. Single source of truth for all callers.

**Fixes applied:**
1. **`studio/actions.ts:createPost()`** — before inserting the post, iterates windows (eom→w7→w3→w24) and computes Decision from the first window with `views > 0`. Falls back to the form's Decision field only if no analytics data exists.
2. **`StudioClient.tsx:buildPostsFromRows()`** (CSV importer) — computes Decision from EOM metrics in the CSV row when views > 0. Falls back to mapped `decision` column, then empty string. No longer defaults to `'Iterate'`.
3. **`StudioClient.tsx:NewPostForm`** — Decision default changed from `'Iterate'` to `''` (blank). Server action auto-computes from metrics.
4. **`edit-actions.ts:updateAnalyticsMetric()`** — after saving any metric, queries all windows (eom→w7→w3→w24) for the same post+platform, finds the best window with views > 0, computes Decision, and updates `posts.decision`. Returns `{ decision }` so the client can update React state immediately.
5. **`AnalyticsClient.tsx`** — `EditableCell.onSave` and `handleMetricSave()` now accept an optional `decision` string and apply it to the matching post in React state so the Decision badge updates instantly without a page reload.
6. **`scripts/ingest-eom-csv.mjs`** — after upserting EOM analytics, computes Decision from EOM ER% for every row and `UPDATE posts SET decision = ...`. Decision is shown in the dry-run preview output.

**Invariant:** Decision is always ER%-derived when analytics data (views > 0) is available. The form's Decision dropdown is only used as a fallback for posts with no analytics yet (pre-publish pipeline stubs).

### Session 17 ✅ — Importer, formula audit, smart popup, welcome screen

**1. Studio Importer (`/studio` tab "Import")**
`src/app/(dashboard)/studio/actions.ts` — new server actions: `createPost()` + `importPostsBatch()`. Both insert into `posts` + `post_analytics` (all non-empty windows) + auto-create `pipeline_item` (status=POSTED) + `calendar_events` (one per platform). Calls `revalidatePath` on all 8 affected routes. `StudioClient.tsx` rebuilt with 4 tabs: Scripts / Production / Planned / Import. Import tab has two sub-modes: New Post form (all fields + 4 window metric tabs) and CSV Import (file upload → column mapping → preview → batch import). Next post ID auto-generated in `studio/page.tsx` via `fetchNextPostId()` and passed as prop.

**2. Formula / data integrity audit**
Dashboard KPI "Engagement Rate" was wrong — only used `likes + comments`. Fixed to `(likes + comments + shares + saves) / views × 100`. Added `shares` to the analytics query. All other tabs (Analytics, Angles, Goals, Report Card) already used the correct 4-component formula. Dashboard chart ER and pillar ER were already correct.

**3. Full auto-sync**
`createPost()` server action revalidates: `/studio`, `/pipeline`, `/calendar`, `/`, `/analytics`, `/goals`, `/report-card`, `/angles`. Existing bidirectional sync (pipeline ↔ calendar from Session 16) unchanged.

**4. Smart pop-up (Pipeline)**
`PipelineClient.tsx` — status dropdown onChange now intercepts POSTED and SCRIPTED when `item.scheduledDate` and `item.postedAt` are both null. Shows a modal: platform multi-select (IG/TT/YT) + datetime picker. POSTED/SCHEDULED: saves `posted_at` + `platform`, auto-flips to SCHEDULED (future) or POSTED (past). SCRIPTED: saves `scheduled_date` + `platform`, keeps SCRIPTED status. Modal dismisses on backdrop click or Cancel.

**5. Welcome screen**
`src/components/portal/WelcomeOverlay.tsx` — `position:fixed` overlay, shows once per session via `sessionStorage`. Gold "Welcome back, [client name]" heading + Drop CLIX wordmark. Slides up + fades out after 1.8s (700ms CSS transition). Added to `(dashboard)/layout.tsx` alongside `SidebarShell`.

### Session 20 ✅ — Global FilterBar, platform/window/scope filters, pagination

**1. Filter hook (`src/hooks/usePortalFilters.ts`)**
Central hook + utilities. Types: `PlatformFilter` ('all'|'ig'|'tt'|'yt'|'lf'), `WindowFilter` ('w24'|'w3'|'w7'|'eom'), `ScopeFilter` ('all'|'week'|'month'|`month-${string}`|'custom'). URL params: `platform`, `win`, `scope`, `from`, `to`. `setFilters()` uses `router.replace()` with `{ scroll: false }`. Utility functions: `getScopeRange(scope, from, to)` → `{ from, to } | null`; `filterByScope<T>(rows, scope, from, to, getDate)` — applies date range client-side; `filterByPlatform<T>(rows, platform, getPlatform, getFormat)` — 'lf' filter checks `platform.includes('yt') && format === 'Long-form'`.

**2. FilterBar component (`src/components/portal/FilterBar.tsx`)**
52px height, 3 groups side-by-side. Platform pills (ALL/IG/TT/YT/LF) with inline SVG icons — active: gold bg + black text + subtle glow. Window segmented control (24HR/3DAY/7DAY/EOM) with absolute-positioned sliding gold underline indicator (`transform: translateX(${idx * 58}px)`, 0.15s transition). Scope dropdown (custom, not native `<select>`) with click-outside dismiss — options: ALL TIME / THIS WEEK / THIS MONTH / individual month pills / CUSTOM; custom date inputs appear when scope=custom. FilterBar rendered in all 9 tab page.tsx files (server components), above the client delegate.

**3. Pagination (`src/components/portal/Paginator.tsx`)**
Props: `page`, `total`, `perPage=10`, `onChange`. Left/right arrow buttons (28×28px), `null` if ≤1 page. "Page X of Y" in DM Sans 11px. Added to: AnalyticsClient, PipelineClient, StudioClient (Scripts + Planned tabs), AdsClient.

**4. AnglesClient (`src/components/portal/AnglesClient.tsx`)**
Angles page converted from pure server component to server-fetch + client delegate. `angles/page.tsx` now does a minimal Supabase fetch and passes `rawPosts: RawAnglesPost[]` to `<AnglesClient>`. AnglesClient reads filters from `usePortalFilters()` and computes all breakdowns via `useMemo`. `RawAnglesPost` type exported from AnglesClient for page.tsx to use.

**5. Client components updated**
`AnalyticsClient`, `PipelineClient`, `StudioClient`, `AdsClient` — all now read `platform`, `win`, `scope` from `usePortalFilters()` instead of managing local platform/window state. Each adds `useEffect` to reset `page` to 1 whenever filters change.

## Key decisions / gotchas

- **Next.js 16 proxy**: `middleware.ts` is deprecated. Use `src/proxy.ts` with `export function proxy()`.
- **`/auth/` routes**: Always let through unauthenticated — recovery token lives in the URL hash (client-only), so the proxy must not redirect these routes to `/login`.
- **cookies() is async**: Always `const cookieStore = await cookies()` in server components.
- **Env var names**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY), `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY).
- **Role check in proxy AND page/layout**: Proxy handles redirect; layout re-checks to be safe.
- **Login redirect**: After sign-in, role fetched client-side → admin goes `/admin`, client goes `/`.
- **No `app/page.tsx`**: Deleted — `app/(dashboard)/page.tsx` owns `/` via route group.
- **Admin on dashboard**: Layout redirects admin role to `/admin`; `/` is client-only.
- **getPortalContext()**: Import from `@/lib/supabase/portal`. Use in ALL dashboard pages — do NOT use separate `createClient()` + profile fetch.
- **Admin impersonation**: Cookie `dropclix_impersonate_client_id`, 8h TTL, httpOnly. Only cleared via "Exit Portal" action. Admin page shows normally regardless of cookie — cookie only matters in dashboard layout.
- **Dashboard queries**: Use `metric_window = 'eom'` for aggregate totals. Pipeline active = not POSTED/CANCELLED.
- **Analytics data join**: `posts.select('..., post_analytics(...)')` returns analytics as nested array keyed by `metric_window`.
- **ER formula (IG/TT)**: `(likes + comments + shares + saves) / views × 100`.
- **ER formula (YouTube)**: `(likes + comments + shares + subscribers_gained) / views × 100`. `subscribers_gained` stored in `post_analytics.followers`; `saves` is `null` for all YT rows. Same decision thresholds. See `ingest-yt-csv.mjs` for the authoritative implementation.
- **YT post IDs**: `#yt0001`–`#yt0039` (Shorts), `#LF0001`–`#LF0014` (Long-form). `pipeline_items.yt_type` = 'Short' or 'Long-form'. `post_analytics.yt_id` = YouTube Video ID.
- **Decision auto-calculation**: Decision is always derived from ER% when any analytics window has `views > 0`. Thresholds: ≥12% → Double Down, 4–11.9% → Iterate, <4% → Kill. Shared utility at `src/lib/decision.ts`. Decision is updated: on `createPost()` (best window), on `updateAnalyticsMetric()` (eom→w7→w3→w24), and on every `ingest-eom-csv.mjs` run. Never hardcode 'Iterate' as a default — leave null if no data.
- **State naming**: Use `win` not `window` for WindowKey state variables (avoids browser global shadowing).
- **Global filters via URL params**: `platform`, `win`, `scope`, `from`, `to`. `FilterBar` reads/writes via `usePortalFilters`. All client components read the same params — no new DB queries on filter change. Filters persist across tab navigation.
- **EditableCell must use post's own platform**: When saving analytics metrics, pass `post.platform[0] ?? 'ig'` not the filter's `platform` value — the filter may be 'all' which is not a valid platform for DB writes.
- **LF filter requires `format` field**: To filter Long-form YT, Analytics query must select `format` and `PostRow` type must include it. `filterByPlatform` receives a `getFormat` callback for this case.
- **Angles is now a client component**: `angles/page.tsx` is a minimal server fetch; all computation is in `AnglesClient.tsx`. Do not add server-side computation back to angles/page.tsx.
- **Default platform is 'ig'**: `usePortalFilters` defaults to `platform='ig'` (not 'all'). Dashboard, Goals, and all tabs open with IG selected.
- **FilterBar exports**: `PlatformPills` and `ScopeDropdown` are exported separately for components that compose their own filter UI (DashboardClient, PipelineClient, GoalsDashboard). Use these instead of `FilterBar` when the page manages its own layout.
- **filterByPlatform signature**: 2-3 args only: `(items, platform, getFormat?)`. Item type must extend `{ platform: string[] }` natively — no `getPlatform` callback.
- **Pipeline phase URL param**: PipelineClient reads `?phase=STATUS` on mount to initialize the filter state. Studio stats tiles navigate to `/pipeline?phase=SCRIPTED` etc.
- **Goals page is now GoalsDashboard**: `goals/page.tsx` is a thin server fetcher. All logic in `GoalsDashboard` (GoalsClient.tsx) — platform filtering, actuals, report card grades, modal. Types `RawGoalPost` and `RawGoal` exported from `goals/page.tsx`.
- **Report card grade computation in GoalsDashboard**: Client computes WeekGrade[] + MonthGrade[] from filtered rawPosts. Types WeekGrade/MonthGrade/PostSummary/ScoreComponents imported from `report-card/page.tsx`.
- **PipelineStats type**: Exported from `studio/page.tsx` — `{ PLANNED, SCRIPTED, FILMING, REVIEWING, POSTED }` (all number). Server fetches all pipeline statuses (separate query from the active items query).
- **Supabase untyped rows**: Cast with `as unknown as RawRow[]` — no generated DB types.
- **Pipeline RLS**: Clients have SELECT only. Updates use `edit-actions.ts` + `admin.ts` after verifying ownership.
- **admin.ts**: ONLY import in server actions / server components. Never in `'use client'` files.
- **Ads revenue**: `revenue` column is 0 in DB. Use `effectiveRevenue = roas * spend`. End dates inferred as day before next campaign's start; last campaign has no inferred end.
- **Goals**: No client UPDATE RLS — admin updates via Supabase dashboard for now.
- **Goals actuals**: From eom analytics window per post, grouped by month. Falls back to most recent data month if current month is empty.
- **Pace status**: `(actual / daysElapsed) * daysInMonth` → ≥110%=Ahead, ≥80%=On Track, <80%=Behind.
- **Calendar notes**: JSON string in a text column. Parse with `try { JSON.parse(notes) } catch {}`.
- **Calendar pipeline link**: `pipeline_item_id` is null for all events. Join via `notes.post_id` → `pipeline_items.post_id`.
- **Calendar grid**: 42-cell fixed (6 rows × 7 cols). Leading/trailing cells from adjacent months.
- **React Fragment key**: Use `<Fragment key={id}>` (imported), not `<>`. Key goes on Fragment, not inner `<tr>`.
- **Recharts v3 types**: `content` prop in `<Tooltip>`: `(props: any) => ...`. `LabelList formatter`: cast as `any`. Tooltip `payload` is `readonly any[]`.
- **Dashboard ER formula fix**: Previously `(likes+comments)/views` — now `(likes+comments+shares+saves)/views`. Analytics query also updated to fetch `shares`.
- **Studio importer**: `studio/actions.ts` is 'use server'. `createPost()` revalidates 8 paths. `post_analytics.post_id` is UUID FK — always use `posts.id` (not text `post_id`) when inserting analytics.
- **Welcome overlay**: Uses `sessionStorage` keyed by `dropclix_welcomed_${clientName}` — one overlay per client per browser session. Rendered in dashboard layout, not inside SidebarShell.
- **Smart popup trigger**: Intercepts status → POSTED/SCRIPTED only when both `item.scheduledDate` AND `item.postedAt` are null. Existing items with either field set skip the popup.
- **Collapsible sidebar**: `SidebarShell.tsx` owns all nav rendering. `PortalNav.tsx` is unused.
- **Tailwind 4 theme**: Colors in `globals.css` `@theme {}` block, not `tailwind.config.js`.
- **Port**: Dev server falls back; check `.next/dev/logs/next-development.log` for actual port.

### Session 22 ✅ — Dashboard overhaul + Analytics chart migration

**Dashboard:** Removed all dashboard graphs, the status-strip boxes below the KPI row, and the recent content table. `DashboardClient.tsx` now has 4 top KPI cards: Followers/Conversion toggle, Reach/Watch toggle, ER/Top Video toggle, and static Posts. All cards react to platform + scope filters.

**Projections:** Added 3 projection cards based on the selected platform's last 10 posts: follower gain, reach, and avg ER. Clicking a projection opens a right-side AI Suggestions drawer.

**AI suggestions:** Added `src/app/api/ai-suggestions/route.ts`, using `@anthropic-ai/sdk` with model `claude-sonnet-4-20250514` when `ANTHROPIC_API_KEY` is set. If the key is missing, the route returns deterministic data-specific fallback suggestions that still cite post IDs, pillars, hooks, and metrics.

**Dashboard snapshots:** Added compact 7-day calendar and pipeline snapshot. Calendar event pills open a post snapshot with grade, stats, and top signals. Snapshot header links to `/calendar?post=<post_id>`. Pipeline snapshot links to `/pipeline?phase=<status>&item=<uuid>`; `PipelineClient` expands the linked item.

**Analytics charts:** Removed dashboard charts from the dashboard surface. Analytics now renders 4 chart cards below the table: Monthly Views / Reach by Post, ER% Over Time, Posts Volume vs Growth %, and Avg ER% by Content Pillar. Chart cards use dark backgrounds, platform glow only, info/expand controls, hover tooltips, and post snapshot clicks for post-level chart points.

**Data cleanup:** Added `scripts/normalize-pipeline-post-ids.mjs`. Ran it against Supabase: normalized 48 `pipeline_items.post_id` values to `#ig0001`, `#yt0001`, `#tt0001`, or `#LF0001` style. Extended the script to normalize matching `calendar_events.notes.post_id` values; fixed 9 calendar rows. Final audit: 154 pipeline rows scanned, 0 remaining changes; 111 calendar rows scanned, 0 remaining changes.

**Verification:** `npm run build` passes with zero TypeScript errors. Browser verified KPI toggles, projection drawer, dashboard calendar popup, dashboard pipeline deep link, Analytics chart labels/toggle, and chart point post snapshot. `npm run lint` still fails on pre-existing repo lint rules in older files; build is clean.

## Nick client

- **Email**: nick@spartasolar.com | **Password**: `DropClix2026!` *(temp — change after first login)*
- **Auth user ID**: `893475d0-f0ba-4570-a1f6-5110cd2c9e18`
- **Client ID**: `913f1794-1506-4449-b56c-b683809cefc3`
- **Test client**: `test@client.com` (role=client) linked to Nick's client_id
- **Re-run migration**: `node scripts/migrate-nick.mjs --force`
- **YouTube data**: 53 videos imported (`#yt0001`–`#yt0039` Shorts, `#LF0001`–`#LF0014` Long-form). Re-import: `node scripts/ingest-yt-csv.mjs <csv> --run` (idempotent).

## Deployment

- **Production URL**: https://dropclix-app.vercel.app
- **Custom domain**: https://portal.drop-clix.com
- **Vercel project**: https://vercel.com/dropclix/dropclix-app
- **GitHub auto-deploy**: Not yet connected — Vercel dashboard → Settings → Git → connect repo

## DNS (Cloudflare for portal.drop-clix.com)

Add A record: Name `portal` → Value `76.76.21.21`, Proxy **OFF** (grey cloud). Or CNAME → `cname.vercel-dns.com`.

## Design tokens

- **Gold**: `#c9a96e` | **Background**: `#0a0a0a` | **Card bg**: `#0a0a0a` | **Grid lines**: `rgba(255,255,255,.04)` | **Tick**: `#333`
- **Tier**: Elite `#39ff88`, Strong `#4cc9ff`, Avg `#fbbf24`, Kill `#ff3b5f`
- **Platforms**: IG gold, YT blue, TT purple, Meta `#1778f2`
- **Status badges**: SCRIPTED=gold, PLANNED=blue, FILMING=amber, REVIEWING=red, POSTED=green, CANCELLED=grey
- **Tooltip**: bg `#0d0d0d`, border `#1e1e1e`
- **KPI cards**: `28px 24px 22px` padding; value `clamp(26px, 4vw, 42px)` font size
- **Table rows**: `py-4 px-4` (pipeline) / `py-4 px-5` (analytics/ads/angles/goals)
- **Filter tabs**: `px-4 py-2.5 gap-2`; pillar chips: `px-3 py-2`
- **Section gaps**: KPI grid `mb-8`; filter row `mb-6`; KPI-to-table `mb-8`
- **Edit panels**: `28px 32px` padding
- **Dashboard types**: `RawDashPost`, `RawDashPipeline`, `RawDashCalendar`, `RawDashGoal` all exported from `DashboardClient.tsx`. `dashboard/page.tsx` imports from there.
- **AI Suggestions API**: DashboardClient calls `/api/ai-suggestions` (NOT `/api/suggestions`). Request body: `{ posts: ContextPost[], platform, mode, projectionMetric?, goalsSummary? }`. Response: `{ suggestions: { icon, headline, body, trigger }[] }`. Needs `ANTHROPIC_API_KEY` in `.env.local`.
- **Dashboard projection AI drawer**: Opens on projection card click, shows right-side slide-in panel. Uses `fallbackSuggestions()` immediately then replaces with API result.
- **Pipeline ID display**: Use `formatDisplayId(postId, platform[])` in PipelineClient — never render `item.postId` raw, as 45 legacy `#0XXX` items exist. Helper infers `ig`/`yt`/`tt` prefix from `platform[0]`.
- **ChartCard glow**: `0 0 56px ${platformColor}1f` box-shadow. Platform colors: ig=#c9a96e, yt/lf=#4cc9ff, tt=#2dd4bf.
- **AdvancedAnalyticsCharts**: Added to AnalyticsClient below the paginator + legend. Contains all 4 charts in 2 grid rows.

## File structure (src/)

```
src/
  app/
    (auth)/login/page.tsx
    auth/reset-password/page.tsx   ← token handler (PASSWORD_RECOVERY event → updateUser)
    (dashboard)/
      layout.tsx                 ← auth guard, renders SidebarShell
      page.tsx                   ← dashboard KPIs + charts
      analytics/page.tsx
      angles/page.tsx
      pipeline/
        page.tsx
        actions.ts               ← updatePipelineStatus (legacy; prefer edit-actions.ts)
      ads/page.tsx
      calendar/page.tsx
      goals/page.tsx
      report-card/page.tsx
      studio/page.tsx
      edit-actions.ts            ← centralized CRUD server actions (all tabs)
    admin/
      page.tsx                   ← client list + "View Portal →" buttons
      actions.ts                 ← impersonateClient, exitImpersonation
    globals.css
    layout.tsx
  components/portal/
    SidebarShell.tsx             ← collapsible sidebar + all nav rendering
    SignOutButton.tsx
    DashboardCharts.tsx
    FilterBar.tsx                ← global platform/window/scope filter bar (all 9 tabs)
    Paginator.tsx                ← pagination arrows + "Page X of Y" (Analytics, Pipeline, Studio, Ads)
    AnalyticsClient.tsx
    PipelineClient.tsx
    AdsClient.tsx
    CalendarClient.tsx
    GoalsClient.tsx
    ReportCardClient.tsx
    StudioClient.tsx
    AnglesClient.tsx             ← angles client delegate (converted from server component in S20)
    PortalNav.tsx                ← UNUSED (replaced by SidebarShell)
  hooks/
    usePortalFilters.ts          ← URL-synced filter state hook + filterByPlatform/filterByScope utils
  lib/supabase/
    client.ts                    ← browser singleton
    server.ts                    ← async server client
    admin.ts                     ← service role, server-only
    portal.ts                    ← getPortalContext() — use in all dashboard pages
  proxy.ts
```

### Session 14f ✅ — Insert missing post #ig0044
Inserted `#ig0044` "Everyone can sell" (2026-02-26, ig, Self Development, Kill) — the post silently dropped by the original migration's dupe-ID upsert. All 4 analytics windows inserted: w24 views=1,722 · w3 views=2,349 · w7 views=4,378 · eom=w7. Supabase now has 44 IG posts matching the HTML source exactly.

### Session 14e ✅ — HTML vs Supabase post audit
Full comparison of `SEED_VIDS` in `portal-nick-updated.html` against `posts` + `post_analytics` tables. 44 HTML IG posts vs 43 Supabase posts (before 14f). **Result: 0 metric differences; 1 post missing.**

**Missing post:** `#0052` (date 2026-02-26) "Everyone can sell" — duplicate ID in HTML caused the original `migrate-nick.mjs` `upsert` to overwrite it with the later `#0052` (2026-03-23, now `#ig0030`). Inserted as `#ig0044` in Session 14f.

### Session 14d ✅ — Post ID rename (#0xxx → #igNNNN)
Renamed all 43 post IDs to sequential `#ig0001`–`#ig0043` format, ordered by `date ASC` (ties broken by old ID ASC). Updated: `posts.post_id` (43 rows), `pipeline_items.post_id` (43 rows; 50 pipeline-only `#0xxx` IDs and 5 `SL00x` IDs left untouched), `calendar_events.notes` JSON `post_id` key (44 of 48 rows; 4 pipeline-only IDs skipped). `post_analytics.post_id` is a UUID FK to `posts.id` — not touched. Script: `scripts/rename-post-ids.mjs` (dry-run without `--run`). Full mapping in `memory/project_post_id_mapping.md`.

### Session 14c ✅ — eom backfill audit + script
Verified all 41 pre-May 2026 posts already have complete eom rows with views > 0 (all 4 windows present: w24, w3, w7, eom). The original `migrate-nick.mjs` already applied the w7→w3 fallback at seed time. Script `scripts/backfill-eom.mjs` was written and confirmed 0 rows needed updating. Re-runnable anytime: `node scripts/backfill-eom.mjs --run` (dry-run without `--run`). Logic: for posts `date < 2026-05-01` where eom is missing or has views=0, copies from best window: w7→w3→w24.

### Session 14b ✅ — Forgot password + reset-password page
Login page toggles between `'login'` and `'reset'` modes. Reset mode: email field + "Send Reset Link" button; calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth/reset-password' })`. Success state shows "Check your email for a reset link."

`src/app/auth/reset-password/page.tsx` — handles the recovery token from the URL hash. States: `loading → ready → submitting → success` (or `invalid` if no `type=recovery` in hash / token expires). Listens to `supabase.auth.onAuthStateChange` for `PASSWORD_RECOVERY` event; 8-second timeout fallback shows invalid state. On submit validates match + min 8 chars, calls `supabase.auth.updateUser({ password })`, shows "Password updated — signing you in" and redirects to `/` after 2.5s.

`src/proxy.ts` updated: `/auth/` prefix is always let through unauthenticated (recovery token is in the hash — server can't see it, so the proxy must not redirect).

### Session 15b ✅ — Pipeline + calendar auto-sync on ingest
`ingest-eom-csv.mjs` now runs a pipeline+calendar sync step after every analytics import. `sync-pipeline-calendar.mjs` added as a standalone backfill tool. Both share the same logic: for each post — if no `pipeline_item` exists for that `post_id`, create one (`status=POSTED`, platform=`['ig']`, pillar + week derived from post); if pipeline_item exists but status ≠ POSTED, update it; if no `calendar_event` notes JSON contains the `post_id`, create one.

**Week derivation:** `${MonthAbbr} WK${ceil(day/7)}` — e.g., May 10 → "May WK2". Matches existing pipeline data format.

**Backfill run against 10 May posts:**
- Pipeline created: #ig0045–#ig0051 (7 new items, status=POSTED)
- Pipeline updated: #ig0035, #ig0042, #ig0043 (3 items, REVIEWING → POSTED)
- Calendar created: #ig0045–#ig0051 (7 new events)
- Calendar already existed: #ig0035, #ig0042, #ig0043 (no action)
- Sync is idempotent — safe to re-run.

### Session 15a ✅ — May 2026 posts + EOM analytics
Inserted 8 new May posts (#ig0045–#ig0052) into `posts`. Ran EOM analytics for all 11 May posts via `scripts/ingest-eom-csv.mjs`. Added `skip_rate numeric` column to `post_analytics` (migration: `supabase/migrations/add_skip_rate.sql`).

**May 2026 post roster (11 posts):**
| ID | Title | Date | Notes |
|----|-------|------|-------|
| #ig0035 | Nick Hype Post | 2026-05-04 | date corrected from Apr 5 |
| #ig0042 | Saudi Cup | 2026-05-06 | date corrected from May 5; skip_rate=58.2% |
| #ig0043 | Law of averages | 2026-05-08 | |
| #ig0045 | Weak leader need their reps | 2026-05-10 | |
| #ig0046 | Door 2 Door sucks... | 2026-05-13 | |
| #ig0047 | Pipeline paradox 80% | 2026-05-16 | |
| #ig0048 | The reason your scripts are failing you | 2026-05-18 | |
| #ig0049 | The fire trap | 2026-05-21 | |
| #ig0050 | How to get more time | 2026-05-23 | |
| #ig0051 | Increase the effort & Decrease the expectation | 2026-05-26 | |
| #ig0052 | You're in control of your success | 2026-06-01 | June post; no EOM data yet |

**Analytics written:** 11 rows — eom for all 10 posts with data; w7 for #ig0035 and #ig0043 (views_7d provided). #ig0052 skipped (blank).

**Schema change:** `post_analytics.skip_rate numeric` — run `supabase/migrations/add_skip_rate.sql` once in SQL Editor for any new environment.

### Session 16 ✅ — Pipeline + Calendar bidirectional sync, posted datetime picker, draggable calendar

**1. Posted datetime picker (Pipeline)**
When status changes to POSTED or SCHEDULED, the edit panel shows a "Posted On / Scheduled For" inline picker (`datetime-local` input, gold/green styled). Picking a datetime auto-flips status: future date → SCHEDULED, past date → POSTED. Syncs the date to the matching `calendar_event.event_date` immediately via the bidirectional sync. The posted date shows under the status badge in the table row.

**2. Bidirectional auto-sync**
`edit-actions.ts` — two helpers: `syncToCalendar(postId, ...)` and `syncToPipeline(postId, ...)`. Both use admin client directly (bypasses RLS, scoped by `client_id`).
- Pipeline → Calendar: `title`, `platform`, `posted_at` (date portion), `scheduled_date` changes mirror to matching `calendar_event` (matched via `ilike('%"post_id":"${postId}"%')` on notes JSON).
- Calendar → Pipeline: `title`, `event_date`, `platform` changes mirror to matching `pipeline_item` (matched via `post_id` column). `revalidatePath` called on both `/pipeline` and `/calendar` after every cross-sync write.

**3. Draggable calendar events**
Mouse (HTML5 drag API): EventPill is `draggable`, carries `eventId` + `fromDate` in dataTransfer. Cells get `onDragOver`/`onDrop` handlers; gold outline + background on hover. Drop triggers optimistic React state update → `updateCalendarEvent({ event_date })` → bidirectional sync updates `pipeline_item.scheduled_date`. Revert on error.
Touch (mobile): document-level `touchmove`/`touchend` listeners (added once on mount, `{ passive: false }`). 8px movement threshold activates drag. A fixed ghost element follows the finger. Hit-test via `document.elementFromPoint` + `data-caldate` attribute on cells. Drop calls same `handleEventMove`. Brief green flash animation on drop target cell.

**Schema change:** `pipeline_items.posted_at timestamptz` — run `supabase/migrations/add_posted_at.sql` in SQL Editor before using the posted datetime picker.

### Session 19 ✅ — YouTube data import (53 videos)
`scripts/ingest-yt-csv.mjs` — new script for YouTube tracker CSV format (different column structure from standard IG import). Imported all 53 Nick YouTube videos: 39 Shorts (`#yt0001`–`#yt0039`) + 14 Long-form (`#LF0001`–`#LF0014`). Jan–May 2026 date range. All stored with `platform=['yt']`, `format='Short'|'Long-form'`, `yt_id` = YouTube Video ID (stored in `post_analytics.yt_id`), `followers` = Subscribers Gained. `pipeline_items.yt_type` set to Short/Long-form. Decision auto-computed using YT ER% formula. 53 pipeline items (POSTED) + 53 calendar events created.

**YouTube ER% formula:** `(likes + comments + shares + subscribers_gained) / views × 100`
Subscribers Gained replaces saves (not available on YouTube). Same decision thresholds: ≥12% = Double Down, 4–11.9% = Iterate, <4% = Kill.

## Formula Reference

### Instagram ER%
`(likes + comments + shares + saves) / views × 100`
Decision thresholds: ≥12% = Double Down, 4–11.9% = Iterate, <4% = Kill.

### YouTube ER%
`(likes + comments + shares + subscribers_gained) / views × 100`
`subscribers_gained` maps to `post_analytics.followers`. `saves` is `null` for all YT rows.
Same decision thresholds: ≥12% = Double Down, 4–11.9% = Iterate, <4% = Kill.
Use `ingest-yt-csv.mjs` for all future YouTube imports — it applies this formula automatically.

### Session 21 ✅ — Major filter system overhaul + page restructuring

**1. Dashboard (DashboardClient)**
`DashboardClient.tsx` — new client component replacing the server-rendered dashboard. Server fetches rawPosts + rawPipeline and passes to client. Client applies platform + scope filters via `useMemo`. Platform pills (IG/TT/YT/LF, default IG) and scope dropdown (ALL TIME / THIS WEEK / Jan–Dec). Chart cards get platform-colored glow (ig=#c9a96e, tt=#a78bfa, yt/lf=#4cc9ff, 15% opacity wide box-shadow). KPIs, charts, recent posts, pipeline strip all reactive to filter. Empty state with platform icon + "No [Platform] data yet" message. Default platform changed from 'all' → 'ig' in `usePortalFilters`.

**2. FilterBar redesign**
`FilterBar.tsx` completely rewritten. Removed ALL pill, removed window segmented control, removed custom date range. Exports: `PlatformPills` (IG/TT/YT/LF), `ScopeDropdown` (compact=false: ALL TIME + 12 months; compact=true: ALL TIME / THIS WEEK / THIS MONTH), `FilterBar` (composes both; `showScope` prop adds scope dropdown; `scopeCompact` prop uses compact scope).

**3. Analytics**
`FilterBar showScope` added to analytics/page.tsx. Window segmented control (24HR/3DAY/7DAY/EOM) moved from top FilterBar to a `<thead>` sub-row inside the Analytics table — spans all 12 columns, absolute-positioned sliding gold underline indicator.

**4. Pipeline**
`FilterBar` removed from pipeline/page.tsx. `PipelineClient` manages its own two-row filter: row 1 = `PlatformPills`, row 2 = full-width search + `ScopeDropdown` (compact). Pillar filter chips removed entirely. `filter` state initialized from `?phase=` URL param on mount via `useSearchParams()`.

**5. Calendar**
`FilterBar` removed from calendar/page.tsx. Max 2 events per cell (was 3), "+X more" indicator updated.

**6. Goals → GoalsDashboard**
`GoalsClient.tsx` completely rewritten as `GoalsDashboard`. Server fetches rawPosts (with platform + format + analytics) + goals, passes to client. Client computes: platform-filtered actuals for current month (Followers Gained / Posts / Total Views / Elite Videos ≥12% ER), report card grades (weekGrades + monthGrades via full computation ported from report-card/page.tsx). 4 goal cards with editable targets (2s debounce, no blur). Report Card snapshot card shows current month grade/score + stats + wins/misses. "View Full Report Card" button opens full-screen modal with `ReportCardClient`.

**7. Report Card merged into Goals**
Report Card removed from sidebar navigation (`SidebarShell.tsx` NAV_ITEMS). `/report-card` route still exists for direct access. All report card data now computed in GoalsDashboard client from filtered posts.

**8. Studio stats bar**
`PipelineStats` type exported from `studio/page.tsx`. Page now fetches ALL pipeline item statuses (extra query), computes counts (PLANNED/SCRIPTED/FILMING/REVIEWING/POSTED), passes to StudioClient. Stats bar replaces the old "Phase funnel" — 5 clickable stat tiles that navigate to `/pipeline?phase=[STATUS]`. `FilterBar` removed from studio/page.tsx.

### Session 22 ✅ — Dashboard overhaul, Analytics charts, Pipeline ID fix

**1. Dashboard (`DashboardClient.tsx`) — full rewrite**
All graphs, pipeline status strip, and recent content table removed. Replaced with:
- **4 toggle KPI cards**: Followers Gained ↔ Conversion Rate | Total Reach ↔ Avg Watch% | Avg ER% ↔ Top Video | Posts (static). Each card uses local boolean toggle state.
- **30-Day Projections**: 3 cards (Follower Gain / Reach / Avg ER%) computed from last 10 posts. Clicking any card opens right-side AI Suggestions drawer that calls Claude API.
- **7-Day Calendar Snapshot**: Horizontal week view, arrow navigation, platform-colored event pills (gold=IG, blue=YT, teal=TT), max 2 per day + "+X more". Click pill → PostSnapshot popup (grade + top 3 stats + link to Calendar tab).
- **Pipeline Snapshot**: Platform+scope filtered items, max 18, click navigates to `/pipeline?phase=STATUS`.
- **AI Suggestions**: 4 cards powered by `/api/ai-suggestions` (Claude API). Fallback to computed client-side suggestions when API unavailable.

**2. `dashboard/page.tsx`** fetches `posts`, `pipeline_items`, `calendar_events`, `goals` in parallel. Exports `RawDashPost`, `RawDashPipeline`, `RawDashCalendar`, `RawDashGoal` types (all from DashboardClient).

**3. AI Suggestions API (`/api/ai-suggestions/route.ts`)**
POST with `{ posts, platform, mode, projectionMetric, goalsSummary }`. Returns `{ suggestions: { icon, headline, body, trigger }[] }`. Uses `claude-sonnet-4-5`. Handles missing `ANTHROPIC_API_KEY` gracefully (returns config-prompt card). `/api/suggestions/route.ts` retained for external callers.

**4. Analytics charts** — `AdvancedAnalyticsCharts` component added to `AnalyticsClient.tsx`:
- Row 1: Monthly Views/Reach by Post (bar, top/last/all modes) | ER% Over Time (line, click-to-snapshot)
- Row 2: Posts Volume vs Growth% (dual-axis composed) | Avg ER% by Pillar (horizontal bar)
- All in `ChartCard` (dark bg, platform glow box-shadow, hover lift, expandable).

**5. Pipeline post ID display fix** — `formatDisplayId(postId, platform)` helper in `PipelineClient.tsx`:
- IDs already in `#(ig|tt|yt|LF)NNNN` format → returned as-is.
- Legacy `#0XXX` numeric IDs → prefix inferred from `item.platform[0]` and formatted `#ig0001` / `#yt0001` / `#tt0001`.
- Applied at both table row ID cell and edit panel header.

## Next sessions
- Session 23: Update Modal (cross-window edit overlay for Analytics/Angles rows)
- Session 24: Ads sub-views (Audience tab, Monthly Summary, charts, auto-suggestion banner, Add Campaign/Audience buttons)

## CSV Import Standard

**This format is locked. Never change column order or names without explicit instruction.**

Template file: `scripts/templates/dropclix-import-template.csv`

### Column order (exact)

```
post_id, title, platform, date, pillar, hook_type, format, decision,
views_24h, likes_24h, comments_24h, shares_24h, saves_24h, watch_pct_24h, skip_rate_24h, followers_24h,
views_3d, likes_3d, comments_3d, shares_3d, saves_3d, watch_pct_3d,
views_7d, likes_7d, comments_7d, shares_7d, saves_7d, watch_pct_7d,
eom_views, eom_likes, eom_comments, eom_shares, eom_saves, eom_watch_pct, eom_skip_rate, eom_followers
```

### Rules
- **platform**: pipe-separated — `ig|tt|yt` (not comma-separated)
- **decision**: always left blank — the importer auto-calculates from ER%
- **Smart window detection**: a window row is only inserted if `views_*` > 0. Blank or zero = skip that window entirely.
- **Any blank column is silently skipped** — you don't need to fill all 36 columns.
- **Source of truth**: `sell_the_situation_24hr_v2.csv` format (Downloads folder)
- **Download Template button** in Studio → Import → CSV Import generates this template client-side from a hardcoded string matching the locked format.

### ER% and Decision auto-calculation
ER% = `(likes + comments + shares + saves) / views × 100` per window. Decision picked from best window (eom→w7→w3→w24). Thresholds: ≥12% = Double Down, 4–11.9% = Iterate, <4% = Kill.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/migrate-nick.mjs` | Initial data seed for Nick/Sparta Solar. `--run` to insert, `--force` to wipe+re-insert. |
| `scripts/backfill-eom.mjs` | Fill missing/zero-views eom rows for pre-May posts from best window (w7→w3→w24). `--run` to apply. |
| `scripts/rename-post-ids.mjs` | Rename post_id labels to `#igNNNN` sequential format (dry-run default, `--run` to apply). Idempotent — safe to re-run on new posts. |
| `scripts/insert-may-posts.mjs` | One-time insert of May 2026 posts #ig0045–#ig0052. `--run` to apply. |
| `scripts/ingest-eom-csv.mjs` | **Generic reusable EOM ingest.** `node scripts/ingest-eom-csv.mjs <path-to-csv> [--run]`. Dry-run by default. Upserts eom + w7 analytics from a filled CSV; inserts missing post stubs automatically; **auto-syncs pipeline+calendar** after every import. Use this for all future monthly EOM imports. |
| `scripts/sync-pipeline-calendar.mjs` | **Standalone pipeline+calendar backfill.** `node scripts/sync-pipeline-calendar.mjs [#igXXXX ...] [--run]`. Dry-run by default. Creates missing pipeline_items (status=POSTED) and calendar_events for all (or specified) posts. Safe to re-run — idempotent. |
| `scripts/ingest-may-analytics.mjs` | Month-specific May ingest (superseded by ingest-eom-csv.mjs — kept for reference). |
| `scripts/ingest-yt-csv.mjs` | **YouTube video ingest.** `node scripts/ingest-yt-csv.mjs <path-to-csv> [--run]`. Dry-run by default. Maps YT tracker CSV columns → posts + post_analytics (platform=yt, yt_id stored, followers=subscribers_gained, saves=null). Auto-computes decision from YT ER% formula. Creates pipeline_items (yt_type=Short/Long-form) + calendar_events. Use for all future YouTube imports. |
