@AGENTS.md

# Drop CLIX — App

Next.js 16.2.6 + Supabase SSR + Tailwind 4. Source under `src/`. Path alias `@/*` → `src/*`.

## Security Rules — NEVER violate these

- **`pipeline_items.title` is the ONLY display title source.** No API sync (YouTube, Instagram, TikTok) may ever write to `pipeline_items.title`. `posts.title` stores raw API metadata and must never be used as a display title in the portal UI. When syncing/polling, always split metadata updates: `pipeline_items` gets only `thumbnail_url`; `posts` may receive `title` + `thumbnail_url`.
- **Never hardcode API keys, secrets, or credentials** in any committed file (.ts, .tsx, .md, .sql, .mjs, etc.). Use `process.env.VAR_NAME` only.
- **Never commit env files**: `.env`, `.env.local`, `.env*.local`, `.env.prod.local` are in `.gitignore` — keep them there. `vercel env pull` overwrites `.env.local` with encrypted empty strings; real secrets are not recoverable via pull.
- **Never put secrets in NEXT_PUBLIC_ variables** — they are inlined into client bundles and visible to anyone.
- **Never paste key values into CLAUDE.md or any tracked file** — describe the key by its Vercel env var name only (e.g., `YOUTUBE_API_KEY`).
- If a key is ever accidentally committed: rotate it immediately in the provider console, remove the value from the file, rewrite git history (`git commit --amend` + `git push --force-with-lease`), and update Vercel env with the new key.
- **DESTRUCTIVE SQL RULE**: Before writing any DELETE or UPDATE targeting client data, always: (1) Run SELECT with identical WHERE clause first. (2) Confirm row count matches expectation. (3) Verify no legitimate client data is included. (4) Never filter on `post_id` alone — always include `client_id`. A cross-client contamination incident (see `/fires/`) was caused by missing `client_id` scoping on inserts and deletes.
- **Platform identity UI rule**: Any UI that visually identifies Instagram, TikTok, YouTube, or Meta must use the actual brand logo/SVG mark, never text initials like `IG`, `TT`, `YT`, `IN`, `TI`, or `YO` as a logo placeholder. Text labels are fine next to the logo.

