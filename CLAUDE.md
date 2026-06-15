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

## FIRES — ACTIVE INCIDENTS
See `/fires/` folder for full incident reports.
- 2026-06-15: **Client data contamination** — Nick's posts rows being rebuilt (IN PROGRESS) → `fires/2026-06-15-client-data-contamination.md`
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
- **Cron polling model (S40)**: Source of truth = `pipeline_items.yt_video_id` set by admin via Mark as Posted modal or YT link button. No link = not polled. Cron writes current public YT totals to `post_analytics.metric_window='live'` only, then `runDueSnapshots()` copies live into locked windows only when jobs are due (`24hr→w24`, `3day→w3`, `7day→w7`, `eom→eom`). Archive tier (`maxAgeDays=null`) includes `posted_at IS NULL`. `pollPipelineItem(admin, item)` resolves UUID internally from `posts` via exact post_id → pipe-split → yt_id fallback.
- **Cron routes**: `/api/cron/poll-fresh|recent|archive` — Hobby plan → daily only. Pro plan enables `*/2`, `*/10`, `0 */6` schedules. Routes respond to GET with `CRON_SECRET` bearer auth (optional). Can be triggered manually. Response includes `checked`, `polled`, `skipped`, `skip_reasons`, `snapshots`.
- **Proxy API bypass**: `proxy.ts` passes all `/api/` routes through without session check (`if (pathname.startsWith('/api/')) return supabaseResponse`). API routes handle their own auth. Without this, cron routes redirect to `/login`.
- **analytics_snapshots**: permanent records, never overwrite (`UNIQUE (post_id, window_type)`). `snapshot_jobs` drives the scheduling (T+24hr/3day/7day/EOM). S40 snapshots copy from the `live` row and write the corresponding locked `post_analytics` window once; normal syncs do not overwrite locked windows. Both tables have RLS. Migration: `session_37_snapshots.sql`; live support migration: `session_40_live_analytics.sql`.
- **useInterpolatedStat hook**: `src/hooks/useInterpolatedStat.ts`. Requires `prev_views`+`prev_recorded_at` on the analytics row. Only interpolates within `maxAgeDays` (default 7). Snaps to real value on every `current` change. Applied via `AnalyticsTableRow` component in AnalyticsClient.
- **AnalyticsTableRow**: standalone component (not inline map) so `useInterpolatedStat` can be called as a hook. Accepts `post, index, activeWin, pillarColors, onOpen, onSave` props.
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
- YouTube: 53 videos (`#yt0001`–`#yt0039` Shorts, `#LF0001`–`#LF0014` LF). Re-import: `node scripts/ingest-yt-csv.mjs <csv> --run`

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
