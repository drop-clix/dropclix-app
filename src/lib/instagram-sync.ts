import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// ── Types ─────────────────────────────────────────────────────────────────────

type IGMedia = {
  id: string
  permalink: string
  media_type: string
  timestamp: string
  like_count: number
  comments_count: number
}

type IGInsights = {
  views: number
  reach: number
  saved: number
  shares: number
  totalInteractions: number
  avgWatchTimeMs: number | null
  totalWatchTimeMs: number | null
  skipRate: number | null
  impressions: number
}

export type IGSyncResult = {
  synced: number
  skipped: number
  errors: string[]
  followersCount: number | null
}

// ── Fetch all media for the connected account ─────────────────────────────────

async function fetchIGMedia(accessToken: string, igAccountId: string): Promise<IGMedia[]> {
  const fields = 'id,permalink,media_type,timestamp,like_count,comments_count'
  const url = `https://graph.facebook.com/v19.0/${igAccountId}/media?fields=${fields}&limit=100&access_token=${accessToken}`

  const res = await fetch(url)
  if (!res.ok) {
    console.error('[ig-sync] /media failed:', res.status, await res.text())
    return []
  }
  const json = await res.json() as { data?: IGMedia[]; error?: { message: string } }
  if (json.error) {
    console.error('[ig-sync] media error:', json.error.message)
    return []
  }
  return json.data ?? []
}

// ── Fetch insights for a single media item ────────────────────────────────────

async function fetchIGMediaInsights(
  mediaId: string,
  accessToken: string,
  mediaType: string,
): Promise<IGInsights> {
  const isVideo = mediaType === 'VIDEO' || mediaType === 'REEL'
  const metrics = isVideo
    ? 'views,saved,reach,total_interactions,shares,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate'
    : 'reach,saved,impressions,shares,total_interactions'

  const url = `https://graph.facebook.com/v19.0/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`
  const res = await fetch(url)

  const empty: IGInsights = {
    views: 0,
    reach: 0,
    saved: 0,
    shares: 0,
    totalInteractions: 0,
    avgWatchTimeMs: null,
    totalWatchTimeMs: null,
    skipRate: null,
    impressions: 0,
  }

  const rawText = await res.text()
  let rawBody: unknown = rawText
  try { rawBody = rawText ? JSON.parse(rawText) : null } catch { /* keep string */ }

  if (!res.ok) {
    const graphMessage = typeof rawBody === 'object' && rawBody && 'error' in rawBody
      ? (rawBody as { error?: { message?: string; code?: number; type?: string } }).error
      : null
    console.warn(`[ig-sync] insights failed for ${mediaId} (${mediaType}) HTTP ${res.status}:`, {
      metrics,
      message: graphMessage?.message ?? rawBody,
      code: graphMessage?.code,
      type: graphMessage?.type,
    })
    return empty
  }

  console.log(`[ig-sync] insights raw ${mediaId} (${mediaType}):`, JSON.stringify(rawBody))

  const json = rawBody as { data?: { name: string; values: { value: number }[] }[] }

  const result = { ...empty }
  for (const metric of json.data ?? []) {
    const val = metric.values?.[0]?.value ?? 0
    if (metric.name === 'views')       result.views       = val
    if (metric.name === 'reach')        result.reach       = val
    if (metric.name === 'saved')        result.saved       = val
    if (metric.name === 'shares')       result.shares      = val
    if (metric.name === 'total_interactions') result.totalInteractions = val
    if (metric.name === 'ig_reels_avg_watch_time') result.avgWatchTimeMs = val
    if (metric.name === 'ig_reels_video_view_total_time') result.totalWatchTimeMs = val
    if (metric.name === 'reels_skip_rate') result.skipRate = val
    if (metric.name === 'impressions')  result.impressions = val
  }
  return result
}

// ── Fetch follower count ───────────────────────────────────────────────────────

export async function fetchIGFollowersCount(accessToken: string, igAccountId: string): Promise<number | null> {
  const url = `https://graph.facebook.com/v19.0/${igAccountId}?fields=followers_count&access_token=${accessToken}`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json() as { followers_count?: number }
  return json.followers_count ?? null
}

// ── Extract shortcode from permalink ──────────────────────────────────────────
// permalink = "https://www.instagram.com/reel/CXxyz123/" → "CXxyz123"