## FIRES — ACTIVE INCIDENTS
See `/fires/` folder for full incident reports.
- 2026-06-15: **Client data contamination** — RESOLVED (S46) → `fires/2026-06-15-client-data-contamination.md`
- 2026-06-15: **Pipeline title overwrite** — RESOLVED (S45) → `fires/2026-06-15-pipeline-title-overwrite.md`

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
- S37 Build 1: Multi-platform URL input on Mark as Posted modal — platform logo toggle buttons (IG/TT/YT SVG) per-platform on pipeline item; active=full opacity+glow ring, inactive=30% opacity; per-platform URL inputs with ID extraction; saves `ig_video_id`/`tt_video_id`/`yt_video_id` to `pipeline_items`. Migration: `session_37_video_ids.sql`.
- S37 Build 2: Smart polling + live stats — 3 cron routes (`/api/cron/poll-fresh|recent|archive`); `src/lib/video-polling.ts` (YT Data API v3 polling, snapshot scheduling, auto-discover uploads); `analytics_snapshots` + `snapshot_jobs` tables; `prev_views`/`prev_recorded_at`/`last_polled_at` on `post_analytics`; `useInterpolatedStat` hook animates view counts between polls; `AnalyticsTableRow` component applies interpolation. Migrations: `session_37_snapshots.sql`. **Cron intervals**: daily on Hobby plan — upgrade to Pro for 2min/10min/6hr intervals (update `vercel.json`).
- S38: 8 fixes — (1) Pipeline link button glow state refresh after URL save: `isPlatLinked` now checks `item.igVideoId`/`item.ttVideoId` in addition to `item.videoUrl`; `handlePlatLinked` updates video ID fields in state; `onPosted` updates `igVideoId`/`ttVideoId`/`ytVideoId` in state; YT button checks `item.ytId || item.ytVideoId`. (2) Pipeline row IG/TT buttons now show actual brand logos (`IGSmall`/`TTSmall` SVG components at 28×28px, opacity 0.25 when unlinked). (3) Auto-fill platform URLs: `PlatformLinkModal` pre-fills IG URL from `igVideoId` (`instagram.com/reel/{id}`); saves `ig_video_id`/`tt_video_id` alongside `video_url`. (4) YT button uses `ytLinked = !!ytId || !!ytVideoId`. (5) Platform persists across tab navigation via `localStorage.setItem('dropclix_platform', ...)` in `usePortalFilters`. (6) Analytics pillar chips replaced with real-time search bar filtering all columns (ID, title, date, pillar, hook, format, decision, views, likes, comments, saves, shares, ER%, watch%). (7) YT link persistence: `linkYouTubeVideo` now accepts optional 3rd arg `pipelineItemId` and always writes `yt_video_id` to `pipeline_items` first (durable path); gracefully returns `note` when no `posts` row exists instead of blocking with "Post not found" error; `YTLinkModal` shows note as info toast and pre-fills from `ytVideoId`; `handleYtLinked` updates both `ytId` + `ytVideoId` in state. (8) Cron auto-discover: `autoDiscoverYTUploads` now includes `pipeline_items.yt_video_id` in `knownYtIds` (not just `post_analytics.yt_id`) and extends fuzzy date match from ±24h to ±72h.
- S39: Polling rewrite — `video-polling.ts` simplified to manual-link-only model. `getPostableItemsInAgeRange` adds `yt_video_id IS NOT NULL` filter; archive tier includes `posted_at IS NULL` items. `pollPipelineItem` signature changed to `(admin, item)` — resolves `posts` UUID internally, skips gracefully (`no_posts_row`) if none found. `autoDiscoverYTUploads` deleted entirely. `resolvePostUUIDs` deleted. Cron routes remove `autoDiscoverYTUploads`/`resolvePostUUIDs` imports; response adds `skipped`+`skip_reasons` fields. Proxy: `/api/` routes now bypass session auth in `proxy.ts` (`if (pathname.startsWith('/api/')) return supabaseResponse`) — cron endpoints no longer redirected to `/login`. `checked=0` is expected until admin links a video via the YT button; once linked, archive cron picks it up.
- S39 addendum: Backfill + import fix — `ingest-yt-csv.mjs` now writes `yt_video_id` to `pipeToInsert` and to `pipeToUpdate` objects. `backfill-yt-video-id.mjs` script copies `posts.yt_id → pipeline_items.yt_video_id` for all clients (dry-run safe, `--run` to apply). Ran backfill: 57 items updated for Nick, 81 for Day 1 / Chase (client `f51bb5e1-9222-44d2-9f0e-795dbe3b6acd`). After backfill, `/api/cron/poll-archive` returns `checked=139` — cron is working. All skip as `yt_api_null` because `YOUTUBE_API_KEY` is not set in Vercel. To fix: GCP project `338389725982` → APIs & Services → Credentials → Create API Key → restrict to YouTube Data API v3 → add as `YOUTUBE_API_KEY` in Vercel env → redeploy.
- S39 `yt_api_null` root cause: `YOUTUBE_API_KEY` was confirmed in Vercel env for `dropclix-app-eu72` but GCP API key had HTTP Referrer restriction (`API_KEY_HTTP_REFERRER_BLOCKED`). Server-side fetch sends no `Referer` header → blocked. Fix: GCP Console → project `338389725982` → APIs & Services → Credentials → find the `YOUTUBE_API_KEY` entry → Application restrictions → change from "HTTP referrers" to **None**. No code change or redeploy needed. **The old key was rotated after being exposed in git — get the new key from GCP and update Vercel env.**
- S39 `no_posts_row` fix: `pollPipelineItem` upgraded to 3-strategy posts lookup via `resolvePostsUUID()`: (1) exact `post_id` match, (2) pipe-split with `.trim()` on each part (for multi-platform items like `#ig0037 | #tt0007 | #yt0087` stored literally in `pipeline_items.post_id`), (3) `yt_id` fallback (`posts.yt_id = yt_video_id`). `ensureYTPostsRow(pipelineItemId)` server action in `edit-actions.ts` — same 3-strategy lookup, auto-creates stub `#ytNNNN` row if nothing found. `MarkAsPostedModal.handleConfirm` calls it when `parsedIds.yt` is set. Migration SQL: `supabase/migrations/fix_missing_posts_rows.sql`. Script: `scripts/fix-missing-posts-rows.mjs`.
- S39 final: Subscriber count Sync Now fix — `sync-youtube` route now calls `fetchChannelInfo(conn.access_token)` after syncing posts and writes the fresh `subscriber_count` to `platform_connections`. Returns `subscriberCount` in JSON response. `AdminYouTubeSection` tracks counts in `subCounts` state (initialized from props), updates on sync — no page reload needed. Security: `YOUTUBE_API_KEY` key in GCP must have Application restrictions = **None** (server fetch has no Referer). `.env.local` overwritten by `vercel env pull` — secrets become empty strings, restore from Supabase dashboard.
- S40: `post_analytics` polling write fixed — `upsertPolledStats()` now logs the resolved `postUUID`/client/platform/window before writing, logs Supabase upsert failures with `message/code/details`, and returns `false` so cron responses show `upsert_failed` instead of incorrectly counting the item as `polled`. Root cause from Vercel logs: cron was writing `decision` into `post_analytics`, but that column does not exist there (decision lives on `posts`). Removed the invalid `decision` field from the polling upsert. Local schema confirms `UNIQUE (post_id, platform, metric_window)` exists.
- S40 Build 2: Live analytics + locked windows — migration `supabase/migrations/session_40_live_analytics.sql` adds `metric_window='live'` support and `thumbnail_url` on `posts` + `pipeline_items`. Cron and Sync Now now write current API totals to `post_analytics.metric_window='live'` only. Locked windows are written by `runDueSnapshots()` when `snapshot_jobs` are due: `24hr→w24`, `3day→w3`, `7day→w7`, `eom→eom` at true calendar month end. Normal API syncs must never overwrite locked windows. `linkYouTubeVideo()` and `ensureYTPostsRow()` fetch YouTube public metadata via `src/lib/youtube-public.ts` and update pipeline/post title + thumbnail when a YT ID is linked. Analytics UI has a Live window selector and thumbnail previews. **Apply the S40 migration in Supabase before deploying this code to production**, or `live` upserts will fail the `post_analytics.metric_window` check constraint.
- S41: `ensureYTPostsRow` was only called from `MarkAsPostedModal`. Root cause: videos linked via YT link button (without marking as posted) had no posts row, so `resolvePostsUUID` returned null and cron skipped them as `no_posts_row`. Fix: `YTLinkModal.handleSave()` now calls `ensureYTPostsRow(item.id)` immediately after `linkYouTubeVideo` succeeds. Added `console.log/error` to every path in `ensureYTPostsRow` for Vercel log visibility. Backfill script: `scripts/fix-missing-posts-rows.mjs` (dry-run safe, `--run` to apply).
- S42: Two fixes. (1) **Post ID mismatch** — `ensureYTPostsRow` was generating sequential `#ytNNNN` IDs instead of using `pipeline_items.post_id` as source of truth. Fix: now uses `item.post_id` directly (or extracts `#yt*`/`#LF*` part from pipe-separated IDs). Same fix applied to `fix-missing-posts-rows.mjs`. Migration `session_42_fix_post_ids.sql`: Step 2 updates mismatched `posts.post_id` to match `pipeline_items.post_id` via `yt_video_id` join; Step 3 handles pipe-separated cases; Step 4 backfills `live` rows from `eom` for historical videos. **Apply to Supabase SQL Editor before or after deploy — order doesn't matter since it's data-only.** (2) **Default window** — `usePortalFilters.ts` default `win` changed from `'eom'` to `'live'`, so Analytics opens on the live view.
- S43: Instagram Graph API integration. OAuth route uses Facebook Login dialog (`https://www.facebook.com/dialog/oauth`) with valid scopes `instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management`; do not use old Basic Display or invalid business scopes in the dialog. Callback exchanges code at `https://graph.facebook.com/v19.0/oauth/access_token` and stores `follower_count` as `subscriber_count`. New `src/lib/instagram-sync.ts` — core sync logic: fetches `/me/media`, parses shortcodes from `permalink`, matches to `pipeline_items.ig_video_id`, fetches per-item `/insights` (reach, saved, plays), upserts `post_analytics.metric_window='live'`. New `/api/admin/sync-instagram` POST route (same pattern as sync-youtube). `AdminInstagramSection` rebuilt with Sync Now, Disconnect, follower count, last synced, 7-day token expiry warning. `admin/page.tsx` IG fetch now includes `subscriber_count,last_synced_at,token_expires_at`. **App is in Development Mode** — only whitelisted test accounts can connect. **Long-lived tokens expire in 60 days** — token expiry warning shown when ≤7 days remain.
- S43 callback fix: Vercel logs showed `[ig-oauth] No Instagram Business Account found` and no `platform_connections` rows were saved. Root cause: callback only tried one nested `/me?fields=id,name,accounts{instagram_business_account...}` user-token request. Fix: callback now logs sanitized Graph responses and uses: (1) `/me?fields=id,name` with user token, (2) `/me/accounts?fields=id,name,access_token` with user token, (3) per page `/{page_id}?fields=instagram_business_account{id,username,followers_count},name` with the PAGE access token, (4) direct fallback `/me?fields=id,name,instagram_business_account` with user token, then details lookup on the IG account id. **Never log raw Graph responses with tokens** — `access_token`, `refresh_token`, `token`, `client_secret`, and `fb_exchange_token` must be redacted in logs.
- S44: Analytics platform ID display fix + `ensureIGPostsRow`/`ensureTTPostsRow` server actions to auto-create posts rows when IG/TT videos are linked or marked as posted. See `## S44 Bug Fix Notes`.
- S45: `pipeline_items.title` source-of-truth enforcement — split all API metadata writes so `pipeline_items` only ever receives `thumbnail_url`, never `title`. Fixed `video-polling.ts`, `linkYouTubeVideo`, `ensureYTPostsRow`, `analytics/page.tsx`. See `## S45 Bug Fix Notes`.
- S46 (CLIENT: Nick): Restored Nick's 354 YouTube videos from YT Studio CSV after contamination incident. `scripts/restore-nick-yt-from-studio.mjs`. See `## S46 Recovery Notes`.
- S49 (GLOBAL): PKCE magic link auth flow. Three-iteration fix: (1) Added `/auth/callback` route + `emailRedirectTo` → `/auth/callback` + `shouldCreateUser:false`. (2) Moved `/auth/` passthrough before `getUser()` in `proxy.ts` — `getUser()` was consuming PKCE code before route handler ran. (3) Replaced `route.ts` (server, reads cookies) with `page.tsx` (client, reads localStorage) — root cause: PKCE verifier stored in `localStorage` by `createBrowserClient` but server `createServerClient` reads cookies only. Client page calls `exchangeCodeForSession(code)` from browser client, subscribes to `onAuthStateChange(SIGNED_IN)`, role-routes to `/admin` or `/`. 10s timeout → `/login?error=auth_failed`. See `fires/2026-06-16-pkce-localstorage-vs-server-cookie.md`.
- S50 (GLOBAL): Password-based client onboarding. Replaced `inviteUserByEmail` with `adm.auth.admin.createUser({ email, password: tempPassword, email_confirm: true, user_metadata: { must_change_password: true } })`. `generateTempPassword()` in `admin/actions.ts` produces 12-char random string (upper+lower+digits). `createNewClient` returns `{ tempPassword, email }` in success response. Admin sees credentials modal in `CreateClientModal` with "Copy Credentials" button. `resendClientInvite` renamed semantically to "Reset PW" — generates new temp and calls `updateUserById`. `ResendButton` shows full credentials modal (portal, email, temp password, copy button) matching `CreateClientModal` on success. `/auth/set-password/page.tsx` created — client page, calls `updateUser({ password, data: { must_change_password: false } })`, redirects to `/`. Dashboard `layout.tsx` checks `user.user_metadata.must_change_password === true && metaRole !== 'admin'` → redirect `/auth/set-password`. See `fires/2026-06-16-magic-link-pkce-failure.md`.
- S51 (GLOBAL): Delete client action + UI. `deleteClient(clientId, clientName)` in `admin/actions.ts` — guards `Nick Nascimento` and `Day 1 | D 1`, previews row counts in server logs, deletes in FK-safe order (post_analytics → calendar_events → goals → pipeline_items → posts → platform_connections → users → clients → auth.users). `DeleteConfirmModal` shows confirmation with red border and "Delete permanently" button. `ClientCard` has red Delete button. `AdminClientsSection` tracks `deletedIds` set for immediate UI removal without page reload. `btnRed` style added.
- S52 (GLOBAL): IG Analytics platform isolation. `AnalyticsClient.resolveWin()` now returns an empty analytics window for missing platform-specific rows instead of falling back to flat/YT data; active platform rows are filtered by actual `byPlatformWindow` existence; search, snapshot modal, slide-over, KPIs, charts, inline metric edits, and ER% calculations now use platform-resolved windows. `analytics/page.tsx` now keys pipeline titles by full pipe ID and every platform segment, never falls through to `posts.title` when a pipeline item exists, and merges duplicate rows that resolve to the same `pipeline_items.post_id`. Migration `session_47_posts_unique_post_id_client_id.sql` adds `UNIQUE (post_id, client_id)` after preview query returned 0 exact duplicates. See `fires/2026-06-16-ig-analytics-platform-isolation.md`.
- S53 (GLOBAL): IG Reels metrics + missing posts row backfill. `instagram-sync.ts` no longer requests invalid `plays` or unsupported Reel `impressions`; Reels/video insights now request `views,saved,reach,total_interactions,shares,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate`. Portal `views` remains mapped to Graph `reach` to preserve the locked IG ER% formula; `shares`, `saves`, and `skip_rate` now write to `post_analytics`. Added Graph error logging with metric list + message/code/type. Added `scripts/backfill-ig-posts-rows.mjs` (dry-run default, `--run` writes) to create missing IG `posts` stubs from linked + POSTED `pipeline_items`. Ran Day 1 backfill: created `#ig0061`, `#ig0031`, `#ig0033`. Corrected sync populated real `ig/live` metrics for `#ig0031`, `#ig0033`, `#ig0037`, `#ig0061`. See `fires/2026-06-16-ig-analytics-platform-isolation.md`.
- S56 (GLOBAL): TikTok analytics sync + platform-aware snapshots. Added `src/lib/tiktok-sync.ts` using TikTok v2 `POST /video/query/?fields=...` with fields as query params; writes `tt/live` rows to `post_analytics` (`views/client_views=view_count`, `likes`, `comments`, `shares`, `saves=0`). Added `/api/admin/sync-tiktok` and TikTok Admin "Sync Now" button with `last_synced_at`. The sync creates missing `#tt` posts stubs from linked `pipeline_items.tt_video_id` rows before upserting analytics, so pre-S44 linked videos can appear in Analytics. `runDueSnapshots()` now copies each live row into locked windows using that row's platform instead of hardcoding `yt`; `getPostableItemsInAgeRange()` now finds linked IG/TT/YT video IDs, though `pollPipelineItem()` still only polls YouTube public stats. Verified Day 1 TikTok sync: `#tt0001` = 553 views, 28 likes, 3 comments, 0 shares; `#tt0003` = 629 views, 31 likes, 1 comment, 1 share. See `fires/2026-06-18-tiktok-analytics-missing.md`.
- S48 (GLOBAL): Magic link + invite auth flow. `login/page.tsx` now detects `access_token` + `type=magiclink|invite` in the URL hash on mount, subscribes to `onAuthStateChange(SIGNED_IN)`, fetches role, redirects admin → `/admin`, client → `/`. Shows "Verifying your link…" while processing; 5-second timeout falls back to "This link has expired" error. Added `'magic'` mode with `signInWithOtp` flow (secondary "Sign in with magic link →" button on login form). Fix 3 (invite `redirectTo`) was already correct — `PORTAL_URL = 'https://portal.drop-clix.com'` already in `admin/actions.ts`.
- S47 (GLOBAL, cleanup only): Auth file dead-code pass. Removed dead `avatar_url` field from TikTok user info request; removed dead `'error'` Status variant + unreachable JSX guard in `reset-password/page.tsx`; removed S43 debug `console.log` from instagram callback; extracted shared `inputStyle` const in `login/page.tsx`; added `const now` in TikTok + YouTube callbacks; fixed `onMouseLeave` color regression on "Back to Sign In" button (`#444` → `#666`); added `tokens.expires_in` null-check in YouTube callback with 1hr fallback. No logic changes. tsc clean.

