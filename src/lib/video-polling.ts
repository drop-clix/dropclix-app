import { createAdminClient } from '@/lib/supabase/admin'
import { getYouTubeConnection } from '@/lib/youtube-auth'
import { erToDecision } from '@/lib/decision'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

// ── YouTube Data API v3 (public stats, no OAuth needed) ───────────────────

export async function fetchYTPublicStats(videoId: string): Promise<{
  views: number; likes: number; comments: number
} | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    console.warn('[poll] YOUTUBE_API_KEY not set')
    return null
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${key}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) {
    console.error('[poll] YT Data API error:', res.status, await res.text())
    return null
  }

  const json = await res.json()
  const stats = json.items?.[0]?.statistics
  if (!stats) return null

  return {
    views:    parseInt(stats.viewCount    ?? '0', 10),
    likes:    parseInt(stats.likeCount    ?? '0', 10),
    comments: parseInt(stats.commentCount ?? '0', 10),
  }
}

// ── Update post_analytics with latest stats (preserving prev data point) ──

export async function upsertPolledStats(
  admin: SupabaseAdmin,
  postUUID: string,
  clientId: string,
  platform: string,
  metricWindow: string,
  stats: { views: number; likes: number; comments: number },
): Promise<void> {
  // Read existing row to preserve previous data point for interpolation
  const { data: existing } = await admin
    .from('post_analytics')
    .select('views, recorded_at')
    .eq('post_id', postUUID)
    .eq('client_id', clientId)
    .eq('platform', platform)
    .eq('metric_window', metricWindow)
    .single()

  const now = new Date().toISOString()
  const prevViews = (existing as any)?.views ?? null
  const prevRecordedAt = (existing as any)?.recorded_at ?? null

  const er = stats.views > 0
    ? ((stats.likes + stats.comments) / stats.views) * 100
    : 0

  await admin.from('post_analytics').upsert({
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
    decision:         erToDecision(er),
  }, { onConflict: 'post_id,platform,metric_window' })
}

// ── Snapshot scheduling (T+24hr, T+72hr, T+168hr, EOM) ───────────────────

export async function scheduleSnapshotsIfNew(
  admin: SupabaseAdmin,
  postUUID: string,
  clientId: string,
  pipelineItemId: string | null,
  postedAt: string,
): Promise<void> {
  // Check if snapshot jobs already exist for this post
  const { data: existing } = await admin
    .from('snapshot_jobs')
    .select('id')
    .eq('post_id', postUUID)
    .limit(1)

  if (existing && existing.length > 0) return // already scheduled

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

// ── Execute due snapshot jobs ─────────────────────────────────────────────

export async function runDueSnapshots(admin: SupabaseAdmin): Promise<number> {
  const now = new Date().toISOString()

  // Get due, uncaptured jobs
  const { data: jobs } = await admin
    .from('snapshot_jobs')
    .select('id, post_id, client_id, pipeline_item_id, window_type')
    .eq('captured', false)
    .lte('target_time', now)
    .limit(20)

  if (!jobs || jobs.length === 0) return 0

  let captured = 0
  for (const job of jobs as any[]) {
    // Read current stats from post_analytics (best window)
    const { data: rows } = await admin
      .from('post_analytics')
      .select('views, likes, comments, shares, saves, metric_window')
      .eq('post_id', job.post_id)
      .eq('client_id', job.client_id)

    if (!rows || rows.length === 0) continue

    // Pick best available window data
    const priority = ['eom', 'w7', 'w3', 'w24']
    const best = (rows as any[]).sort((a: any, b: any) =>
      priority.indexOf(a.metric_window) - priority.indexOf(b.metric_window)
    )[0]

    if (!best) continue

    const views = best.views ?? 0
    const likes = best.likes ?? 0
    const comments = best.comments ?? 0
    const shares = best.shares ?? 0
    const saves = best.saves ?? 0
    const erPct = views > 0 ? ((likes + comments + shares + saves) / views) * 100 : 0

    await admin.from('analytics_snapshots').upsert({
      post_id:          job.post_id,
      client_id:        job.client_id,
      pipeline_item_id: job.pipeline_item_id,
      window_type:      job.window_type,
      views, likes, comments, shares, saves,
      er_pct: erPct,
      captured_at: now,
    }, { onConflict: 'post_id,window_type', ignoreDuplicates: true })

    await admin.from('snapshot_jobs').update({ captured: true }).eq('id', job.id)
    captured++
  }

  return captured
}

// ── Auto-discover new YT uploads for a client ────────────────────────────

export async function autoDiscoverYTUploads(
  admin: SupabaseAdmin,
  clientId: string,
): Promise<number> {
  const conn = await getYouTubeConnection(clientId)
  if (!conn?.channel_id || !conn.access_token) return 0

  // Uploads playlist ID = channel ID with UC → UU
  const uploadsPlaylistId = conn.channel_id.replace(/^UC/, 'UU')

  const key = process.env.YOUTUBE_API_KEY
  const params = new URLSearchParams({
    part: 'snippet',
    maxResults: '50',
    playlistId: uploadsPlaylistId,
    ...(key ? { key } : {}),
  })

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
    { headers: { Authorization: `Bearer ${conn.access_token}` } },
  )
  if (!res.ok) return 0

  const json = await res.json()
  const items: any[] = json.items ?? []
  if (items.length === 0) return 0

  // Get existing yt_ids for this client
  const { data: existingRows } = await admin
    .from('post_analytics')
    .select('yt_id')
    .eq('client_id', clientId)
    .not('yt_id', 'is', null)

  const knownYtIds = new Set(
    (existingRows as any[] ?? []).map((r: any) => r.yt_id).filter(Boolean)
  )

  // Get pipeline items for fuzzy date matching
  const { data: pipeItems } = await admin
    .from('pipeline_items')
    .select('id, post_id, posted_at, scheduled_date')
    .eq('client_id', clientId)
    .eq('status', 'POSTED')
    .not('posted_at', 'is', null)

  let discovered = 0

  for (const item of items) {
    const videoId: string = item.snippet?.resourceId?.videoId
    const publishedAt: string = item.snippet?.publishedAt
    const title: string = item.snippet?.title ?? ''

    if (!videoId || knownYtIds.has(videoId)) continue

    // Try to fuzzy-match a pipeline item by date ±24h
    const publishTime = new Date(publishedAt).getTime()
    const matchedPipe = (pipeItems as any[] ?? []).find((p: any) => {
      const pTime = new Date(p.posted_at).getTime()
      return Math.abs(pTime - publishTime) < 24 * 3600_000
    })

    if (!matchedPipe) continue // don't create orphaned analytics rows

    // Look up or create the posts row
    const { data: postRow } = await admin
      .from('posts')
      .select('id')
      .eq('client_id', clientId)
      .eq('post_id', matchedPipe.post_id)
      .single()

    if (!postRow) continue

    // Upsert analytics row with the discovered video ID
    await admin.from('post_analytics').upsert({
      post_id:       (postRow as any).id,
      client_id:     clientId,
      platform:      'yt',
      metric_window: 'eom',
      yt_id:         videoId,
      yt_video_id:   videoId,
      views: 0, likes: 0, comments: 0, shares: 0, saves: 0,
      last_polled_at: null,
      recorded_at:    new Date().toISOString(),
    }, { onConflict: 'post_id,platform,metric_window', ignoreDuplicates: true })

    // Mark the pipeline item with the discovered YT video ID
    await admin.from('pipeline_items')
      .update({ yt_video_id: videoId })
      .eq('id', matchedPipe.id)

    knownYtIds.add(videoId)
    discovered++
    console.log(`[poll] Auto-discovered YT video ${videoId} → ${matchedPipe.post_id}`)
  }

  return discovered
}

