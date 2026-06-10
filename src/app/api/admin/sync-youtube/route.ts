import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getYouTubeConnection } from '@/lib/youtube-auth'

type SyncResult = {
  synced: number
  skipped: number
  errors: string[]
  lastSyncedAt: string
}

// Compute the end date for each analytics window relative to publish date
function windowEndDate(publishDate: string, win: 'w24' | 'w3' | 'w7' | 'eom'): string {
  const d = new Date(publishDate)
  if (win === 'w24') { d.setDate(d.getDate() + 1) }
  else if (win === 'w3') { d.setDate(d.getDate() + 3) }
  else if (win === 'w7') { d.setDate(d.getDate() + 7) }
  else {
    // End of the publish month
    d.setMonth(d.getMonth() + 1, 0)
  }
  // Cap at today so we don't request future data
  const today = new Date()
  if (d > today) return today.toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

async function fetchYTAnalytics(
  accessToken: string,
  channelId: string,
  videoId: string,
  startDate: string,
  endDate: string,
): Promise<{
  views: number; likes: number; comments: number; shares: number
  estimatedMinutesWatched: number; averageViewPercentage: number; subscribersGained: number
} | null> {
  const params = new URLSearchParams({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: 'views,likes,comments,shares,estimatedMinutesWatched,averageViewPercentage,subscribersGained',
    filters: `video==${videoId}`,
    dimensions: '',
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

  // Column order matches metrics param order
  return {
    views:                   row[0] ?? 0,
    likes:                   row[1] ?? 0,
    comments:                row[2] ?? 0,
    shares:                  row[3] ?? 0,
    estimatedMinutesWatched: row[4] ?? 0,
    averageViewPercentage:   row[5] ?? 0,
    subscribersGained:       row[6] ?? 0,
  }
}

function erPct(m: { views: number; likes: number; comments: number; shares: number; subscribersGained: number }) {
  if (!m.views) return 0
  return ((m.likes + m.comments + m.shares + m.subscribersGained) / m.views) * 100
}

function decisionFromEr(er: number): string {
  if (er >= 12) return 'Double Down'
  if (er >= 4)  return 'Iterate'
  return 'Kill'
}

export async function POST(req: NextRequest) {
  // Verify caller is an authenticated admin via session cookie
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
  const force:    boolean = body.force ?? false

  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const conn = await getYouTubeConnection(clientId)
  if (!conn || !conn.channel_id) {
    return NextResponse.json({ error: 'No YouTube connection found for this client' }, { status: 404 })
  }

  const admin  = createAdminClient()
  const result: SyncResult = { synced: 0, skipped: 0, errors: [], lastSyncedAt: '' }

  // Fetch all posts for this client with a yt_id in post_analytics
  type AnalyticsRow = { id: string; post_id: string; yt_id: string | null; metric_window: string }
  type PostRow = { id: string; post_id: string; date: string; decision: string | null }

  const { data: analyticsRows, error: aErr } = await admin
    .from('post_analytics')
    .select('id, post_id, yt_id, metric_window')
    .not('yt_id', 'is', null)

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  // Build map: post UUID → yt_id (first non-null)
  const postYtMap = new Map<string, string>()
  for (const row of (analyticsRows ?? []) as unknown as AnalyticsRow[]) {
    if (row.yt_id && !postYtMap.has(row.post_id)) {
      postYtMap.set(row.post_id, row.yt_id)
    }
  }

  // Fetch matching posts (to get publish date + post_id text)
  const postUuids = [...postYtMap.keys()]
  if (postUuids.length === 0) {
    return NextResponse.json({ ...result, message: 'No posts with yt_id found' })
  }

  const { data: postsData, error: pErr } = await admin
    .from('posts')
    .select('id, post_id, date, decision')
    .eq('client_id', clientId)
    .in('id', postUuids)

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const posts = (postsData ?? []) as unknown as PostRow[]
  const WINDOWS: ('w24' | 'w3' | 'w7' | 'eom')[] = ['w24', 'w3', 'w7', 'eom']

  for (const post of posts) {
    const videoId = postYtMap.get(post.id)!
    const publishDate = post.date

    // Check which windows already have data (to skip unless --force)
    type ExistingRow = { metric_window: string; views: number | null }
    const { data: existing } = await admin
      .from('post_analytics')
      .select('metric_window, views')
      .eq('post_id', post.id)
      .in('metric_window', WINDOWS)

    const existingWins = new Set(
      ((existing ?? []) as unknown as ExistingRow[])
        .filter(r => (r.views ?? 0) > 0)
        .map(r => r.metric_window),
    )

    let bestEr  = 0
    let bestViews = 0

    for (const win of WINDOWS) {
      if (existingWins.has(win) && !force) {
        result.skipped++
        continue
      }

      const endDate = windowEndDate(publishDate, win)
      if (endDate <= publishDate) {
        result.skipped++
        continue
      }

      const metrics = await fetchYTAnalytics(
        conn.access_token,
        conn.channel_id,
        videoId,
        publishDate,
        endDate,
      )

      if (!metrics || metrics.views === 0) {
        result.skipped++
        continue
      }

      const er = erPct(metrics)
      if (metrics.views > bestViews) { bestViews = metrics.views; bestEr = er }

      // Upsert the analytics row
      const { error: uErr } = await admin
        .from('post_analytics')
        .upsert(
          {
            post_id:        post.id,
            metric_window:  win,
            yt_id:          videoId,
            views:          metrics.views,
            likes:          metrics.likes,
            comments:       metrics.comments,
            shares:         metrics.shares,
            saves:          null,
            watch_pct:      metrics.averageViewPercentage,
            followers:      metrics.subscribersGained,
            er_pct:         Math.round(er * 100) / 100,
          },
          { onConflict: 'post_id,metric_window' },
        )

      if (uErr) {
        result.errors.push(`${post.post_id} ${win}: ${uErr.message}`)
      } else {
        result.synced++
      }
    }

    // Update decision on the post from best window
    if (bestViews > 0) {
      await admin
        .from('posts')
        .update({ decision: decisionFromEr(bestEr) })
        .eq('id', post.id)
    }
  }

  const now = new Date().toISOString()
  result.lastSyncedAt = now

  // Update last_synced_at on the connection record
  await admin
    .from('platform_connections')
    .update({ last_synced_at: now, updated_at: now })
    .eq('client_id', clientId)
    .eq('platform', 'youtube')

  return NextResponse.json(result)
}