## Key decisions / gotchas

- **`pipeline_items.title` source of truth**: The display title for any video in the portal is always `pipeline_items.title`. `posts.title` is API metadata only (stores raw YT caption for internal use) and is never rendered in the UI. When syncing/polling, split metadata: `pipeline_items` → `thumbnail_url` only; `posts` → `title` + `thumbnail_url`. `analytics/page.tsx` resolves display title from `pipelineTitleByPostId` map (built from `pipeline_items.title` via video ID or post_id segment lookup), falling back to `posts.title` only when no pipeline item exists.
- **`isPlatLinked` signature**: takes `(item: PipelineItem, plat: 'ig' | 'tt')` — NOT `(videoUrl, plat)`. Checks `item.igVideoId`/`item.ttVideoId` first, then falls back to `item.videoUrl` domain check.
- **Pipeline row link buttons (IG/TT/YT)**: 28×28px with brand logo SVGs (`IGSmall`/`TTSmall`/`YTIcon`). `opacity: 0.25` when unlinked, `1` when linked + glow `boxShadow`. `ytLinked = !!item.ytId || !!item.ytVideoId`.
- **`PlatformLinkModal` auto-fill**: pre-fills IG from `item.igVideoId` → `instagram.com/reel/{id}/`; TT from `item.videoUrl` if TT URL; also saves `ig_video_id`/`tt_video_id` to DB alongside `video_url`. `onLinked(url, videoId)` — two args.
- **Platform persistence**: `usePortalFilters` reads `localStorage.getItem('dropclix_platform')` as default when no URL param. Writes on `setFilters({ platform })`. Key: `dropclix_platform`.
- **Analytics search bar**: replaces pillar chips. `search` state, filters across ID/title/date/pillar/hook/format/decision/numeric metrics. Dependency: `[posts, platform, search, win, scope, from, to, sortKey, sortDir]`.
- **`linkYouTubeVideo` durable path**: always saves `yt_video_id` to `pipeline_items` when `pipelineItemId` arg is provided (3rd arg). Also fetches YouTube public metadata and updates pipeline/post `title` + `thumbnail_url` when available. `post_analytics.yt_id` update is best-effort (may be 0 rows if post has no analytics). Returns `{ ytId, note? }` — note shown as info toast, never blocks save.
- **`YTLinkModal` pre-fill**: pre-fills input from `item.ytId` first, then reconstructs `youtube.com/watch?v={ytVideoId}`. Shows "Currently linked" from `ytId ?? ytVideoId`. Always pass `item.id` as 3rd arg to `linkYouTubeVideo`.
- **`handleYtLinked`**: updates both `ytId` AND `ytVideoId` in local state so glow persists without reload.
- **`autoDiscoverYTUploads`**: DELETED in S39. Admin links manually via pipeline YT button — that is the only source of truth for `yt_video_id`.
- **`resolvePostsUUID` (3-strategy)**: in `video-polling.ts`. Tries: (1) exact `post_id`, (2) pipe-split parts (multi-platform items like `#ig0037 | #tt0007 | #yt0087` stored literally in `pipeline_items.post_id`), (3) `posts.yt_id = yt_video_id`. Used by `pollPipelineItem`. Never use `.single()` for posts lookup in the cron — multi-platform post_ids will miss.
- **`ensureYTPostsRow(pipelineItemId)`**: server action in `edit-actions.ts`. Uses same 3-strategy lookup. If no posts row found, creates stub row using `pipeline_items.post_id` as `posts.post_id` (source of truth). For pipe-separated IDs, extracts the `#yt*`/`#LF*` part; only falls back to generating sequential `#ytNNNN` as last resort. Called from BOTH `MarkAsPostedModal.handleConfirm` (when `parsedIds.yt` is set) AND `YTLinkModal.handleSave()` (immediately after `linkYouTubeVideo` succeeds). **Must fire from both locations** — a video can be YT-linked before being marked as posted, and cron needs a posts row the moment `yt_video_id` is saved.
- **`posts.post_id` source of truth**: always `pipeline_items.post_id`. Never auto-generate a new `#ytNNNN` if the pipeline item already has a `#yt*` or `#LF*` ID. Mismatch between posts.post_id and pipeline_items.post_id corrupts the Analytics tab display. Fix: `session_42_fix_post_ids.sql` migration (UPDATE via yt_id join). After applying, verify with: `SELECT COUNT(*) FROM posts p JOIN pipeline_items pi ON pi.yt_video_id = p.yt_id AND pi.client_id = p.client_id WHERE p.post_id != pi.post_id`.
- **Analytics default window**: `'live'` (set in `usePortalFilters.ts` line `const win = ... ?? 'live'`). Changed from `'eom'` in S42. If live rows don't exist yet, run Step 4 of `session_42_fix_post_ids.sql` to backfill from eom.
- **Instagram OAuth**: `/api/auth/instagram/route.ts` uses `INSTAGRAM_APP_ID` and `INSTAGRAM_REDIRECT_URI` (server-side, no NEXT_PUBLIC_ prefix needed) and redirects to `https://www.facebook.com/dialog/oauth`. Valid Facebook Login dialog scopes are `instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management`. Do not use `instagram_business_basic`, `instagram_business_manage_messages`, or `instagram_manage_comments` in the OAuth dialog. Callback exchanges code via Graph API → short-lived token → long-lived token (60-day TTL); stores in `platform_connections` with `subscriber_count = followers_count`. **App in Development Mode** — add accounts as testers in Meta Developer Dashboard before testing.
- **Instagram account lookup in callback**: use page access tokens for page-level `instagram_business_account` lookups. Lookup order: user `/me`, user `/me/accounts`, page `/{page_id}?fields=instagram_business_account{id,username,followers_count},name` with page token, then direct `/me?fields=id,name,instagram_business_account` fallback with user token. Save `channel_id = IG account id`, `channel_name = username`, `subscriber_count = followers_count`, `token_expires_at = 60-day expiry`. If no IG account id is found, redirect with `ig_error=no_instagram_account` and do not upsert a broken null-channel connection. `platform_connections` has no `username` column.
- **Instagram sync (`/api/admin/sync-instagram`)**: POST route. Calls `syncInstagramForClient()` from `src/lib/instagram-sync.ts`. Core logic: fetches `/me/media` → parses shortcode from `permalink` → matches to `pipeline_items.ig_video_id` → fetches `/{id}/insights` (reach, saved, plays) → upserts `post_analytics.metric_window='live'`. Skips unlinked media (no `pipeline_items` row with matching `ig_video_id`). Updates `subscriber_count` + `last_synced_at` on each sync.
- **TikTok sync (`/api/admin/sync-tiktok`)**: POST route. Calls `syncTikTokForClient()` from `src/lib/tiktok-sync.ts`. TikTok API shape is locked: `POST https://open.tiktokapis.com/v2/video/query/?fields=id,title,view_count,like_count,comment_count,share_count,cover_image_url` with JSON body `{ filters: { video_ids: [...] } }`; fields must be query params, not request body. Sync resolves linked videos through `pipeline_items.tt_video_id`, ensures a `#tt` posts row exists, then writes `post_analytics.platform='tt'`, `metric_window='live'`. TikTok has no reach/views split, so `views=view_count` and `client_views=view_count`; ER% still uses `views`.
- **`ig_video_id` stores shortcodes**: from Instagram URLs like `instagram.com/reel/CXxyz123` → stores `CXxyz123`. Graph API media objects use numeric IDs. Sync matches via `permalink` → parse shortcode. Never store the Graph API numeric ID in `ig_video_id` — always the URL shortcode.
- **Instagram token expiry**: 60-day TTL. `token_expires_at` stored in `platform_connections`. `AdminInstagramSection` shows warning when ≤7 days remain. User must Reconnect to get a new token.
- **Instagram ER% formula LOCKED**: `(likes + comments + shares + saves) / views × 100` where `views = reach` (unique accounts reached from insights API). Never change this formula.
- **YOUTUBE_API_KEY HTTP referrer restriction**: the `YOUTUBE_API_KEY` in GCP must have Application restrictions set to **None** — NOT "HTTP referrers". Server-side fetch sends no `Referer` header → gets `API_KEY_HTTP_REFERRER_BLOCKED`. GCP: project `338389725982` → APIs & Services → Credentials → find the key → edit restriction.
- **`.env.local` after `vercel env pull`**: encrypted secrets become empty strings `""`. Pull only restores non-secret system vars. Keep real Supabase creds in a safe local backup — do NOT rely on `vercel env pull` to restore them.
- **subscriber_count refresh on Sync Now**: `sync-youtube` route calls `fetchChannelInfo(conn.access_token)` and writes `subscriber_count` to `platform_connections` alongside `last_synced_at`. Returns `{ subscriberCount }` in JSON. `AdminYouTubeSection` has `subCounts` state (init from props) — updated on sync so display reflects new count immediately.
- **`resolvePostsUUID` 3-strategy**: exact post_id → pipe-split `.trim()` each part → `yt_id` fallback. Multi-platform pipeline items store pipe-separated post_id literally (e.g., `#ig0037 | #tt0007 | #yt0087`) — space+trim is critical. Same logic in `ensureYTPostsRow`.
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
- **per-platform video IDs**: `ig_video_id`, `tt_video_id`, `yt_video_id` on `pipeline_items` (saved by Mark as Posted modal) AND `post_analytics` (populated by polling cron). Migration: `session_37_video_ids.sql`. VALID_PIPE in `edit-actions.ts` includes all three.
- **Mark as Posted modal**: platform logo toggle buttons. `lf` → renders as YT logo. Multi-toggle: multiple platforms can be active simultaneously, each showing its own URL input. `parsePlatformVideoId(url, plat)` is per-platform (not generic). Saves `ig_video_id`/`tt_video_id`/`yt_video_id` + `video_url` (primary URL) to pipeline_items.
- **video-polling.ts**: `fetchYTPublicStats(videoId)` uses YouTube Data API v3 — needs `YOUTUBE_API_KEY` env var (public API key, NOT OAuth). `YOUTUBE_API_KEY` is separate from `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`. Create it in GCP project `338389725982` → APIs & Services → Credentials → API Key → restrict to YouTube Data API v3. Without it, all polls return `yt_api_null`. `upsertPolledStats()` preserves `prev_views`+`prev_recorded_at` for growth rate interpolation. `autoDiscoverYTUploads` DELETED (S39).
- **Cron polling model (S40/S56/S61)**: Source of truth = `pipeline_items.*_video_id` set by admin via Mark as Posted modal or platform link buttons. Cron public polling still only fetches YouTube Data API stats; TikTok/Instagram live stats come from their manual/admin sync routes. `runDueSnapshots()` copies platform `live` rows into locked windows only when jobs are due (`24hr→w24`, `3day→w3`, `7day→w7`, `eom→eom`) and never hardcodes `yt`. S61 made capture per-platform: a `snapshot_jobs` row stays `captured=false` until every applicable platform on that `posts` row has the locked `post_analytics` window. Before copying, snapshots refresh live data through `pollPipelineItem()` for YT, `syncSingleIGVideo()` for IG, and `syncSingleTTVideo()` for TT when the linked video ID exists. Archive tier (`maxAgeDays=null`) includes `posted_at IS NULL`. `pollPipelineItem(admin, item)` resolves UUID internally from `posts` via exact post_id → pipe-split → yt_id fallback.
- **Cron routes**: `/api/cron/poll-fresh|recent|archive` — Hobby plan → daily only. Pro plan enables `*/2`, `*/10`, `0 */6` schedules. Routes respond to GET with `CRON_SECRET` bearer auth (optional). Can be triggered manually. Response includes `checked`, `polled`, `skipped`, `skip_reasons`, `snapshots`.
- **Proxy API bypass**: `proxy.ts` passes all `/api/` routes through without session check (`if (pathname.startsWith('/api/')) return supabaseResponse`). API routes handle their own auth. Without this, cron routes redirect to `/login`.
- **analytics_snapshots**: permanent records, never overwrite (`UNIQUE (post_id, window_type)`). `snapshot_jobs` drives the scheduling (T+24hr/3day/7day/EOM). S40 snapshots copy from the `live` row and write the corresponding locked `post_analytics` window once; normal syncs do not overwrite locked windows. Both tables have RLS. Migration: `session_37_snapshots.sql`; live support migration: `session_40_live_analytics.sql`.
- **useInterpolatedStat hook**: `src/hooks/useInterpolatedStat.ts`. Requires `prev_views`+`prev_recorded_at` on the analytics row. Only interpolates within `maxAgeDays` (default 7). Snaps to real value on every `current` change. Applied via `AnalyticsTableRow` component in AnalyticsClient.
- **AnalyticsTableRow**: standalone component (not inline map) so `useInterpolatedStat` can be called as a hook. Accepts `post, index, activeWin, pillarColors, onOpen, onSave` props.
- **Pipeline platform link buttons**: `isPlatLinked(videoUrl, 'ig'|'tt')`. `PlatformLinkModal` saves to `video_url`. `PipelineItem.videoUrl` added.
- **Pipeline row stripe**: first `<td>` = `PLAT_CFG[item.platform[0]].color`. `colSpan` = 13.
- **Next.js 16 proxy**: `middleware.ts` deprecated. Use `src/proxy.ts` with `export function proxy()`.
- **`/auth/` routes**: always pass unauthenticated — recovery token is in URL hash (client-only).
- **Client onboarding (S50)**: Password-based. `createNewClient` calls `adm.auth.admin.createUser({ email, password: tempPassword, email_confirm: true, user_metadata: { must_change_password: true } })`. No invite email is sent. Admin copies credentials from `CreateClientModal` credentials panel and shares out-of-band. `resendClientInvite` (labeled "Reset PW" in UI) generates a fresh temp password via `updateUserById`. On first login, `layout.tsx` detects `user.user_metadata.must_change_password === true` and redirects to `/auth/set-password`. Set-password page calls `supabase.auth.updateUser({ password, data: { must_change_password: false } })` then redirects to `/`. Admins (app_metadata.role='admin') are exempt from this redirect.
- **`generateTempPassword()`**: In `admin/actions.ts`. Uses `crypto.randomBytes(24)`. 12 chars: guarantees ≥1 uppercase, ≥1 lowercase, ≥1 digit, then shuffled. No external dependency needed.
- **`deleteClient(clientId, clientName)`**: In `admin/actions.ts`. Protected names: `'Nick Nascimento'` and `'Day 1 | D 1'` (exact string match). Delete order: post_analytics → calendar_events → goals → pipeline_items → posts → platform_connections → public.users → clients → auth.users. Preview logs each table count before delete. Returns `{}` on success, `{ error }` on failure. Never add new protected names without updating CLAUDE.md.
- **Magic link / invite token handling**: Two flows coexist. (1) **PKCE flow** (default for `signInWithOtp`): Supabase emails a link with `?code=...` appended to `emailRedirectTo`. The `emailRedirectTo` is set to `${window.location.origin}/auth/callback`. The callback handler is `src/app/auth/callback/page.tsx` — a **client-side page** (NOT a route handler) that reads the code from `window.location.search`, calls `supabase.auth.exchangeCodeForSession(code)` using `createBrowserClient`, subscribes to `onAuthStateChange(SIGNED_IN)`, fetches role, and redirects. Must be a client page because the PKCE code verifier is stored in `localStorage` by `createBrowserClient` — a server route handler using `createServerClient` reads cookies and cannot find the verifier. `shouldCreateUser: false` prevents unknown-email account creation. (2) **Hash/implicit flow**: If the URL has `#access_token=...&type=magiclink|invite` (invite emails, legacy links), `login/page.tsx` `useEffect` detects it and uses `onAuthStateChange(SIGNED_IN)`. `timerRef` guards a 5-second expiry fallback. Proxy passes all `/auth/` routes unauthenticated; `/api/` and `/auth/` passthroughs are ordered BEFORE `createServerClient` + `getUser()` in `proxy.ts`.
- **cookies() is async**: `const cookieStore = await cookies()` in server components.
- **Env vars**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY), `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY, prefix `sb_secret_*`).
- **Role check**: proxy AND page/layout. Login: admin → `/admin`, client → `/`. Layout redirects admin to `/admin`; `/` is client-only.
- **No `app/page.tsx`**: `app/(dashboard)/page.tsx` owns `/` via route group.
- **getPortalContext()**: import from `@/lib/supabase/portal`. Use in ALL dashboard pages — never separate `createClient()` + profile fetch.
- **Admin impersonation**: cookie `dropclix_impersonate_client_id`, 8h httpOnly. Only cleared via "Exit Portal".
- **Dashboard queries**: `metric_window = 'eom'` for totals. Pipeline active = not POSTED/CANCELLED.
- **Analytics data join**: `posts.select('..., thumbnail_url, post_analytics(...)')` — nested array keyed by `metric_window`; current totals are `live`, locked windows are `w24`/`w3`/`w7`/`eom`.
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
- YouTube: 354 videos restored from YT Studio CSV (S46). IDs #yt0001–#yt0070 pre-existing; #yt0071+ assigned chronologically. Re-import/restore: `node scripts/restore-nick-yt-from-studio.mjs --run`

## Day 1 / Chase client

- Client ID: `f51bb5e1-9222-44d2-9f0e-795dbe3b6acd`
- YouTube: 80+ videos (`#yt0001`–`#yt0080+`, `#LF0001`–`#LF0003`). All have `yt_video_id` set after S39 backfill.

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

