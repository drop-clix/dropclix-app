import { createAdminClient } from '@/lib/supabase/admin'
import { erToDecision } from '@/lib/decision'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

// ── YouTube Data API v3 (public stats — YOUTUBE_API_KEY, no OAuth) ────────

export async function fetchYTPublicStats(videoId: string): Promise<{
  views: number; likes: number; comments: number
} | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    console.warn('[poll] YOUTUBE_API_KEY not set — cannot poll')
    return null
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${key}`
  console.log(`[poll] → YT Data API: ${videoId}`)
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) {
    console.error(`[poll] YT Data API HTTP ${res.status} for ${videoId}:`, await res.text())
    return null
  }

  const json = await res.json()
  const stats = json.items?.[0]?.statistics
  if (!stats) {
    console.log(`[poll] YT Data API: no stats for ${videoId} (private, deleted, or invalid ID)`)
    return null
  }

  const result = {
    views:    parseInt(stats.viewCount    ?? '0', 10),
    likes:    parseInt(stats.likeCount    ?? '0', 10),
    comments: parseInt(stats.commentCount ?? '0', 10),
  }
  console.log(`[poll] YT stats ${videoId}: views=${result.views} likes=${result.likes} comments=${result.comments}`)
  return result
}

// ── Upsert post_analytics (preserves prev data point for interpolation) ───

export async function upsertPolledStats(
  admin: SupabaseAdmin,
  postUUID: string,
  clientId: string,
  platform: string,
  metricWindow: string,
  stats: { views: number; likes: number; comments: number },
): Promise<void> {
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
    const { data: rows } = await admin
      .from('post_analytics')
      .select('views, likes, comments, shares, saves, metric_window')
      .eq('post_id', job.post_id)
      .eq('client_id', job.client_id)

    if (!rows || rows.length === 0) continue

    const priority = ['eom', 'w7', 'w3', 'w24']
    const best = (rows as any[]).sort((a: any, b: any) =>
      priority.indexOf(a.metric_window) - priority.indexOf(b.metric_window)
    )[0]
    if (!best) continue

    const views    = best.views    ?? 0
    const likes    = best.likes    ?? 0
    const comments = best.comments ?? 0
    const shares   = best.shares   ?? 0
    const saves    = best.saves    ?? 0
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

  const stats = await fetchYTPublicStats(item.yt_video_id)
  if (!stats) {
    console.log(`[poll] skip ${item.post_id}: YT API returned no data`)
    return { polled: false, reason: 'yt_api_null' }
  }

  // Resolve posts UUID for post_analytics FK (3-strategy)
  const postUUID = await resolvePostsUUID(admin, item)

  if (!postUUID) {
    // Stats were fetched but we can't write to post_analytics without a posts row.
    // Admin must import the post via Studio CSV import, or the Mark as Posted flow
    // will auto-create a stub posts row (ensureYTPostsRow in edit-actions.ts).
    console.log(`[poll] ${item.post_id}: no posts row found (tried exact, pipe-split, yt_id) — skipping`)
    return { polled: false, reason: 'no_posts_row' }
  }

  console.log(`[poll] ${item.post_id} → posts UUID=${postUUID} — writing to post_analytics eom`)

  await upsertPolledStats(admin, postUUID, item.client_id, 'yt', 'eom', stats)

  if (item.posted_at) {
    await scheduleSnapshotsIfNew(admin, postUUID, item.client_id, item.id, item.posted_at)
  }

  console.log(`[poll] ✓ ${item.post_id} written — views=${stats.views} likes=${stats.likes} comments=${stats.comments}`)
  return { polled: true }
}

// ── Query helpers for cron routes ─────────────────────────────────────────
//
// Only returns POSTED items where yt_video_id IS NOT NULL.
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
    .not('yt_video_id', 'is', null)

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

  console.log(`[poll] getPostableItemsInAgeRange(${tierLabel}): ${items.length} items with yt_video_id`)
  for (const item of items) {
    console.log(`[poll]   ${item.post_id} (${item.id}) yt_video_id=${item.yt_video_id} posted_at=${item.posted_at ?? 'NULL'}`)
  }

  return items
}
