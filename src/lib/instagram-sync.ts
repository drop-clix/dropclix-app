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
  reach: number
  saved: number
  plays: number | null
  impressions: number
}

export type IGSyncResult = {
  synced: number
  skipped: number
  errors: string[]
  followersCount: number | null
}

// ── Fetch all media for the connected account ─────────────────────────────────

async function fetchIGMedia(accessToken: string): Promise<IGMedia[]> {
  const fields = 'id,permalink,media_type,timestamp,like_count,comments_count'
  const url = `https://graph.instagram.com/me/media?fields=${fields}&limit=100&access_token=${accessToken}`

  const res = await fetch(url)
  if (!res.ok) {
    console.error('[ig-sync] /me/media failed:', res.status, await res.text())
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
  // Reels use 'plays' instead of 'video_views'
  const metrics = isVideo
    ? 'reach,saved,plays,impressions'
    : 'reach,saved,impressions'

  const url = `https://graph.instagram.com/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`
  const res = await fetch(url)

  const empty: IGInsights = { reach: 0, saved: 0, plays: null, impressions: 0 }

  if (!res.ok) {
    // Insights can fail for personal accounts or content older than 2 years
    console.warn(`[ig-sync] insights failed for ${mediaId}: HTTP ${res.status}`)
    return empty
  }
  const json = await res.json() as { data?: { name: string; values: { value: number }[] }[] }

  const result = { ...empty }
  for (const metric of json.data ?? []) {
    const val = metric.values?.[0]?.value ?? 0
    if (metric.name === 'reach')        result.reach       = val
    if (metric.name === 'saved')        result.saved       = val
    if (metric.name === 'plays')        result.plays       = val
    if (metric.name === 'impressions')  result.impressions = val
  }
  return result
}

// ── Fetch follower count ───────────────────────────────────────────────────────

export async function fetchIGFollowersCount(accessToken: string): Promise<number | null> {
  const url = `https://graph.instagram.com/me?fields=followers_count&access_token=${accessToken}`
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
): Promise<IGSyncResult> {
  const result: IGSyncResult = { synced: 0, skipped: 0, errors: [], followersCount: null }

  const followersCount = await fetchIGFollowersCount(accessToken)
  result.followersCount = followersCount

  const media = await fetchIGMedia(accessToken)
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
    const plays    = insights.plays     ?? null

    const { error: uErr } = await admin.from('post_analytics').upsert(
      {
        post_id:        resolved.postUUID,
        client_id:      clientId,
        platform:       'ig',
        metric_window:  'live',
        views,
        likes,
        comments,
        shares:         0,
        saves,
        watch_pct:      plays !== null && views > 0
                          ? Math.round((plays / views) * 10000) / 100
                          : 0,
        last_polled_at: new Date().toISOString(),
        recorded_at:    new Date().toISOString(),
      },
      { onConflict: 'post_id,platform,metric_window' },
    )

    if (uErr) {
      console.error(`[ig-sync] upsert failed for ${shortcode}:`, uErr.message)
      result.errors.push(`${shortcode}: ${uErr.message}`)
    } else {
      console.log(`[ig-sync] ✓ ${shortcode} — views=${views} likes=${likes} saves=${saves}`)
      result.synced++
    }
  }

  return result
}
