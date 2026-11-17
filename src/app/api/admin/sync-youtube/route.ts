import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getYouTubeConnection, fetchChannelInfo } from '@/lib/youtube-auth'
import { discoverYouTubeUnlinkedUploads } from '@/lib/video-polling'
import { runPool } from '@/lib/concurrency'
import { fetchYTAnalytics, fetchYTLifetimeBatch, ytLifetimeStart, type YTVideoMetrics } from '@/lib/youtube-analytics'
import { erToDecision } from '@/lib/decision'

// Vercel Hobby + Fluid Compute: 300s is the project default and plan maximum.
export const maxDuration = 300

const YT_SYNC_CONCURRENCY = 1

type SyncResult = {
  synced: number
  skipped: number
  errors: string[]
  lastSyncedAt: string
  discovered?: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const clientId: string = body.client_id

  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const conn = await getYouTubeConnection(clientId)
  if (!conn || !conn.channel_id) {
    return NextResponse.json({ error: 'No YouTube connection found for this client' }, { status: 404 })
  }

  const admin  = createAdminClient()

  // Read-only preview of the lifetime-range fix (S77). Writes nothing to
  // post_analytics, discoveries or platform_connections.last_synced_at.
  if (body.dry_run === true) {
    return NextResponse.json(await youtubeLifetimeDryRun(admin, clientId, conn.access_token, conn.channel_id))
  }

  const result: SyncResult = { synced: 0, skipped: 0, errors: [], lastSyncedAt: '' }
  const discovery = await discoverYouTubeUnlinkedUploads(admin, clientId, conn.access_token)
  if (discovery.error) result.errors.push(`discovery: ${discovery.error}`)
  result.discovered = discovery.discovered

  type PostRow = { id: string; post_id: string; date: string; decision: string | null; yt_id: string }

  const { data: postsData, error: pErr } = await admin
    .from('posts')
    .select('id, post_id, date, decision, yt_id')
    .eq('client_id', clientId)
    .not('yt_id', 'is', null)

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const posts = (postsData ?? []) as unknown as PostRow[]

  if (posts.length === 0) {
    return NextResponse.json({ ...result, message: 'No posts with yt_id found. Run the YouTube CSV importer first.' })
  }

  // S77: lifetime range, one batched dimensions=video call. Analytics reports
  // days in Pacific time and posts.date is the UTC publish date, so starting at
  // posts.date dropped the publish day for videos posted 00:00–06:59 UTC.
  const channelId = conn.channel_id
  const endDate = new Date().toISOString().slice(0, 10)
  const earliest = posts.map(p => p.date).filter(Boolean).sort()[0] ?? null
  const startDate = ytLifetimeStart(earliest)
  const batch = await fetchYTLifetimeBatch(conn.access_token, channelId, posts.map(p => p.yt_id), startDate, endDate)
  // Non-transient batch failures (4xx: auth, quota) skip those videos rather
  // than retrying each one; 5xx and "missing from batch" fall back per video.
  const noFallback = new Set(batch.batchErrors.filter(e => e.status < 500).flatMap(e => e.ids))
  for (const e of batch.batchErrors) result.errors.push(`lifetime batch failed (${e.status}) for ${e.ids.length} videos`)
  console.log(`[yt-sync] lifetime ${startDate}→${endDate}: ${batch.metrics.size} in batch, ${batch.missing.length} missing`)

  // Concurrency 1: per-post error isolation; fallback calls stay sequential
  // because the Analytics per-minute quota is not visible to us.
  await runPool(posts, async post => {
    const videoId = post.yt_id
    let metrics: YTVideoMetrics | null = batch.metrics.get(videoId) ?? null
    if (!metrics && !noFallback.has(videoId)) {
      metrics = await fetchYTAnalytics(conn.access_token, channelId, videoId, startDate, endDate)
    }

    if (!metrics) {
      result.skipped++
      return
    }

    const { error: uErr } = await admin
      .from('post_analytics')
      .upsert(
        {
          post_id:        post.id,
          client_id:      clientId,
          platform:       'yt',
          metric_window:  'live',
          yt_id:          videoId,
          yt_video_id:    videoId,
          views:          metrics.views,
          likes:          metrics.likes,
          comments:       metrics.comments,
          shares:         metrics.shares,
          saves:          null,
          watch_pct:      metrics.averageViewPercentage,
          followers:      metrics.subscribersGained,
          impressions:    metrics.impressions,
          ctr:            metrics.ctr,
          last_polled_at: new Date().toISOString(),
          recorded_at:    new Date().toISOString(),
        },
        { onConflict: 'post_id,platform,metric_window' },
      )

    if (uErr) {
      result.errors.push(`${post.post_id} live: ${uErr.message}`)
    } else {
      result.synced++
    }
  }, {
    concurrency: YT_SYNC_CONCURRENCY,
    onError: (err, post) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[yt-sync] post failed for ${post.post_id}:`, message)
      result.errors.push(`${post.post_id} live: ${message}`)
      result.skipped++
    },
  })

  const now = new Date().toISOString()
  result.lastSyncedAt = now

  // Refresh subscriber count while we have an active token — same OAuth call used at connect time.
  let subscriberCount: number | null = null
  const channelInfo = await fetchChannelInfo(conn.access_token)
  if (channelInfo) subscriberCount = channelInfo.subscriberCount

  const { data: updatedConn } = await admin
    .from('platform_connections')
    .update({
      last_synced_at:   now,
      updated_at:       now,
      ...(subscriberCount !== null ? { subscriber_count: subscriberCount } : {}),
    })
    .eq('client_id', clientId)
    .eq('platform', 'youtube')
    .select('last_synced_at, token_expires_at, subscriber_count')
    .maybeSingle()

  return NextResponse.json({
    ...result,
    subscriberCount: (updatedConn as any)?.subscriber_count ?? subscriberCount,
    lastSyncedAt: (updatedConn as any)?.last_synced_at ?? now,
    tokenExpiresAt: (updatedConn as any)?.token_expires_at ?? conn.token_expires_at ?? null,
  })
}

// ── S77 dry run: lifetime batch vs stored live rows ──────────────────────────

type DryRunMetrics = { views: number; likes: number; comments: number; shares: number; subscribersGained: number; er: number | null; decision: string | null; tier: string }

function ytEr(m: { views: number; likes: number; comments: number; shares: number; subscribersGained: number }): number | null {
  // Locked YT formula: (likes + comments + shares + subscribers gained) / views × 100
  if (!m.views) return null
  return Math.round(((m.likes + m.comments + m.shares + m.subscribersGained) / m.views) * 10000) / 100
}

// Mirrors AnalyticsClient tier(): ≥12 elite, ≥7 strong, ≥4 avg, else kill.
function ytTier(er: number | null): string {
  if (er == null) return 'none'
  if (er >= 12) return 'elite'
  if (er >= 7) return 'strong'
  if (er >= 4) return 'avg'
  return 'kill'
}

function withDecision(m: Omit<DryRunMetrics, 'er' | 'decision' | 'tier'>): DryRunMetrics {
  const er = ytEr(m)
  return { ...m, er, decision: er == null ? null : erToDecision(er), tier: ytTier(er) }
}

async function youtubeLifetimeDryRun(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  accessToken: string,
  channelId: string,
) {
  const { data: postsData, error: pErr } = await admin
    .from('posts')
    .select('id, post_id, date, yt_id')
    .eq('client_id', clientId)
    .not('yt_id', 'is', null)
  if (pErr) return { dryRun: true, error: pErr.message }
  const posts = (postsData ?? []) as { id: string; post_id: string; date: string | null; yt_id: string }[]

  const { data: liveData } = await admin
    .from('post_analytics')
    .select('post_id, views, likes, comments, shares, followers')
    .eq('client_id', clientId)
    .eq('platform', 'yt')
    .eq('metric_window', 'live')
    .in('post_id', posts.map(p => p.id))
  const liveByPost = new Map(((liveData ?? []) as { post_id: string; views: number | null; likes: number | null; comments: number | null; shares: number | null; followers: number | null }[]).map(r => [r.post_id, r]))

  const endDate = new Date().toISOString().slice(0, 10)
  const earliest = posts.map(p => p.date).filter(Boolean).sort()[0] ?? null
  const startDate = ytLifetimeStart(earliest)
  const batch = await fetchYTLifetimeBatch(accessToken, channelId, posts.map(p => p.yt_id), startDate, endDate)

  // Per-video fallback only for videos missing from the batch.
  const fallback = new Map<string, YTVideoMetrics | null>()
  for (const videoId of batch.missing) {
    fallback.set(videoId, await fetchYTAnalytics(accessToken, channelId, videoId, startDate, endDate))
  }

  const rows = posts.map(post => {
    const live = liveByPost.get(post.id)
    const next = batch.metrics.get(post.yt_id) ?? fallback.get(post.yt_id) ?? null
    const before = live ? withDecision({
      views: live.views ?? 0, likes: live.likes ?? 0, comments: live.comments ?? 0,
      shares: live.shares ?? 0, subscribersGained: live.followers ?? 0,
    }) : null
    const after = next ? withDecision({
      views: next.views, likes: next.likes, comments: next.comments,
      shares: next.shares, subscribersGained: next.subscribersGained,
    }) : null
    const source = batch.metrics.has(post.yt_id) ? 'batch' : next ? 'fallback' : 'skip (no data; existing row kept)'
    const changed = !!before && !!after && (
      before.views !== after.views || before.likes !== after.likes || before.comments !== after.comments ||
      before.shares !== after.shares || before.subscribersGained !== after.subscribersGained)
    return { post: post.post_id, videoId: post.yt_id, postsDate: post.date, source, changed, before, after,
      decisionChanged: !!before && !!after && before.decision !== after.decision,
      tierChanged: !!before && !!after && before.tier !== after.tier }
  })

  return {
    dryRun: true,
    startDate,
    endDate,
    posts: rows.length,
    inBatch: batch.metrics.size,
    fallbackUsed: Array.from(fallback.values()).filter(Boolean).length,
    skipped: rows.filter(r => !r.after).length,
    batchErrors: batch.batchErrors.map(e => ({ status: e.status, message: e.message, count: e.ids.length })),
    changed: rows.filter(r => r.changed).length,
    decisionChanges: rows.filter(r => r.decisionChanged).length,
    tierChanges: rows.filter(r => r.tierChanged).length,
    rows,
  }
}
