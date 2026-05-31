import { getPortalContext } from '@/lib/supabase/portal'
import { AnalyticsClient } from '@/components/portal/AnalyticsClient'

// ── Types shared with AnalyticsClient ──────────────────────────────────────
export type WindowData = {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  followers: number
  watch_pct: number
}

export type PostRow = {
  uuid: string      // posts.id — needed to target post_analytics rows
  postId: string
  title: string
  platform: string[]
  pillar: string
  date: string
  decision: string
  w24: WindowData
  w3: WindowData
  w7: WindowData
  eom: WindowData
}

const EMPTY_WIN: WindowData = {
  views: 0, likes: 0, comments: 0, shares: 0,
  saves: 0, followers: 0, watch_pct: 0,
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function AnalyticsPage() {
  const { supabase, clientId } = await getPortalContext()
  const fallback = '00000000-0000-0000-0000-000000000000'

  // Fetch all posts + their analytics in one query
  const { data: rawPosts, error } = await supabase
    .from('posts')
    .select(`
      id, post_id, title, platform, pillar, date, decision,
      post_analytics(metric_window, views, likes, comments, shares, saves, followers, watch_pct)
    `)
    .eq('client_id', clientId ?? fallback)
    .order('date', { ascending: false })

  if (error) {
    console.error('Analytics fetch error:', error.message)
  }

  // Flatten into PostRow[]
  const posts: PostRow[] = (rawPosts ?? []).map(p => {
    const byWindow: Record<string, WindowData> = {}
    for (const a of p.post_analytics ?? []) {
      byWindow[a.metric_window] = {
        views:     a.views     ?? 0,
        likes:     a.likes     ?? 0,
        comments:  a.comments  ?? 0,
        shares:    a.shares    ?? 0,
        saves:     a.saves     ?? 0,
        followers: a.followers ?? 0,
        watch_pct: a.watch_pct ?? 0,
      }
    }
    return {
      uuid:     p.id,
      postId:   p.post_id,
      title:    p.title,
      platform: p.platform ?? [],
      pillar:   p.pillar   ?? '—',
      date:     p.date     ?? '',
      decision: p.decision ?? '',
      w24: byWindow['w24'] ?? { ...EMPTY_WIN },
      w3:  byWindow['w3']  ?? { ...EMPTY_WIN },
      w7:  byWindow['w7']  ?? { ...EMPTY_WIN },
      eom: byWindow['eom'] ?? { ...EMPTY_WIN },
    }
  })

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
        <p className="text-[12px] font-light mt-1" style={{ color: '#444' }}>
          {posts.length} posts · all metric windows · IG / TT / YT
        </p>
      </div>

      <AnalyticsClient posts={posts} />
    </div>
  )
}
