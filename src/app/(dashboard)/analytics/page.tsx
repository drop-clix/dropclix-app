import { getPortalContext } from '@/lib/supabase/portal'
import { AnalyticsClient } from '@/components/portal/AnalyticsClient'
import { FilterBar } from '@/components/portal/FilterBar'

// ── Types shared with AnalyticsClient ──────────────────────────────────────
export type WindowData = {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  followers: number
  watch_pct: number
  prevViews: number | null
  prevRecordedAt: string | null
  lastPolledAt: string | null
  recordedAt: string | null
}

export type PostRow = {
  uuid: string      // posts.id — needed to target post_analytics rows
  postId: string
  pipelinePostId: string | null
  title: string
  platform: string[]
  pillar: string
  hook: string
  format: string
  date: string
  decision: string
  thumbnailUrl: string | null
  // Keyed '{platform}_{metric_window}' e.g. 'ig_live', 'yt_eom' — used for per-platform display
  byPlatformWindow: Record<string, WindowData>
  // Flat windows: prefer 'ig' row; used when platform filter = 'all'
  live: WindowData
  w24: WindowData
  w3: WindowData
  w7: WindowData
  eom: WindowData
}

const EMPTY_WIN: WindowData = {
  views: 0, likes: 0, comments: 0, shares: 0,
  saves: 0, followers: 0, watch_pct: 0,
  prevViews: null, prevRecordedAt: null, lastPolledAt: null, recordedAt: null,
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function AnalyticsPage() {
  const { supabase, clientId } = await getPortalContext()
  const fallback = '00000000-0000-0000-0000-000000000000'

  // Fetch all posts + their analytics in one query
  const { data: rawPosts, error } = await supabase
    .from('posts')
    .select(`
      id, post_id, title, platform, pillar, hook, format, date, decision, yt_id,
      thumbnail_url,
      post_analytics(platform, metric_window, views, likes, comments, shares, saves, followers, watch_pct, prev_views, prev_recorded_at, last_polled_at, recorded_at)
    `)
    .eq('client_id', clientId ?? fallback)
    .order('date', { ascending: false })

  if (error) {
    console.error('Analytics fetch error:', error.message)
  }

  const { data: rawPipelineItems, error: pipelineError } = await supabase
    .from('pipeline_items')
    .select('post_id, title, yt_video_id, ig_video_id, tt_video_id')
    .eq('client_id', clientId ?? fallback)

  if (pipelineError) {
    console.error('Analytics pipeline ID fetch error:', pipelineError.message)
  }

  const pipelineByVideoId = new Map<string, string>()
  const pipelineByPostSegment = new Map<string, string>()
  const pipelineTitleByPostId = new Map<string, string>()

  for (const item of rawPipelineItems ?? []) {
    const pipelinePostId = (item as any).post_id as string | null
    const pipelineTitle  = (item as any).title    as string | null
    if (!pipelinePostId) continue

    const displayTitle = pipelineTitle?.trim() || 'Untitled'
    pipelineTitleByPostId.set(pipelinePostId, displayTitle)

    const ytVideoId = (item as any).yt_video_id as string | null
    const igVideoId = (item as any).ig_video_id as string | null
    const ttVideoId = (item as any).tt_video_id as string | null

    if (ytVideoId) pipelineByVideoId.set(ytVideoId, pipelinePostId)
    if (igVideoId) pipelineByVideoId.set(igVideoId, pipelinePostId)
    if (ttVideoId) pipelineByVideoId.set(ttVideoId, pipelinePostId)

    for (const part of pipelinePostId.split('|').map(part => part.trim()).filter(Boolean)) {
      pipelineByPostSegment.set(part, pipelinePostId)
      pipelineTitleByPostId.set(part, displayTitle)
    }
  }

  // Flatten into PostRow[]
  const mappedPosts: PostRow[] = (rawPosts ?? []).map(p => {
    // byPlatformWindow: exact per-platform data, e.g. 'ig_live', 'yt_eom'
    const byPlatformWindow: Record<string, WindowData> = {}
    // byWindow (flat): prefer 'ig' rows; used for platform='all' display
    const byWindow: Record<string, WindowData> = {}

    for (const a of p.post_analytics ?? []) {
      const data: WindowData = {
        views:          a.views           ?? 0,
        likes:          a.likes           ?? 0,
        comments:       a.comments        ?? 0,
        shares:         a.shares          ?? 0,
        saves:          a.saves           ?? 0,
        followers:      a.followers       ?? 0,
        watch_pct:      a.watch_pct       ?? 0,
        prevViews:      (a as any).prev_views       ?? null,
        prevRecordedAt: (a as any).prev_recorded_at ?? null,
        lastPolledAt:   (a as any).last_polled_at   ?? null,
        recordedAt:     (a as any).recorded_at      ?? null,
      }
      const rowPlatform = (a as any).platform as string ?? 'ig'
      byPlatformWindow[`${rowPlatform}_${a.metric_window}`] = data
      // Flat: prefer 'ig', then first-seen for each window
      if (!byWindow[a.metric_window] || rowPlatform === 'ig') {
        byWindow[a.metric_window] = data
      }
    }

    const ytId = (p as any).yt_id as string | null
    const resolvedPipelinePostId = (ytId ? pipelineByVideoId.get(ytId) : undefined)
      ?? pipelineByPostSegment.get(p.post_id)
      ?? null
    const displayTitle = resolvedPipelinePostId
      ? (pipelineTitleByPostId.get(resolvedPipelinePostId) ?? pipelineTitleByPostId.get(p.post_id) ?? 'Untitled')
      : (p.title ?? 'Untitled')

    return {
      uuid:     p.id,
      postId:   p.post_id,
      pipelinePostId: resolvedPipelinePostId,
      title:    displayTitle,
      platform: p.platform ?? [],
      pillar:   p.pillar   ?? '—',
      hook:     (p as any).hook   ?? '—',
      format:   (p as any).format ?? '—',
      date:     p.date     ?? '',
      decision: p.decision ?? '',
      thumbnailUrl: (p as any).thumbnail_url ?? null,
      byPlatformWindow,
      live: byWindow['live'] ?? { ...EMPTY_WIN },
      w24: byWindow['w24'] ?? { ...EMPTY_WIN },
      w3:  byWindow['w3']  ?? { ...EMPTY_WIN },
      w7:  byWindow['w7']  ?? { ...EMPTY_WIN },
      eom: byWindow['eom'] ?? { ...EMPTY_WIN },
    }
  })

  const hasAnalytics = (post: PostRow) => Object.keys(post.byPlatformWindow).length > 0
  const mergeWindows = (target: PostRow, source: PostRow) => {
    for (const [key, value] of Object.entries(source.byPlatformWindow)) {
      target.byPlatformWindow[key] ??= value
    }
    for (const win of ['live', 'w24', 'w3', 'w7', 'eom'] as const) {
      if (target[win].views === 0 && target[win].likes === 0 && target[win].comments === 0 && target[win].shares === 0 && target[win].saves === 0) {
        target[win] = source[win]
      }
    }
  }

  const postsByResolvedId = new Map<string, PostRow>()
  for (const post of mappedPosts) {
    const key = post.pipelinePostId ?? post.postId
    const existing = postsByResolvedId.get(key)
    if (!existing) {
      postsByResolvedId.set(key, post)
      continue
    }

    const keep = hasAnalytics(existing) || !hasAnalytics(post) ? existing : post
    const mergeFrom = keep === existing ? post : existing
    mergeWindows(keep, mergeFrom)
    postsByResolvedId.set(key, keep)
  }
  const posts = [...postsByResolvedId.values()]

  return (
    <div className="p-10">
      {/* Header */}
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
        <p
          className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
          style={{ color: '#c9a96e' }}
        >
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Content Performance
        </p>
        <h1
          className="font-jakarta font-light"
          style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}
        >
          Analytics
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#666' }}>
          {posts.length} posts · all metric windows · IG / TT / YT
        </p>
      </div>

      <FilterBar showScope />
      <AnalyticsClient posts={posts} />
    </div>
  )
}
