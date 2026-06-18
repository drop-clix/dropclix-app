import { createAdminClient } from '@/lib/supabase/admin'
import { fetchYouTubePublicVideo, type YouTubePublicVideo } from '@/lib/youtube-public'

type SupabaseAdmin = ReturnType<typeof createAdminClient>
type MetricWindow = 'live' | 'w24' | 'w3' | 'w7' | 'eom'
type PollStats = {
  views: number
  client_views?: number | null
  likes: number
  comments: number
  shares?: number | null
  saves?: number | null
  followers?: number | null
  watch_pct?: number | null
  impressions?: number | null
  ctr?: number | null
  yt_id?: string | null
  yt_video_id?: string | null
}

// ── YouTube Data API v3 (public stats — YOUTUBE_API_KEY, no OAuth) ────────

export async function fetchYTPublicStats(videoId: string): Promise<{
  views: number; likes: number; comments: number
} | null> {
  console.log(`[poll] → YT Data API: ${videoId}`)
  const video = await fetchYouTubePublicVideo(videoId)
  if (!video) {
    console.log(`[poll] YT Data API: no stats for ${videoId} (private, deleted, or invalid ID)`)
    return null
  }

  const result = video.stats
  console.log(`[poll] YT stats ${videoId}: views=${result.views} likes=${result.likes} comments=${result.comments}`)
  return result
}

// ── Upsert post_analytics (preserves prev data point for interpolation) ───

export async function upsertPolledStats(
  admin: SupabaseAdmin,
  postUUID: string,
  clientId: string,
  platform: string,
  metricWindow: MetricWindow,
  stats: PollStats,
): Promise<boolean> {
  const { data: existing, error: existingError } = await admin
    .from('post_analytics')
    .select('views, recorded_at')
    .eq('post_id', postUUID)
    .eq('client_id', clientId)
    .eq('platform', platform)
    .eq('metric_window', metricWindow)
    .single()

  if (existingError && existingError.code !== 'PGRST116') {
    console.error('[poll] existing analytics lookup failed:', existingError.message, existingError.code, existingError.details)
  }

  const now = new Date().toISOString()
  const prevViews = (existing as any)?.views ?? null
  const prevRecordedAt = (existing as any)?.recorded_at ?? null

  console.log('[poll] upserting post_analytics:', {
    postUUID,
    clientId,
    platform,
    metricWindow,
    views: stats.views,
  })

  const payload: Record<string, unknown> = {
    post_id:          postUUID,
    client_id:        clientId,
    platform,
    metric_window:    metricWindow,
    views:            stats.views,
    likes:            stats.likes,
    comments:         stats.comments,
    prev_views:       prevViews,
    prev_recorded_at: prevRecordedAt,
    last_polled_at:   now,
    recorded_at:      now,
  }

  if (stats.shares !== undefined) payload.shares = stats.shares
  if (stats.client_views !== undefined) payload.client_views = stats.client_views
  if (stats.saves !== undefined) payload.saves = stats.saves
  if (stats.followers !== undefined) payload.followers = stats.followers
  if (stats.watch_pct !== undefined) payload.watch_pct = stats.watch_pct
  if (stats.impressions !== undefined) payload.impressions = stats.impressions
  if (stats.ctr !== undefined) payload.ctr = stats.ctr
  if (stats.yt_id !== undefined) payload.yt_id = stats.yt_id
  if (stats.yt_video_id !== undefined) payload.yt_video_id = stats.yt_video_id

  const { error } = await admin.from('post_analytics').upsert(payload, { onConflict: 'post_id,platform,metric_window' })

  if (error) {
    console.error('[poll] upsert failed:', error.message, error.code, error.details)
    return false
  }

  console.log('[poll] upsert ok:', { postUUID, platform, metricWindow })
  return true
}

// ── Snapshot scheduling (T+24hr, T+72hr, T+168hr, EOM) ───────────────────

