'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlatformPills, ScopeDropdown } from '@/components/portal/FilterBar'
import { usePortalFilters, filterByPlatform, filterByScope } from '@/hooks/usePortalFilters'
import { EmptyState } from '@/components/portal/EmptyState'
import { OnboardingBanner } from '@/components/portal/OnboardingBanner'
import { AISuggestionsModal } from '@/components/portal/AISuggestionsModal'
import { submitApproval, getClientNotes, saveClientNotes } from '@/app/(dashboard)/edit-actions'
import { RichTextEditor } from '@/components/portal/RichTextEditor'
import { useToast } from '@/components/portal/Toast'
import type { AISuggestion } from '@/components/portal/AISuggestionsModal'
import type { PlatformFilter } from '@/hooks/usePortalFilters'

export type RawDashPost = {
  id: string
  post_id: string
  title: string
  platform: string[]
  date: string | null
  format: string | null
  pillar: string | null
  hook: string | null
  decision: string | null
  post_analytics: {
    metric_window: string
    platform: string | null
    views: number | null
    likes: number | null
    comments: number | null
    shares: number | null
    saves: number | null
    followers: number | null
    watch_pct: number | null
  }[]
}

export type RawDashPipeline = {
  id: string
  post_id: string
  title: string
  platform: string[]
  status: string
  week: string | null
  scheduled_date: string | null
  posted_at: string | null
  priority: number
  drive_file_id: string | null
  approval_comment: string | null
  pillar: string | null
}

export type RawDashCalendar = {
  id: string
  title: string
  platform: string | null
  event_date: string
  notes: string | null
}

export type RawDashGoal = {
  metric: string
  target: number
  period: string
}

export type RawDashCampaign = {
  id: string
  name: string
  date: string
  spend: number
  roas: number
  ctr: number
  cpm: number
  impressions: number
}

type WindowKey = 'w24' | 'w3' | 'w7' | 'eom'
type MetricSet = {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  followers: number
  watch_pct: number
}
type PostStat = RawDashPost & {
  date: string
  metric: MetricSet
  er: number
  platformKey: string
}
type Suggestion = AISuggestion

const EMPTY: MetricSet = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, followers: 0, watch_pct: 0 }
const TIER_COLORS = { a: '#39ff88', b: '#4cc9ff', c: '#fbbf24', d: '#ff3b5f', f: '#ff3b5f' }
const PLATFORM_COLORS: Record<string, string> = { ig: '#c9a96e', yt: '#4cc9ff', tt: '#2dd4bf', lf: '#4cc9ff' }
const STATUS_COLORS: Record<string, string> = {
  SCRIPTED: '#c9a96e',
  PLANNED: '#4cc9ff',
  FILMING: '#fbbf24',
  EDITING: '#a78bfa',
  REVIEWING: '#ff3b5f',
  PENDING_APPROVAL: '#f97316',
  APPROVED: '#4ade80',
  CHANGES_REQUESTED: '#fb923c',
  SCHEDULED: '#4cc9ff',
  POSTED: '#39ff88',
  CANCELLED: '#555',
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '-'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return Math.round(n).toLocaleString()
}

function pct(n: number): string {
  return Number.isFinite(n) && n > 0 ? n.toFixed(1) + '%' : '-'
}

function getMetric(post: RawDashPost, win: WindowKey, platform: PlatformFilter): MetricSet {
  const preferred = post.post_analytics.find(a =>
    a.metric_window === win &&
    (platform === 'lf' ? a.platform === 'yt' : platform === 'all' || !a.platform || a.platform === platform),
  ) ?? post.post_analytics.find(a => a.metric_window === win)
  if (!preferred) return { ...EMPTY }
  return {
    views: preferred.views ?? 0,
    likes: preferred.likes ?? 0,
    comments: preferred.comments ?? 0,
    shares: preferred.shares ?? 0,
    saves: preferred.saves ?? 0,
    followers: preferred.followers ?? 0,
    watch_pct: preferred.watch_pct ?? 0,
  }
}

function calcER(metric: MetricSet, platformKey: string): number {
  if (!metric.views) return 0
  const fourth = platformKey === 'yt' || platformKey === 'lf' ? metric.followers : metric.saves
  return ((metric.likes + metric.comments + metric.shares + fourth) / metric.views) * 100
}

function grade(er: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (er >= 12) return 'A'
  if (er >= 7) return 'B'
  if (er >= 4) return 'C'
  if (er >= 2) return 'D'
  return 'F'
}