### Instagram Reach vs Client-Facing Views

**Locked architecture from S55. Do not rename `post_analytics.views`.**

- For Instagram only, `post_analytics.views` means **Reach** (unique accounts reached).
- Instagram ER% and Decision thresholds must always use `post_analytics.views` / Reach.
- `post_analytics.client_views` stores the real Instagram Graph API `views` metric (total plays).
- Client-facing Analytics table/KPI/chart displays use `client_views` for IG when present.
- YouTube and TikTok continue using `post_analytics.views` as real views. TikTok sync also writes `client_views = views` for display consistency, but TT formulas and decisions still read `views`.
- Historical IG rows may have `client_views = null` until the next IG sync. Do not estimate or backfill unless explicitly requested.

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
| `scripts/sync-youtube.mjs` | CLI YT Analytics sync. S40 writes current totals to `metric_window='live'` only; locked windows are captured by cron snapshot jobs. `[--run] [--force]`. 403 = wrong channel or YT Analytics API not enabled (GCP `338389725982`). |
| `scripts/fix-week-format.mjs` | Normalise `pipeline_items.week` to MonWk# (ALL clients). Unrecognisable → `MayWk2`. `[--run]`. |
| `scripts/fix-nick-data.mjs` | CLIENT:Nick cleanup — week fixes, ID renames, platforms. Already applied. Idempotent. |
| `scripts/diagnose-nick.mjs` | Prints Nick's enabled_platforms + post/pipeline platform distribution. |
| `scripts/backfill-priorities.mjs` | Backfill pipeline priorities from STATUS_PRIORITY map. |

