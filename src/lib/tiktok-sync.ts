import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleSnapshotsIfNew } from '@/lib/video-polling'

type AdminClient = ReturnType<typeof createAdminClient>

type TikTokConnection = {
  accessToken: string
  channelName: string | null
  subscriberCount: number | null
}

type TikTokVideoStat = {
  id: string
  title?: string | null
  view_count?: number | null
  like_count?: number | null
  comment_count?: number | null
  share_count?: number | null
  cover_image_url?: string | null
}

type PipelineItem = {
  id: string
  post_id: string
  title: string | null
  pillar: string | null
  posted_at: string | null
  tt_video_id: string | null
}

type PostsRow = {
  id: string
  post_id: string
}

export type TikTokSyncResult = {
  synced: number
  skipped: number
  errors: string[]
  channelName: string | null
  subscriberCount: number | null
}

const TIKTOK_VIDEO_FIELDS = 'id,title,view_count,like_count,comment_count,share_count,cover_image_url'

function extractPlatformPostId(rawPostId: string, platform: 'tt'): string | null {
  const prefix = `#${platform}`
  const parts = rawPostId.split('|').map(part => part.trim()).filter(Boolean)
  return parts.find(part => part.toLowerCase().startsWith(prefix)) ?? null
}

function postIdParts(rawPostId: string): string[] {
  return rawPostId.split('|').map(part => part.trim()).filter(Boolean)
}

// ── Connection ───────────────────────────────────────────────────────────────

export async function getTikTokConnection(clientId: string): Promise<TikTokConnection> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('platform_connections')
    .select('access_token, channel_name, subscriber_count')
    .eq('client_id', clientId)
    .eq('platform', 'tiktok')
    .single()

  if (error || !data) {
    throw new Error(`No TikTok connection found for client ${clientId}`)
  }

  const conn = data as any
  if (!conn.access_token) {
    throw new Error(`TikTok connection for client ${clientId} is missing an access token`)
  }

  return {
    accessToken: conn.access_token,
    channelName: conn.channel_name ?? null,
    subscriberCount: conn.subscriber_count ?? null,
  }
}

// ── TikTok API ───────────────────────────────────────────────────────────────

export async function fetchTikTokVideoStats(
  accessToken: string,
  videoIds: string[],
): Promise<TikTokVideoStat[]> {
  if (videoIds.length === 0) return []

  const url = new URL('https://open.tiktokapis.com/v2/video/query/')
  url.searchParams.set('fields', TIKTOK_VIDEO_FIELDS)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filters: { video_ids: videoIds } }),
  })

  const rawText = await res.text()
  console.log('[tt-sync] video/query raw:', rawText)

  let json: any = null
  try {
    json = rawText ? JSON.parse(rawText) : null
  } catch {
    throw new Error(`TikTok video/query returned non-JSON response: ${rawText}`)
  }

  if (!res.ok) {
    const msg = json?.error?.message ?? json?.error?.code ?? rawText
    throw new Error(`TikTok video/query failed (${res.status}): ${msg}`)
  }

  if (json?.error && json.error.code && json.error.code !== 'ok') {
    throw new Error(`TikTok video/query error: ${json.error.message ?? json.error.code}`)
  }

  return (json?.data?.videos ?? []) as TikTokVideoStat[]
}

// ── Posts row resolution ─────────────────────────────────────────────────────

async function ensureTTPostsRowForPipeline(
  admin: AdminClient,
  clientId: string,
  item: PipelineItem,
): Promise<PostsRow | null> {
  const ttPostId = extractPlatformPostId(item.post_id, 'tt')
  if (!ttPostId) {
    console.warn(`[tt-sync] no #tt segment in pipeline post_id=${item.post_id} item=${item.id}`)
    return null
  }

  const candidates = [ttPostId, item.post_id, ...postIdParts(item.post_id)]
  for (const postId of Array.from(new Set(candidates))) {
    const { data } = await admin
      .from('posts')
      .select('id, post_id')
      .eq('client_id', clientId)
      .eq('post_id', postId)
      .maybeSingle()
    if (data) return data as PostsRow
  }

  const { data, error } = await admin
    .from('posts')
    .insert({
      client_id: clientId,
      post_id: ttPostId,
      title: item.title ?? '(TikTok post)',
      platform: ['tt'],
      pillar: item.pillar ?? null,
      date: item.posted_at ? item.posted_at.slice(0, 10) : null,
    })
    .select('id, post_id')
    .single()

  if (error || !data) {
    console.error(`[tt-sync] failed to create posts row ${ttPostId}:`, error?.message)
    return null
  }

  console.log(`[tt-sync] created missing posts row ${ttPostId} for pipeline item ${item.id}`)
  return data as PostsRow
}

// ── Main sync ────────────────────────────────────────────────────────────────