export async function scheduleSnapshotsIfNew(
  admin: SupabaseAdmin,
  postUUID: string,
  clientId: string,
  pipelineItemId: string | null,
  postedAt: string,
): Promise<void> {
  const { data: existing } = await admin
    .from('snapshot_jobs')
    .select('id')
    .eq('post_id', postUUID)
    .limit(1)

  if (existing && existing.length > 0) return

  const base = new Date(postedAt)
  const jobs = [
    { window_type: '24hr', target_time: new Date(base.getTime() + 24 * 3600_000).toISOString() },
    { window_type: '3day', target_time: new Date(base.getTime() + 72 * 3600_000).toISOString() },
    { window_type: '7day', target_time: new Date(base.getTime() + 168 * 3600_000).toISOString() },
    { window_type: 'eom',  target_time: endOfMonth(base).toISOString() },
  ]

  await admin.from('snapshot_jobs').upsert(
    jobs.map(j => ({
      post_id:          postUUID,
      client_id:        clientId,
      pipeline_item_id: pipelineItemId,
      ...j,
    })),
    { onConflict: 'post_id,window_type', ignoreDuplicates: true },
  )
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
}

function windowTypeToMetricWindow(windowType: string): MetricWindow | null {
  if (windowType === '24hr') return 'w24'
  if (windowType === '3day') return 'w3'
  if (windowType === '7day') return 'w7'
  if (windowType === 'eom') return 'eom'
  return null
}

// ── Execute due snapshot jobs ─────────────────────────────────────────────

export async function runDueSnapshots(admin: SupabaseAdmin): Promise<number> {
  const now = new Date().toISOString()

  const { data: jobs } = await admin
    .from('snapshot_jobs')
    .select('id, post_id, client_id, pipeline_item_id, window_type')
    .eq('captured', false)
    .lte('target_time', now)
    .limit(20)

  if (!jobs || jobs.length === 0) return 0

  let captured = 0
  for (const job of jobs as any[]) {
    const metricWindow = windowTypeToMetricWindow(job.window_type)
    if (!metricWindow) continue

    const { data: liveRows } = await admin
      .from('post_analytics')
      .select('platform, views, client_views, likes, comments, shares, saves, followers, watch_pct, impressions, ctr, yt_id, yt_video_id')
      .eq('post_id', job.post_id)
      .eq('client_id', job.client_id)
      .eq('metric_window', 'live')
      .limit(10)

    if (!liveRows || liveRows.length === 0) continue

    let wroteAnyWindow = false
    let snapshotWritten = false

    for (const live of liveRows as any[]) {
      const platform = live.platform ?? 'yt'
      const { data: existingLocked } = await admin
        .from('post_analytics')
        .select('id')
        .eq('post_id', job.post_id)
        .eq('client_id', job.client_id)
        .eq('platform', platform)
        .eq('metric_window', metricWindow)
        .limit(1)

      if (existingLocked && existingLocked.length > 0) {
        wroteAnyWindow = true
        continue
      }

      const views     = live.views     ?? 0
      const likes     = live.likes     ?? 0
      const comments  = live.comments  ?? 0
      const shares    = live.shares    ?? 0
      const saves     = live.saves     ?? 0
      const followers = live.followers ?? 0
      const didUpsert = await upsertPolledStats(admin, job.post_id, job.client_id, platform, metricWindow, {
        views,
        client_views: live.client_views ?? null,
        likes,
        comments,
        shares,
        saves,
        followers,
        watch_pct: live.watch_pct ?? 0,
        impressions: live.impressions ?? 0,
        ctr: live.ctr ?? 0,
        yt_id: live.yt_id ?? null,
        yt_video_id: live.yt_video_id ?? null,
      })

      if (!didUpsert) continue
      wroteAnyWindow = true

      // analytics_snapshots has no platform column, so preserve its legacy
      // one-row-per-post/window record while platform-specific locked rows
      // live in post_analytics above.
      if (!snapshotWritten) {
        const erNumerator = platform === 'yt'
          ? likes + comments + shares + followers
          : likes + comments + shares + saves
        const erPct = views > 0 ? (erNumerator / views) * 100 : 0

        await admin.from('analytics_snapshots').upsert({
          post_id:          job.post_id,
          client_id:        job.client_id,
          pipeline_item_id: job.pipeline_item_id,
          window_type:      job.window_type,
          views, likes, comments, shares, saves,
          er_pct: erPct,
          captured_at: now,
        }, { onConflict: 'post_id,window_type', ignoreDuplicates: true })
        snapshotWritten = true
      }
    }

    if (wroteAnyWindow) {
      await admin.from('snapshot_jobs').update({ captured: true }).eq('id', job.id)
      captured++
    }
  }

  return captured
}