// ── Main poll function for a single pipeline item ─────────────────────────

export type PollablePipelineItem = {
  id: string
  post_id: string
  client_id: string
  platform: string[]
  posted_at: string
  yt_video_id: string | null
  tt_video_id: string | null
  ig_video_id: string | null
}

export async function pollPipelineItem(
  admin: SupabaseAdmin,
  item: PollablePipelineItem,
  postUUID: string | null,
  pipelineItemId: string,
): Promise<{ polled: boolean; error?: string }> {
  if (!postUUID) return { polled: false, error: 'no post UUID' }

  let polled = false

  // YouTube
  if (item.yt_video_id) {
    const stats = await fetchYTPublicStats(item.yt_video_id)
    if (stats) {
      await upsertPolledStats(admin, postUUID, item.client_id, 'yt', 'eom', stats)
      await scheduleSnapshotsIfNew(admin, postUUID, item.client_id, pipelineItemId, item.posted_at)
      polled = true
    }
  }

  // TikTok (stub — requires video.list scope + approved app)
  // if (item.tt_video_id) { ... }

  // Instagram (stub — requires media API scope)
  // if (item.ig_video_id) { ... }

  return { polled }
}

// ── Query helpers for cron routes ─────────────────────────────────────────

export async function getPostableItemsInAgeRange(
  admin: SupabaseAdmin,
  minAgeDays: number,
  maxAgeDays: number | null,
): Promise<PollablePipelineItem[]> {
  const now = Date.now()
  const minDate = new Date(now - (maxAgeDays ?? 36500) * 86400_000).toISOString()
  const maxDate = new Date(now - minAgeDays * 86400_000).toISOString()

  let q = admin
    .from('pipeline_items')
    .select('id, post_id, client_id, platform, posted_at, yt_video_id, tt_video_id, ig_video_id')
    .eq('status', 'POSTED')
    .not('posted_at', 'is', null)
    .gte('posted_at', minDate)

  if (maxAgeDays !== null) {
    q = q.lte('posted_at', maxDate)
  }

  const { data, error } = await q
  if (error) console.error('[poll] query error:', error.message)
  return (data ?? []) as PollablePipelineItem[]
}

// Resolve pipeline_item.post_id (text like #ig0001) → posts.id (UUID)
export async function resolvePostUUIDs(
  admin: SupabaseAdmin,
  items: PollablePipelineItem[],
): Promise<Map<string, string>> {
  if (items.length === 0) return new Map()

  const textIds = [...new Set(items.map(i => i.post_id).filter(Boolean))]
  const clientIds = [...new Set(items.map(i => i.client_id).filter(Boolean))]

  const { data } = await admin
    .from('posts')
    .select('id, post_id, client_id')
    .in('post_id', textIds)
    .in('client_id', clientIds)

  const map = new Map<string, string>()
  for (const row of (data ?? []) as any[]) {
    map.set(`${row.client_id}::${row.post_id}`, row.id)
  }
  return map
}
