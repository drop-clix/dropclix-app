'use client'

import { useMemo } from 'react'
import { DashboardCharts } from '@/components/portal/DashboardCharts'
import { PlatformPills, ScopeDropdown } from '@/components/portal/FilterBar'
import { usePortalFilters, filterByPlatform, filterByScope, getScopeRange } from '@/hooks/usePortalFilters'
import type { MonthlyPoint, PillarPoint } from '@/components/portal/DashboardCharts'
import type { PlatformFilter } from '@/hooks/usePortalFilters'

// ── Types ──────────────────────────────────────────────────────────────────

export type RawDashPost = {
  post_id: string
  title: string
  platform: string[]
  date: string | null
  format: string | null
  pillar: string | null
  post_analytics: {
    metric_window: string
    views: number
    likes: number
    comments: number
    shares: number
    saves: number
    followers: number
  }[]
}

export type RawDashPipeline = {
  status: string
  platform: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}

const STATUS_ORDER = ['PLANNED','SCRIPTED','FILMING','EDITING','REVIEWING','SCHEDULED','POSTED']
const PLATFORM_LABELS: Record<string, string> = { ig: 'IG', tt: 'TT', yt: 'YT', lf: 'LF' }

const GLOW: Record<string, string> = {
  ig: '#c9a96e',
  tt: '#a78bfa',
  yt: '#4cc9ff',
  lf: '#4cc9ff',
  all: '#c9a96e',
}

const PLATFORM_NAMES: Record<string, string> = {
  ig: 'Instagram',
  tt: 'TikTok',
  yt: 'YouTube',
  lf: 'Long-form',
  all: 'All Platforms',
}

// ── SVG empty-state icons ─────────────────────────────────────────────────

function IgEmptyIcon() {
  return (
    <svg width={48} height={48} viewBox="0 0 48 48" fill="none">
      <rect x="4" y="4" width="40" height="40" rx="12" stroke="#2a2a2a" strokeWidth="2"/>
      <circle cx="24" cy="24" r="9" stroke="#2a2a2a" strokeWidth="2"/>
      <circle cx="35" cy="13" r="3" fill="#2a2a2a"/>
    </svg>
  )
}
function TtEmptyIcon() {
  return (
    <svg width={48} height={48} viewBox="0 0 48 48" fill="none">
      <path d="M34 4c0 10 6 14 14 14v8c-5.6 0-10.4-2-14-5.2V38c0 7.2-5.6 13-12 13S10 45.2 10 38s5.6-13 12-13c1 0 2 .1 2.8.4V33C23.2 32.8 22.2 32.6 22 32.6c-3.2 0-6 3.2-6 6s2.8 6 6 6 6-3.2 6-6V0h6v4z" fill="#2a2a2a"/>
    </svg>
  )
}
function YtEmptyIcon() {
  return (
    <svg width={48} height={36} viewBox="0 0 48 36" fill="none">
      <rect x="2" y="2" width="44" height="32" rx="8" stroke="#2a2a2a" strokeWidth="2"/>
      <path d="M19 11L32 18L19 25V11Z" fill="#2a2a2a"/>
    </svg>
  )
}

const EMPTY_ICONS: Record<string, React.ReactNode> = {
  ig: <IgEmptyIcon />,
  tt: <TtEmptyIcon />,
  yt: <YtEmptyIcon />,
  lf: <YtEmptyIcon />,
  all: <IgEmptyIcon />,
}

// ── Sub-components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, index }: { label: string; value: string; sub: string; index: number }) {
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
      <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#333' }}>
        {label}
      </p>
      <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(32px,3.5vw,52px)', lineHeight: 1 }}>
        {value}
      </p>
      <p className="text-[10px] font-light mt-2" style={{ color: '#333' }}>
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

// ── Main ───────────────────────────────────────────────────────────────────

