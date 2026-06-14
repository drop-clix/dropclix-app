@AGENTS.md

# Drop CLIX — App

Next.js 16.2.6 + Supabase SSR + Tailwind 4. Source under `src/`. Path alias `@/*` → `src/*`.

## Session Scope

**GLOBAL** — any code/UI/feature/backend change; affects ALL clients.
**CLIENT: [Name]** — data-only; zero code changes (.tsx/.ts/.js/.css forbidden).

Rules:
- First line of every prompt: `SCOPE: GLOBAL` or `SCOPE: CLIENT: Nick`
- GLOBAL: verify Nick's existing data unaffected
- Default to GLOBAL if unsure; UI/logic bug = GLOBAL, one client's data bug = CLIENT

## Sessions (completed)

- S1–3: Scaffold + SSR auth + gold/black login/dashboard; auth via `src/proxy.ts`; Tailwind 4 `@theme` in globals.css
- S4: Analytics tab — sortable table, ER%, tier + decision badges, KPI strip
- S5: Pipeline tab — phase cards, status dropdown, `admin.ts` RLS bypass
- S6: Ads tab — KPI cards, campaign table; `effectiveRevenue = roas * spend`; end dates inferred from next campaign start
- S6.5: Calendar tab — 42-cell grid, agenda, JSON notes; `pipeline_item_id` null, join via `notes.post_id`
- S6.6: Angles tab — ER by pillar/hook/format, Top/Bottom 5
- S6.7: Goals tab — 9 seeded goals, pace projection
- S7: Report Card + Studio tabs
- S8: Nick data migration — 43 posts, 176 analytics, 93 pipeline, 6 campaigns, 48 calendar events
- S9: Admin impersonation — `getPortalContext()`, cookie `dropclix_impersonate_client_id` (8h httpOnly)
- S9b: Created nick@spartasolar.com (pw: `DropClix2026!`)
- S10: Vercel deploy + `portal.drop-clix.com`; DNS: Cloudflare A `portal → 76.76.21.21`, proxy OFF
- S11: Inline editing — `edit-actions.ts` CRUD, 2s debounce, SaveDot; `useRef<T | undefined>(undefined)` for React 19
- S12: HTML portal audit (50 gaps); HTML `reach` = DB `views`
- S13: Design system spacing — KPI `28px 24px 22px`, rows `py-4`, gaps `mb-8`
- S14: Recharts (`recharts@3.8.1`) + collapsible sidebar `SidebarShell.tsx` (56px/220px); `PortalNav.tsx` unused
- S14b: Forgot password + `auth/reset-password/page.tsx`; proxy passes `/auth/` unauthenticated
- S14c: eom backfill audit — 0 rows needed; `backfill-eom.mjs` written
- S14d: Post IDs renamed `#ig0001`–`#ig0043` date-ASC
- S14e/f: HTML vs Supabase audit (0 diffs); inserted `#ig0044` "Everyone can sell"
- S15a: May 2026 posts `#ig0045`–`#ig0052` + EOM ingest; `skip_rate numeric` added (`add_skip_rate.sql`)
- S15b: Pipeline + calendar auto-sync on ingest; `sync-pipeline-calendar.mjs` added
- S16: Bidirectional pipeline↔calendar sync, posted datetime picker, draggable calendar; `pipeline_items.posted_at` (`add_posted_at.sql`)
- S17: Studio importer (`createPost()` + `importPostsBatch()`), ER% formula audit, smart popup, welcome overlay
- S18-pre: Decision auto-calc — `src/lib/decision.ts` (`erToDecision`,`computeDecision`); never hardcode 'Iterate'
- S19: YouTube import — 53 videos (`#yt0001`–`#yt0039` Shorts, `#LF0001`–`#LF0014` LF); `yt_type` in pipeline_items
- S20: `usePortalFilters` hook + URL-synced filters (`platform`,`win`,`scope`,`from`,`to`), `FilterBar`, `Paginator.tsx`
- S21: FilterBar redesign (no ALL pill, no custom range), Dashboard→DashboardClient, Goals→GoalsDashboard, Studio stats bar
- S22: Dashboard rewrite — toggle KPI cards, 30-day projections, AI suggestions, 7-day calendar+pipeline snapshots; `formatDisplayId()` fix
- S23: YouTube OAuth, `platform_connections` table, `/api/admin/sync-youtube`, `YTLinkModal`, Admin YT section, Studio YT status bar
- S24: Client onboarding — `AdminClientsSection`, goals UPDATE RLS, `monthly_retainer` col, `seed-new-client.mjs`
- S25: Multi-client — `enabled_platforms`/`enabled_tabs`, `ClientConfigProvider`, `EmptyState.tsx`, `AdminImportModal`, `OnboardingBanner`
- Bug (post-S25): Admin "No clients" — wrong `SUPABASE_SECRET_KEY` (must be `sb_secret_*`); admin role via JWT claim; `createAdminClient()` for all admin queries
- S26: `createAdminClient()` rebuilt (`persistSession:false, autoRefreshToken:false`); premium clients card UI; `session_26_rls_fix.sql`
- S27: Pipeline Add Video modal (pipe-separated IDs); AI command bar (`/api/ai-command`, voice-to-text); legibility pass; `fix-week-format.mjs`
- S28 GLOBAL: `enabled_platforms` default fixed to `['ig','tt','yt','lf']` in `layout.tsx`
- S28 CLIENT Nick: `fix-nick-data.mjs` — 154 week fixes, SL001–SL005 → #ig0118–#ig0122, platforms updated; `fix-week-format.mjs` uses readFileSync
- Bug (post-S29): YT sync "Unauthorized" — route uses session cookie auth; fixed refresh_token wipe on reconnect; `connected_at`→`created_at`
- Bug (post-S29, r2): YT sync 0 windows — upsert missing `client_id`/`platform`; wrong onConflict key; `posts.yt_id` added (`add_posts_yt_id.sql`); no `dimensions:''`
- Bug (post-S29, r3): YT sync 0 synced — `windowsForPost()` age-based; eom end=today; skip only if `!m`; always upsert. 403 = YT Analytics API not enabled in GCP `338389725982`
- S29: Toast system, PostSlideOver, Cmd+K, sticky thead, pillar color stripes, pipeline phase card gold border, hover preview popover (800ms), 6-week calendar mini-map, "This Week" strip
- S29b: Bulk Pipeline Import modal + ⇪ Bulk Import button
- S30: Pipeline text glow, platform pill stat accuracy (`platFiltered` feeds counts+rows), calendar pillar colors+slide-over, MarkAsPostedModal (`add_video_url.sql`), Ads Recharts charts, Dashboard ad KPI strip, Jarvis AI orb (R3F + GLSL); packages: `@react-three/fiber`,`@react-three/drei`,`@react-three/postprocessing`,`three`,`maath`
- S31: Pipeline priority auto-update, mass delete (`DeleteConfirmModal`), calendar analytics snapshot (animated BarChart), Jarvis orb Tier 3 GLSL
- S32: Pipeline ID display filter, priority auto-derive (`STATUS_PRIORITY`+`backfill-priorities.mjs`), calendar `SlideOverPanel`, `AISuggestionsModal.tsx`, Instagram OAuth, TikTok OAuth, `PlatformLinkModal`
- S33: Body text-glow removed from globals.css; full 10-card pipeline set (`PHASE_CARD_COLORS`); link column visibility (`showIG/showTT/showYT`); `PLAT_CFG.tt` fixed to `#2dd4bf`
- S34: Contrast/legibility polish — all `#333`/`#252525`/`#2a2a2a`/`#2e2e2e` text → `≥#555`; custom scrollbar (5px), `::selection` gold, `:focus-visible` gold ring, `color-scheme:dark`, `prefers-reduced-motion`, `button { cursor:pointer }`
- S35: Approval workflow — `drive_file_id` + `approval_comment` cols on `pipeline_items`; `client_notes` table (one row per client); `agency_docs` table; all RLS enabled. Migration: `supabase/migrations/session_35_approval_workflow.sql` (must be applied manually to prod via SQL editor).
- S36: TikTok OAuth callback raw-text logging + flat/nested token shape handling; TikTok Disconnect button on admin panel (`disconnectTikTok` server action in `admin/actions.ts`); Pipeline empty-platform fix — shows "No items for X" + "Show all platforms" button when `platFiltered.length === 0` but `items.length > 0`
- Bug (post-S36): Pipeline empty ALL clients + TikTok Reconnect instant redirect. Root causes: (1) `pipeline/page.tsx` SELECT includes `drive_file_id`/`approval_comment` — missing columns → Supabase error → `data=null` → empty for everyone; fixed by applying session_35_approval_workflow.sql to prod. (2) `force_reauth=1` + `prompt=consent` are not valid TikTok v2 OAuth params — TikTok rejected and returned `access_denied`; fixed by removing both params from `/api/auth/tiktok/route.ts`.