function parsePostId(notes: string | null): string | null {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes) as { post_id?: string }
    return parsed.post_id ?? null
  } catch {
    const match = notes.match(/#(?:ig|yt|tt|LF)?\d{4}/i)
    return match?.[0] ?? null
  }
}

const MON_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function monWkLabel(d: Date): string {
  const mon = MON_ABBR[d.getMonth()]
  const wk  = Math.ceil(d.getDate() / 7)
  return `${mon}Wk${wk}`
}

function startOfWeek(base: Date): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function topStats(post: PostStat, averageER: number): string[] {
  const stats: string[] = []
  if (post.metric.watch_pct >= 35) stats.push('High watch rate')
  if (post.metric.shares >= 20) stats.push('Above avg shares')
  if (post.er >= 12) stats.push('Elite ER')
  if (post.er >= averageER) stats.push('Above avg ER')
  if (post.metric.followers > 0) stats.push('Follower gain')
  return stats.slice(0, 3)
}

function fallbackSuggestions(posts: PostStat[], mode: string): Suggestion[] {
  const sorted = [...posts].sort((a, b) => b.er - a.er)
  const top = sorted[0]
  const bottom = sorted[sorted.length - 1]
  const avgER = posts.length ? posts.reduce((s, p) => s + p.er, 0) / posts.length : 0
  const pillarMap = new Map<string, { er: number; count: number }>()
  for (const p of posts) {
    const key = p.pillar ?? 'Other'
    const cur = pillarMap.get(key) ?? { er: 0, count: 0 }
    pillarMap.set(key, { er: cur.er + p.er, count: cur.count + 1 })
  }
  const bestPillar = [...pillarMap.entries()]
    .map(([pillar, v]) => ({ pillar, avg: v.er / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg)[0]

  if (!top) {
    return [{ icon: 'spark', headline: 'Import more data', body: 'No posts match this filter, so suggestions need fresh analytics first.', trigger: '0 matching posts' }]
  }

  return [
    {
      icon: 'trend',
      headline: `Repeat ${top.pillar ?? 'the top pillar'}`,
      body: `${top.title} is leading at ${top.er.toFixed(1)}% ER with ${fmt(top.metric.views)} reach.`,
      trigger: `${top.post_id} is ${Math.max(0, top.er - avgER).toFixed(1)} pts above avg`,
    },
    {
      icon: 'hook',
      headline: `Use more ${top.hook ?? 'proven'} hooks`,
      body: `${top.hook ?? 'The winning hook'} is attached to the strongest post in this view.`,
      trigger: `${top.post_id} hook type: ${top.hook ?? 'unknown'}`,
    },
    {
      icon: 'pillar',
      headline: `Push ${bestPillar?.pillar ?? 'the best pillar'}`,
      body: `${bestPillar?.pillar ?? 'Top pillar'} averages ${(bestPillar?.avg ?? 0).toFixed(1)}% ER across ${bestPillar?.count ?? 0} posts.`,
      trigger: `Filtered avg is ${avgER.toFixed(1)}% ER`,
    },
    {
      icon: 'repair',
      headline: `Rewrite the weakest angle`,
      body: `${bottom?.title ?? top.title} is dragging the set at ${(bottom?.er ?? top.er).toFixed(1)}% ER.`,
      trigger: `${bottom?.post_id ?? top.post_id} is the low performer`,
    },
    ...(mode === 'projection' ? [{
      icon: 'pace',
      headline: 'Protect cadence',
      body: `The last 10-post average is the basis for this projection; avoid changing multiple variables at once.`,
      trigger: `${Math.min(10, posts.length)} posts in projection sample`,
    }] : []),
  ].slice(0, mode === 'projection' ? 5 : 4)
}

function CardShell({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={{
        width: '100%',
        textAlign: 'left',
        background: '#0a0a0a',
        border: '1px solid #171717',
        borderRadius: 6,
        padding: 24,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform .15s ease, border-color .15s ease, background .15s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = onClick ? 'translateY(-2px)' : 'none'
        e.currentTarget.style.borderColor = '#242424'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = '#171717'
      }}
    >
      {children}
    </button>
  )
}

function SparkIcon({ color = '#c9a96e' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5L9.6 6.4L14.5 8L9.6 9.6L8 14.5L6.4 9.6L1.5 8L6.4 6.4L8 1.5Z" stroke={color} strokeWidth="1.2" />
    </svg>
  )
}

function ArrowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 4,
        border: '1px solid #1f1f1f',
        background: '#0d0d0d',
        color: '#c9a96e',
        cursor: 'pointer',
        transition: 'all .15s ease',
      }}
    >
      {label === 'Previous week' ? '<' : '>'}
    </button>
  )
}

