import { createAdminClient } from '@/lib/supabase/admin'
import { FACEBOOK_RECONNECT_REQUIRED, refreshFacebookToken } from '@/lib/facebook-auth'
import { fillPublishDatesIfMissing } from '@/lib/publish-date'
import { scheduleSnapshotsIfNew } from '@/lib/video-polling'
import { recordUnlinkedVideoDiscovery } from '@/lib/unlinked-discoveries'
import { runPool } from '@/lib/concurrency'
import { graphBlocked, graphFetch, graphUsagePct } from '@/lib/graph-rate-limit'

type AdminClient = ReturnType<typeof createAdminClient>

// ── Types ─────────────────────────────────────────────────────────────────────

type IGMedia = {
  id: string
  permalink: string
  media_type: string
  timestamp: string
  caption?: string | null
  thumbnail_url?: string | null
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
  reconnectNeeded?: boolean
  discovered?: number
  /** Posts whose processing threw or whose insights were temporarily unavailable. */
  failed?: number
  /** Media items processed in this call (linked + unlinked). */
  processed?: number
  /** Total media listed for the account in this call. */
  mediaTotal?: number
  /** Set when the sync stopped early; pass back as resumeCursor to continue. */
  resumeCursor?: string | null
  stoppedReason?: 'time_budget' | 'rate_limit' | null
}

export type IGSyncOptions = {
  /** Epoch ms after which no new posts are started. */
  deadlineMs?: number
  /** Cursor returned by a previous partial sync. */
  resumeCursor?: string | null
  /** Parallel posts in flight (default IG_SYNC_CONCURRENCY). */
  concurrency?: number
}

// Parallel per-post workers. Each post makes one Graph insights call; usage
// headers throttle further if Meta reports high usage.
export const IG_SYNC_CONCURRENCY = 4

// ── Fetch all media for the connected account ─────────────────────────────────

const IG_MEDIA_PAGE_SIZE = 100
// Safety cap: 50 pages × 100 = 5,000 media. Hitting it logs a warning and is
// reported in the sync result so nothing is truncated silently.
const IG_MEDIA_MAX_PAGES = 50

type IGMediaListResult = {
  media: IGMedia[]
  pages: number
  /** Set when listing failed or stopped before the last page (cap hit or page failure). */
  warning?: string
}

/**
 * Lists the account's media, following Graph cursor pagination (paging.next)
 * until there are no more pages. Pass stopWhen to end early once a wanted item
 * has been seen. paging.next URLs embed the access token, so they are never logged.
 */
export async function fetchIGMedia(
  accessToken: string,
  igAccountId: string,
  stopWhen?: (item: IGMedia) => boolean,
): Promise<IGMediaListResult> {
  const fields = 'id,permalink,media_type,timestamp,caption,thumbnail_url,like_count,comments_count'
  let url: string | null = `https://graph.facebook.com/v19.0/${igAccountId}/media?fields=${fields}&limit=${IG_MEDIA_PAGE_SIZE}&access_token=${accessToken}`
  const media: IGMedia[] = []
  let pages = 0

  while (url) {
    if (pages >= IG_MEDIA_MAX_PAGES) {
      const warning = `IG /media page cap (${IG_MEDIA_MAX_PAGES}) hit after ${media.length} media; older media were not listed`
      console.warn(`[ig-sync] ${warning}`)
      return { media, pages, warning }
    }

    const res = await graphFetch(url, `/media page ${pages + 1}`)
    pages++
    if (!res.ok) {
      const detail = res.errorMessage ?? res.text
      console.error(`[ig-sync] /media page ${pages} failed:`, res.status, detail)
      const warning = pages === 1
        ? `IG /media failed (HTTP ${res.status}): ${detail}; no media listed`
        : `IG /media page ${pages} failed (HTTP ${res.status}) after ${media.length} media; older media were not listed`
      return { media, pages, warning }
    }
    const json = res.json as { data?: IGMedia[]; paging?: { next?: string } }

    const pageItems = json.data ?? []
    media.push(...pageItems)
    if (stopWhen && pageItems.some(stopWhen)) break
    url = json.paging?.next ?? null
  }

  return { media, pages }
}

