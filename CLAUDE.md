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
    AnalyticsClient.tsx
    PipelineClient.tsx
    AdsClient.tsx
    CalendarClient.tsx
    GoalsClient.tsx
    ReportCardClient.tsx
    StudioClient.tsx
    PortalNav.tsx                ← UNUSED (replaced by SidebarShell)
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

## Next sessions
- Session 20: Update Modal (cross-window edit overlay for Analytics/Angles/Report Card rows)
- Session 21: Ads sub-views (Audience tab, Monthly Summary, charts, auto-suggestion banner, Add Campaign/Audience buttons)
- Session 22: Goals enhancements — Elite Videos + Watch% Avg targets; weekly actuals from last 7 days

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
