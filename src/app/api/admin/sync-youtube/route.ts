import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getYouTubeConnection, fetchChannelInfo } from '@/lib/youtube-auth'

type SyncResult = {
  synced: number
  skipped: number
  errors: string[]
  lastSyncedAt: string
}

async function fetchYTAnalytics(
  accessToken: string,
  channelId: string,
  videoId: string,
  startDate: string,
  endDate: string,
): Promise<{
  views: number; likes: number; comments: number; shares: number
  estimatedMinutesWatched: number; averageViewPercentage: number
  subscribersGained: number; impressions: number; ctr: number
} | null> {
  // Main call: per-video engagement metrics (always supported with yt-analytics.readonly)
  const params = new URLSearchParams({
    ids:      `channel==${channelId}`,
    startDate,
    endDate,
    metrics:  'views,likes,comments,shares,estimatedMinutesWatched,averageViewPercentage,subscribersGained',
    filters:  `video==${videoId}`,
  })

  const res = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    console.error(`YT Analytics error for ${videoId}:`, await res.text())
    return null
  }

  const json = await res.json()
  const row = json.rows?.[0]
  if (!row) return null

  // Secondary call: impressions + CTR — requires dimensions=video; stored as 0 if unavailable
  let impressions = 0
  let ctr = 0
  try {
    const iParams = new URLSearchParams({
      ids:        `channel==${channelId}`,
      startDate,
      endDate,
      dimensions: 'video',
      metrics:    'impressions,impressionsClickThroughRate',
      filters:    `video==${videoId}`,
    })
    const iRes = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${iParams.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (iRes.ok) {
      const iJson = await iRes.json()
      const iRow = iJson.rows?.[0]  // columns: [videoId, impressions, ctr]
      if (iRow) {
        impressions = Math.round(iRow[1] ?? 0)
        ctr         = Math.round((iRow[2] ?? 0) * 10000) / 100
      }
    }
  } catch { /* impressions unavailable — stored as 0 */ }

  return {
    views:                   Math.round(row[0] ?? 0),
    likes:                   Math.round(row[1] ?? 0),
    comments:                Math.round(row[2] ?? 0),
    shares:                  Math.round(row[3] ?? 0),
    estimatedMinutesWatched: Math.round(row[4] ?? 0),
    averageViewPercentage:   Math.round((row[5] ?? 0) * 100) / 100,
    subscribersGained:       Math.round(row[6] ?? 0),
    impressions,
    ctr,
  }
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
  const result: SyncResult = { synced: 0, skipped: 0, errors: [], lastSyncedAt: '' }

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

  for (const post of posts) {
    const videoId    = post.yt_id
    const publishDate = post.date
    const endDate = new Date().toISOString().slice(0, 10)
    const metrics = await fetchYTAnalytics(
      conn.access_token,
      conn.channel_id,
      videoId,
      publishDate,
      endDate,
    )

    if (!metrics) {
      result.skipped++
      continue
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
  }

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
