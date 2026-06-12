'use client'

import { useMemo, useState } from 'react'
import { usePortalFilters, filterByPlatform, filterByScope } from '@/hooks/usePortalFilters'
import { EmptyState } from '@/components/portal/EmptyState'
import { PostSlideOver, type SlideOverPost, type SlideOverWindow } from '@/components/portal/PostSlideOver'
import { usePillarColors } from '@/hooks/usePillarColors'

// ── Types ──────────────────────────────────────────────────────────────────────

export type RawAnglesPost = {
  post_id: string
  title: string
  platform: string[]
  pillar: string | null
  hook: string | null
  format: string | null
  date: string | null
  decision: string | null
  post_analytics: {
    metric_window: string
    views: number
    likes: number
    comments: number
    shares: number
    saves: number
    watch_pct: number
    followers?: number
  }[]
}

type PostMetrics = {
  postId: string
  title: string
  platform: string[]
  pillar: string
  hook: string
  format: string
  date: string
  decision: string
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  watchPct: number
  er: number
}

type BreakdownRow = {
  label: string
  count: number
  avgER: number
  totalViews: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

type Tier = 'elite' | 'strong' | 'avg' | 'kill'

function tier(er: number): Tier {
  if (er >= 12) return 'elite'
  if (er >= 7)  return 'strong'
  if (er >= 4)  return 'avg'
  return 'kill'
}

const TIER_STYLE: Record<Tier, { color: string; bg: string; border: string; label: string }> = {
  elite:  { color: '#39ff88', bg: 'rgba(57,255,136,.1)',  border: 'rgba(57,255,136,.25)',  label: 'Elite'  },
  strong: { color: '#4cc9ff', bg: 'rgba(76,201,255,.1)',  border: 'rgba(76,201,255,.25)',  label: 'Strong' },
  avg:    { color: '#fbbf24', bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.25)',  label: 'Avg'    },
  kill:   { color: '#ff3b5f', bg: 'rgba(255,59,95,.1)',   border: 'rgba(255,59,95,.25)',   label: 'Kill'   },
}

const DECISION_COLOR: Record<string, string> = {
  'Double Down': '#c9a96e',
  'Iterate':     '#fbbf24',
  'Kill':        '#ff3b5f',
}

function computeBreakdown(posts: PostMetrics[], keyFn: (p: PostMetrics) => string): BreakdownRow[] {
  const map: Record<string, { count: number; totalER: number; totalViews: number }> = {}
  for (const p of posts) {
    const key = keyFn(p) || '—'
    if (!map[key]) map[key] = { count: 0, totalER: 0, totalViews: 0 }
    map[key].count++
    map[key].totalER    += p.er
    map[key].totalViews += p.views
  }
  return Object.entries(map)
    .map(([label, s]) => ({
      label,
      count:      s.count,
      avgER:      s.totalER / s.count,
      totalViews: s.totalViews,
    }))
    .sort((a, b) => b.avgER - a.avgER)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, sub2 }: { label: string; value: string; sub: string; sub2?: string }) {
  return (
    <div
      className="flex flex-col justify-between overflow-hidden"
      style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '28px 24px 22px' }}
    >
      <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>
        {label}
      </p>
      <p className="font-jakarta font-light text-gold-gradient"
         style={{ fontSize: 'clamp(22px,2.5vw,36px)', lineHeight: 1 }}>
        {value}
      </p>
      <p className="text-[10px] font-light mt-2" style={{ color: '#c9a96e' }}>{sub}</p>
      {sub2 && <p className="text-[9px] font-light mt-0.5" style={{ color: '#555' }}>{sub2}</p>}
    </div>
  )
}