// ── Pipeline item type ────────────────────────────────────────────────────

export type PollablePipelineItem = {
  id: string
  post_id: string
  client_id: string
  platform: string[]
  posted_at: string | null
  yt_video_id: string | null
  tt_video_id: string | null
  ig_video_id: string | null
}

// ── Resolve posts UUID from a pipeline item (3 strategies) ───────────────
//
// 1. Exact post_id match (simple IDs like "#yt0087")
// 2. Pipe-split match (multi-platform items like "#ig0037 | #tt0007 | #yt0087")
// 3. yt_id fallback (matches posts.yt_id = yt_video_id — most reliable for YT)

async function resolvePostsUUID(
  admin: SupabaseAdmin,
  item: PollablePipelineItem,
): Promise<string | null> {
  // Strategy 1: exact post_id
  const { data: exact } = await admin.from('posts').select('id')
    .eq('post_id', item.post_id).eq('client_id', item.client_id).maybeSingle()
  if (exact) return (exact as any).id

  // Strategy 2: pipe-split (admin entered "#ig0037 | #tt0007 | #yt0087" as post_id)
  if (item.post_id.includes('|')) {
    const parts = item.post_id.split('|').map((s: string) => s.trim()).filter(Boolean)
    for (const part of parts) {
      const { data } = await admin.from('posts').select('id')
        .eq('post_id', part).eq('client_id', item.client_id).maybeSingle()
      if (data) { console.log(`[poll] resolved ${item.post_id} → ${part} via pipe-split`); return (data as any).id }
    }
  }

  // Strategy 3: yt_id fallback
  if (item.yt_video_id) {
    const { data } = await admin.from('posts').select('id')
      .eq('yt_id', item.yt_video_id).eq('client_id', item.client_id).maybeSingle()
    if (data) { console.log(`[poll] resolved ${item.post_id} → yt_id=${item.yt_video_id} via yt_id fallback`); return (data as any).id }
  }

  return null
}

async function updateVideoMetadata(
  admin: SupabaseAdmin,
  item: PollablePipelineItem,
  postUUID: string,
  video: YouTubePublicVideo,
): Promise<void> {
  // pipeline_items.title is the source of truth — never overwrite it from the API
  const pipelineUpdate: Record<string, string> = {}
  if (video.thumbnailUrl) pipelineUpdate.thumbnail_url = video.thumbnailUrl

  if (Object.keys(pipelineUpdate).length > 0) {
    const { error: pipeErr } = await admin
      .from('pipeline_items')
      .update(pipelineUpdate)
      .eq('id', item.id)
      .eq('client_id', item.client_id)
    if (pipeErr) console.error('[poll] pipeline metadata update failed:', pipeErr.message)
  }

  // posts.title stores API metadata only; safe to write YT caption here
  const postUpdate: Record<string, string> = {}
  if (video.title) postUpdate.title = video.title
  if (video.thumbnailUrl) postUpdate.thumbnail_url = video.thumbnailUrl

  if (Object.keys(postUpdate).length > 0) {
    const { error: postErr } = await admin
      .from('posts')
      .update(postUpdate)
      .eq('id', postUUID)
      .eq('client_id', item.client_id)
    if (postErr) console.error('[poll] posts metadata update failed:', postErr.message)
  }
}

// ── Poll a single pipeline item ───────────────────────────────────────────
//
// Source of truth: yt_video_id on pipeline_items (set by admin via Mark as Posted modal or YT link modal).
// No auto-discover. No fuzzy matching. If yt_video_id is not set, skip.

