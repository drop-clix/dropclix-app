import { getPortalContext } from '@/lib/supabase/portal'
import { DashboardCharts } from '@/components/portal/DashboardCharts'
import type { MonthlyPoint, PillarPoint } from '@/components/portal/DashboardCharts'
import { FilterBar } from '@/components/portal/FilterBar'

/* ── Types ──────────────────────────────────────── */
type Post = {
  post_id: string
  title: string
  platform: string[]
  date: string | null
}

const STATUS_ORDER = ['PLANNED','SCRIPTED','FILMING','EDITING','REVIEWING','SCHEDULED','POSTED']
const PLATFORM_LABELS: Record<string, string> = { ig: 'IG', tt: 'TT', yt: 'YT' }

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + 'K'
  return n.toString()
}

/* ── Sub-components ─────────────────────────────── */
function KpiCard({
  label, value, sub, index,
}: {
  label: string; value: string; sub: string; index: number
}) {
  return (
    <div
      className="kpi-bar relative overflow-hidden flex flex-col justify-between"
      style={{
        background: '#0a0a0a',
        border: '1px solid #141414',
        padding: '28px 24px 24px',
        animationDelay: `${index * 80}ms`,
      }}
    >
      <p
        className="text-[8px] font-medium tracking-[.2em] uppercase mb-4"
        style={{ color: '#333' }}
      >
        {label}
      </p>
      <p
        className="font-jakarta font-light text-gold-gradient"
        style={{ fontSize: 'clamp(32px,3.5vw,52px)', lineHeight: 1 }}
      >
        {value}
      </p>
      <p
        className="text-[10px] font-light mt-2"
        style={{ color: '#333' }}
      >
        {sub}
      </p>
    </div>
  )
}

function PlatformBadge({ platform }: { platform: string }) {
  const label = PLATFORM_LABELS[platform] ?? platform.toUpperCase()
  return (
    <span
      className="inline-block text-[7px] font-medium tracking-[.14em] px-1.5 py-0.5"
      style={{ background: 'rgba(201,169,110,0.08)', color: '#c9a96e', border: '1px solid rgba(201,169,110,0.15)' }}
    >
      {label}
    </span>
  )
}

function EmptyTableRow() {
  return (
    <tr>
      <td colSpan={4} className="text-center py-12 text-[11px]" style={{ color: '#2a2a2a' }}>
        No posts yet — data migration coming in a future session.
      </td>
    </tr>
  )
}