## S46 Recovery Notes (CLIENT: Nick Nascimento)

- Incident: Client data contamination (June 15, 2026) deleted Nick's posts rows and post_analytics during a cross-client cleanup. 43 posts + 89 analytics rows were removed.
- Recovery: `scripts/restore-nick-yt-from-studio.mjs` — reads 354 rows from YouTube Studio CSV export (`scripts/data/Content.../nick_yt_import.csv`). Sorts chronologically oldest→newest so post_ids (#yt####) are date-ordered.
- Step 1 pipeline_items: skips rows where `yt_video_id` already exists for Nick (existing rows not touched). Inserts new rows with status=POSTED, priority=6, week=MonWk#, platform=['yt'].
- Step 2 posts: skips rows where `yt_id` already exists for Nick. Uses same #yt#### assigned in Step 1. Starting ID = max(existing Nick #yt####, 70) + 1.
- Step 3 post_analytics: upserts all 354 rows as metric_window='live'. ON CONFLICT (post_id, platform, metric_window) DO UPDATE.
- Step 4 verify: queries pipeline_items / posts / post_analytics counts for Nick. Cross-contamination check: Day 1 client_id must have 0 rows matching Nick's yt_ids.
- Safety: every insert includes `client_id: NICK_CLIENT_ID` hardcoded. Day 1 client_id is declared as a constant and never written.
- Script is idempotent: safe to re-run. If .env.local has empty strings (after `vercel env pull`), restore Supabase creds from dashboard before running.
- Nick CLAUDE.md note update: Nick now has up to 354 YouTube videos. Post IDs #yt0001–#yt0070 were pre-existing (57 had yt_video_id from S39 backfill). New videos assigned #yt0071+ in chronological order.

## S52 Bug Fix Notes

- Issue: IG Analytics showed duplicate `#ig0037`, YT views in IG KPIs, empty `#ig0033` rows, and YT captions as IG titles. Root cause: Analytics treated `posts.platform` metadata and `post_analytics.platform` rows as interchangeable, and `resolveWin()` fell back to flat windows when an active-platform row was missing.
- Fix: Active platform views now require `byPlatformWindow[platform_window]`; missing IG/TT/YT rows return an empty window and are filtered out for platform-specific views. Inline metric edits also use the active platform pill unless the view is `all`. This preserves the no-query-on-filter-change UX while stopping cross-platform metric bleed.
- Fix: `analytics/page.tsx` merges multiple `posts` rows that resolve to the same pipeline item, keys pipeline titles by full pipe ID and every segment, and uses `'Untitled'` when a pipeline item exists without a title instead of falling through to raw `posts.title`.
- Migration: `supabase/migrations/session_47_posts_unique_post_id_client_id.sql` adds `UNIQUE (post_id, client_id)`. The required preview query returned 0 exact duplicate `(post_id, client_id)` groups before the migration file was added.

## S55 Bug Fix Notes

- Issue: Instagram Graph API returns both `reach` and `views`, but the portal had only one `post_analytics.views` column. Showing that column to clients made IG "Views" look smaller than the Instagram app because the portal uses `views` as Reach for the locked ER% formula.
- Root cause: The schema did not have a second display-only metric for real IG plays. Reusing `views` for display would break ER% and Double Down / Iterate / Kill decisions.
- Fix: Added `post_analytics.client_views` via `supabase/migrations/session_55_ig_client_views.sql` and applied the production DDL manually in Supabase SQL Editor. IG sync now writes `views = insights.reach` and `client_views = insights.views`.
- Fix: Analytics fetch/mapping carries `client_views`; IG-only display surfaces use `client_views` for the client-facing Views column, Total Views KPI, search/sort by views, snapshot modal, slide-over window grid, and the Monthly Views / Reach chart. `resolveWin()` and all ER/Decision code still read `views` as Reach.
- Verification: Day 1 IG sync populated `#ig0061` with `views/reach=221671` and `client_views=301492`. ER remained 11.33% and the computed decision remained `Iterate`, proving formulas stayed on Reach.
- Gotcha: Admin inline editing of the Analytics "Views" cell still writes to `views` / Reach through the existing `updateAnalyticsMetric()` path. If client-facing manual editing of Graph views is needed later, add an explicit `client_views` edit path that does not recompute Decision.

## S56 Bug Fix Notes

- Issue: TikTok videos linked in Pipeline did not show metrics in Analytics. Root cause: OAuth existed and `ensureTTPostsRow()` existed, but no `tiktok-sync.ts` or `/api/admin/sync-tiktok` route had ever been built, so no `tt/live` rows were written.
- Fix: Added TikTok v2 sync using the confirmed `video/query` request shape. Sync creates missing `#tt` posts stubs for linked `pipeline_items.tt_video_id` rows, writes `views/client_views`, `likes`, `comments`, `shares`, and `saves=0` to `post_analytics`, and exposes a TikTok Admin Sync Now button.
- Issue: Locked snapshot windows were YouTube-only. Root cause: `runDueSnapshots()` fetched a single live row and hardcoded `platform='yt'`, so IG/TT live rows could never lock into `w24/w3/w7/eom`.
- Fix: `runDueSnapshots()` now iterates all live platform rows for a job and writes each locked window with the source row's platform. `analytics_snapshots` remains one row per post/window because its schema has no platform column; platform-specific truth lives in `post_analytics`.
- Verification: Live Day 1 TikTok API sync returned and wrote `#tt0001` (553 views, 28 likes, 3 comments, 0 shares) and `#tt0003` (629 views, 31 likes, 1 comment, 1 share).

## S57 Bug Fix Notes

- Issue: After TikTok sync shipped, IG Analytics dropped `#ig0031` and `#ig0033`. Root cause: `analytics/page.tsx` deduped rows by resolved pipeline ID but kept the first row's identity. TikTok rows with `date=null` sorted first, won the merge, and left the merged row with `platform=['tt']`, so the IG/YT pills filtered it out even though IG/YT analytics were present.
- Fix: Analytics dedup now builds a true multi-platform merged row per pipeline item: platform arrays are unioned, all `byPlatformWindow` entries are preserved, flat windows are rebuilt from platform-specific rows, and `uuidByPlatform` tracks the correct `posts.id` for inline edits on IG/TT/YT.
- Issue: `#ig0062` could display an API caption instead of the curated pipeline title. Root cause: merged row identity could inherit `posts.title` from whichever row won. Fix: pipeline title resolution is enforced after merge; `pipeline_items.title` remains the only display title source when a pipeline item exists, with the pipeline post ID as fallback if the title is blank.
- Build: Added per-video auto-sync after link save and Mark as Posted. `syncLinkedVideoNow()` dispatches to `syncSingleIGVideo()`, `syncSingleTTVideo()`, or `syncSingleYTVideo()` after `ensure*PostsRow()` succeeds. Sync errors are logged and non-blocking; the manual Sync Now buttons remain the fallback.
- Known issue to fix later: `updateAnalyticsMetric()` recomputes Decision with `(likes + comments + shares + saves) / views` for every platform. YouTube's locked formula should use `subscribers_gained` / `followers`, not `saves`. This bug pre-existed S57 and was documented only, not fixed.

## S58 Meta Ads API Notes

- Build: Added Meta Ads OAuth using the same Meta app credentials as Instagram (`INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`) with scope `ads_read` only. Routes: `/api/auth/meta-ads` and `/api/auth/meta-ads/callback`. Redirect env var: `META_ADS_REDIRECT_URI=https://portal.drop-clix.com/api/auth/meta-ads/callback`.
- Schema: `ad_campaigns.meta_campaign_id text` added in Supabase and documented in `supabase/migrations/session_58_meta_ads_campaign_id.sql`; unique partial index `ad_campaigns_client_meta_campaign` enforces one API-backed campaign per client/account campaign ID.
- Sync: `src/lib/meta-ads-sync.ts` fetches `{adAccountId}/campaigns` and `{campaign.id}/insights` with `date_preset=maximum`, then saves API-sourced fields only: `meta_campaign_id`, `name`, `date`, `objective`, `status`, `spend`, `impressions`, `reach`, `clicks`, `ctr`, `cpm`, `cpc`. Never overwrite manual fields: `leads`, `hires`, `roas`, `revenue`, `cpl`, `cph`.
- Admin: New `AdminMetaAdsSection` under TikTok connections. Connect/reconnect uses `/api/auth/meta-ads?client_id=...`; Sync Now posts to `/api/admin/sync-meta-ads`; Disconnect deletes `platform_connections.platform='meta_ads'`.
- Gotcha: Meta Ads account IDs should be stored in `platform_connections.channel_id` with the `act_` prefix from Graph `/me/adaccounts`. For Day 1 the expected account is `act_1196633849221825`.
- S58 follow-up: Meta Insights does NOT support `date_preset=lifetime`; it returns HTTP 400 `(#100) lifetime is not a valid date_preset`. Use `date_preset=maximum` for campaign insights. Empty successful insights (`data: []`) are normal for brand-new campaigns and must still insert/update the campaign row with zero metrics so it appears in Ads immediately.
- S58 follow-up gotcha: Supabase/PostgREST `upsert(... onConflict: 'client_id,meta_campaign_id')` failed against the partial unique index with `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Meta Ads sync now uses explicit lookup by `client_id + meta_campaign_id`, then updates only API-sourced columns or inserts a new row. Do not switch back to PostgREST upsert unless the DB has a full unique constraint compatible with `ON CONFLICT`.

## S59 TikTok Token Refresh Notes

- Issue: TikTok access tokens expire after roughly 24 hours, so daily syncs returned 401 errors and required manual reconnect even though `platform_connections.refresh_token` was stored.
- Fix: `src/lib/tiktok-sync.ts` now includes `refreshTikTokToken(clientId)` and refreshes automatically when `token_expires_at` is missing, invalid, expired, or within 5 minutes of expiry. The refresh path updates `access_token`, `refresh_token`, `token_expires_at`, and `updated_at` using `createAdminClient()`.
- Sync behavior: `syncTikTokForClient()` and `syncSingleTTVideo()` both load TikTok connections through the refresh-aware path before calling `video/query`. If refresh fails, `/api/admin/sync-tiktok` returns `Token expired, please reconnect` with a 401 instead of a generic sync failure.
- Gotcha: Do not log raw TikTok access or refresh tokens. Refresh logs should include status/error context only. Manual reconnect remains the fallback if TikTok rejects the stored refresh token.

## S60 Global Cleanup + Admin Token Expiry Notes

- Cleanup: Removed confirmed-unused `PortalNav.tsx` and `DashboardCharts.tsx`, plus dead locals/imports in Dashboard layout, Ads, AI command bar, Analytics, Pipeline import modal, Pipeline, Studio CSV import, and Pipeline page.
- Admin: YouTube, Instagram, TikTok, and Meta Ads admin sections now all fetch and display `platform_connections.token_expires_at` with consistent labels: `Expires in X days` or `Token expired — reconnect needed`.
- Gotcha: TikTok has 24-hour access tokens with automatic refresh. Its admin section displays the expiry but only treats an actually expired token as a warning/reconnect state, so routine near-term expiry does not look broken.
- Deferred: Admin connection UI still has duplicated `fmt` / `fmtDate` / state patterns by design; consolidate in a separate dedicated session if needed.

## S61 Snapshot Capture Notes

- Issue: `snapshot_jobs.captured` was job-level, but multi-platform posts need platform-level completion. A due job could be marked captured after only one platform wrote or already had a locked row, permanently skipping missing IG/TT/YT windows for the same post/window.
- Fix: `runDueSnapshots()` now treats existing locked `post_analytics` rows as the per-platform completion state. It fetches applicable platforms from the `posts.platform` array plus existing live rows, copies each missing platform from `live` into the due locked window, and only marks the job captured when every applicable platform has that locked row.
- Fix: Before capture, the runner refreshes live stats for the applicable platform: YouTube through the existing `pollPipelineItem()` path, Instagram through `syncSingleIGVideo()`, and TikTok through `syncSingleTTVideo()`. Dynamic imports avoid a static circular dependency between `video-polling.ts` and the IG/TT sync modules.
- Processing cap: due snapshot job limit increased from 20 to 30 per cron invocation. Reasoning: each job can do up to three platform refresh attempts, so 30 speeds backlog cleanup without turning a Hobby cron run into a large API spike.
- Verification note: Local manual cron pass processed 30 due jobs successfully (`snapshots=30`) and wrote locked rows, but the local `.env.local` YouTube API key returned `API_KEY_INVALID / API key expired`, so YT live refresh skipped and copied existing live rows. Confirm/rotate the local key if local YT refresh testing is needed. Production Vercel key may differ.
- Gotcha: This fix prevents future premature job closure but does not backfill windows that were already marked captured before S61. Historical repair still needs an explicit backfill session.

## S62 Admin Token Expiry UI Notes

- Issue: Admin Sync Now could refresh or update connection data in `platform_connections`, but YouTube/TikTok/Instagram/Meta Ads admin sections kept rendering the initial server-fetched `token_expires_at` and `last_synced_at` props until a page reload.
- Root cause: `admin/page.tsx` fetches connection rows server-side once. The client Sync Now handlers updated sync result text and a few platform-specific values, but they did not update local expiry/sync timestamp state from the route response.
- Fix: `/api/admin/sync-youtube`, `/api/admin/sync-tiktok`, `/api/admin/sync-instagram`, and `/api/admin/sync-meta-ads` now return the persisted `lastSyncedAt` and `tokenExpiresAt` from `platform_connections` after sync. All four admin sections store those values locally after a successful Sync Now.
- Gotcha: Do not change token refresh logic to fix stale warning UI. The correct pattern is backend refresh/update first, route returns the updated display fields second, admin component updates local state third.

## S63 Facebook Token Refresh Notes

- Issue: Instagram and Meta Ads both used 60-day Facebook long-lived tokens but had no refresh-before-sync path. Instagram's expired-token failure mode could look like false success because `/media` errors returned an empty array and the sync could report 0 posts synced.
- Fix: Added shared `src/lib/facebook-auth.ts` with `refreshFacebookToken(clientId, platform)`, where `platform` is `'instagram' | 'meta_ads'`. It uses the same 5-minute safety window as TikTok/YouTube, refreshes via Graph `grant_type=fb_exchange_token`, updates `platform_connections.access_token`, `token_expires_at`, and `updated_at`, and never logs token values.
- Instagram: `syncInstagramForClient()` and `syncSingleIGVideo()` now call the shared helper before any Graph API calls. If refresh fails, they stop immediately with `Token expired, please reconnect` instead of calling `/media` and returning a misleading empty sync.
- Meta Ads: `syncMetaAdsForClient()` now calls the shared helper before campaign/insights calls. If refresh fails, `/api/admin/sync-meta-ads` returns the same reconnect-needed 401 pattern as TikTok.
- Verification: Day 1 live tokens were outside the refresh window after build: Instagram expires `2026-08-17T18:16:57.232Z`; Meta Ads expires `2026-08-18T19:52:33.628Z`. All four platform connections now have auto-refresh coverage: YouTube (`youtube-auth.ts`), TikTok (`tiktok-sync.ts`), Instagram/Meta Ads (`facebook-auth.ts`).

## S64 Publish Date Auto-Fill Notes

- Issue: Analytics displayed `posts.date` while Pipeline displayed `pipeline_items.posted_at`, but IG/TT/YT sync/link paths did not save real platform publish dates. Newly linked videos could show blank or portal-entered dates instead of the original publish date.
- Fix: Added shared `src/lib/publish-date.ts`. `fillPublishDatesIfMissing()` normalizes platform timestamps and fills both `pipeline_items.posted_at` and `posts.date` only when those fields are null. It never overwrites an existing/manual date.
- Instagram: `instagram-sync.ts` now maps the already-fetched Graph `timestamp` into the shared helper during full-client sync and single-video sync.
- YouTube: `youtube-public.ts` now returns `snippet.publishedAt`; `video-polling.ts`, `linkYouTubeVideo()`, and `ensureYTPostsRow()` use it to fill missing publish dates.
- TikTok: Live API test confirmed `create_time` is the correct field and returns Unix seconds. `tiktok-sync.ts` now requests `create_time` and maps it through the shared helper during full-client sync and single-video sync.
- Gotcha: This is not a historical backfill. Existing rows are updated only when they pass through a normal link/sync path and their date fields are missing. If a one-time historical cleanup is needed, run a separate scoped audit/backfill session.

## S65 Dashboard Greeting Name Fix

- Issue: Dashboard greeting used `userEmail.split('@')[0]`, which rendered email fragments like "chase" instead of the actual client display name.
- Root cause: `getPortalContext()` fetched each client's config but did not expose `clients.name` to the dashboard page.
- Fix: `getPortalContext()` now returns `clientName` from `clients.name`, and `src/app/(dashboard)/page.tsx` passes that value to `DashboardClient`, falling back to the email fragment only if the client name is unavailable.
- Gotcha: No `public.users.full_name` / `display_name` column is needed. Portal-wide client display names should continue to use `clients.name` as the source of truth.

## S66 OAuth Client ID Trust Fix

- Issue: Instagram, TikTok, and YouTube OAuth initiation routes trusted `?client_id=` from the URL and copied it into OAuth `state`; callbacks then used that state with `createAdminClient()` to write `platform_connections`.
- Root cause: These routes were built for admin-only UI links, but `/api/` routes bypass proxy auth by design. The routes did not independently verify the session was authorized to act on the requested client.
- Fix: Added shared `src/lib/oauth-state.ts`. IG/TT/YT initiation routes now require a session, resolve the authorized client ID from the session, sign OAuth state with platform/client/nonce/timestamp, and set an httpOnly nonce cookie. Admins can still pass explicit `client_id`; clients always use their own `users.client_id`.
- Fix: IG/TT/YT callback routes now require a session, verify signed state, verify nonce, re-resolve session authorization, and reject mismatched client IDs before any `platform_connections` upsert.
- Gotcha: RLS is not a substitute here because callbacks write through `createAdminClient()`. Future `/api/auth/*` integrations must use signed state plus session authorization, never a trusted query-string client ID.
- Fire doc: `fires/2026-06-26-oauth-client-id-trust.md`.

## S67 Client Settings + Self-Service Connections

- Build: Added client-facing `/settings` under the dashboard shell as the future home for self-service account features. The first section is Platform Connections for Instagram, TikTok, and YouTube.
- Security: `/settings` resolves the current client through `getPortalContext()` first, then server-fetches only safe `platform_connections` fields with `createAdminClient()`: `platform`, `channel_name`, `channel_id`, `subscriber_count`, `created_at`, `last_synced_at`, `token_expires_at`. Never pass `access_token` or `refresh_token` to client components.
- OAuth redirects: `src/lib/oauth-state.ts` state payload now includes signed `origin: 'admin' | 'client'`. Admin-initiated IG/TT/YT callbacks still redirect to `/admin` with the existing query params. Client-initiated callbacks redirect to `/settings` with the same success/error query params.
- Client UX: `SettingsClient` exposes Connect/Reconnect only. No client-facing Sync Now exists; Sync Now remains admin-only. Reconnect links intentionally omit `client_id`, relying on the S66 session-secured initiation routes to resolve the logged-in client's own `client_id`.
- Navigation: Settings was added to `SidebarShell` and default enabled-tab fallbacks. It is always visible in the sidebar for existing clients whose saved `enabled_tabs` arrays predate the Settings tab, because account/platform self-service should not be hidden by content-tab configuration.
- Gotcha: True admins without impersonation still redirect to `/admin` through `getPortalContext()`. Admins can view `/settings` only while impersonating a client, which matches the existing dashboard support model.
- Business unblock: Nick can now reconnect his own YouTube account from the client portal instead of needing an admin-initiated OAuth flow.

## S68 Settings OAuth Redirect + Brand Logo Fix

- Issue: Clicking Reconnect from `/settings` while admin-impersonating a client could land on the wrong page instead of completing the OAuth flow back to Settings. Root cause: `resolveOAuthClientForInitiation()` treated every admin session without an explicit `client_id` query param as `client_id_required`. The new Settings page intentionally omits `client_id`, so admin-impersonated Settings flows were rejected before reaching Instagram/TikTok/YouTube OAuth.
- Fix: `resolveOAuthClientForInitiation()` now checks the existing `dropclix_impersonate_client_id` cookie for admin sessions when no explicit `client_id` is supplied. Admin panel links with explicit `client_id` still create `origin='admin'`; admin-impersonated Settings links create `origin='client'`; real client sessions still use only their own `users.client_id`.
- Security: This preserves the S66 trust fix. Query-string `client_id` remains admin-only, client sessions cannot choose another client, and callback writes still require signed state + nonce + session authorization.
- UI: `SettingsClient` no longer renders platform initials (`IN`, `TI`, `YO`). It now uses inline Instagram, TikTok, and YouTube SVG brand marks matching the existing pipeline link-button pattern. Admin connection sections did not have the same initial-placeholder logo pattern.
- Standing rule: all future platform-identification UI must use actual brand logos/SVG marks rather than text initials as the visual icon.

## S69 Meta Ads OAuth Signed-State Fix

- Issue: Meta Ads OAuth was built after Instagram/TikTok/YouTube but still used raw `state=client_id`. The callback trusted that state and wrote `platform_connections` with `createAdminClient()`, leaving Meta Ads outside the S66 signed-state protection.
- Fix: `src/lib/oauth-state.ts` now includes `meta_ads` as a supported OAuth platform. `/api/auth/meta-ads` resolves the authorized client from the current session, signs state with platform/client/origin/nonce/timestamp, and sets an httpOnly nonce cookie. `/api/auth/meta-ads/callback` verifies signed state + nonce + session authorization before token exchange or any database write.
- Preserved behavior: Admin Meta Ads Connect/Reconnect still accepts explicit `client_id` from the admin panel and redirects back to `/admin`. No client-facing Meta Ads settings UI or ad-account selector was added in this session.
- Known next build: Meta Ads still auto-selects the first active account returned by Graph `/me/adaccounts`. Day 1 returned both `act_649411569080714` ("Chase Evans") and `act_1196633849221825` ("Day 1 | D 1"), so a future account-selector step is needed before reconnecting to choose the intended account.

## S70 Meta Ads Account Selector Notes

- Issue: Meta Ads OAuth selected the first active ad account returned by Graph `/me/adaccounts`, which picked `act_649411569080714` ("Chase Evans") ahead of the intended Day 1 account `act_1196633849221825` when both were active.
- Fix: Meta Ads callback now requests `id,name,account_status,business`. If zero active accounts are returned, it keeps the existing error redirect. If exactly one active account is returned, it auto-connects immediately as before. If multiple active accounts are returned, it creates a short-lived pending selection and redirects to an account selector instead of writing `platform_connections` immediately.
- Security: Pending account selection uses `src/lib/oauth-pending-selection.ts`. It stores the long-lived Facebook token and account list in an encrypted, signed, httpOnly cookie with a 15-minute max age. The URL carries only a signed selector token. The final server action re-validates the current session, client ownership, origin (`admin` or `client`), token expiry, and chosen account before writing `platform_connections`.
- UX: Admin-origin selection route is `/admin/meta-ads/select`; client-origin selection route is `/settings/meta-ads/select`. Both list ad account name, account ID, and Business name when Graph returns it. A single-account OAuth flow skips this UI entirely.
- Client Settings: `/settings` now includes a Meta Ads card with the Meta logo, Connect/Reconnect only, and no client-facing Sync Now. Admin Sync Now remains the only manual Meta Ads sync surface.
- Gotcha: No Supabase migration is required for the selector; the pending state is intentionally cookie-backed to avoid storing temporary OAuth tokens in a table and to keep the flow self-expiring. If account lists grow large enough to risk cookie size limits, move the same payload to a server-side pending table before adding more asset selectors.

## S71 Admin Connections Popup Notes

- UI consolidation: Admin no longer renders four standalone connection sections below the client list. Each client card now has a `Connections` button that opens `AdminConnectionsPopup`, showing Instagram, TikTok, YouTube, and Meta Ads rows in one per-client surface.
- Data flow: `admin/page.tsx` still fetches all four platform connection sets in the existing single `Promise.all` pass. It now groups them into `connectionsByClient` and passes that map to `AdminClientsSection`; no per-client refetching was added.
- Behavior preserved: Sync Now still posts `{ client_id: clientId }` to the existing platform routes. Reconnect/Connect still hit the existing OAuth initiation URLs with `?client_id=...`. Instagram/TikTok/Meta Ads keep Disconnect; YouTube still has no Disconnect action.
- UI rule: Platform action slots are rendered in a consistent order across all four rows: Connect, Sync Now, Reconnect, Disconnect. Unsupported or inactive actions are hidden in-place rather than changing the row order, so the popup scans uniformly.
- Shared logo cleanup: Instagram, TikTok, YouTube, and Meta logos now live in `src/components/portal/PlatformLogos.tsx`. `SettingsClient` and the admin popup use the shared logo components. Keep future platform identity UI on these actual SVG marks, never text initials.
- OAuth redirect notices: Admin-level success/error notices for `yt_*`, `ig_*`, `tt_*`, and `meta_ads_*` URL params are handled in `AdminClientsSection`, since the old standalone sections are no longer visible.
- Gotcha: This was layout/UI only. Do not infer any OAuth, sync, token refresh, or signed-state logic change from this session.

## S72 Unlinked Video Discovery Notes

- Build: Added passive unlinked video discovery across Instagram, TikTok, and YouTube. Discovery creates rows in `unlinked_video_discoveries` only. It never writes to `pipeline_items` until an admin explicitly clicks Link, Create, or Ignore.
- Schema: New migration `supabase/migrations/session_72_unlinked_video_discoveries.sql` creates `unlinked_video_discoveries` with `UNIQUE (client_id, platform, platform_video_id)`, status values `unlinked | linked | ignored`, and admin-only RLS. The terminal SQL RPC helpers are not available in this project, so apply this migration in Supabase SQL Editor before expecting live discovery rows.
- Instagram: `instagram-sync.ts` already sees all `/media` items. When shortcode resolution fails, it now records an unlinked discovery with shortcode, permalink, caption, thumbnail, timestamp, likes, and comments instead of only logging and discarding it.
- TikTok: `tiktok-sync.ts` now runs a `video/list` discovery pass alongside the existing linked-ID `video/query` sync. It records unmatched TikTok videos with title, cover image, create time, views, likes, comments, and shares.
- YouTube: `video-polling.ts` now has `discoverYouTubeUnlinkedUploads()` using the connected channel's uploads playlist. `/api/admin/sync-youtube` calls it during Sync Now. This is separate from `pollPipelineItem()` and does not change the S39 no-fuzzy-matching polling rule.
- Dashboard: `DashboardClient` shows an admin-only `Unlinked Videos` section when the viewer is an admin impersonating a client. Regular client sessions do not fetch or render discoveries.
- Linking UI: Clicking a discovery opens a centered modal with platform logo, thumbnail, API title/caption, publish date, and metrics. Admin can search existing pipeline items, link the selected item, create a new POSTED pipeline item from the discovery, or ignore it permanently.
- Linking UI follow-up: The discovery modal now fetches `pipeline_items.ig_video_id`, `tt_video_id`, and `yt_video_id` for dashboard pipeline matches. Search results show existing platform logo + video ID chips so admin can confirm the selected pipeline item is the same content before linking.
- Linking UI follow-up: If the selected pipeline item already has a different video ID for the discovery's platform, the modal shows a platform conflict warning and disables `Link Selected Item`. The server action still blocks the same conflict; the UI just surfaces it earlier.
- Cross-platform suggestions: The modal computes display-only "Possible Same Content, Other Platforms" candidates from currently fetched unlinked discoveries: same client, `status='unlinked'`, different platform, different discovery id, and `published_at` within +/- 1 day, sorted by date proximity then light title-overlap score. Suggestions are clickable for review only and never auto-link or write to `pipeline_items`.
- Linking behavior: Link/Create writes the explicit platform video ID to the correct `pipeline_items` column, ensures the matching `posts` row through existing `ensureIGPostsRow` / `ensureTTPostsRow` / `ensureYTPostsRow`, triggers `syncLinkedVideoNow()`, and marks the discovery `linked`.
- Guardrails: No automatic pipeline writes during discovery. No fuzzy title/date auto-linking. `pipeline_items.title` remains the display title source; API captions/titles are candidate metadata only unless an admin creates a new pipeline item from the discovery.

## S45 Bug Fix Notes

- Issue: Analytics tab displayed YouTube video captions (from YT API) instead of the admin-curated titles in `pipeline_items.title`. Root cause: `analytics/page.tsx` fetched `posts.title` only and never fetched `pipeline_items.title`. Meanwhile, `video-polling.ts`, `linkYouTubeVideo()`, and `ensureYTPostsRow()` all wrote the raw YT API caption into `pipeline_items.title` on every poll or link save, silently overwriting the admin title.
- Fix: `analytics/page.tsx` now fetches `title` from `pipeline_items` alongside the existing video ID columns. A `pipelineTitleByPostId` map resolves the display title from pipeline (by video ID or post_id segment) before falling back to `posts.title`. `PostRow.title` is now always the pipeline title when a matching pipeline item exists.
- Fix: `video-polling.ts` `updateVideoMetadata()` now uses two separate update objects — `pipelineUpdate` (thumbnail only, no title) and `postUpdate` (title + thumbnail). The YT API caption is only ever written to `posts.title` (API metadata), never to `pipeline_items.title`.
- Fix: `edit-actions.ts` `linkYouTubeVideo()` same split — pipeline gets `thumbnail_url` only; posts gets `title` + `thumbnail_url`.
- Fix: `edit-actions.ts` `ensureYTPostsRow()` same split for existing-row updates; stub row creation now uses `item.title` (pipeline title) instead of `video?.title` (YT API caption).
- Gotcha: `pipeline_items.title` is the ONLY display title source across the entire portal. When adding any new sync route or metadata update, always check: does this write overwrite `pipeline_items.title`? If yes, remove it. The rule is in the Security Rules section of CLAUDE.md and must never be broken.

## S44 Bug Fix Notes

- Issue: Analytics ID display stayed on `posts.post_id` (often `#yt...`) even when the IG/TT platform pill was active. Root cause: Analytics loaded rows from `posts` and rendered `post.postId` directly; the platform filter was never passed into ID segment selection. Fix: Analytics now carries `pipeline_items.post_id` as `pipelinePostId` via video ID / post segment lookup and uses platform-aware display logic for table IDs, search, charts, slide-over headers, snapshots, and save toasts. Source of truth remains `pipeline_items.post_id`.
- Issue: IG/TT linked + posted pipeline items did not auto-appear in Analytics. Root cause: only YouTube called `ensureYTPostsRow`; IG/TT link save and Mark as Posted only stored `ig_video_id` / `tt_video_id` on `pipeline_items` and never created a `posts` row for `post_analytics` to reference. Fix: added `ensureIGPostsRow()` and `ensureTTPostsRow()` in `edit-actions.ts`, wired them after IG/TT link save and Mark as Posted. They extract the matching `#ig` / `#tt` segment from pipe-separated `pipeline_items.post_id`, insert only if missing, and never generate or renumber IDs.
- Gotcha: The `posts` table has no `ig_id` or `tt_id` columns. Do not write those fields. IG/TT video IDs live on `pipeline_items`; `posts` rows are keyed by platform-specific `post_id` segments and sync routes resolve through the pipeline link columns.