export function DashboardClient({
  rawPosts,
  rawPipeline,
  clientName,
}: {
  rawPosts: RawDashPost[]
  rawPipeline: RawDashPipeline[]
  clientName: string
}) {
  const { platform, scope, from, to, setFilters } = usePortalFilters()

  // Normalise: RawDashPost has platform[] + nullable date — wrap for filterByScope
  type ScopedPost = RawDashPost & { date: string }
  const postsWithDate = useMemo(
    () => rawPosts.filter((p): p is RawDashPost & { date: string } => !!p.date),
    [rawPosts],
  )

  // Apply platform filter
  const platFiltered = useMemo(
    () => filterByPlatform(postsWithDate, platform, p => p.format),
    [postsWithDate, platform],
  )

  // Apply scope filter
  const filteredPosts = useMemo(
    () => filterByScope(platFiltered as ScopedPost[], scope, from, to),
    [platFiltered, scope, from, to],
  )

  // Filter pipeline by platform
  const filteredPipeline = useMemo(() => {
    if (platform === 'all') return rawPipeline
    if (platform === 'lf') return rawPipeline.filter(p => p.platform.includes('yt'))
    return rawPipeline.filter(p => p.platform.includes(platform))
  }, [rawPipeline, platform])

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalPosts = filteredPosts.length
    let totalViews = 0, likes = 0, comments = 0, shares = 0, saves = 0
    for (const p of filteredPosts) {
      const eom = p.post_analytics.find(a => a.metric_window === 'eom')
      if (eom) {
        totalViews += eom.views ?? 0
        likes     += eom.likes ?? 0
        comments  += eom.comments ?? 0
        shares    += eom.shares ?? 0
        saves     += eom.saves ?? 0
      }
    }
    const engRate = totalViews > 0
      ? (((likes + comments + shares + saves) / totalViews) * 100).toFixed(1)
      : '—'

    const activePipeline = filteredPipeline.filter(
      p => !['POSTED','CANCELLED'].includes(p.status)
    ).length

    return { totalPosts, totalViews, engRate, activePipeline }
  }, [filteredPosts, filteredPipeline])

  // ── Pipeline status strip ────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of filteredPipeline) counts[p.status] = (counts[p.status] ?? 0) + 1
    return counts
  }, [filteredPipeline])

  // ── Charts ────────────────────────────────────────────────────────────────
  const { monthly, pillars } = useMemo(() => {
    const monthMap = new Map<string, { posts: number; views: number; followers: number; totalER: number; erCount: number }>()
    const pillarMap = new Map<string, { totalER: number; count: number }>()

    for (const p of filteredPosts) {
      const mk = p.date!.slice(0, 7)
      if (!monthMap.has(mk)) monthMap.set(mk, { posts: 0, views: 0, followers: 0, totalER: 0, erCount: 0 })
      const m = monthMap.get(mk)!
      const eom = p.post_analytics.find(a => a.metric_window === 'eom')
      m.posts++
      if (eom) {
        m.views += eom.views ?? 0
        m.followers += eom.followers ?? 0
        const er = (eom.views ?? 0) > 0
          ? ((eom.likes + eom.comments + eom.shares + eom.saves) / eom.views) * 100
          : 0
        m.totalER += er; m.erCount++
      }

      const pl = p.pillar ?? '—'
      if (!pillarMap.has(pl)) pillarMap.set(pl, { totalER: 0, count: 0 })
      const pm = pillarMap.get(pl)!
      const eom2 = p.post_analytics.find(a => a.metric_window === 'eom')
      if (eom2 && (eom2.views ?? 0) > 0) {
        const er = ((eom2.likes + eom2.comments + eom2.shares + eom2.saves) / eom2.views) * 100
        pm.totalER += er; pm.count++
      }
    }

    const monthly: MonthlyPoint[] = [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mk, m]) => {
        const mo = mk.split('-')[1]
        return {
          month: MONTH_LABELS[mo] ?? mo,
          posts: m.posts,
          views: m.views,
          followers: m.followers,
          avgER: m.erCount > 0 ? +(m.totalER / m.erCount).toFixed(1) : 0,
        }
      })

    const pillars: PillarPoint[] = [...pillarMap.entries()]
      .filter(([, v]) => v.count > 0)
      .map(([pillar, v]) => ({
        pillar,
        avgER: +(v.totalER / v.count).toFixed(1),
        count: v.count,
      }))

    return { monthly, pillars }
  }, [filteredPosts])

  // ── Recent posts ──────────────────────────────────────────────────────────
  const recentPosts = useMemo(
    () => [...filteredPosts]
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 8),
    [filteredPosts],
  )

  const glowColor = GLOW[platform] ?? '#c9a96e'
  const hasData = filteredPosts.length > 0

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

      {/* Filter bar: 4 platform pills + scope dropdown */}
      <div
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid #141414',
          marginBottom: 24,
        }}
      >
        <PlatformPills platform={platform} onChange={p => setFilters({ platform: p })} />
        <div style={{ width: 1, height: 22, background: '#1a1a1a', flexShrink: 0 }} />
        <ScopeDropdown scope={scope} onChange={s => setFilters({ scope: s })} />
      </div>

      {/* Empty state */}
      {!hasData && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 40px',
            gap: 16,
          }}
        >
          <div style={{ opacity: 0.3 }}>{EMPTY_ICONS[platform]}</div>
          <p
            className="font-jakarta font-light"
            style={{ fontSize: 16, color: '#2a2a2a', textAlign: 'center', lineHeight: 1.6 }}
          >
            No {PLATFORM_NAMES[platform] ?? 'platform'} data yet
          </p>
          <p style={{ fontSize: 12, color: '#1e1e1e' }}>
            Import posts via Studio to get started.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-px mb-px" style={{ gridTemplateColumns: 'repeat(4, 1fr)', background: '#141414' }}>
            <KpiCard index={0} label="Total Posts" value={fmt(kpis.totalPosts)} sub="Filtered posts" />
            <KpiCard index={1} label="Total Views" value={kpis.totalViews > 0 ? fmt(kpis.totalViews) : '—'} sub="End-of-month windows" />
            <KpiCard index={2} label="Engagement Rate" value={kpis.engRate === '—' ? '—' : `${kpis.engRate}%`} sub="Likes + comments + shares + saves / views" />
            <KpiCard index={3} label="Pipeline Active" value={fmt(kpis.activePipeline)} sub={`${filteredPipeline.length} total items`} />
          </div>

          {/* Pipeline Status Strip */}
          {filteredPipeline.length > 0 && (
            <div className="flex gap-px mb-10" style={{ background: '#141414' }}>
              {STATUS_ORDER.map(status => {
                const count = statusCounts[status] ?? 0
                const pct = filteredPipeline.length > 0 ? Math.round((count / filteredPipeline.length) * 100) : 0
                return (
                  <div key={status} className="flex flex-col items-center py-4 flex-1" style={{ background: '#080808', minWidth: 0 }}>
                    <p className="font-jakarta font-light text-[18px] mb-1" style={{ color: count > 0 ? '#c9a96e' : '#1a1a1a' }}>
                      {count}
                    </p>
                    <p className="text-[7px] tracking-[.14em] uppercase text-center" style={{ color: '#2a2a2a' }}>
                      {status}
                    </p>
                    {count > 0 && <p className="text-[7px] mt-0.5" style={{ color: '#1e1e1e' }}>{pct}%</p>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Charts */}
          {monthly.length > 0 && (
            <div className="mt-10 mb-px">
              <p
                className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
                style={{ color: '#c9a96e' }}
              >
                <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
                Performance Trends
              </p>
              <DashboardCharts monthly={monthly} pillars={pillars} glowColor={glowColor} />
            </div>
          )}

          {/* Recent Posts */}
          <div className="mt-10" style={{ border: '1px solid #141414' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #141414' }}>
              <p className="text-[9px] font-medium tracking-[.22em] uppercase" style={{ color: '#444' }}>
                Recent Content
              </p>
              <p className="text-[9px] tracking-[.12em] uppercase" style={{ color: '#2a2a2a' }}>
                {recentPosts.length} shown
              </p>
            </div>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #141414' }}>
                  {['ID', 'Title', 'Platform', 'Date'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-[8px] font-medium tracking-[.18em] uppercase" style={{ color: '#2a2a2a' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentPosts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-[11px]" style={{ color: '#2a2a2a' }}>
                      No posts
                    </td>
                  </tr>
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
                        <span className="text-[10px] font-medium tracking-[.1em]" style={{ color: '#c9a96e' }}>
                          {post.post_id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[12px] font-light" style={{ color: '#f2ede4' }}>
                          {post.title}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {(post.platform ?? []).map(p => <PlatformBadge key={p} platform={p} />)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[11px] font-light" style={{ color: '#444' }}>
                          {post.date ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