export async function pollPipelineItem(
  admin: SupabaseAdmin,
  item: PollablePipelineItem,
): Promise<{ polled: boolean; reason?: string }> {
  if (!item.yt_video_id) {
    console.log(`[poll] skip ${item.post_id} (${item.id}): yt_video_id not set`)
    return { polled: false, reason: 'no_yt_video_id' }
  }

  console.log(`[poll] polling ${item.post_id} (pipeline ${item.id}) yt_video_id=${item.yt_video_id}`)

  const video = await fetchYouTubePublicVideo(item.yt_video_id)
  if (!video) {
    console.log(`[poll] skip ${item.post_id}: YT API returned no data`)
    return { polled: false, reason: 'yt_api_null' }
  }
  const stats = video.stats

  // Resolve posts UUID for post_analytics FK (3-strategy)
  const postUUID = await resolvePostsUUID(admin, item)

  if (!postUUID) {
    // Stats were fetched but we can't write to post_analytics without a posts row.
    // Admin must import the post via Studio CSV import, or the Mark as Posted flow
    // will auto-create a stub posts row (ensureYTPostsRow in edit-actions.ts).
    console.log(`[poll] ${item.post_id}: no posts row found (tried exact, pipe-split, yt_id) — skipping`)
    return { polled: false, reason: 'no_posts_row' }
  }

  await updateVideoMetadata(admin, item, postUUID, video)

  console.log(`[poll] ${item.post_id} → posts UUID=${postUUID} — writing to post_analytics live`)

  const didUpsert = await upsertPolledStats(admin, postUUID, item.client_id, 'yt', 'live', {
    ...stats,
    yt_id: item.yt_video_id,
    yt_video_id: item.yt_video_id,
  })
  if (!didUpsert) {
    return { polled: false, reason: 'upsert_failed' }
  }

  if (item.posted_at) {
    await scheduleSnapshotsIfNew(admin, postUUID, item.client_id, item.id, item.posted_at)
  }

  console.log(`[poll] ✓ ${item.post_id} written — views=${stats.views} likes=${stats.likes} comments=${stats.comments}`)
  return { polled: true }
}

export async function syncSingleYTVideo(
  clientId: string,
  ytVideoId: string,
): Promise<{ synced: number; error?: string }> {
  const admin = createAdminClient()
  const { data: item, error } = await admin
    .from('pipeline_items')
    .select('id, post_id, client_id, platform, posted_at, yt_video_id, tt_video_id, ig_video_id')
    .eq('client_id', clientId)
    .eq('yt_video_id', ytVideoId)
    .maybeSingle()

  if (error || !item) {
    return { synced: 0, error: error?.message ?? `No pipeline item found for YouTube video ${ytVideoId}` }
  }

  const result = await pollPipelineItem(admin, item as PollablePipelineItem)
  if (!result.polled) {
    return { synced: 0, error: result.reason ?? `YouTube video ${ytVideoId} was not synced` }
  }

  return { synced: 1 }
}

// ── Query helpers for cron routes ─────────────────────────────────────────
//
// Only returns POSTED items with at least one linked platform video ID.
// Archive tier (maxAgeDays=null) includes items with posted_at IS NULL
// so historical imports without a posted date still get polled.

export async function getPostableItemsInAgeRange(
  admin: SupabaseAdmin,
  minAgeDays: number,
  maxAgeDays: number | null,
): Promise<PollablePipelineItem[]> {
  const now = Date.now()
  const maxDate = new Date(now - minAgeDays * 86400_000).toISOString()

  // Cast to any to avoid TS2589 (Supabase query builder type chain too deep)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin
    .from('pipeline_items')
    .select('id, post_id, client_id, platform, posted_at, yt_video_id, tt_video_id, ig_video_id')
    .eq('status', 'POSTED')
    .or('yt_video_id.not.is.null,tt_video_id.not.is.null,ig_video_id.not.is.null')

  if (maxAgeDays === null) {
    // Archive tier: posted_at older than minAgeDays OR posted_at IS NULL
    q = q.or(`posted_at.lte.${maxDate},posted_at.is.null`)
  } else {
    // Fresh/recent tiers: items within the date window (posted_at must be set)
    const minDate = new Date(now - maxAgeDays * 86400_000).toISOString()
    q = q
      .not('posted_at', 'is', null)
      .gte('posted_at', minDate)
      .lte('posted_at', maxDate)
  }

  const { data, error } = await q
  if (error) console.error('[poll] query error:', error.message)

  const items = (data ?? []) as PollablePipelineItem[]
  const tierLabel = maxAgeDays === null
    ? `${minAgeDays}d+`
    : `${minAgeDays}–${maxAgeDays}d`

  console.log(`[poll] getPostableItemsInAgeRange(${tierLabel}): ${items.length} items with linked platform video IDs`)
  for (const item of items) {
    console.log(`[poll]   ${item.post_id} (${item.id}) yt=${item.yt_video_id ?? 'NULL'} ig=${item.ig_video_id ?? 'NULL'} tt=${item.tt_video_id ?? 'NULL'} posted_at=${item.posted_at ?? 'NULL'}`)
  }

  return items
}
