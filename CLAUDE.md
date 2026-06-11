@AGENTS.md

# Drop CLIX — App

Next.js 16.2.6 + Supabase SSR + Tailwind 4. Source under `src/`. Path alias `@/*` → `src/*`.

## Session Scope

Every session must be labeled with one of two scopes before any work begins:

**GLOBAL** — changes to codebase, UI, features, or backend
- Affects ALL clients
- Any code change = global by default
- Examples: new feature, UI update, bug fix in shared component, schema migration

**CLIENT: [Name]** — data only, no code changes
- Affects ONE client's Supabase data only
- Zero code changes allowed in client-specific sessions
- Examples: import posts, fix data, update goals, correct pipeline items

### Rules:
- Every Claude Code prompt must declare scope in the first line: `SCOPE: GLOBAL` or `SCOPE: CLIENT: Nick`
- If scope is CLIENT, Claude Code must not touch any .tsx, .ts, .js, or .css files
- If scope is GLOBAL, changes apply to all clients — verify nothing breaks Nick's existing data
- If unsure, default to GLOBAL and flag it
- Bug fixes: if the bug affects only one client's data → CLIENT scope. If it affects the UI or logic → GLOBAL scope

## Sessions (completed)

- **Sessions 1–3**: Scaffold, Supabase SSR auth, gold/black login + dashboard. Auth via `src/proxy.ts` (not middleware.ts). Tailwind 4 `@theme` tokens in `globals.css`.
- **Session 4**: Analytics tab — sortable table, platform/window filters, ER% formula, tier + decision badges, KPI strip.
- **Session 5**: Pipeline tab — phase cards, inline status dropdown with optimistic updates, script expand, `admin.ts` for RLS bypass.
- **Session 6**: Ads tab — 4 KPI cards, sortable campaign table, creatives expand. `effectiveRevenue = roas * spend`; end dates inferred from next campaign start.
- **Session 6.5**: Calendar tab — 42-cell grid, agenda view, event pills. Notes is JSON string in text column; `pipeline_item_id` is null, join via `notes.post_id`.
- **Session 6.6**: Angles tab — ER breakdown by pillar/hook/format, breakdown bars, Top/Bottom 5 tables.
- **Session 6.7**: Goals tab — 9 seeded goals (5 monthly + 4 weekly), pace projection, editable targets via `GoalsClient`.
- **Session 7**: Report Card + Studio tabs — weekly/monthly grades, wins/misses, studio phase funnel + script expand.
- **Session 8**: Nick data migration via `scripts/migrate-nick.mjs` — 43 posts, 176 analytics rows, 93 pipeline items, 6 campaigns, 48 calendar events.
- **Session 9**: Admin impersonation — `getPortalContext()` in `portal.ts`, cookie `dropclix_impersonate_client_id` (8h httpOnly), "← Exit Portal" button.
- **Session 9b**: Created Supabase auth user nick@spartasolar.com (temp pw: `DropClix2026!`).
- **Session 10**: Vercel deploy to `dropclix-app.vercel.app` + custom domain `portal.drop-clix.com`. DNS: Cloudflare A `portal → 76.76.21.21`, proxy OFF.
- **Session 11**: Inline editing across all tabs — `edit-actions.ts` centralized CRUD, 2s debounce auto-save, SaveDot indicator. `useRef<T | undefined>(undefined)` required in React 19.
- **Session 12**: HTML portal audit (50 gaps) — report in `memory/project_html_portal_audit.md`. Note: HTML `reach` = DB `views`.
- **Session 13**: Design system spacing pass — KPI cards `28px 24px 22px`, table rows `py-4`, section gaps `mb-8`. No new features.
- **Session 14**: Recharts charts (`recharts@3.8.1`) + collapsible sidebar via `SidebarShell.tsx` (56px collapsed / 220px expanded). `PortalNav.tsx` is unused.
- **Session 14b**: Forgot password + reset-password page at `auth/reset-password/page.tsx`. Proxy always lets `/auth/` through unauthenticated.
- **Session 14c**: eom backfill audit — all pre-May posts already had complete eom rows. `scripts/backfill-eom.mjs` written (0 rows needed).
- **Session 14d**: Post ID rename — all 43 IDs renamed `#ig0001`–`#ig0043` (date ASC). Script: `scripts/rename-post-ids.mjs`.
- **Session 14e/f**: HTML vs Supabase audit (0 metric diffs, 1 missing post). Inserted `#ig0044` "Everyone can sell" with all 4 windows.
- **Session 15a**: May 2026 posts (#ig0045–#ig0052) inserted + EOM analytics ingested. `skip_rate numeric` column added (`supabase/migrations/add_skip_rate.sql`).
- **Session 15b**: Pipeline + calendar auto-sync on ingest — `ingest-eom-csv.mjs` syncs both; `sync-pipeline-calendar.mjs` added as standalone backfill. Idempotent.
- **Session 16**: Bidirectional pipeline↔calendar sync in `edit-actions.ts`, posted datetime picker (auto-flips POSTED/SCHEDULED by date), draggable calendar (mouse + touch). Added `pipeline_items.posted_at timestamptz` (`supabase/migrations/add_posted_at.sql`).
- **Session 17**: Studio importer (`createPost()` + `importPostsBatch()` server actions, CSV file upload → mapping → preview → batch), ER% formula audit (fixed dashboard to 4-component), smart popup for POSTED/SCRIPTED status, welcome overlay (`sessionStorage` per client).
- **Session 18-pre**: Decision auto-calculation everywhere — `src/lib/decision.ts` shared utility (`erToDecision`, `computeDecision`). Decision updated on `createPost()`, `updateAnalyticsMetric()`, and every EOM ingest. Never hardcode 'Iterate' as default.
- **Session 19**: YouTube import — 53 videos (39 Shorts `#yt0001`–`#yt0039`, 14 Long-form `#LF0001`–`#LF0014`) via `ingest-yt-csv.mjs`. YT ER% uses `subscribers_gained` stored in `post_analytics.followers`. `pipeline_items.yt_type` = Short/Long-form.
- **Session 20**: Global `usePortalFilters` hook + URL-synced filters (`platform`, `win`, `scope`, `from`, `to`), `FilterBar` component, `Paginator.tsx`. Angles converted to client component.
- **Session 21**: Major filter overhaul — FilterBar redesigned (no ALL pill, no custom range), Dashboard→DashboardClient, Goals→GoalsDashboard (Report Card merged in), Studio stats bar with pipeline deep links, Pipeline owns its own filter row.
- **Session 22**: Dashboard full rewrite (toggle KPI cards, 30-day projections, AI suggestions drawer, 7-day calendar + pipeline snapshots). Analytics 4 chart cards below table. Pipeline `formatDisplayId()` fix for legacy `#0XXX` IDs.
- **Session 23**: YouTube OAuth, `platform_connections` table (`create_platform_connections.sql`), Analytics sync (`sync-youtube.mjs` + `/api/admin/sync-youtube`), Pipeline YT linking (`YTLinkModal`), Admin YouTube section, Studio YT status bar.
- **Session 24**: Client onboarding — `AdminClientsSection` with create/edit/resend invite modals, goals UPDATE RLS + `monthly_retainer` column (`session_24_onboarding.sql`), `seed-new-client.mjs`. New clients get 9 seeded goals + 1 welcome pipeline item (`post_id='#new0001'`).
- **Session 25**: Multi-client — `enabled_platforms`/`enabled_tabs` per client (`session_25_client_config.sql`), `ClientConfigProvider` + `useClientConfig()`, `EmptyState.tsx` for all 8 tabs, admin CSV import (`AdminImportModal`), `OnboardingBanner` (postCount < 5, not admin).
- **Bug Fix (post-S29, round 2)**: YouTube sync returning 0 windows — 4 bugs in the upsert: (1) `er_pct` column doesn't exist in `post_analytics`; (2) `client_id` (NOT NULL) and `platform` missing from upsert payload; (3) `onConflict: 'post_id,metric_window'` didn't match actual constraint `unique(post_id, platform, metric_window)`; (4) stray `dimensions: ''` param in YT Analytics API call. Also added `posts.yt_id` column (migration: `add_posts_yt_id.sql`) so sync queries `posts WHERE yt_id IS NOT NULL` directly instead of joining through `post_analytics`. `ingest-yt-csv.mjs` now writes `yt_id` to posts rows. **PENDING**: Run `supabase/migrations/add_posts_yt_id.sql` in the Supabase SQL Editor.
- **Bug Fix (post-S29, round 3)**: YouTube sync "0 windows synced, 332 skipped" — sync was never creating new rows, only skipping. Fix: (1) replaced fixed `['w24','w3','w7','eom']` loop with age-based `windowsForPost()` — eom always; w7 if ≤6 days old; w3 if ≤3 days; w24 if ≤2 days; (2) eom end date changed from end-of-publish-month to **today**, so old posts get current all-time totals; (3) skip condition changed from `!m || m.views === 0` to `!m` only — zero-view rows are now written; (4) removed "has data → skip" check entirely — always attempt API and upsert. Impressions/CTR added as secondary API call (`dimensions=video`) — gracefully falls back to 0 if unavailable. **Root cause of 403s**: YouTube Analytics API NOT ENABLED in GCP project `338389725982`. Enable at: console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=338389725982. After enabling, all posts with yt_ids owned by the connected channel will sync. Token must match the channel that owns the videos.
- **Bug Fix (post-S29)**: YouTube sync "Unauthorized" — `AdminYouTubeSection` sent `NEXT_PUBLIC_SUPABASE_SERVICE_KEY` (doesn't exist, always empty) as auth header. Fix: sync route now validates Supabase session + admin role via cookie instead of comparing service key. Removed auth header from client. Also: protected callback from wiping stored `refresh_token` with null on reconnect, fixed `YouTubeConnection` type (`connected_at` → `created_at`).
- **Bug Fix (post-S25)**: Admin "No clients" — root cause: wrong `SUPABASE_SECRET_KEY` in Vercel (publishable key, not service role). Fix: synced correct env vars, set `app_metadata.role='admin'` via `setup-admin.mjs`, updated `get_my_role()` to use JWT claim, rewrote clients fetch to raw `fetch()` bypassing Supabase JS client entirely. **`SUPABASE_SECRET_KEY` prefix must be `sb_secret_*`, not `sb_publishable_*`.**
- **Session 26**: Admin layer rebuilt correctly — `createAdminClient()` now uses `persistSession:false, autoRefreshToken:false`; `admin/page.tsx` uses it for all 3 queries (clients, connections, posts); `AdminClientsSection` rebuilt with premium card UI (hover border, breathing room, gold CTAs); `session_26_rls_fix.sql` drops redundant admin policy on `clients` (service role bypasses RLS automatically).
- **Session 27**: Pipeline Add Video modal (gold "+ Add Video" button, platform-aware ID auto-fill using `#ig|#tt|#yt` pipe-separated IDs, read-only ID field computed from next available per platform); AI command bar (floating gold sparkle button, slide-up chat panel, `/api/ai-command` route with Claude context — add pipeline/update analytics/bulk status via confirmation cards, voice-to-text via SpeechRecognition API); legibility pass across all components (table headers #2a2a2a→#555, label text-[7px]→text-[9px], secondary text #252525/#1e1e1e→#555/#444); `scripts/fix-week-format.mjs` for normalising week values to MonWk# format.
- **Session 29 (GLOBAL)**: 10 global UI enhancements — Toast system (`Toast.tsx`, `ToastProvider` in layout), PostSlideOver panel (`PostSlideOver.tsx`, row clicks on Analytics/Angles open right slide-over with sparkline + decision badge), Cmd+K global shortcut + ⌘K hint label (AICommandBar), sticky thead on Pipeline/Analytics/Angles (`position:sticky`, `background:#060606` on every `<th>`), pillar color coding (`usePillarColors.ts`, 3px `<td>` stripe on all 3 tables), pipeline phase card gold border on active, pipeline hover preview popover (800ms debounce, fixed position), pipeline 6-week calendar mini-map (status dots, week filter, current week gold border), dashboard "This Week" strip (MonWk# label, priority-sorted status cards), contextual empty state in pipeline. TypeScript: 0 errors.
- **Session 28 (GLOBAL + CLIENT: Nick)**:
  - *GLOBAL*: Platform visibility bug — `enabled_platforms` defaulted to `['ig']` for non-admin clients when null; changed fallback to `['ig','tt','yt','lf']` in `layout.tsx` so all platforms are visible by default.
  - *CLIENT: Nick*: `scripts/fix-nick-data.mjs` applied — 154 week format fixes (M2 WK4→FebWk4, Mar WK3→MarWk3, etc.); 5 ID renames (SL001–SL005 → #ig0118–#ig0122); `enabled_platforms` updated to `['ig','tt','yt','lf']`. Also fixed `scripts/fix-week-format.mjs` to use readFileSync (was using broken dotenv).

## Key decisions / gotchas

- **Next.js 16 proxy**: `middleware.ts` is deprecated. Use `src/proxy.ts` with `export function proxy()`.
- **`/auth/` routes**: Always let through unauthenticated — recovery token is in URL hash (client-only).
- **cookies() is async**: Always `const cookieStore = await cookies()` in server components.
- **Env var names**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY), `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY). Service role prefix: `sb_secret_*`.
- **Role check in proxy AND page/layout**: Proxy handles redirect; layout re-checks to be safe.
- **Login redirect**: After sign-in, role fetched client-side → admin goes `/admin`, client goes `/`.
- **No `app/page.tsx`**: Deleted — `app/(dashboard)/page.tsx` owns `/` via route group.
- **Admin on dashboard**: Layout redirects admin role to `/admin`; `/` is client-only.
- **getPortalContext()**: Import from `@/lib/supabase/portal`. Use in ALL dashboard pages — do NOT use separate `createClient()` + profile fetch.
- **Admin impersonation**: Cookie `dropclix_impersonate_client_id`, 8h TTL, httpOnly. Only cleared via "Exit Portal" action.
- **Dashboard queries**: Use `metric_window = 'eom'` for aggregate totals. Pipeline active = not POSTED/CANCELLED.
- **Analytics data join**: `posts.select('..., post_analytics(...)')` returns analytics as nested array keyed by `metric_window`.
- **ER formula (IG/TT)**: `(likes + comments + shares + saves) / views × 100`.
- **ER formula (YouTube)**: `(likes + comments + shares + subscribers_gained) / views × 100`. `subscribers_gained` stored in `post_analytics.followers`; `saves` is `null` for all YT rows. Same decision thresholds.
- **YT post IDs**: `#yt0001`–`#yt0039` (Shorts), `#LF0001`–`#LF0014` (Long-form). `pipeline_items.yt_type` = 'Short' or 'Long-form'. `post_analytics.yt_id` = YouTube Video ID.
- **Decision auto-calculation**: Derived from ER% when any window has `views > 0`. Thresholds: ≥12% → Double Down, 4–11.9% → Iterate, <4% → Kill. Utility: `src/lib/decision.ts`. Never hardcode 'Iterate' — leave null if no data.
- **State naming**: Use `win` not `window` for WindowKey state variables (avoids browser global shadowing).
- **Global filters via URL params**: `platform`, `win`, `scope`, `from`, `to`. All client components read same params — no new DB queries on filter change.
- **EditableCell must use post's own platform**: Pass `post.platform[0] ?? 'ig'` not the filter's `platform` value — filter may be 'all' which is not valid for DB writes.
- **LF filter requires `format` field**: Analytics query must select `format`; `filterByPlatform` receives `getFormat` callback for Long-form YT.
- **Angles is now a client component**: `angles/page.tsx` is minimal server fetch; all computation in `AnglesClient.tsx`.
- **Default platform is 'ig'**: `usePortalFilters` defaults to `platform='ig'`. All tabs open with IG selected.
- **FilterBar exports**: `PlatformPills` and `ScopeDropdown` exported separately for pages that compose their own filter UI (DashboardClient, PipelineClient, GoalsDashboard).
- **filterByPlatform signature**: 2-3 args only: `(items, platform, getFormat?)`. Item type must extend `{ platform: string[] }` natively.
- **Pipeline phase URL param**: PipelineClient reads `?phase=STATUS` on mount. Studio stats tiles navigate to `/pipeline?phase=SCRIPTED` etc.
- **Goals page is GoalsDashboard**: All logic in `GoalsDashboard` (GoalsClient.tsx). Types `RawGoalPost` + `RawGoal` exported from `goals/page.tsx`. Report card grades computed client-side; WeekGrade/MonthGrade types imported from `report-card/page.tsx`.
- **Supabase untyped rows**: Cast with `as unknown as RawRow[]` — no generated DB types.
- **Pipeline RLS**: Clients have SELECT only. Updates use `edit-actions.ts` + `admin.ts`.
- **admin.ts**: ONLY import in server actions / server components. Never in `'use client'` files.
- **Ads revenue**: `revenue` column is 0 in DB. Use `effectiveRevenue = roas * spend`. End dates inferred as day before next campaign start.
- **Goals actuals**: From eom analytics window per post, grouped by month. Falls back to most recent data month if current month empty.
- **Pace status**: `(actual / daysElapsed) * daysInMonth` → ≥110%=Ahead, ≥80%=On Track, <80%=Behind.
- **Calendar notes**: JSON string in text column. Parse with `try { JSON.parse(notes) } catch {}`.
- **Calendar pipeline link**: `pipeline_item_id` is null for all events. Join via `notes.post_id` → `pipeline_items.post_id`.
- **Calendar grid**: 42-cell fixed (6 rows × 7 cols). Leading/trailing cells from adjacent months.
- **React Fragment key**: Use `<Fragment key={id}>` (imported), not `<>`.
- **Recharts v3 types**: `content` prop in `<Tooltip>`: `(props: any) => ...`. Tooltip `payload` is `readonly any[]`.
- **Studio importer**: `studio/actions.ts` is 'use server'. `createPost()` revalidates 8 paths. `post_analytics.post_id` is UUID FK — always use `posts.id` (not text `post_id`) when inserting analytics.
- **Welcome overlay**: `sessionStorage` keyed by `dropclix_welcomed_${clientName}`. Rendered in dashboard layout, not inside SidebarShell.
- **Smart popup trigger**: Intercepts status → POSTED/SCRIPTED only when both `item.scheduledDate` AND `item.postedAt` are null.
- **Tailwind 4 theme**: Colors in `globals.css` `@theme {}` block, not `tailwind.config.js`.
- **Port**: Dev server falls back; check `.next/dev/logs/next-development.log` for actual port.
- **Pipeline ID display**: Use `formatDisplayId(postId, platform[])` in PipelineClient — never render `item.postId` raw (45 legacy `#0XXX` items exist).
- **Dashboard types**: `RawDashPost`, `RawDashPipeline`, `RawDashCalendar`, `RawDashGoal` all exported from `DashboardClient.tsx`.
- **AI Suggestions API**: DashboardClient calls `/api/ai-suggestions` (NOT `/api/suggestions`). Body: `{ posts, platform, mode, projectionMetric?, goalsSummary? }`. Needs `ANTHROPIC_API_KEY`.
- **Admin clients fetch**: Uses `createAdminClient()` (service role, `persistSession:false, autoRefreshToken:false`) for ALL admin queries — clients, connections, posts. Service role bypasses RLS entirely. `get_my_role() = NULL in SQL Editor` is expected; not a bug.
- **ClientConfigProvider**: `src/lib/client-config-context.tsx` wraps dashboard layout. `useClientConfig()` returns `{ enabledPlatforms, enabledTabs, isAdmin }`.
- **enabled_platforms default**: All platforms `['ig','tt','yt','lf']` when `clients.enabled_platforms` is null. Applies to all users including non-admin. To restrict a client to fewer platforms, set the column explicitly.
- **OnboardingBanner**: Never shows to admin users even when `postCount < 5`.
- **AdminImportModal CSV**: Parses using locked 36-column Drop CLIX format. `buildPostFromRow` maps `hook` (not `hookType`), `watch_pct` (not `watchPct`), `cta: ''`.
- **Pipeline post_id multi-platform**: Items added via Add Video modal store pipe-separated IDs like `#ig0053 | #tt0048` in `post_id`. `formatDisplayId()` returns pipe-separated strings as-is (checks for `|` first). IDs computed server-side in `pipeline/page.tsx` from max across `posts` + `pipeline_items`.
- **AI command bar**: Floating button at `position:fixed; bottom:28px; right:28px`. Mounted in dashboard layout. Calls `/api/ai-command` (server-auth'd). Returns `{type:'text'|'action', ...}`. Actions: `add_pipeline`, `update_analytics`, `bulk_update_status`. Executes via server actions + `router.refresh()`. SpeechRecognition uses `window.SpeechRecognition ?? window.webkitSpeechRecognition`.
- **sync-youtube route auth**: Uses Supabase session cookie (admin role check), NOT the `SUPABASE_SECRET_KEY` bearer header. Never pass service keys from client components — they can't read non-`NEXT_PUBLIC_` env vars. Client fetch to `/api/admin/sync-youtube` needs no Authorization header; session cookie handles it.
- **post_analytics upsert**: Always include `client_id`, `platform`, and use `onConflict: 'post_id,platform,metric_window'`. The unique constraint is `unique(post_id, platform, metric_window)`. Missing any of these causes silent insert failures.
- **posts.yt_id**: YouTube video ID lives on the `posts` row (not just `post_analytics.yt_id`). Migration: `supabase/migrations/add_posts_yt_id.sql`. Both sync scripts and the YT CSV importer use/write this column.
- **YT Analytics API**: Do NOT include `dimensions: ''` in params — it's invalid. Metrics order: views[0], likes[1], comments[2], shares[3], estimatedMinutesWatched[4], averageViewPercentage[5], subscribersGained[6].
- **Week format**: Pipeline weeks should use MonWk# (e.g. JunWk1). Migration: `node scripts/fix-week-format.mjs [--run]`.
- **Toast system**: `ToastProvider` wraps the dashboard layout. Any child calls `useToast()` → `toast(message, variant)`. Variant: `'success'` (gold), `'error'` (red), `'info'` (grey). Auto-dismiss 3s.
- **PostSlideOver**: Right-side slide-over panel. Takes `SlideOverPost` shape with w24/w3/w7/eom windows. Used in Analytics, Angles (Top/Bottom 5). Use `e.stopPropagation()` on any `<td>` onClick inside the row to prevent bubbling to the slide-over handler.
- **Pillar color stripe**: `usePillarColors(pillars)` returns `Map<string, string>`. Use `${color}cc` for stripe td background (80% alpha). Stripe td is `width:3, padding:0` — first column before data.
- **Sticky thead with overflow-x**: Give every `<th>` an explicit `background:'#060606'` so content doesn't bleed through. The `<thead>` itself gets `position:'sticky', top:0, zIndex:10`.
- **border-collapse + row borders**: `borderLeft` on `<tr>` with `borderCollapse:'collapse'` doesn't render. Use a narrow `<td>` for left-border stripe effect instead.

## Nick client

- **Email**: nick@spartasolar.com | **Password**: `DropClix2026!` *(temp)*
- **Auth user ID**: `893475d0-f0ba-4570-a1f6-5110cd2c9e18`
- **Client ID**: `913f1794-1506-4449-b56c-b683809cefc3`
- **Test client**: `test@client.com` (role=client) linked to Nick's client_id
- **YouTube data**: 53 videos (`#yt0001`–`#yt0039` Shorts, `#LF0001`–`#LF0014` Long-form). Re-import: `node scripts/ingest-yt-csv.mjs <csv> --run`.

## Deployment

- **Production URL**: https://dropclix-app.vercel.app
- **Custom domain**: https://portal.drop-clix.com
- **Vercel project**: https://vercel.com/dropclix/dropclix-app
- **GitHub auto-deploy**: NOT connected. After every `git push`, also run `npx vercel --prod` to deploy.

## DNS (Cloudflare for portal.drop-clix.com)

A record: `portal` → `76.76.21.21`, Proxy **OFF**. Or CNAME → `cname.vercel-dns.com`.

## Design tokens

- **Gold**: `#c9a96e` | **Background**: `#0a0a0a` | **Card bg**: `#0a0a0a` | **Grid lines**: `rgba(255,255,255,.04)` | **Tick**: `#333`
- **Tier**: Elite `#39ff88`, Strong `#4cc9ff`, Avg `#fbbf24`, Kill `#ff3b5f`
- **Platforms**: IG gold `#c9a96e`, YT blue `#4cc9ff`, TT purple `#2dd4bf`, Meta `#1778f2`
- **Status badges**: SCRIPTED=gold, PLANNED=blue, FILMING=amber, REVIEWING=red, POSTED=green, CANCELLED=grey
- **Tooltip**: bg `#0d0d0d`, border `#1e1e1e`
- **KPI cards**: `28px 24px 22px` padding; value `clamp(26px, 4vw, 42px)` font size
- **Table rows**: `py-4 px-4` (pipeline) / `py-4 px-5` (analytics/ads/angles/goals)
- **Filter tabs**: `px-4 py-2.5 gap-2`; pillar chips: `px-3 py-2`
- **Section gaps**: KPI grid `mb-8`; filter row `mb-6`; KPI-to-table `mb-8`
- **Edit panels**: `28px 32px` padding

## File structure (src/)

```
src/
  app/
    (auth)/login/page.tsx
    auth/reset-password/page.tsx   ← PASSWORD_RECOVERY event → updateUser
    (dashboard)/
      layout.tsx                 ← auth guard, ClientConfigProvider, SidebarShell
      page.tsx                   ← dashboard (DashboardClient)
      analytics/page.tsx
      angles/page.tsx
      pipeline/page.tsx + actions.ts
      ads/page.tsx
      calendar/page.tsx
      goals/page.tsx
      report-card/page.tsx
      studio/page.tsx
      edit-actions.ts            ← centralized CRUD server actions (all tabs)
    admin/
      page.tsx                   ← client list (raw fetch for clients query)
      actions.ts                 ← impersonateClient, exitImpersonation, createNewClient, etc.
    api/
      ai-suggestions/route.ts    ← Claude API suggestions
      auth/youtube/route.ts + callback/route.ts
      admin/sync-youtube/route.ts
    globals.css
    layout.tsx
  components/portal/
    SidebarShell.tsx             ← collapsible sidebar + all nav rendering
    FilterBar.tsx                ← PlatformPills, ScopeDropdown, FilterBar
    Paginator.tsx
    EmptyState.tsx
    AnalyticsClient.tsx / PipelineClient.tsx / AdsClient.tsx
    CalendarClient.tsx / GoalsClient.tsx / ReportCardClient.tsx
    StudioClient.tsx / AnglesClient.tsx
    PortalNav.tsx                ← UNUSED
  hooks/
    usePortalFilters.ts          ← URL-synced filters + filterByPlatform/filterByScope
  lib/supabase/
    client.ts / server.ts / admin.ts / portal.ts
  lib/
    decision.ts                  ← erToDecision(), computeDecision()
    client-config-context.tsx    ← ClientConfigProvider, useClientConfig()
    youtube-auth.ts
  proxy.ts
```

## Formula Reference

### Instagram / TikTok ER%
`(likes + comments + shares + saves) / views × 100`
Decision thresholds: ≥12% = Double Down, 4–11.9% = Iterate, <4% = Kill.

### YouTube ER%
`(likes + comments + shares + subscribers_gained) / views × 100`
`subscribers_gained` maps to `post_analytics.followers`. `saves` is `null` for all YT rows.
Same decision thresholds. Use `ingest-yt-csv.mjs` for all future YouTube imports.

## Next sessions

- **Session 30**: Ads sub-views
  - Audience tab + Monthly Summary tab inside Ads
  - Charts (ROAS trend, spend breakdown), auto-suggestion banner
  - Add Campaign / Add Audience buttons

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
- **Smart window detection**: a window row is only inserted if `views_*` > 0. Blank or zero = skip that window.
- **Any blank column is silently skipped** — you don't need to fill all 36 columns.
- **Source of truth**: `sell_the_situation_24hr_v2.csv` format (Downloads folder)
- **Download Template button** in Studio → Import → CSV Import generates this template client-side.

### ER% and Decision auto-calculation
ER% = `(likes + comments + shares + saves) / views × 100` per window. Decision picked from best window (eom→w7→w3→w24). Thresholds: ≥12% = Double Down, 4–11.9% = Iterate, <4% = Kill.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/migrate-nick.mjs` | Initial data seed for Nick/Sparta Solar. `--run` to insert, `--force` to wipe+re-insert. |
| `scripts/backfill-eom.mjs` | Fill missing eom rows for pre-May posts (w7→w3→w24 fallback). `--run` to apply. |
| `scripts/rename-post-ids.mjs` | Rename post_id labels to `#igNNNN` sequential format. Idempotent, `--run` to apply. |
| `scripts/ingest-eom-csv.mjs` | **Generic EOM ingest.** `node scripts/ingest-eom-csv.mjs <csv> [--run]`. Upserts eom+w7, inserts missing post stubs, auto-syncs pipeline+calendar. Use for all future monthly imports. |
| `scripts/sync-pipeline-calendar.mjs` | **Pipeline+calendar backfill.** `[#igXXXX ...] [--run]`. Creates missing pipeline_items + calendar_events. Idempotent. |
| `scripts/ingest-yt-csv.mjs` | **YouTube video ingest.** `node scripts/ingest-yt-csv.mjs <csv> [--run]`. Maps YT tracker CSV → posts + post_analytics. Auto-computes YT ER% decision. |
| `scripts/setup-admin.mjs` | **Admin bootstrap.** Sets `app_metadata.role='admin'` + upserts users row. Idempotent, `--run`. Run once per environment. |
| `scripts/seed-new-client.mjs` | Seeds 9 default goals + welcome pipeline item. `<client_id> [--run]`. Use when client created manually. |
| `scripts/sync-youtube.mjs` | CLI YouTube Analytics sync. Reads tokens from `platform_connections`, calls YT Analytics API, upserts `post_analytics`. Window selection is age-based (eom always; w7 ≤6d; w3 ≤3d; w24 ≤2d). eom end date = today. `[--run] [--force]`. Impressions/CTR via secondary `dimensions=video` call. Token must match the video owner's channel (403 = wrong channel). |
| `scripts/fix-week-format.mjs` | Normalise `pipeline_items.week` to MonWk# format (ALL clients). Unrecognisable values → `MayWk2`. `[--run]` to apply. |
| `scripts/fix-nick-data.mjs` | **CLIENT: Nick** data cleanup — week formats, SL### IDs → #ig0118–#ig0122, enabled_platforms. Already applied. Idempotent. |
| `scripts/diagnose-nick.mjs` | Diagnostic: prints Nick's enabled_platforms, post platform distribution, pipeline platform distribution. |