/* ── Page ───────────────────────────────────────── */
export default async function DashboardPage() {
  const { supabase, clientId, userEmail } = await getPortalContext()

  const cid = clientId ?? '00000000-0000-0000-0000-000000000000'

  /* ── Queries run in parallel ──────────────────── */
  const [postsRes, analyticsRes, pipelineRes, recentRes, chartPostsRes] = await Promise.all([
    // Total post count
    supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', cid),

    // Analytics for eom window (aggregate totals)
    supabase
      .from('post_analytics')
      .select('views, likes, comments, shares, saves')
      .eq('client_id', cid)
      .eq('metric_window', 'eom'),

    // Pipeline status breakdown
    supabase
      .from('pipeline_items')
      .select('status')
      .eq('client_id', cid),

    // Recent 8 posts
    supabase
      .from('posts')
      .select('post_id, title, platform, date')
      .eq('client_id', cid)
      .order('date', { ascending: false })
      .limit(8),

    // All posts + eom analytics for charts
    supabase
      .from('posts')
      .select('date, pillar, post_analytics(metric_window, views, followers, likes, comments, shares, saves)')
      .eq('client_id', cid)
      .order('date', { ascending: true }),
  ])

  /* ── Chart data: monthly + pillar aggregates ─── */
  type RawChartPost = {
    date: string | null
    pillar: string | null
    post_analytics: Array<{
      metric_window: string
      views: number; followers: number
      likes: number; comments: number
      shares: number; saves: number
    }>
  }

  const MONTH_LABELS: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
  }

  const rawChartPosts = (chartPostsRes.data ?? []) as unknown as RawChartPost[]

  // Monthly aggregation
  const monthMap = new Map<string, { posts: number; views: number; followers: number; totalER: number; erCount: number }>()
  for (const p of rawChartPosts) {
    if (!p.date) continue
    const mk = p.date.slice(0, 7) // "2026-02"
    if (!monthMap.has(mk)) monthMap.set(mk, { posts: 0, views: 0, followers: 0, totalER: 0, erCount: 0 })
    const m = monthMap.get(mk)!
    const eom = p.post_analytics.find(a => a.metric_window === 'eom')
    m.posts++
    if (eom) {
      m.views     += eom.views     ?? 0
      m.followers += eom.followers ?? 0
      const er = (eom.views ?? 0) > 0
        ? ((eom.likes + eom.comments + eom.shares + eom.saves) / eom.views) * 100
        : 0
      m.totalER += er; m.erCount++
    }
  }
  const monthly: MonthlyPoint[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mk, m]) => {
      const [, mo] = mk.split('-')
      return {
        month:     MONTH_LABELS[mo] ?? mo,
        posts:     m.posts,
        views:     m.views,
        followers: m.followers,
        avgER:     m.erCount > 0 ? +(m.totalER / m.erCount).toFixed(1) : 0,
      }
    })

  // Pillar aggregation
  const pillarMap = new Map<string, { totalER: number; count: number }>()
  for (const p of rawChartPosts) {
    const pillar = p.pillar ?? '—'
    if (!pillarMap.has(pillar)) pillarMap.set(pillar, { totalER: 0, count: 0 })
    const pm = pillarMap.get(pillar)!
    const eom = p.post_analytics.find(a => a.metric_window === 'eom')
    if (eom && (eom.views ?? 0) > 0) {
      const er = ((eom.likes + eom.comments + eom.shares + eom.saves) / eom.views) * 100
      pm.totalER += er; pm.count++
    }
  }
  const pillars: PillarPoint[] = [...pillarMap.entries()]
    .filter(([, v]) => v.count > 0)
    .map(([pillar, v]) => ({
      pillar,
      avgER: +(v.totalER / v.count).toFixed(1),
      count: v.count,
    }))

  /* ── Derived KPIs ─────────────────────────────── */
  const totalPosts = postsRes.count ?? 0

  const analytics = (analyticsRes.data ?? []) as unknown as { views: number; likes: number; comments: number; shares: number; saves: number }[]
  const totalViews    = analytics.reduce((s, a) => s + (a.views    ?? 0), 0)
  const totalLikes    = analytics.reduce((s, a) => s + (a.likes    ?? 0), 0)
  const totalComments = analytics.reduce((s, a) => s + (a.comments ?? 0), 0)
  const totalShares   = analytics.reduce((s, a) => s + (a.shares   ?? 0), 0)
  const totalSaves    = analytics.reduce((s, a) => s + (a.saves    ?? 0), 0)
  const engRate =
    totalViews > 0
      ? (((totalLikes + totalComments + totalShares + totalSaves) / totalViews) * 100).toFixed(1)
      : '—'

  const pipeline = pipelineRes.data ?? []
  const activePipeline = pipeline.filter(
    p => !['POSTED', 'CANCELLED'].includes(p.status)
  ).length

  const statusCounts = pipeline.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1
    return acc
  }, {})

  const recentPosts = (recentRes.data ?? []) as Post[]

  /* ── Page header greeting ─────────────────────── */
  const clientName = userEmail?.split('@')[0] ?? 'there'

  return (
    <div className="p-10 max-w-[1200px]">

      {/* Header */}
      <div className="mb-10" style={{ borderBottom: '1px solid #141414', paddingBottom: 28 }}>
        <p
          className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
          style={{ color: '#c9a96e' }}
        >
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Overview
        </p>
        <h1
          className="font-jakarta font-light"
          style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}
        >
          Dashboard
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#444' }}>
          Welcome back, {clientName}.
        </p>
      </div>

      <FilterBar />

      {/* ── KPI Cards ─────────────────────────────── */}
      <div className="grid gap-px mb-px" style={{ gridTemplateColumns: 'repeat(4, 1fr)', background: '#141414' }}>
        <KpiCard
          index={0}
          label="Total Posts"
          value={fmt(totalPosts)}
          sub={totalPosts === 0 ? 'No posts yet' : 'All-time'}
        />
        <KpiCard
          index={1}
          label="Total Views"
          value={totalViews > 0 ? fmt(totalViews) : '—'}
          sub="End-of-month windows"
        />
        <KpiCard
          index={2}
          label="Engagement Rate"
          value={engRate === '—' ? '—' : `${engRate}%`}
          sub="Likes + comments + shares + saves / views"
        />
        <KpiCard
          index={3}
          label="Pipeline Active"
          value={fmt(activePipeline)}
          sub={`${pipeline.length} total items`}
        />
      </div>

      {/* ── Pipeline Status Strip ─────────────────── */}
      {pipeline.length > 0 && (
        <div
          className="flex gap-px mb-10"
          style={{ background: '#141414' }}
        >
          {STATUS_ORDER.map(status => {
            const count = statusCounts[status] ?? 0
            const pct = pipeline.length > 0 ? Math.round((count / pipeline.length) * 100) : 0
            return (
              <div
                key={status}
                className="flex flex-col items-center py-4 flex-1"
                style={{ background: '#080808', minWidth: 0 }}
              >
                <p
                  className="font-jakarta font-light text-[18px] mb-1"
                  style={{ color: count > 0 ? '#c9a96e' : '#1a1a1a' }}
                >
                  {count}
                </p>
                <p
                  className="text-[7px] tracking-[.14em] uppercase text-center"
                  style={{ color: '#2a2a2a' }}
                >
                  {status}
                </p>
                {count > 0 && (
                  <p className="text-[7px] mt-0.5" style={{ color: '#1e1e1e' }}>
                    {pct}%
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Charts ───────────────────────────────── */}
      {monthly.length > 0 && (
        <div className="mt-10 mb-px">
          <p
            className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
            style={{ color: '#c9a96e' }}
          >
            <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
            Performance Trends
          </p>
          <DashboardCharts monthly={monthly} pillars={pillars} />
        </div>
      )}

      {/* ── Recent Posts ──────────────────────────── */}
      <div
        className="mt-10"
        style={{ border: '1px solid #141414' }}
      >
        {/* Table header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #141414' }}
        >
          <p
            className="text-[9px] font-medium tracking-[.22em] uppercase"
            style={{ color: '#444' }}
          >
            Recent Content
          </p>
          <p
            className="text-[9px] tracking-[.12em] uppercase"
            style={{ color: '#2a2a2a' }}
          >
            {recentPosts.length} shown
          </p>
        </div>

        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #141414' }}>
              {['ID', 'Title', 'Platform', 'Date'].map(h => (
                <th
                  key={h}
                  className="text-left px-6 py-3 text-[8px] font-medium tracking-[.18em] uppercase"
                  style={{ color: '#2a2a2a' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentPosts.length === 0 ? (
              <EmptyTableRow />
            ) : (
              recentPosts.map((post, i) => (
                <tr
                  key={post.post_id}
                  style={{
                    borderBottom: i < recentPosts.length - 1 ? '1px solid #0e0e0e' : 'none',
                    background: i % 2 === 0 ? '#060606' : '#080808',
                  }}
                >
                  <td className="px-6 py-4">
                    <span
                      className="text-[10px] font-medium tracking-[.1em]"
                      style={{ color: '#c9a96e' }}
                    >
                      {post.post_id}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className="text-[12px] font-light"
                      style={{ color: '#f2ede4' }}
                    >
                      {post.title}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      {(post.platform ?? []).map(p => (
                        <PlatformBadge key={p} platform={p} />
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className="text-[11px] font-light"
                      style={{ color: '#444' }}
                    >
                      {post.date ?? '—'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Empty state notice when no client data yet */}
      {!clientId && (
        <div
          className="mt-8 px-6 py-5 text-[11px] font-light"
          style={{ background: '#080808', border: '1px solid #141414', color: '#444', lineHeight: 1.8 }}
        >
          Your portal is being set up. Data will appear here once your client profile
          is linked. Contact Drop CLIX to get started.
        </div>
      )}

    </div>
  )
}