## Key decisions / gotchas

- **PLAT_CFG.tt color**: `#2dd4bf` (teal) NOT `#a78bfa` (purple). `#a78bfa` = `STATUS_CFG.EDITING` only.
- **Pipeline phase cards**: 10-card set: Active, Scripted, Planned, Filming, Editing, Reviewing, Scheduled, Posted, Cancelled, All. `PHASE_CARD_COLORS` per-status. `overflow-x:auto` + `minWidth:600`. Grid: `repeat(10, 1fr)`.
- **Pipeline link columns**: `showIG/showTT/showYT` from `usePortalFilters()`. `colCount = 10 + showIG + showTT + showYT`. `lf` → `showYT = true`.
- **Body text-shadow**: REMOVED from `globals.css`. Inline `textShadow` on specific elements only (hero titles, gold text, phase card counts). Never re-add global body text-shadow.
- **Contrast floor**: bg `#060606`. Min readable: `#555` labels/secondary, `#666` inactive toggles, `#3a3a3a` no-data. Never use `#333`/`#252525`/`#2a2a2a` for text (WCAG fail ~1.6:1). Borders: `#1e1e1e`/`#1a1a1a` OK.
- **AISuggestionsModal**: `src/components/portal/AISuggestionsModal.tsx`. Props: `isOpen, onClose, title, subtitle, suggestions, loading`. Animation: `@keyframes aiModalIn` in globals.css. Used by DashboardClient + AdsClient.
- **AI suggestions ads mode**: `/api/ai-suggestions` accepts `{ mode: 'ads', campaigns: ContextCampaign[], posts: [], platform: 'all' }`. Returns 4 recommendations.
- **Instagram OAuth**: env `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`. Route: `/api/auth/instagram`. Stores `platform='instagram'` in `platform_connections`.
- **TikTok OAuth**: env `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`. Route: `/api/auth/tiktok`. Redirect URI must be `https://portal.drop-clix.com/api/auth/tiktok/callback`. Valid params only: `client_key`, `redirect_uri`, `scope`, `response_type`, `state`. Do NOT add `force_reauth`, `prompt`, or any non-standard params — TikTok v2 rejects them with `access_denied`.
- **TikTok disconnect**: `disconnectTikTok(clientId)` server action in `admin/actions.ts`. Deletes `platform_connections` row where `client_id` + `platform='tiktok'`. Disconnect button shown next to Reconnect in `AdminTikTokSection.tsx`.
- **pipeline_items columns**: `drive_file_id text`, `approval_comment text` added in session_35_approval_workflow.sql. Pipeline page SELECT includes these — if missing, Supabase returns error, `data=null`, all clients see empty pipeline. Always apply migration before deploying code that queries these cols.
- **client_notes table**: one row per client (`client_id` unique). `agency_docs` table: global. Both have RLS enabled. Created in session_35_approval_workflow.sql.
- **Pipeline platform link buttons**: `isPlatLinked(videoUrl, 'ig'|'tt')`. `PlatformLinkModal` saves to `video_url`. `PipelineItem.videoUrl` added.
- **Pipeline row stripe**: first `<td>` = `PLAT_CFG[item.platform[0]].color`. `colSpan` = 13.
- **Next.js 16 proxy**: `middleware.ts` deprecated. Use `src/proxy.ts` with `export function proxy()`.
- **`/auth/` routes**: always pass unauthenticated — recovery token is in URL hash (client-only).
- **cookies() is async**: `const cookieStore = await cookies()` in server components.
- **Env vars**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY), `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY, prefix `sb_secret_*`).
- **Role check**: proxy AND page/layout. Login: admin → `/admin`, client → `/`. Layout redirects admin to `/admin`; `/` is client-only.
- **No `app/page.tsx`**: `app/(dashboard)/page.tsx` owns `/` via route group.
- **getPortalContext()**: import from `@/lib/supabase/portal`. Use in ALL dashboard pages — never separate `createClient()` + profile fetch.
- **Admin impersonation**: cookie `dropclix_impersonate_client_id`, 8h httpOnly. Only cleared via "Exit Portal".
- **Dashboard queries**: `metric_window = 'eom'` for totals. Pipeline active = not POSTED/CANCELLED.
- **Analytics data join**: `posts.select('..., post_analytics(...)')` — nested array keyed by `metric_window`.
- **ER formula (IG/TT)**: `(likes + comments + shares + saves) / views × 100`. Thresholds: ≥12% Double Down, 4–11.9% Iterate, <4% Kill.
- **ER formula (YT)**: `(likes + comments + shares + subscribers_gained) / views × 100`. `subscribers_gained` → `post_analytics.followers`; `saves` null for YT. Same thresholds.
- **YT post IDs**: `#yt0001`–`#yt0039` (Shorts), `#LF0001`–`#LF0014` (LF). `pipeline_items.yt_type` = Short/Long-form. `post_analytics.yt_id` = YouTube Video ID.
- **Decision auto-calc**: `src/lib/decision.ts`. ≥12% Double Down, 4–11.9% Iterate, <4% Kill. Never hardcode 'Iterate' — null if no data.
- **State naming**: `win` not `window` (avoids browser global).
- **Global filters**: URL params `platform`,`win`,`scope`,`from`,`to`. No DB query on filter change.
- **EditableCell**: pass `post.platform[0] ?? 'ig'` not filter platform (filter may be 'all', invalid for DB writes).
- **LF filter**: analytics query must select `format`; `filterByPlatform` needs `getFormat` callback.
- **Angles**: `angles/page.tsx` is minimal server fetch; all computation in `AnglesClient.tsx` (client component).
- **Default platform**: `'ig'` in `usePortalFilters`. All tabs open with IG.
- **FilterBar exports**: `PlatformPills` + `ScopeDropdown` exported separately for DashboardClient, PipelineClient, GoalsDashboard.
- **filterByPlatform**: 2-3 args: `(items, platform, getFormat?)`. Item must extend `{ platform: string[] }`.
- **Pipeline phase URL param**: `?phase=STATUS`. Studio tiles → `/pipeline?phase=SCRIPTED`.
- **Goals page**: `GoalsDashboard` in GoalsClient.tsx. Types `RawGoalPost`+`RawGoal` from `goals/page.tsx`. WeekGrade/MonthGrade from `report-card/page.tsx`.
- **Supabase untyped rows**: cast `as unknown as RawRow[]`.
- **Pipeline RLS**: clients SELECT only. Updates via `edit-actions.ts` + `admin.ts`.
- **admin.ts**: server actions/components ONLY. Never in `'use client'`.
- **Ads revenue**: `effectiveRevenue = roas * spend`. End dates = day before next campaign start.
- **Goals actuals**: eom window per post by month. Falls back to most recent data month.
- **Pace status**: `(actual / daysElapsed) * daysInMonth` → ≥110% Ahead, ≥80% On Track, <80% Behind.
- **Calendar notes**: JSON string. `try { JSON.parse(notes) } catch {}`.
- **Calendar pipeline link**: `pipeline_item_id` null. Join via `notes.post_id` → `pipeline_items.post_id`.
- **Calendar grid**: 42-cell (6×7). Leading/trailing cells from adjacent months.
- **React Fragment key**: `<Fragment key={id}>` (imported), not `<>`.
- **Recharts v3 types**: `<Tooltip content={(props: any) => ...}>`. Payload: `readonly any[]`. Formatter: `(v: unknown, n: unknown)` → cast `Number(v)` inside.
- **Studio importer**: `studio/actions.ts` is `'use server'`. `createPost()` revalidates 8 paths. `post_analytics.post_id` = UUID FK — use `posts.id` (not text `post_id`).
- **Welcome overlay**: `sessionStorage` keyed `dropclix_welcomed_${clientName}`. In dashboard layout, not SidebarShell.
- **Smart popup trigger**: intercepts POSTED/SCRIPTED only when both `scheduledDate` AND `postedAt` are null.
- **Tailwind 4 theme**: colors in `globals.css` `@theme {}`, not `tailwind.config.js`.
- **Port**: check `.next/dev/logs/next-development.log` for actual port.
- **Pipeline ID display**: `formatDisplayId(postId, platform[])` — never render `item.postId` raw (45 legacy `#0XXX`).
- **Pipeline phase counts**: `platFiltered` memo → both `counts` AND `rows`. Never compute counts from raw `items`.
- **Pipeline platform empty state**: when `platFiltered.length === 0` but `initialItems.length > 0`, render an inline empty state (not `EmptyState` component) with "No items for [PLATFORM]" + "Show all platforms" button that calls `setFilters({ platform: 'all' })`. Prevents blank table when client has no IG content but default filter is 'ig'.
- **video_url**: migration `add_video_url.sql`. Whitelist in `VALID_PIPE` in `edit-actions.ts`. Parsed via `parseVideoUrl()`.
- **R3F/Three.js**: `AICommandBar` is `'use client'`; no `ssr:false` needed. Packages: `@react-three/fiber`,`@react-three/drei`,`@react-three/postprocessing`,`three`,`maath`.
- **Pipeline priority**: `STATUS_PRIORITY` in PipelineClient.tsx (REVIEWING→1, FILMING→2, SCRIPTED→3, PLANNED→4, EDITING/SCHEDULED→5, POSTED/CANCELLED→6). Always save `priority`+`status` together.
- **Pipeline mass delete**: `bulkDeletePipelineItems` in `edit-actions.ts`. `.in('id', itemIds)` + `.eq('client_id', cid)`. `selectedIds: Set<string>`. IDs never renumbered.
- **Calendar analytics snapshot**: `getPostAnalyticsSnapshot(postTextId)` in `edit-actions.ts`. `showChart` delays Recharts 200ms. `isAnimationActive` default true.
- **Jarvis orb GLSL**: `VERTEX_SHADER` uses `IcosahedronGeometry(0.72, 20)` + simplex noise. `FRAGMENT_SHADER` rim lighting + gold/cream. Uniforms: `u_time`,`u_intensity`,`u_errorState`. Glow shell: `IcosahedronGeometry(0.72,4)` + `THREE.BackSide+THREE.AdditiveBlending`. `OrbState` = idle/active/thinking/error. `ChromaticAberration` scales with state. `orbError` clears after 1.8s.
- **CalendarEvent.pillar**: joined from `pipeline_items.pillar` via `post_id` in calendar/page.tsx. EventPill left border = pillar color (fallback: platform color).
- **Dashboard types**: `RawDashPost`,`RawDashPipeline`,`RawDashCalendar`,`RawDashGoal` exported from `DashboardClient.tsx`. `RawDashCampaign` also exported.
- **AI Suggestions API**: `/api/ai-suggestions` (NOT `/api/suggestions`). Body: `{ posts, platform, mode, projectionMetric?, goalsSummary? }`. Needs `ANTHROPIC_API_KEY`.
- **Admin clients fetch**: `createAdminClient()` (service role, `persistSession:false, autoRefreshToken:false`) for ALL admin queries. `get_my_role() = NULL in SQL Editor` is expected.
- **ClientConfigProvider**: `src/lib/client-config-context.tsx`. `useClientConfig()` → `{ enabledPlatforms, enabledTabs, isAdmin }`.
- **enabled_platforms default**: `['ig','tt','yt','lf']` when null. Set explicitly to restrict a client.
- **OnboardingBanner**: never shows to admin. Shows when `postCount < 5`.
- **AdminImportModal CSV**: locked 36-column format. `buildPostFromRow` maps `hook` (not `hookType`), `watch_pct` (not `watchPct`), `cta: ''`.
- **Pipeline post_id multi-platform**: pipe-separated `#ig0053 | #tt0048`. `formatDisplayId()` detects `|` first. IDs computed server-side in `pipeline/page.tsx`.
- **AI command bar**: `position:fixed; bottom:28px; right:28px`. In dashboard layout. `/api/ai-command`. Returns `{type:'text'|'action'}`. Actions: `add_pipeline`,`update_analytics`,`bulk_update_status`. `SpeechRecognition`: `window.SpeechRecognition ?? window.webkitSpeechRecognition`.
- **sync-youtube route auth**: session cookie (admin role check), NOT `SUPABASE_SECRET_KEY` bearer. No Authorization header from client.
- **post_analytics upsert**: always include `client_id`,`platform`; `onConflict: 'post_id,platform,metric_window'`. Missing any = silent failure.
- **posts.yt_id**: YouTube video ID on `posts` row. Migration: `add_posts_yt_id.sql`. Both sync scripts and YT CSV importer write this column.
- **YT Analytics API**: no `dimensions:''`. Metrics order: views[0], likes[1], comments[2], shares[3], estimatedMinutesWatched[4], averageViewPercentage[5], subscribersGained[6].
- **Week format**: MonWk# (e.g. JunWk1). Fix: `node scripts/fix-week-format.mjs [--run]`.
- **Toast system**: `ToastProvider` in dashboard layout. `useToast()` → `toast(msg, variant)`. Variants: success(gold)/error(red)/info(grey). 3s auto-dismiss.
- **PostSlideOver**: `SlideOverPost` shape with w24/w3/w7/eom windows. Used in Analytics, Angles. `e.stopPropagation()` on inner `<td>` clicks.
- **Pillar color stripe**: `usePillarColors(pillars)` → `Map<string,string>`. Use `${color}cc` (80% alpha). Stripe td: `width:3, padding:0` — first column.
- **Sticky thead**: every `<th>` needs `background:'#060606'`. `<thead>`: `position:'sticky', top:0, zIndex:10`.
- **border-collapse + stripes**: `borderLeft` on `<tr>` doesn't render with `borderCollapse:'collapse'`. Use narrow `<td>` instead.

