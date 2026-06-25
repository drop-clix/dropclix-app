import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleSnapshotsIfNew } from '@/lib/video-polling'
import { fillPublishDatesIfMissing } from '@/lib/publish-date'

type AdminClient = ReturnType<typeof createAdminClient>

type TikTokConnection = {
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: string | null
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
  create_time?: number | null
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

const TIKTOK_VIDEO_FIELDS = 'id,title,view_count,like_count,comment_count,share_count,cover_image_url,create_time'
const TIKTOK_RECONNECT_REQUIRED = 'Token expired, please reconnect'
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

function extractPlatformPostId(rawPostId: string, platform: 'tt'): string | null {
  const prefix = `#${platform}`
  const parts = rawPostId.split('|').map(part => part.trim()).filter(Boolean)
  return parts.find(part => part.toLowerCase().startsWith(prefix)) ?? null
}

function postIdParts(rawPostId: string): string[] {
  return rawPostId.split('|').map(part => part.trim()).filter(Boolean)
}

function shouldRefreshTikTokToken(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return true
  const expiryMs = new Date(tokenExpiresAt).getTime()
  if (Number.isNaN(expiryMs)) return true
  return expiryMs <= Date.now() + TOKEN_REFRESH_BUFFER_MS
}

// ── Connection ───────────────────────────────────────────────────────────────

export async function getTikTokConnection(clientId: string): Promise<TikTokConnection> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('platform_connections')
    .select('access_token, refresh_token, token_expires_at, channel_name, subscriber_count')
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

  const connection: TikTokConnection = {
    accessToken: conn.access_token,
    refreshToken: conn.refresh_token ?? null,
    tokenExpiresAt: conn.token_expires_at ?? null,
    channelName: conn.channel_name ?? null,
    subscriberCount: conn.subscriber_count ?? null,
  }

  if (shouldRefreshTikTokToken(connection.tokenExpiresAt)) {
    const refreshed = await refreshTikTokToken(clientId)
    if (!refreshed) throw new Error(TIKTOK_RECONNECT_REQUIRED)
    return refreshed
  }

  return connection
}

export async function refreshTikTokToken(clientId: string): Promise<TikTokConnection | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('platform_connections')
    .select('refresh_token, channel_name, subscriber_count')
    .eq('client_id', clientId)
    .eq('platform', 'tiktok')
    .single()

  if (error || !data) {
    console.error('[tt-sync] token refresh failed: no TikTok connection found', error?.message)
    return null
  }

  const current = data as any
  const refreshToken = current.refresh_token as string | null
  if (!refreshToken) {
    console.error('[tt-sync] token refresh failed: no refresh token stored for client', clientId)
    return null
  }

  console.log('[tt-sync] refreshing TikTok access token for client', clientId)

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const rawText = await res.text()
  let json: any = null
  try {
    json = rawText ? JSON.parse(rawText) : null
  } catch {
    console.error('[tt-sync] token refresh returned non-JSON response:', res.status, rawText)
    return null
  }

  if (!res.ok) {
    console.error('[tt-sync] token refresh HTTP failed:', res.status, json?.error ?? json)
    return null
  }

  const nested = json?.data as Record<string, unknown> | undefined
  const accessToken = (nested?.access_token as string | undefined) ?? (json?.access_token as string | undefined)
  const nextRefreshToken = (nested?.refresh_token as string | undefined) ?? (json?.refresh_token as string | undefined)
  const expiresIn = Number(nested?.expires_in ?? json?.expires_in ?? 86400)
  const apiError = json?.error as Record<string, unknown> | undefined

  if (apiError?.code || !accessToken || Number.isNaN(expiresIn)) {
    console.error('[tt-sync] token refresh API failed:', apiError ?? 'missing access_token/expires_in')
    return null
  }

  const expiry = new Date(Date.now() + expiresIn * 1000).toISOString()
  const now = new Date().toISOString()

  const { data: updated, error: updateErr } = await admin
    .from('platform_connections')
    .update({
      access_token: accessToken,
      refresh_token: nextRefreshToken ?? refreshToken,
      token_expires_at: expiry,
      updated_at: now,
    })
    .eq('client_id', clientId)
    .eq('platform', 'tiktok')
    .select('access_token, refresh_token, token_expires_at, channel_name, subscriber_count')
    .single()

  if (updateErr || !updated) {
    console.error('[tt-sync] token refresh DB update failed:', updateErr?.message)
    return null
  }

  console.log('[tt-sync] TikTok access token refreshed; expires_at=', expiry)

  const conn = updated as any
  return {
    accessToken: conn.access_token,
    refreshToken: conn.refresh_token ?? null,
    tokenExpiresAt: conn.token_expires_at ?? null,
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
    const publishedAt = await fillPublishDatesIfMissing(admin, {
      clientId,
      postUUID: resolved.post.id,
      pipelineItemId: resolved.item.id,
      publishedAt: video.create_time,
    })
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

    const snapshotPostedAt = resolved.item.posted_at ?? publishedAt?.iso
    if (snapshotPostedAt) {
      await scheduleSnapshotsIfNew(admin, resolved.post.id, clientId, resolved.item.id, snapshotPostedAt)
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
  let connection: TikTokConnection
  try {
    connection = await getTikTokConnection(clientId)
  } catch (err) {
    const message = err instanceof Error ? err.message : TIKTOK_RECONNECT_REQUIRED
    return { synced: 0, error: message === TIKTOK_RECONNECT_REQUIRED ? TIKTOK_RECONNECT_REQUIRED : message }
  }

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
  const publishedAt = await fillPublishDatesIfMissing(admin, {
    clientId,
    postUUID: post.id,
    pipelineItemId: item.id,
    publishedAt: video.create_time,
  })
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

  const snapshotPostedAt = item.posted_at ?? publishedAt?.iso
  if (snapshotPostedAt) {
    await scheduleSnapshotsIfNew(admin, post.id, clientId, item.id, snapshotPostedAt)
  }

  console.log(`[tt-sync] single ✓ ${ttVideoId} — views=${views} likes=${likes} comments=${comments} shares=${shares}`)
  return { synced: 1 }
}