function BreakdownBar({ row, max, rank }: { row: BreakdownRow; max: number; rank: number }) {
  const barPct = max > 0 ? Math.round((row.avgER / max) * 100) : 0
  const t  = tier(row.avgER)
  const ts = TIER_STYLE[t]
  return (
    <div className="flex items-center gap-4 py-4" style={{ borderBottom: '1px solid #0e0e0e' }}>
      <span className="text-[10px] font-light" style={{ color: '#555', minWidth: 14 }}>{rank}</span>
      <span className="text-[11px] font-light" style={{ color: '#f2ede4', minWidth: 140 }}>{row.label}</span>
      <div style={{ flex: 1, height: 3, background: '#141414', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${barPct}%`, height: '100%', background: `linear-gradient(90deg, ${ts.color}88, ${ts.color})`, borderRadius: 2 }} />
      </div>
      <span className="text-[12px] font-light" style={{ color: ts.color, minWidth: 52, textAlign: 'right' }}>
        {row.avgER.toFixed(1)}%
      </span>
      <span
        className="text-[7px] font-medium tracking-[.1em] uppercase px-1.5 py-0.5"
        style={{ color: ts.color, background: ts.bg, border: `1px solid ${ts.border}`, minWidth: 40, textAlign: 'center' }}
      >
        {ts.label}
      </span>
      <span className="text-[10px] font-light" style={{ color: '#666', minWidth: 56 }}>
        {row.count} post{row.count !== 1 ? 's' : ''}
      </span>
      <span className="text-[10px] font-light" style={{ color: '#555', minWidth: 60, textAlign: 'right' }}>
        {fmtViews(row.totalViews)}
      </span>
    </div>
  )
}

function PostTable({
  posts, title, color, pillarColors, onRowClick,
}: {
  posts: PostMetrics[]
  title: string
  color: string
  pillarColors: Map<string, string>
  onRowClick: (postId: string) => void
}) {
  return (
    <div>
      <p
        className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
        style={{ color }}
      >
        <span style={{ display: 'block', width: 16, height: 1, background: color }} />
        {title}
      </p>
      <div style={{ border: '1px solid #141414', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #141414' }}>
              <th style={{ width: 3, padding: 0, background: '#060606' }} />
              {['ID', 'Title', 'Pillar', 'Hook', 'Format', 'ER %', 'Views', 'Decision'].map(h => (
                <th key={h}
                    className="text-left px-5 py-4 text-[8px] font-medium tracking-[.14em] uppercase"
                    style={{ color: '#555', whiteSpace: 'nowrap', background: '#060606' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-[11px]" style={{ color: '#555' }}>
                  No posts match current filters.
                </td>
              </tr>
            ) : (
              posts.map((p, i) => {
                const t  = tier(p.er)
                const ts = TIER_STYLE[t]
                const pillarColor = pillarColors.get(p.pillar) ?? '#1a1a1a'
                return (
                  <tr
                    key={p.postId}
                    onClick={() => onRowClick(p.postId)}
                    style={{
                      borderBottom: i < posts.length - 1 ? '1px solid #0e0e0e' : 'none',
                      background: i % 2 === 0 ? '#060606' : '#070707',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ width: 3, padding: 0, background: `${pillarColor}cc` }} />
                    <td className="px-5 py-4">
                      <span className="text-[10px] font-medium" style={{ fontFamily: 'monospace', color: '#c9a96e' }}>
                        {p.postId}
                      </span>
                    </td>
                    <td className="px-5 py-4" style={{ maxWidth: 200 }}>
                      <span className="text-[12px] font-light block overflow-hidden"
                            style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 200 }}
                            title={p.title}>
                        {p.title}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[8px] font-medium tracking-[.1em] uppercase px-2 py-1"
                            style={{ color: '#555', background: '#0d0d0d', border: '1px solid #1a1a1a', whiteSpace: 'nowrap' }}>
                        {p.pillar}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[11px] font-light" style={{ color: '#555', whiteSpace: 'nowrap' }}>
                      {p.hook}
                    </td>
                    <td className="px-5 py-4 text-[11px] font-light" style={{ color: '#666', whiteSpace: 'nowrap' }}>
                      {p.format}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-light" style={{ color: ts.color }}>
                          {p.er.toFixed(1)}%
                        </span>
                        <span className="text-[7px] font-medium tracking-[.1em] uppercase px-1.5 py-0.5"
                              style={{ color: ts.color, background: ts.bg, border: `1px solid ${ts.border}` }}>
                          {ts.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[12px] font-light" style={{ color: '#666' }}>
                      {fmtViews(p.views)}
                    </td>
                    <td className="px-5 py-4 text-[9px] font-medium tracking-[.08em] uppercase"
                        style={{ color: DECISION_COLOR[p.decision] ?? '#666' }}>
                      {p.decision || '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

function buildWindow(pa: RawAnglesPost['post_analytics'][number] | undefined): SlideOverWindow {
  return {
    views:     pa?.views     ?? 0,
    likes:     pa?.likes     ?? 0,
    comments:  pa?.comments  ?? 0,
    shares:    pa?.shares    ?? 0,
    saves:     pa?.saves     ?? 0,
    followers: pa?.followers ?? 0,
    watch_pct: pa?.watch_pct ?? 0,
  }
}

function buildSlideOverPost(raw: RawAnglesPost): SlideOverPost {
  const find = (wk: string) => raw.post_analytics.find(a => a.metric_window === wk)
  return {
    postId:   raw.post_id,
    title:    raw.title,
    platform: raw.platform ?? [],
    date:     raw.date ?? '',
    pillar:   raw.pillar,
    hook:     raw.hook,
    decision: raw.decision,
    w24: buildWindow(find('w24')),
    w3:  buildWindow(find('w3')),
    w7:  buildWindow(find('w7')),
    eom: buildWindow(find('eom')),
  }
}

export function AnglesClient({ rawPosts }: { rawPosts: RawAnglesPost[] }) {
  const { platform, win, scope, from, to } = usePortalFilters()
  const [slidePost, setSlidePost] = useState<SlideOverPost | null>(null)

  const posts = useMemo<PostMetrics[]>(() => {
    const platformFiltered = filterByPlatform(
      rawPosts.map(p => ({
        ...p,
        date: p.date ?? '',
        platform: p.platform ?? [],
      })),
      platform,
      p => p.format,
    )

    const scopeFiltered = filterByScope(platformFiltered, scope, from, to)

    return scopeFiltered.map(p => {
      const winData = p.post_analytics.find(a => a.metric_window === win)
        ?? p.post_analytics.find(a => a.metric_window === 'eom')

      const views    = winData?.views    ?? 0
      const likes    = winData?.likes    ?? 0
      const comments = winData?.comments ?? 0
      const shares   = winData?.shares   ?? 0
      const saves    = winData?.saves    ?? 0
      const watchPct = winData?.watch_pct ?? 0
      const er       = views > 0 ? ((likes + comments + shares + saves) / views) * 100 : 0

      return {
        postId:   p.post_id,
        title:    p.title,
        platform: p.platform ?? [],
        pillar:   p.pillar   ?? '—',
        hook:     p.hook     ?? '—',
        format:   p.format   ?? '—',
        date:     p.date     ?? '',
        decision: p.decision ?? '',
        views, likes, comments, shares, saves, watchPct, er,
      }
    })
  }, [rawPosts, platform, win, scope, from, to])

  const rawByPostId = useMemo(
    () => new Map(rawPosts.map(p => [p.post_id, p])),
    [rawPosts],
  )

  const pillarColors = usePillarColors(useMemo(() => posts.map(p => p.pillar), [posts]))

  const handleRowClick = (postId: string) => {
    const raw = rawByPostId.get(postId)
    if (raw) setSlidePost(buildSlideOverPost(raw))
  }

  const withViews = useMemo(() => posts.filter(p => p.views > 0), [posts])

  const { pillarStats, hookStats, formatStats } = useMemo(() => ({
    pillarStats: computeBreakdown(withViews, p => p.pillar),
    hookStats:   computeBreakdown(withViews, p => p.hook),
    formatStats: computeBreakdown(withViews, p => p.format),
  }), [withViews])

  const pillarMax = pillarStats[0]?.avgER ?? 1
  const hookMax   = hookStats[0]?.avgER   ?? 1
  const formatMax = formatStats[0]?.avgER  ?? 1

  const byER     = useMemo(() => [...withViews].sort((a, b) => b.er - a.er), [withViews])
  const top5     = byER.slice(0, 5)
  const bottom5  = byER.slice(-5).reverse()

  const totalWithViews = withViews.length
  const overallAvgER   = totalWithViews
    ? withViews.reduce((s, p) => s + p.er, 0) / totalWithViews
    : 0

  const bestPillar = pillarStats[0]
  const bestHook   = hookStats[0]
  const bestCombo  = withViews.filter(
    p => p.pillar === bestPillar?.label && p.hook === bestHook?.label
  )
  const unusedBestHookCount = hookStats[0]?.count ?? 0
  const bestPillarUsagePct  = Math.round((pillarStats[0]?.count ?? 0) / (totalWithViews || 1) * 100)

  if (rawPosts.length === 0) {
    return (
      <EmptyState
        icon="triangle"
        headline="No content to analyse yet."
        body="Once videos are imported, angle breakdowns by pillar, hook, and format will appear here."
      />
    )
  }

  return (
    <div>
      {slidePost && (
        <PostSlideOver
          post={slidePost}
          onClose={() => setSlidePost(null)}
        />
      )}

      {/* Summary line */}
      <p className="text-[11px] font-light mb-8" style={{ color: '#666' }}>
        {totalWithViews} posts analysed · {overallAvgER.toFixed(1)}% overall avg ER
      </p>

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      <div className="grid gap-px mb-8" style={{ gridTemplateColumns: 'repeat(3,1fr)', background: '#141414' }}>
        <KpiCard
          label="Best Pillar"
          value={bestPillar?.label ?? '—'}
          sub={`${bestPillar?.avgER.toFixed(1) ?? '0'}% avg ER`}
          sub2={`${bestPillar?.count ?? 0} posts · ${fmtViews(bestPillar?.totalViews ?? 0)} total views`}
        />
        <KpiCard
          label="Best Hook"
          value={bestHook?.label ?? '—'}
          sub={`${bestHook?.avgER.toFixed(1) ?? '0'}% avg ER`}
          sub2={`${bestHook?.count ?? 0} post${bestHook?.count !== 1 ? 's' : ''}`}
        />
        <KpiCard
          label="Best Format"
          value={formatStats[0]?.label ?? '—'}
          sub={`${formatStats[0]?.avgER.toFixed(1) ?? '0'}% avg ER`}
          sub2={`${formatStats[0]?.count ?? 0} posts`}
        />
      </div>

      {/* ── Recommendation callout ────────────────────────────────── */}
      {bestPillar && (
        <div
          className="mb-10 px-6 py-5"
          style={{
            background: 'rgba(201,169,110,.04)',
            border: '1px solid rgba(201,169,110,.2)',
            borderLeft: '3px solid #c9a96e',
          }}
        >
          <p className="text-[8px] font-medium tracking-[.22em] uppercase mb-2" style={{ color: '#c9a96e' }}>
            Recommended Next Angle
          </p>
          <p className="text-[13px] font-light" style={{ color: '#f2ede4', lineHeight: 1.7 }}>
            <strong style={{ fontWeight: 500, color: '#c9a96e' }}>{bestPillar.label}</strong> is your
            highest-performing pillar at {bestPillar.avgER.toFixed(1)}% avg ER and {fmtViews(bestPillar.totalViews)} total views —
            but it&apos;s only {bestPillarUsagePct}% of your content ({bestPillar.count} of {totalWithViews} posts).{' '}
            The <strong style={{ fontWeight: 500, color: '#c9a96e' }}>{bestHook?.label}</strong> hook
            averages {bestHook?.avgER.toFixed(1)}% ER across {unusedBestHookCount} post{unusedBestHookCount !== 1 ? 's' : ''}.{' '}
            {bestCombo.length > 0
              ? `Combining both has produced ${bestCombo.length} post${bestCombo.length !== 1 ? 's' : ''} averaging ${(bestCombo.reduce((s, p) => s + p.er, 0) / bestCombo.length).toFixed(1)}% ER.`
              : 'This combination is untested — your biggest opportunity.'
            }{' '}
            Make more of it.
          </p>
        </div>
      )}

      {/* ── Pillar breakdown ──────────────────────────────────────── */}
      <div className="mb-8">
        <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
          Pillar Performance
        </p>
        <div style={{ border: '1px solid #141414', padding: '8px 20px' }}>
          <div className="flex mb-2" style={{ paddingLeft: 30 }}>
            {['Content Pillar', '', 'Avg ER', '', 'Posts', 'Views'].map((h, i) => (
              <span key={i} className="text-[7px] font-medium tracking-[.16em] uppercase"
                    style={{
                      color: '#555',
                      minWidth: i === 1 ? 'auto' : i === 0 ? 140 : i === 2 ? 52 : i === 4 ? 56 : 60,
                      flex: i === 1 ? 1 : undefined,
                      textAlign: i >= 2 ? 'right' : 'left',
                    }}>
                {h}
              </span>
            ))}
          </div>
          {pillarStats.length === 0
            ? <p className="py-8 text-center text-[11px]" style={{ color: '#555' }}>No data for current filters.</p>
            : pillarStats.map((row, i) => <BreakdownBar key={row.label} row={row} max={pillarMax} rank={i + 1} />)
          }
        </div>
      </div>

      {/* ── Hook breakdown ────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
          Hook Performance
        </p>
        <div style={{ border: '1px solid #141414', padding: '8px 20px' }}>
          {hookStats.map((row, i) => <BreakdownBar key={row.label} row={row} max={hookMax} rank={i + 1} />)}
        </div>
      </div>

      {/* ── Format breakdown ──────────────────────────────────────── */}
      <div className="mb-10">
        <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
          Format Performance
        </p>
        <div style={{ border: '1px solid #141414', padding: '8px 20px' }}>
          {formatStats.map((row, i) => <BreakdownBar key={row.label} row={row} max={formatMax} rank={i + 1} />)}
        </div>
      </div>

      {/* ── Top 5 ────────────────────────────────────────────────── */}
      <div className="mb-10">
        <PostTable posts={top5} title="Top 5 — Double Down" color="#39ff88" pillarColors={pillarColors} onRowClick={handleRowClick} />
      </div>

      {/* ── Bottom 5 ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <PostTable posts={bottom5} title="Bottom 5 — Review or Cut" color="#ff3b5f" pillarColors={pillarColors} onRowClick={handleRowClick} />
      </div>

      {/* Tier legend */}
      <div className="flex gap-4 flex-wrap">
        {(['elite','strong','avg','kill'] as Tier[]).map(t => {
          const s = TIER_STYLE[t]
          return (
            <div key={t} className="flex items-center gap-1.5">
              <span style={{ width: 6, height: 6, background: s.color, opacity: .8, display: 'block' }} />
              <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#555' }}>
                {s.label} {t === 'elite' ? '≥12%' : t === 'strong' ? '7–12%' : t === 'avg' ? '4–7%' : '<4%'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
