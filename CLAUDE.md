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
- **ER formula**: `(likes + comments + shares + saves) / views × 100`.
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
- **Collapsible sidebar**: `SidebarShell.tsx` owns all nav rendering. `PortalNav.tsx` is unused.
- **Tailwind 4 theme**: Colors in `globals.css` `@theme {}` block, not `tailwind.config.js`.
- **Port**: Dev server falls back; check `.next/dev/logs/next-development.log` for actual port.

## Nick client

- **Email**: nick@spartasolar.com | **Password**: `DropClix2026!` *(temp — change after first login)*
- **Auth user ID**: `893475d0-f0ba-4570-a1f6-5110cd2c9e18`
- **Client ID**: `913f1794-1506-4449-b56c-b683809cefc3`
- **Test client**: `test@client.com` (role=client) linked to Nick's client_id
- **Re-run migration**: `node scripts/migrate-nick.mjs --force`

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

### Session 14b ✅ — Forgot password + reset-password page
Login page toggles between `'login'` and `'reset'` modes. Reset mode: email field + "Send Reset Link" button; calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth/reset-password' })`. Success state shows "Check your email for a reset link."

`src/app/auth/reset-password/page.tsx` — handles the recovery token from the URL hash. States: `loading → ready → submitting → success` (or `invalid` if no `type=recovery` in hash / token expires). Listens to `supabase.auth.onAuthStateChange` for `PASSWORD_RECOVERY` event; 8-second timeout fallback shows invalid state. On submit validates match + min 8 chars, calls `supabase.auth.updateUser({ password })`, shows "Password updated — signing you in" and redirects to `/` after 2.5s.

`src/proxy.ts` updated: `/auth/` prefix is always let through unauthenticated (recovery token is in the hash — server can't see it, so the proxy must not redirect).

## Next sessions
- Session 15: Update Modal + Studio video-logging form
- Session 16: Ads sub-views (Audience tab, Monthly Summary, charts, auto-suggestion banner, Add buttons)