export function DashboardClient({
  rawPosts,
  rawPipeline,
  rawCalendar,
  rawGoals,
  rawCampaigns = [],
  clientName,
}: {
  rawPosts: RawDashPost[]
  rawPipeline: RawDashPipeline[]
  rawCalendar: RawDashCalendar[]
  rawGoals: RawDashGoal[]
  rawCampaigns?: RawDashCampaign[]
  clientName: string
}) {
  const router = useRouter()
  const { platform, win, scope, from, to, setFilters } = usePortalFilters()
  const activeWin = win as WindowKey
  const [kpiModes, setKpiModes] = useState({ followers: 0, reach: 0, er: 0 })
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiModalTitle, setAiModalTitle] = useState('Content Performance')
  const [loadingAi, setLoadingAi] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [approvalItemId, setApprovalItemId] = useState<string | null>(null)
  const { toast } = useToast()

  const pendingApprovals = useMemo(
    () => rawPipeline.filter(i => i.status === 'PENDING_APPROVAL'),
    [rawPipeline],
  )

  async function handleApproval(itemId: string, action: 'approve' | 'request_changes') {
    const { error } = await submitApproval(itemId, action, action === 'request_changes' ? approvalComment : undefined)
    if (error) {
      toast(error, 'error')
    } else {
      toast(action === 'approve' ? 'Content approved!' : 'Changes requested', 'success')
      setApprovalItemId(null)
      setApprovalComment('')
      router.refresh()
    }
  }

  const datedPosts = useMemo(
    () => rawPosts.filter((p): p is RawDashPost & { date: string } => Boolean(p.date)),
    [rawPosts],
  )

  const scopedPosts = useMemo(() => {
    const platformPosts = filterByPlatform(datedPosts, platform, p => p.format)
    return filterByScope(platformPosts, scope, from, to)
  }, [datedPosts, platform, scope, from, to])

  const allPlatformPosts = useMemo(
    () => filterByPlatform(datedPosts, platform, p => p.format),
    [datedPosts, platform],
  )

  const posts = useMemo<PostStat[]>(() => scopedPosts.map(post => {
    const platformKey = platform === 'lf' ? 'lf' : post.platform[0] ?? platform
    const metric = getMetric(post, activeWin, platform)
    return { ...post, metric, er: calcER(metric, platformKey), platformKey }
  }), [scopedPosts, activeWin, platform])

  const allStats = useMemo<PostStat[]>(() => allPlatformPosts.map(post => {
    const platformKey = platform === 'lf' ? 'lf' : post.platform[0] ?? platform
    const metric = getMetric(post, activeWin, platform)
    return { ...post, metric, er: calcER(metric, platformKey), platformKey }
  }), [allPlatformPosts, activeWin, platform])

  const avgER = posts.length ? posts.reduce((s, p) => s + p.er, 0) / posts.length : 0
  const postById = useMemo(() => new Map(allStats.map(p => [p.post_id, p])), [allStats])

  const kpis = useMemo(() => {
    const totalReach = posts.reduce((s, p) => s + p.metric.views, 0)
    const gained = posts.reduce((s, p) => s + p.metric.followers, 0)
    const currentFollowers = allStats.reduce((s, p) => s + p.metric.followers, 0)
    const withViews = posts.filter(p => p.metric.views > 0)
    const watch = withViews.length ? withViews.reduce((s, p) => s + p.metric.watch_pct, 0) / withViews.length : 0
    const er = withViews.length ? withViews.reduce((s, p) => s + p.er, 0) / withViews.length : 0
    const top = withViews.slice().sort((a, b) => b.er - a.er)[0]
    const conversion = totalReach ? (gained / totalReach) * 100 : 0
    return { totalReach, gained, currentFollowers, watch, er, top, conversion, posts: posts.length }
  }, [posts, allStats])

  const last10 = useMemo(() => allStats.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10), [allStats])
  const projections = useMemo(() => {
    const spanDays = last10.length > 1
      ? Math.max(7, (new Date(last10[0].date).getTime() - new Date(last10[last10.length - 1].date).getTime()) / 86400000)
      : 30
    const postsPer30 = last10.length ? Math.max(1, (last10.length / spanDays) * 30) : 0
    const avgFollowers = last10.length ? last10.reduce((s, p) => s + p.metric.followers, 0) / last10.length : 0
    const avgReach = last10.length ? last10.reduce((s, p) => s + p.metric.views, 0) / last10.length : 0
    const avgProjectionER = last10.length ? last10.reduce((s, p) => s + p.er, 0) / last10.length : 0
    return {
      followers: Math.round(avgFollowers * postsPer30),
      reach: Math.round(avgReach * postsPer30),
      er: avgProjectionER,
      sample: last10.length,
    }
  }, [last10])

  const filteredPipeline = useMemo(() => {
    let out = rawPipeline
    if (platform === 'lf') out = out.filter(i => i.platform.includes('yt'))
    else out = filterByPlatform(out, platform)
    return out
      .filter(i => {
        const date = i.posted_at?.split('T')[0] ?? i.scheduled_date ?? ''
        if (scope === 'all') return true
        return filterByScope([{ ...i, date }], scope, from, to).length > 0
      })
      .sort((a, b) => {
        const ad = a.posted_at ?? a.scheduled_date ?? ''
        const bd = b.posted_at ?? b.scheduled_date ?? ''
        return bd.localeCompare(ad)
      })
  }, [rawPipeline, platform, scope, from, to])

  const currentWeekLabel = useMemo(() => monWkLabel(new Date()), [])

  const thisWeekItems = useMemo(() => {
    return rawPipeline
      .filter(i => i.week === currentWeekLabel)
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  }, [rawPipeline, currentWeekLabel])

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  }), [weekStart])

  const weekEvents = useMemo(() => {
    const fromDay = isoDate(weekDays[0])
    const toDay = isoDate(weekDays[6])
    return rawCalendar
      .filter(e => e.event_date >= fromDay && e.event_date <= toDay)
      .filter(e => {
        if (platform === 'all') return true
        if (platform === 'lf') return e.platform === 'yt'
        return e.platform === platform
      })
      .map(e => ({ ...e, postId: parsePostId(e.notes) }))
  }, [rawCalendar, weekDays, platform])

  const goalsSummary = useMemo(() => rawGoals.map(g => `${g.period} ${g.metric}: ${g.target}`).join(', '), [rawGoals])

  async function loadSuggestions(mode: 'monthly' | 'projection', projectionMetric?: string) {
    const contextPosts = (mode === 'projection' ? last10 : posts).slice(0, 20).map(p => ({
      id: p.post_id,
      title: p.title,
      platform: p.platformKey,
      pillar: p.pillar,
      hook: p.hook,
      reach: p.metric.views,
      followers: p.metric.followers,
      watch: p.metric.watch_pct,
      er: +p.er.toFixed(2),
      decision: p.decision,
    }))
    setLoadingAi(true)
    try {
      const res = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          platform,
          scope,
          projectionMetric,
          goalsSummary,
          posts: contextPosts,
        }),
      })
      const json = await res.json() as { suggestions?: Suggestion[] }
      const next = json.suggestions?.length ? json.suggestions : fallbackSuggestions(mode === 'projection' ? last10 : posts, mode)
      setSuggestions(next.slice(0, 4))
    } catch {
      const next = fallbackSuggestions(mode === 'projection' ? last10 : posts, mode)
      setSuggestions(next.slice(0, 4))
    } finally {
      setLoadingAi(false)
    }
  }

  useEffect(() => {
    void loadSuggestions('monthly')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, scope, from, to, win, rawPosts.length])

  function openProjection(metric: string, label: string) {
    setAiModalTitle(`${label} — Projection Analysis`)
    setAiModalOpen(true)
    void loadSuggestions('projection', metric)
  }

  const selectedPost = selectedPostId ? postById.get(selectedPostId) ?? null : null

  if (rawPosts.length === 0) {
    return (
      <div className="p-10">
        <EmptyState
          icon="chart"
          headline="No data yet."
          body="Your content manager will import your videos here — check back soon."
        />
      </div>
    )
  }

  return (
    <div className="p-10 max-w-[1320px]">
      <OnboardingBanner postCount={rawPosts.length} />
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 28 }}>
        <p className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3" style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Overview
        </p>
        <h1 className="font-jakarta font-light" style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}>
          Dashboard
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#666' }}>Welcome back, {clientName}.</p>
      </div>

      <div className="mb-8 flex items-center gap-3 flex-wrap" style={{ minHeight: 52, borderBottom: '1px solid #141414', paddingBottom: 18 }}>
        <PlatformPills platform={platform} onChange={p => setFilters({ platform: p })} />
        <div style={{ width: 1, height: 22, background: '#1a1a1a' }} />
        <ScopeDropdown scope={scope} onChange={s => setFilters({ scope: s })} />
      </div>

      {thisWeekItems.length > 0 && (
        <section className="mb-8">
          <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
            <span style={{ width: 16, height: 1, background: '#c9a96e' }} />
            This Week — {currentWeekLabel}
          </p>
          <div className="flex gap-3 flex-wrap">
            {thisWeekItems.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/pipeline?phase=${encodeURIComponent(item.status)}&item=${encodeURIComponent(item.id)}&platform=${platform}&scope=${scope}`)}
                style={{
                  background: '#0a0a0a',
                  border: `1px solid ${(STATUS_COLORS[item.status] ?? '#555')}44`,
                  borderLeft: `3px solid ${STATUS_COLORS[item.status] ?? '#555'}`,
                  borderRadius: 5,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  minWidth: 200,
                  maxWidth: 260,
                  transition: 'border-color .15s ease, background .15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#0d0d0d' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0a0a0a' }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[8px] font-medium tracking-[.1em] uppercase"
                        style={{ color: STATUS_COLORS[item.status] ?? '#555', background: `${STATUS_COLORS[item.status] ?? '#555'}18`, border: `1px solid ${STATUS_COLORS[item.status] ?? '#555'}44`, padding: '1px 6px' }}>
                    {item.status}
                  </span>
                  <span className="text-[9px] font-light" style={{ color: '#555' }}>#{idx + 1}</span>
                </div>
                <p className="text-[12px] font-light overflow-hidden" style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 228 }}>{item.title}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {item.platform.slice(0, 2).map(pl => (
                    <span key={pl} className="text-[8px] tracking-[.08em] uppercase" style={{ color: PLATFORM_COLORS[pl] ?? '#555' }}>{pl}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {pendingApprovals.length > 0 && (
        <section className="mb-8">
          <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#f97316' }}>
            <span style={{ width: 16, height: 1, background: '#f97316' }} />
            Pending Approval ({pendingApprovals.length})
          </p>
          <div className="flex flex-col gap-3">
            {pendingApprovals.map(item => (
              <div key={item.id} style={{
                background: '#0a0a0a',
                border: '1px solid rgba(249,115,22,.25)',
                borderLeft: '3px solid #f97316',
                borderRadius: 5,
                padding: '16px 20px',
              }}>
                <div className="flex items-start justify-between gap-4">
                  <div style={{ flex: 1 }}>
                    <p className="text-[13px] font-light" style={{ color: '#f2ede4' }}>{item.title}</p>
                    <div className="flex items-center gap-3 mt-2" style={{ fontSize: 9, color: '#555' }}>
                      {item.platform?.slice(0, 2).map(pl => (
                        <span key={pl} className="tracking-[.08em] uppercase" style={{ color: PLATFORM_COLORS[pl] ?? '#555' }}>{pl}</span>
                      ))}
                      {item.pillar && <span>{item.pillar}</span>}
                      {item.scheduled_date && <span>Planned: {item.scheduled_date}</span>}
                    </div>
                    {item.drive_file_id && (
                      <a
                        href={`https://drive.google.com/file/d/${item.drive_file_id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] mt-2 inline-flex items-center gap-1"
                        style={{ color: '#4cc9ff' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M10 2h4v4M7 9l7-7"/></svg>
                        View in Google Drive
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApproval(item.id, 'approve')}
                      style={{
                        padding: '5px 12px', fontSize: 9, fontWeight: 500,
                        letterSpacing: '.1em', textTransform: 'uppercase',
                        color: '#060606', background: '#4ade80',
                        border: 'none', borderRadius: 3,
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setApprovalItemId(approvalItemId === item.id ? null : item.id)}
                      style={{
                        padding: '5px 12px', fontSize: 9, fontWeight: 500,
                        letterSpacing: '.1em', textTransform: 'uppercase',
                        color: '#fb923c', background: 'rgba(251,146,60,.1)',
                        border: '1px solid rgba(251,146,60,.3)', borderRadius: 3,
                      }}
                    >
                      Request Changes
                    </button>
                  </div>
                </div>
                {approvalItemId === item.id && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="Add a comment..."
                      value={approvalComment}
                      onChange={e => setApprovalComment(e.target.value)}
                      style={{
                        flex: 1, background: '#111', border: '1px solid #1e1e1e',
                        borderRadius: 3, padding: '6px 10px', fontSize: 11,
                        color: '#f2ede4',
                      }}
                    />
                    <button
                      onClick={() => handleApproval(item.id, 'request_changes')}
                      style={{
                        padding: '6px 14px', fontSize: 9, fontWeight: 500,
                        color: '#fb923c', background: 'rgba(251,146,60,.1)',
                        border: '1px solid rgba(251,146,60,.3)', borderRadius: 3,
                      }}
                    >
                      Submit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 mb-8 dashboard-kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <CardShell onClick={() => setKpiModes(m => ({ ...m, followers: m.followers ? 0 : 1 }))}>
          <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>{kpiModes.followers ? 'Conversion Rate' : 'Followers'}</p>
          <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(30px,3vw,48px)', lineHeight: 1 }}>
            {kpiModes.followers ? pct(kpis.conversion) : fmt(kpis.currentFollowers)}
          </p>
          <p className="text-[10px] mt-3" style={{ color: kpis.gained >= 0 ? '#39ff88' : '#ff3b5f' }}>
            {kpis.gained >= 0 ? '+' : ''}{fmt(kpis.gained)} this period
          </p>
        </CardShell>
        <CardShell onClick={() => setKpiModes(m => ({ ...m, reach: m.reach ? 0 : 1 }))}>
          <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>{kpiModes.reach ? 'Avg Watch %' : 'Total Reach'}</p>
          <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(30px,3vw,48px)', lineHeight: 1 }}>
            {kpiModes.reach ? pct(kpis.watch) : fmt(kpis.totalReach)}
          </p>
          <p className="text-[10px] mt-3" style={{ color: '#666' }}>{activeWin.toUpperCase()} window</p>
        </CardShell>
        <CardShell onClick={() => setKpiModes(m => ({ ...m, er: m.er ? 0 : 1 }))}>
          <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>{kpiModes.er ? 'Top Video' : 'Avg ER %'}</p>
          <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: kpiModes.er ? 'clamp(18px,1.6vw,25px)' : 'clamp(30px,3vw,48px)', lineHeight: 1.1 }}>
            {kpiModes.er ? (kpis.top?.title ?? '-') : pct(kpis.er)}
          </p>
          <p className="text-[10px] mt-3" style={{ color: '#666' }}>{kpiModes.er ? `${pct(kpis.top?.er ?? 0)} ER` : `${posts.length} posts in view`}</p>
        </CardShell>
        <CardShell>
          <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>Posts</p>
          <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(30px,3vw,48px)', lineHeight: 1 }}>{fmt(kpis.posts)}</p>
          <p className="text-[10px] mt-3" style={{ color: '#666' }}>Published this period</p>
        </CardShell>
      </section>

      <section className="mb-8">
        <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
          <span style={{ width: 16, height: 1, background: '#c9a96e' }} />
          30 Day Projections
        </p>
        <div className="grid gap-6 dashboard-projections" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {[
            ['Projected Follower Gain', `+${fmt(projections.followers)}`, 'followers'],
            ['Projected Reach', fmt(projections.reach), 'reach'],
            ['Projected Avg ER %', pct(projections.er), 'er'],
          ].map(([label, value, key]) => (
            <CardShell key={key} onClick={() => openProjection(key as string, label as string)}>
              <div className="flex items-center justify-between mb-5">
                <p className="text-[8px] font-medium tracking-[.2em] uppercase" style={{ color: '#555' }}>{label}</p>
                <SparkIcon />
              </div>
              <p className="font-jakarta font-light" style={{ color: '#f2ede4', fontSize: 'clamp(26px,2.8vw,42px)', lineHeight: 1 }}>{value}</p>
              <p className="text-[10px] mt-3" style={{ color: '#666' }}>Last {projections.sample} posts average</p>
            </CardShell>
          ))}
        </div>
      </section>

      {rawCampaigns.length > 0 && (() => {
        const totalSpend30 = rawCampaigns.reduce((s, c) => s + +c.spend, 0)
        const avgRoas = rawCampaigns.filter(c => +c.roas > 0)
        const topRoas = avgRoas.length ? Math.max(...avgRoas.map(c => +c.roas)) : 0
        const topCtr  = rawCampaigns.filter(c => +c.ctr > 0)
        const maxCtr  = topCtr.length ? Math.max(...topCtr.map(c => +c.ctr)) : 0
        const avgCpm  = rawCampaigns.filter(c => +c.cpm > 0)
        const cpmAvg  = avgCpm.length ? avgCpm.reduce((s, c) => s + +c.cpm, 0) / avgCpm.length : 0
        const fmtMon  = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(0)}`
        return (
          <section className="mb-8">
            <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
              <span style={{ width: 16, height: 1, background: '#c9a96e' }} />
              Paid Media · 30 Days
            </p>
            <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(4,1fr)', background: '#141414' }}>
              {[
                { label: 'Total Spend',   value: fmtMon(totalSpend30), sub: `${rawCampaigns.length} campaigns` },
                { label: 'Top ROAS',      value: topRoas > 0 ? `${topRoas.toFixed(1)}x` : '—', sub: 'Best campaign' },
                { label: 'Top CTR',       value: maxCtr > 0 ? `${maxCtr.toFixed(2)}%` : '—', sub: 'Click-through rate' },
                { label: 'Avg CPM',       value: cpmAvg > 0 ? fmtMon(cpmAvg) : '—', sub: 'Cost per 1K impressions' },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ background: '#0a0a0a', padding: '22px 20px' }}>
                  <p className="text-[8px] font-medium tracking-[.18em] uppercase mb-3" style={{ color: '#555' }}>{label}</p>
                  <p className="font-jakarta font-light" style={{ fontSize: 'clamp(22px,2.4vw,34px)', color: '#f2ede4', lineHeight: 1 }}>{value}</p>
                  <p className="text-[10px] mt-2" style={{ color: '#666' }}>{sub}</p>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      <section className="grid gap-6 mb-8 dashboard-snapshots" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, .65fr)' }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #171717', borderRadius: 6, padding: 24 }}>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[9px] font-medium tracking-[.22em] uppercase" style={{ color: '#c9a96e' }}>7 Day Calendar</p>
            <div className="flex gap-2">
              <ArrowButton label="Previous week" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })} />
              <ArrowButton label="Next week" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })} />
            </div>
          </div>
          <div className="grid gap-3 dashboard-calendar" style={{ gridTemplateColumns: 'repeat(7, minmax(104px, 1fr))', overflowX: 'auto' }}>
            {weekDays.map(day => {
              const dayIso = isoDate(day)
              const events = weekEvents.filter(e => e.event_date === dayIso)
              return (
                <div key={dayIso} style={{ minHeight: 154, background: '#070707', border: '1px solid #141414', borderRadius: 5, padding: 10 }}>
                  <p className="text-[8px] tracking-[.16em] uppercase" style={{ color: '#555' }}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                  <p className="font-jakarta text-[20px] mb-3" style={{ color: '#f2ede4' }}>{day.getDate()}</p>
                  <div className="flex flex-col gap-2">
                    {events.slice(0, 2).map(event => {
                      const p = event.platform ?? 'ig'
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => setSelectedPostId(event.postId)}
                          style={{
                            border: `1px solid ${PLATFORM_COLORS[p] ?? '#555'}66`,
                            borderLeft: `3px solid ${PLATFORM_COLORS[p] ?? '#555'}`,
                            color: '#f2ede4',
                            background: '#0d0d0d',
                            borderRadius: 4,
                            padding: '7px 8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 10,
                            lineHeight: 1.25,
                            transition: 'all .15s ease',
                          }}
                        >
                          <span className="block overflow-hidden" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{event.title}</span>
                        </button>
                      )
                    })}
                    {events.length > 2 && <span className="text-[10px]" style={{ color: '#555' }}>+{events.length - 2} more</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: '#0a0a0a', border: '1px solid #171717', borderRadius: 6, padding: 24 }}>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[9px] font-medium tracking-[.22em] uppercase" style={{ color: '#c9a96e' }}>Pipeline Snapshot</p>
            <span className="text-[10px]" style={{ color: '#666' }}>{filteredPipeline.length} items</span>
          </div>
          <div style={{ maxHeight: 384, overflowY: 'auto', paddingRight: 4 }}>
            {filteredPipeline.slice(0, 18).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/pipeline?phase=${encodeURIComponent(item.status)}&item=${encodeURIComponent(item.id)}&platform=${platform}&scope=${scope}`)}
                className="flex items-center gap-3"
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  border: 'none',
                  borderBottom: '1px solid #121212',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: 3,
                  margin: '0 -8px',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0d0d0d' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span className="text-[10px] font-medium" style={{ color: '#c9a96e', fontFamily: 'monospace', width: 70 }}>{item.post_id}</span>
                <span className="text-[12px] flex-1 overflow-hidden" style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.title}</span>
                <span className="text-[7px] font-medium tracking-[.12em] uppercase px-2 py-1" style={{ color: STATUS_COLORS[item.status] ?? '#555', border: `1px solid ${(STATUS_COLORS[item.status] ?? '#555')}55`, background: '#080808' }}>{item.status}</span>
              </button>
            ))}
            {!filteredPipeline.length && <p className="text-[11px] py-10 text-center" style={{ color: '#555' }}>No pipeline items in this view.</p>}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 8 }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-medium tracking-[.24em] uppercase flex items-center gap-3" style={{ color: '#c9a96e' }}>
            <span style={{ width: 16, height: 1, background: '#c9a96e' }} />
            AI Insights
          </p>
          <button
            type="button"
            onClick={() => { setAiModalTitle('Content Performance'); setAiModalOpen(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px',
              background: 'rgba(201,169,110,0.07)',
              border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 5,
              color: '#c9a96e',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all .15s ease',
            }}
          >
            <SparkIcon />
            View Insights
          </button>
        </div>
        <p className="text-[11px]" style={{ color: '#666', lineHeight: 1.5 }}>
          AI-powered analysis of your top content pillars, hook performance, and engagement trends.
          Click a projection card above to drill into metric-specific insights.
        </p>
      </section>

      {selectedPost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={e => { if (e.currentTarget === e.target) setSelectedPostId(null) }}>
          <div style={{ width: 420, maxWidth: '100%', background: '#0a0a0a', border: '1px solid #242424', borderRadius: 8, boxShadow: '0 24px 80px rgba(0,0,0,.7)' }}>
            <button type="button" onClick={() => router.push(`/calendar?post=${encodeURIComponent(selectedPost.post_id)}`)} style={{ width: '100%', padding: '20px 22px', border: 'none', borderBottom: '1px solid #171717', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <p className="text-[10px] tracking-[.18em] uppercase mb-2" style={{ color: '#c9a96e' }}>{selectedPost.post_id} - {selectedPost.platformKey.toUpperCase()}</p>
              <h3 className="font-jakarta font-light text-[22px]" style={{ color: '#f2ede4', lineHeight: 1.2 }}>{selectedPost.title}</h3>
            </button>
            <div style={{ padding: 22 }}>
              <div className="flex items-center gap-3 mb-5">
                <span className="font-jakarta text-[34px]" style={{ color: TIER_COLORS[grade(selectedPost.er).toLowerCase() as keyof typeof TIER_COLORS] }}>{grade(selectedPost.er)}</span>
                <div>
                  <p className="text-[12px]" style={{ color: '#f2ede4' }}>{pct(selectedPost.er)} ER</p>
                  <p className="text-[10px]" style={{ color: '#555' }}>{fmt(selectedPost.metric.views)} reach - {selectedPost.decision ?? 'No decision'}</p>
                </div>
              </div>
              <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                  ['Views', fmt(selectedPost.metric.views)],
                  ['Watch', pct(selectedPost.metric.watch_pct)],
                  ['Followers', fmt(selectedPost.metric.followers)],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid #171717', borderRadius: 5, padding: 12 }}>
                    <p className="text-[8px] tracking-[.16em] uppercase mb-2" style={{ color: '#555' }}>{label}</p>
                    <p className="text-[16px]" style={{ color: '#f2ede4' }}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {topStats(selectedPost, avgER).map(stat => (
                  <span key={stat} className="text-[9px] px-2 py-1" style={{ color: '#c9a96e', background: 'rgba(201,169,110,.08)', border: '1px solid rgba(201,169,110,.25)', borderRadius: 4 }}>{stat}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client Notes */}
      <ClientNotesPanel />

      <AISuggestionsModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title={aiModalTitle}
        subtitle="Powered by Claude · Based on your recent content data"
        suggestions={suggestions}
        loading={loadingAi}
      />
    </div>
  )
}

function ClientNotesPanel() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [shared, setShared] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && !loaded) {
      getClientNotes().then(res => {
        if (!res.error) {
          setContent(res.content ?? '')
          setShared(res.shared ?? false)
          setLoaded(true)
        }
      })
    }
  }, [open, loaded])

  async function handleSave(html: string) {
    setContent(html)
    setSaving(true)
    const { error } = await saveClientNotes(html, shared)
    setSaving(false)
    if (error) toast(error, 'error')
  }

  return (
    <section className="mt-8" style={{ borderTop: '1px solid #141414', paddingTop: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: 'none', color: '#555',
          fontSize: 9, fontWeight: 500, letterSpacing: '.2em',
          textTransform: 'uppercase', cursor: 'pointer',
          padding: '4px 0',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M6 4l4 4-4 4"/></svg>
        Notes
        {saving && <span style={{ color: '#c9a96e', marginLeft: 4 }}>saving...</span>}
      </button>
      {open && loaded && (
        <div className="mt-3">
          <RichTextEditor
            content={content}
            onChange={handleSave}
            placeholder="Add notes about this client..."
            debounceMs={1500}
            minHeight={100}
          />
        </div>
      )}
    </section>
  )
}