// ── Fetch insights for a single media item ────────────────────────────────────

async function fetchIGMediaInsights(
  mediaId: string,
  accessToken: string,
  mediaType: string,
): Promise<IGInsights | null> {
  const isVideo = mediaType === 'VIDEO' || mediaType === 'REEL'
  const metrics = isVideo
    ? 'views,saved,reach,total_interactions,shares,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate'
    : 'reach,saved,impressions,shares,total_interactions'

  const url = `https://graph.facebook.com/v19.0/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`
  const res = await graphFetch(url, `insights ${mediaId}`)

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

  const rawBody: unknown = res.json ?? res.text

  // Transient failure (rate limit after one retry, or Graph/server error):
  // return null so callers skip the upsert instead of overwriting good data with zeros.
  if (!res.ok && (res.rateLimited || res.status >= 500 || res.errorCode === 1 || res.errorCode === 2)) {
    console.warn(`[ig-sync] insights temporarily unavailable for ${mediaId} (${mediaType}) HTTP ${res.status} code ${res.errorCode}: ${res.errorMessage ?? ''}`)
    return null
  }

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
  options: IGSyncOptions = {},
): Promise<IGSyncResult> {
  const result: IGSyncResult = { synced: 0, skipped: 0, errors: [], followersCount: null, failed: 0, processed: 0, resumeCursor: null, stoppedReason: null }
  const activeToken = await refreshFacebookToken(clientId, 'instagram')
  if (!activeToken) {
    return {
      ...result,
      errors: [FACEBOOK_RECONNECT_REQUIRED],
      reconnectNeeded: true,
    }
  }

  const followersCount = await fetchIGFollowersCount(activeToken, igAccountId)
  result.followersCount = followersCount

  const listing = await fetchIGMedia(activeToken, igAccountId)
  const allMedia = listing.media
  result.mediaTotal = allMedia.length
  console.log(`[ig-sync] fetched ${allMedia.length} media items in ${listing.pages} page(s) for client ${clientId}`)
  if (listing.warning) result.errors.push(listing.warning)

  const startIndex = resolveResumeIndex(allMedia, options.resumeCursor ?? null)
  if (options.resumeCursor) {
    console.log(`[ig-sync] resuming at media index ${startIndex}/${allMedia.length}`)
  }
  const media = allMedia.slice(startIndex)

  const pool = await runPool(media, async item => {
    result.processed = (result.processed ?? 0) + 1
    const shortcode = shortcodeFromPermalink(item.permalink)
    if (!shortcode) { result.skipped++; return }

    const resolved = await resolveIGPostsUUID(admin, shortcode, clientId)
    if (!resolved) {
      console.log(`[ig-sync] no pipeline match for shortcode=${shortcode} (not linked)`)
      const discovered = await recordUnlinkedVideoDiscovery(admin, {
        clientId,
        platform: 'ig',
        platformVideoId: shortcode,
        permalink: item.permalink,
        title: item.caption ?? `Instagram ${shortcode}`,
        thumbnailUrl: item.thumbnail_url ?? null,
        publishedAt: item.timestamp,
        likes: item.like_count ?? 0,
        comments: item.comments_count ?? 0,
      })
      if (discovered) result.discovered = (result.discovered ?? 0) + 1
      result.skipped++
      return
    }

    const insights = await fetchIGMediaInsights(item.id, activeToken, item.media_type)
    if (!insights) {
      // Transient Graph failure: keep the existing live row untouched.
      result.failed = (result.failed ?? 0) + 1
      result.errors.push(`${shortcode}: insights temporarily unavailable; existing metrics kept`)
      return
    }

    const publishedAt = await fillPublishDatesIfMissing(admin, {
      clientId,
      postUUID: resolved.postUUID,
      pipelineItemId: resolved.pipelineItemId,
      publishedAt: item.timestamp,
    })

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
      if (publishedAt?.iso && resolved.pipelineItemId) {
        await scheduleSnapshotsIfNew(admin, resolved.postUUID, clientId, resolved.pipelineItemId, publishedAt.iso)
      }
      result.synced++
    }
  }, {
    concurrency: options.concurrency ?? IG_SYNC_CONCURRENCY,
    canStart: () => {
      if (options.deadlineMs && Date.now() >= options.deadlineMs) {
        result.stoppedReason = 'time_budget'
        return false
      }
      if (graphBlocked()) {
        result.stoppedReason = 'rate_limit'
        return false
      }
      return true
    },
    onError: (err, item) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ig-sync] post failed for media ${item.id}:`, message)
      result.failed = (result.failed ?? 0) + 1
      result.errors.push(`${shortcodeFromPermalink(item.permalink) ?? item.id}: ${message}`)
    },
  })

  if (pool.stoppedEarly) {
    const nextItem = media[pool.nextIndex]
    result.resumeCursor = encodeResumeCursor(nextItem)
    const remaining = media.length - pool.nextIndex
    const why = result.stoppedReason === 'rate_limit'
      ? `Graph usage limit reached (${graphUsagePct()}%)`
      : 'time budget reached'
    console.warn(`[ig-sync] stopped early: ${why}; ${remaining} media remaining; resume cursor set`)
    result.errors.push(`Partial sync: ${why}; ${remaining} of ${allMedia.length} media remaining. Run Sync Now again to continue.`)
  } else {
    result.stoppedReason = null
  }

  return result
}

// ── Resume cursor ─────────────────────────────────────────────────────────────
// Format "<timestamp>|<mediaId>" of the first media item not yet started.
// /media is newest-first, so on resume we start at that item, or (if it was
// deleted) at the first item at or before its timestamp.

export function encodeResumeCursor(item: IGMedia | undefined): string | null {
  if (!item) return null
  return `${item.timestamp}|${item.id}`
}

export function resolveResumeIndex(media: IGMedia[], cursor: string | null): number {
  if (!cursor) return 0
  const sep = cursor.lastIndexOf('|')
  const timestamp = sep > 0 ? cursor.slice(0, sep) : ''
  const mediaId = sep > 0 ? cursor.slice(sep + 1) : cursor
  const byId = media.findIndex(item => item.id === mediaId)
  if (byId >= 0) return byId
  const cutoff = Date.parse(timestamp)
  if (Number.isNaN(cutoff)) return 0
  const byTime = media.findIndex(item => Date.parse(item.timestamp) <= cutoff)
  return byTime >= 0 ? byTime : media.length
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

  const activeToken = await refreshFacebookToken(clientId, 'instagram')
  if (!activeToken) {
    return { synced: 0, error: FACEBOOK_RECONNECT_REQUIRED }
  }

  const matches = (mediaItem: IGMedia) => shortcodeFromPermalink(mediaItem.permalink) === igVideoId
  const { media } = await fetchIGMedia(activeToken, igAccountId, matches)
  const item = media.find(matches)
  if (!item) {
    return { synced: 0, error: `No Instagram media found for ${igVideoId}` }
  }

  const resolved = await resolveIGPostsUUID(admin, igVideoId, clientId)
  if (!resolved) {
    return { synced: 0, error: `No posts row found for Instagram video ${igVideoId}` }
  }

  const insights = await fetchIGMediaInsights(item.id, activeToken, item.media_type)
  if (!insights) {
    return { synced: 0, error: `Instagram insights temporarily unavailable for ${igVideoId}; existing metrics kept` }
  }
  const publishedAt = await fillPublishDatesIfMissing(admin, {
    clientId,
    postUUID: resolved.postUUID,
    pipelineItemId: resolved.pipelineItemId,
    publishedAt: item.timestamp,
  })
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

  if (publishedAt?.iso && resolved.pipelineItemId) {
    await scheduleSnapshotsIfNew(admin, resolved.postUUID, clientId, resolved.pipelineItemId, publishedAt.iso)
  }

  console.log(`[ig-sync] single ✓ ${igVideoId} — reach=${views} graph_views=${insights.views} likes=${likes} comments=${comments} shares=${shares} saves=${saves}`)
  return { synced: 1 }
}