function shortcodeFromPermalink(permalink: string): string | null {
  const m = permalink.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

// ── Resolve posts UUID (2-strategy for Instagram) ─────────────────────────────
// Strategy 1: pipeline_items.ig_video_id = shortcode → posts via post_id
// Strategy 2: exact posts.post_id match (for directly imported posts)

async function resolveIGPostsUUID(
  admin: AdminClient,
  shortcode: string,
  clientId: string,
): Promise<{ postUUID: string; pipelineItemId: string | null } | null> {
  // Strategy 1: find pipeline_item with matching ig_video_id
  const { data: pipeRow } = await admin
    .from('pipeline_items')
    .select('id, post_id, client_id')
    .eq('ig_video_id', shortcode)
    .eq('client_id', clientId)
    .maybeSingle()

  if (pipeRow) {
    const pi = pipeRow as any
    // Resolve posts UUID from pipeline post_id
    const { data: exact } = await admin.from('posts').select('id')
      .eq('post_id', pi.post_id).eq('client_id', clientId).maybeSingle()
    if (exact) return { postUUID: (exact as any).id, pipelineItemId: pi.id }

    // Pipe-split
    if (typeof pi.post_id === 'string' && pi.post_id.includes('|')) {
      for (const part of pi.post_id.split('|').map((s: string) => s.trim()).filter(Boolean)) {
        const { data } = await admin.from('posts').select('id')
          .eq('post_id', part).eq('client_id', clientId).maybeSingle()
        if (data) return { postUUID: (data as any).id, pipelineItemId: pi.id }
      }
    }
  }

  return null
}

// ── Main sync function ────────────────────────────────────────────────────────

export async function syncInstagramForClient(
  admin: AdminClient,
  clientId: string,
  accessToken: string,
  igAccountId: string,
): Promise<IGSyncResult> {
  const result: IGSyncResult = { synced: 0, skipped: 0, errors: [], followersCount: null }

  const followersCount = await fetchIGFollowersCount(accessToken, igAccountId)
  result.followersCount = followersCount

  const media = await fetchIGMedia(accessToken, igAccountId)
  console.log(`[ig-sync] fetched ${media.length} media items for client ${clientId}`)

  for (const item of media) {
    const shortcode = shortcodeFromPermalink(item.permalink)
    if (!shortcode) { result.skipped++; continue }

    const resolved = await resolveIGPostsUUID(admin, shortcode, clientId)
    if (!resolved) {
      console.log(`[ig-sync] no pipeline match for shortcode=${shortcode} (not linked)`)
      result.skipped++
      continue
    }

    const insights = await fetchIGMediaInsights(item.id, accessToken, item.media_type)

    // IG ER% formula: (likes + comments + shares + saves) / views × 100
    // views = reach (unique accounts reached)
    const views    = insights.reach || 0
    const likes    = item.like_count    || 0
    const comments = item.comments_count || 0
    const saves    = insights.saved     || 0
    const shares   = insights.shares    || 0

    const payload: Record<string, unknown> = {
      post_id:        resolved.postUUID,
      client_id:      clientId,
      platform:       'ig',
      metric_window:  'live',
      views,
      client_views:   insights.views || 0,
      likes,
      comments,
      shares,
      saves,
      watch_pct:      0,
      skip_rate:      insights.skipRate,
      last_polled_at: new Date().toISOString(),
      recorded_at:    new Date().toISOString(),
    }

    const { error: uErr } = await admin.from('post_analytics').upsert(
      payload,
      { onConflict: 'post_id,platform,metric_window' },
    )

    if (views === 0 && likes > 0) {
      console.warn(`[ig-sync] reach=0 but likes=${likes} for ${shortcode} (mediaId=${item.id}, type=${item.media_type}) — insights may be unavailable or metric name mismatch`)
    }

    if (uErr) {
      console.error(`[ig-sync] upsert failed for ${shortcode}:`, uErr.message)
      result.errors.push(`${shortcode}: ${uErr.message}`)
    } else {
      console.log(`[ig-sync] ✓ ${shortcode} — reach=${views} graph_views=${insights.views} likes=${likes} comments=${comments} shares=${shares} saves=${saves} skip_rate=${insights.skipRate ?? 'n/a'}`)
      result.synced++
    }
  }

  return result
}

export async function syncSingleIGVideo(
  clientId: string,
  igVideoId: string,
): Promise<{ synced: number; error?: string }> {
  const admin = createAdminClient()

  const { data: connection, error: connectionError } = await admin
    .from('platform_connections')
    .select('access_token, channel_id')
    .eq('client_id', clientId)
    .eq('platform', 'instagram')
    .maybeSingle()

  if (connectionError || !connection) {
    return { synced: 0, error: connectionError?.message ?? 'No Instagram connection found' }
  }

  const accessToken = (connection as any).access_token as string | null
  const igAccountId = (connection as any).channel_id as string | null
  if (!accessToken || !igAccountId) {
    return { synced: 0, error: 'Instagram connection is missing token or channel_id' }
  }

  const media = await fetchIGMedia(accessToken, igAccountId)
  const item = media.find(mediaItem => shortcodeFromPermalink(mediaItem.permalink) === igVideoId)
  if (!item) {
    return { synced: 0, error: `No Instagram media found for ${igVideoId}` }
  }

  const resolved = await resolveIGPostsUUID(admin, igVideoId, clientId)
  if (!resolved) {
    return { synced: 0, error: `No posts row found for Instagram video ${igVideoId}` }
  }

  const insights = await fetchIGMediaInsights(item.id, accessToken, item.media_type)
  const views = insights.reach || 0
  const likes = item.like_count || 0
  const comments = item.comments_count || 0
  const saves = insights.saved || 0
  const shares = insights.shares || 0

  const { error } = await admin.from('post_analytics').upsert({
    post_id: resolved.postUUID,
    client_id: clientId,
    platform: 'ig',
    metric_window: 'live',
    views,
    client_views: insights.views || 0,
    likes,
    comments,
    shares,
    saves,
    watch_pct: 0,
    skip_rate: insights.skipRate,
    last_polled_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
  }, { onConflict: 'post_id,platform,metric_window' })

  if (error) {
    console.error(`[ig-sync] single-video upsert failed for ${igVideoId}:`, error.message)
    return { synced: 0, error: error.message }
  }

  console.log(`[ig-sync] single ✓ ${igVideoId} — reach=${views} graph_views=${insights.views} likes=${likes} comments=${comments} shares=${shares} saves=${saves}`)
  return { synced: 1 }
}