## Nick client

- Email: nick@spartasolar.com | Password: `DropClix2026!` *(temp)*
- Auth user ID: `893475d0-f0ba-4570-a1f6-5110cd2c9e18`
- Client ID: `913f1794-1506-4449-b56c-b683809cefc3`
- Test client: test@client.com (role=client) linked to Nick's client_id
- YouTube: 53 videos (`#yt0001`–`#yt0039` Shorts, `#LF0001`–`#LF0014` LF). Re-import: `node scripts/ingest-yt-csv.mjs <csv> --run`

## Deployment

- Production: https://dropclix-app.vercel.app
- Custom domain: https://portal.drop-clix.com
- Vercel project: https://vercel.com/dropclix/dropclix-app
- GitHub auto-deploy: NOT connected. After `git push`, also run `npx vercel --prod`.
- DNS: Cloudflare A `portal → 76.76.21.21`, Proxy OFF. Or CNAME → `cname.vercel-dns.com`.

## Design tokens

- Gold: `#c9a96e` | Bg: `#0a0a0a` | Grid lines: `rgba(255,255,255,.04)` | Tick: `#333`
- Tier: Elite `#39ff88`, Strong `#4cc9ff`, Avg `#fbbf24`, Kill `#ff3b5f`
- Platforms: IG `#c9a96e`, YT `#4cc9ff`, TT `#2dd4bf`, Meta `#1778f2`
- Status: SCRIPTED=gold, PLANNED=blue, FILMING=amber, REVIEWING=red, POSTED=green, CANCELLED=grey
- Tooltip: bg `#0d0d0d`, border `#1e1e1e`
- KPI cards: `28px 24px 22px` padding; value `clamp(26px, 4vw, 42px)`
- Table rows: `py-4 px-4` (pipeline) / `py-4 px-5` (analytics/ads/angles/goals)
- Filter tabs: `px-4 py-2.5 gap-2`; pillar chips: `px-3 py-2`
- Section gaps: KPI grid `mb-8`; filter row `mb-6`; KPI-to-table `mb-8`
- Edit panels: `28px 32px` padding