export async function syncTikTokForClient(clientId: string): Promise<TikTokSyncResult> {
  const admin = createAdminClient()
  const connection = await getTikTokConnection(clientId)
  const result: TikTokSyncResult = {
    synced: 0,
    skipped: 0,
    errors: [],
    channelName: connection.channelName,
    subscriberCount: connection.subscriberCount,
  }

  const { data: linkedRows, error: linkedErr } = await admin
    .from('pipeline_items')
    .select('id, post_id, title, pillar, posted_at, tt_video_id')
    .eq('client_id', clientId)
    .not('tt_video_id', 'is', null)

  if (linkedErr) {
    throw new Error(`Failed to load linked TikTok pipeline items: ${linkedErr.message}`)
  }

  const linkedItems = ((linkedRows ?? []) as PipelineItem[]).filter(item => !!item.tt_video_id)
  if (linkedItems.length === 0) {
    return result
  }

  const postByVideoId = new Map<string, { post: PostsRow; item: PipelineItem }>()
  for (const item of linkedItems) {
    const post = await ensureTTPostsRowForPipeline(admin, clientId, item)
    if (!post || !item.tt_video_id) {
      result.skipped++
      continue
    }
    postByVideoId.set(item.tt_video_id, { post, item })
  }

  const videoIds = Array.from(postByVideoId.keys())
  const videos = await fetchTikTokVideoStats(connection.accessToken, videoIds)
  const statsById = new Map(videos.map(video => [video.id, video]))

  for (const videoId of videoIds) {
    const resolved = postByVideoId.get(videoId)
    const video = statsById.get(videoId)
    if (!resolved || !video) {
      console.warn(`[tt-sync] no TikTok stats returned for video_id=${videoId}`)
      result.skipped++
      continue
    }

    const views = video.view_count ?? 0
    const likes = video.like_count ?? 0
    const comments = video.comment_count ?? 0
    const shares = video.share_count ?? 0
    const now = new Date().toISOString()

    if (video.cover_image_url) {
      const [{ error: postMetaErr }, { error: pipeMetaErr }] = await Promise.all([
        admin
          .from('posts')
          .update({
            ...(video.title ? { title: video.title } : {}),
            thumbnail_url: video.cover_image_url,
          })
          .eq('id', resolved.post.id)
          .eq('client_id', clientId),
        admin
          .from('pipeline_items')
          .update({ thumbnail_url: video.cover_image_url })
          .eq('id', resolved.item.id)
          .eq('client_id', clientId),
      ])
      if (postMetaErr) console.error('[tt-sync] posts metadata update failed:', postMetaErr.message)
      if (pipeMetaErr) console.error('[tt-sync] pipeline thumbnail update failed:', pipeMetaErr.message)
    }

    const { error: upsertErr } = await admin.from('post_analytics').upsert({
      post_id: resolved.post.id,
      client_id: clientId,
      platform: 'tt',
      metric_window: 'live',
      views,
      client_views: views,
      likes,
      comments,
      shares,
      saves: 0,
      last_polled_at: now,
      recorded_at: now,
    }, { onConflict: 'post_id,platform,metric_window' })

    if (upsertErr) {
      console.error(`[tt-sync] upsert failed for ${videoId}:`, upsertErr.message, upsertErr.code, upsertErr.details)
      result.errors.push(`${videoId}: ${upsertErr.message}`)
      continue
    }

    if (resolved.item.posted_at) {
      await scheduleSnapshotsIfNew(admin, resolved.post.id, clientId, resolved.item.id, resolved.item.posted_at)
    }

    console.log(`[tt-sync] ✓ ${videoId} — views=${views} likes=${likes} comments=${comments} shares=${shares}`)
    result.synced++
  }

  return result
}

export async function syncSingleTTVideo(
  clientId: string,
  ttVideoId: string,
): Promise<{ synced: number; error?: string }> {
  const admin = createAdminClient()
  const connection = await getTikTokConnection(clientId)

  const { data: rawItem, error: itemErr } = await admin
    .from('pipeline_items')
    .select('id, post_id, title, pillar, posted_at, tt_video_id')
    .eq('client_id', clientId)
    .eq('tt_video_id', ttVideoId)
    .maybeSingle()

  if (itemErr || !rawItem) {
    return { synced: 0, error: itemErr?.message ?? `No pipeline item found for TikTok video ${ttVideoId}` }
  }

  const item = rawItem as PipelineItem
  const post = await ensureTTPostsRowForPipeline(admin, clientId, item)
  if (!post) {
    return { synced: 0, error: `No posts row found for TikTok video ${ttVideoId}` }
  }

  const [video] = await fetchTikTokVideoStats(connection.accessToken, [ttVideoId])
  if (!video) {
    return { synced: 0, error: `No TikTok stats returned for ${ttVideoId}` }
  }

  const views = video.view_count ?? 0
  const likes = video.like_count ?? 0
  const comments = video.comment_count ?? 0
  const shares = video.share_count ?? 0
  const now = new Date().toISOString()

  if (video.cover_image_url) {
    const [{ error: postMetaErr }, { error: pipeMetaErr }] = await Promise.all([
      admin
        .from('posts')
        .update({
          ...(video.title ? { title: video.title } : {}),
          thumbnail_url: video.cover_image_url,
        })
        .eq('id', post.id)
        .eq('client_id', clientId),
      admin
        .from('pipeline_items')
        .update({ thumbnail_url: video.cover_image_url })
        .eq('id', item.id)
        .eq('client_id', clientId),
    ])
    if (postMetaErr) console.error('[tt-sync] single posts metadata update failed:', postMetaErr.message)
    if (pipeMetaErr) console.error('[tt-sync] single pipeline thumbnail update failed:', pipeMetaErr.message)
  }

  const { error } = await admin.from('post_analytics').upsert({
    post_id: post.id,
    client_id: clientId,
    platform: 'tt',
    metric_window: 'live',
    views,
    client_views: views,
    likes,
    comments,
    shares,
    saves: 0,
    last_polled_at: now,
    recorded_at: now,
  }, { onConflict: 'post_id,platform,metric_window' })

  if (error) {
    console.error(`[tt-sync] single upsert failed for ${ttVideoId}:`, error.message, error.code, error.details)
    return { synced: 0, error: error.message }
  }

  if (item.posted_at) {
    await scheduleSnapshotsIfNew(admin, post.id, clientId, item.id, item.posted_at)
  }

  console.log(`[tt-sync] single ✓ ${ttVideoId} — views=${views} likes=${likes} comments=${comments} shares=${shares}`)
  return { synced: 1 }
}