## File structure (src/)

```
src/
  app/
    (auth)/login/page.tsx
    auth/reset-password/page.tsx   ← PASSWORD_RECOVERY → updateUser
    (dashboard)/
      layout.tsx                 ← auth guard, ClientConfigProvider, SidebarShell
      page.tsx                   ← DashboardClient
      analytics/ angles/ pipeline/ ads/ calendar/ goals/ report-card/ studio/
      edit-actions.ts            ← centralized CRUD server actions (all tabs)
    admin/
      page.tsx                   ← client list (raw fetch)
      actions.ts                 ← impersonateClient, exitImpersonation, createNewClient
    api/
      ai-suggestions/route.ts
      auth/youtube/route.ts + callback/route.ts
      admin/sync-youtube/route.ts
    globals.css / layout.tsx
  components/portal/
    SidebarShell.tsx             ← collapsible sidebar + nav
    FilterBar.tsx                ← PlatformPills, ScopeDropdown, FilterBar
    Paginator.tsx / EmptyState.tsx
    AnalyticsClient.tsx / PipelineClient.tsx / AdsClient.tsx
    CalendarClient.tsx / GoalsClient.tsx / ReportCardClient.tsx
    StudioClient.tsx / AnglesClient.tsx
    PortalNav.tsx                ← UNUSED
  hooks/usePortalFilters.ts      ← URL-synced filters + filterByPlatform/filterByScope
  lib/supabase/client.ts / server.ts / admin.ts / portal.ts
  lib/decision.ts                ← erToDecision(), computeDecision()
  lib/client-config-context.tsx  ← ClientConfigProvider, useClientConfig()
  lib/youtube-auth.ts
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

## CSV Import Standard

**This format is locked. Never change column order or names without explicit instruction.**

Template: `scripts/templates/dropclix-import-template.csv`

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
- **decision**: always blank — auto-calculated from ER%
- Window row only inserted if `views_*` > 0. Blank/zero = skip.
- Blank columns silently skipped.
- Source of truth: `sell_the_situation_24hr_v2.csv` format
- Download Template button in Studio → Import → CSV Import generates client-side.

### ER% auto-calculation
ER% = `(likes + comments + shares + saves) / views × 100` per window. Decision from best window (eom→w7→w3→w24). Thresholds: ≥12% Double Down, 4–11.9% Iterate, <4% Kill.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/migrate-nick.mjs` | Nick/Sparta Solar initial seed. `--run` insert, `--force` wipe+re-insert. |
| `scripts/backfill-eom.mjs` | Fill missing eom rows (w7→w3→w24 fallback). `--run`. |
| `scripts/rename-post-ids.mjs` | Rename to `#igNNNN` sequential. Idempotent, `--run`. |
| `scripts/ingest-eom-csv.mjs` | Generic EOM ingest. `node ... <csv> [--run]`. Upserts eom+w7, stubs missing posts, syncs pipeline+calendar. |
| `scripts/sync-pipeline-calendar.mjs` | Pipeline+calendar backfill. `[#igXXXX ...] [--run]`. Idempotent. |
| `scripts/ingest-yt-csv.mjs` | YouTube video ingest. `node ... <csv> [--run]`. YT ER% decision auto-computed. Writes `yt_id` to posts. |
| `scripts/setup-admin.mjs` | Sets `app_metadata.role='admin'` + upserts users row. `--run`. Once per env. |
| `scripts/seed-new-client.mjs` | 9 default goals + welcome pipeline item (`#new0001`). `<client_id> [--run]`. |
| `scripts/sync-youtube.mjs` | CLI YT Analytics sync. Age-based windows (eom always; w7 ≤6d; w3 ≤3d; w24 ≤2d). eom end=today. `[--run] [--force]`. 403 = wrong channel or YT Analytics API not enabled (GCP `338389725982`). |
| `scripts/fix-week-format.mjs` | Normalise `pipeline_items.week` to MonWk# (ALL clients). Unrecognisable → `MayWk2`. `[--run]`. |
| `scripts/fix-nick-data.mjs` | CLIENT:Nick cleanup — week fixes, ID renames, platforms. Already applied. Idempotent. |
| `scripts/diagnose-nick.mjs` | Prints Nick's enabled_platforms + post/pipeline platform distribution. |
| `scripts/backfill-priorities.mjs` | Backfill pipeline priorities from STATUS_PRIORITY map. |
