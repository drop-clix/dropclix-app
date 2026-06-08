'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { updateGoalTarget } from '@/app/(dashboard)/edit-actions'
import { usePortalFilters, filterByPlatform } from '@/hooks/usePortalFilters'
import { PlatformPills } from '@/components/portal/FilterBar'
import { ReportCardClient } from '@/components/portal/ReportCardClient'
import { EmptyState } from '@/components/portal/EmptyState'
import type { WeekGrade, MonthGrade, PostSummary, ScoreComponents } from '@/app/(dashboard)/report-card/page'
import type { RawGoalPost, RawGoal } from '@/app/(dashboard)/goals/page'

// ── Types ──────────────────────────────────────────────────────────────────

export type GoalRow = { id: string; metric: string; period: 'monthly' | 'weekly'; target: number }
export type CurrentData = { posts: number; views: number; followers: number; er: number }

type GoalStatus = 'ahead' | 'on_track' | 'behind'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n > 0 ? n.toLocaleString() : '0'
}

function paceStatus(actual: number, target: number, daysElapsed: number, daysInMonth: number): GoalStatus {
  if (target === 0) return 'on_track'
  const pace  = (actual / Math.max(1, daysElapsed)) * daysInMonth
  const ratio = pace / target
  if (ratio >= 1.1) return 'ahead'
  if (ratio >= 0.8) return 'on_track'
  return 'behind'
}

function progressPct(actual: number, target: number): number {
  if (target === 0) return 100
  return Math.min(100, Math.round((actual / target) * 100))
}

function gradeColor(g: string): string {
  return g === 'A' ? '#c9a96e' : g === 'B' ? '#4ade80' : g === 'C' ? '#f59e0b' : g === 'D' ? '#f97316' : '#ef4444'
}

function gradeFor(score: number): { grade: string; label: string } {
  if (score >= 90) return { grade: 'A', label: 'Exceptional' }
  if (score >= 80) return { grade: 'B', label: 'Strong'      }
  if (score >= 70) return { grade: 'C', label: 'Developing'  }
  if (score >= 60) return { grade: 'D', label: 'Needs Work'  }
  return              { grade: 'F', label: 'Miss'         }
}

function weekStart(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function weekLabel(mon: string): string {
  const s = new Date(mon + 'T12:00:00')
  const e = new Date(mon + 'T12:00:00')
  e.setDate(e.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(s)} – ${fmt(e)}`
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

interface PeriodRaw {
  posts: number; totalER: number; totalViews: number
  totalFollowers: number; eliteCount: number
  postList: PostSummary[]
}

function postER(p: RawGoalPost, window: 'eom' | 'w7' | 'w3' | 'w24'): { er: number; views: number; likes: number; comments: number; shares: number; saves: number | null; followers: number } | null {
  const a = p.post_analytics.find(x => x.metric_window === window)
  if (!a) return null
  return { er: 0, views: a.views ?? 0, likes: a.likes ?? 0, comments: a.comments ?? 0, shares: a.shares ?? 0, saves: a.saves ?? null, followers: a.followers ?? 0 }
}

function computeER(p: RawGoalPost): { er: number; views: number; followers: number } {
  for (const win of ['eom', 'w7', 'w3', 'w24'] as const) {
    const a = postER(p, win)
    if (a && a.views > 0) {
      const isYT = (p.platform ?? []).includes('yt')
      const engagement = isYT
        ? a.likes + a.comments + a.shares + a.followers
        : a.likes + a.comments + a.shares + (a.saves ?? 0)
      return { er: (engagement / a.views) * 100, views: a.views, followers: a.followers }
    }
  }
  return { er: 0, views: 0, followers: 0 }
}

function computeReportCard(
  posts: RawGoalPost[],
  goals: RawGoal[],
): { weekGrades: WeekGrade[]; monthGrades: MonthGrade[] } {
  const monthlyGoals: Record<string, number> = {}
  const weeklyGoals:  Record<string, number> = {}
  for (const g of goals) {
    if (g.period === 'monthly') monthlyGoals[g.metric] = +g.target
    if (g.period === 'weekly')  weeklyGoals[g.metric]  = +g.target
  }

  const weekMap  = new Map<string, PeriodRaw>()
  const monthMap = new Map<string, PeriodRaw>()

  function ensurePeriod(map: Map<string, PeriodRaw>, key: string): PeriodRaw {
    if (!map.has(key)) map.set(key, { posts: 0, totalER: 0, totalViews: 0, totalFollowers: 0, eliteCount: 0, postList: [] })
    return map.get(key)!
  }

  for (const p of posts) {
    if (!p.date) continue
    const { er, views, followers } = computeER(p)
    const isElite = er >= 12

    const ps: PostSummary = {
      postId: p.post_id, title: p.title, er, views,
      pillar: p.pillar ?? '—', hook: p.hook ?? '—', decision: p.decision ?? '—',
    }

    const wk = weekStart(p.date)
    const w  = ensurePeriod(weekMap, wk)
    w.posts++; w.totalER += er; w.totalViews += views; w.totalFollowers += followers
    if (isElite) w.eliteCount++
    w.postList.push(ps)

    const mk = p.date.slice(0, 7)
    const mo = ensurePeriod(monthMap, mk)
    mo.posts++; mo.totalER += er; mo.totalViews += views; mo.totalFollowers += followers
    if (isElite) mo.eliteCount++
    mo.postList.push(ps)
  }

  function buildWeekGrade(weekKey: string, raw: PeriodRaw): WeekGrade {
    const tgtPosts = weeklyGoals['Posts']       || 5
    const tgtViews = weeklyGoals['Total Views'] || 50_000
    const tgtER    = weeklyGoals['Avg ER%']     || 7.5
    const avgER    = raw.posts > 0 ? raw.totalER / raw.posts : 0
    const postScore  = Math.min(25, Math.round((raw.posts      / tgtPosts) * 25))
    const viewScore  = Math.min(30, Math.round((raw.totalViews / tgtViews) * 30))
    const erScore    = Math.min(35, Math.round((avgER           / tgtER)   * 35))
    const eliteScore = Math.min(10, raw.eliteCount * 5)
    const total      = postScore + viewScore + erScore + eliteScore
    const components: ScoreComponents = [
      { label: 'Posts',         score: postScore,  max: 25 },
      { label: 'Views / Reach', score: viewScore,  max: 30 },
      { label: 'Avg ER%',       score: erScore,    max: 35 },
      { label: 'Elite Videos',  score: eliteScore, max: 10 },
    ]
    const wins: string[]  = []
    const misses: string[] = []
    if (raw.posts >= tgtPosts) wins.push(`Published ${raw.posts} posts — hit the ${tgtPosts}/week target.`)
    if (raw.totalViews >= tgtViews) wins.push(`Reach: ${fmtNum(raw.totalViews)} views.`)
    if (avgER >= tgtER && raw.posts > 0) wins.push(`ER hit ${avgER.toFixed(1)}% — at or above ${tgtER}% target.`)
    if (raw.eliteCount > 0) {
      const best = [...raw.postList].sort((a, b) => b.er - a.er)[0]
      wins.push(`Elite video: ${best.postId} at ${best.er.toFixed(1)}% ER.`)
    }
    if (raw.posts < tgtPosts * 0.8) misses.push(`${raw.posts} posts vs ${tgtPosts} target.`)
    if (raw.totalViews < tgtViews * 0.5) misses.push(`Views at ${fmtNum(raw.totalViews)} — short of ${fmtNum(tgtViews)}.`)
    if (avgER > 0 && avgER < tgtER * 0.85) misses.push(`Avg ER ${avgER.toFixed(1)}% — below ${tgtER}% target.`)
    if (raw.eliteCount === 0 && raw.posts > 0) misses.push('No elite videos (≥12% ER) this week.')
    const topPosts = [...raw.postList].sort((a, b) => b.views - a.views).slice(0, 5)
    const { grade, label } = gradeFor(total)
    return { weekStart: weekKey, label: weekLabel(weekKey), score: total, grade, gradeLabel: label, posts: raw.posts, views: raw.totalViews, avgER, eliteCount: raw.eliteCount, components, topPosts, wins, misses }
  }

  function buildMonthGrade(monthKey: string, raw: PeriodRaw): MonthGrade {
    const tgtPosts     = monthlyGoals['Posts']            || 20
    const tgtViews     = monthlyGoals['Total Views']      || 200_000
    const tgtER        = monthlyGoals['Avg ER%']          || 7.5
    const tgtFollowers = monthlyGoals['Followers Gained'] || 500
    const tgtElite     = monthlyGoals['Elite Videos']     || 2
    const avgER        = raw.posts > 0 ? raw.totalER / raw.posts : 0
    const postScore  = Math.min(20, Math.round((raw.posts          / tgtPosts)     * 20))
    const viewScore  = Math.min(25, Math.round((raw.totalViews     / tgtViews)     * 25))
    const erScore    = Math.min(30, Math.round((avgER              / tgtER)        * 30))
    const follScore  = Math.min(15, Math.round((raw.totalFollowers / tgtFollowers) * 15))
    const eliteScore = Math.min(10, Math.round((raw.eliteCount     / tgtElite)     * 10))
    const total      = postScore + viewScore + erScore + follScore + eliteScore
    const components: ScoreComponents = [
      { label: 'Posts',            score: postScore,  max: 20 },
      { label: 'Total Views',      score: viewScore,  max: 25 },
      { label: 'Avg ER%',          score: erScore,    max: 30 },
      { label: 'Followers Gained', score: follScore,  max: 15 },
      { label: 'Elite Videos',     score: eliteScore, max: 10 },
    ]
    const wins: string[]    = []
    const misses: string[]  = []
    const strategy: string[] = []
    if (raw.posts >= tgtPosts) wins.push(`Published ${raw.posts} posts — hit the ${tgtPosts}-post target.`)
    if (raw.totalViews >= tgtViews) wins.push(`${fmtNum(raw.totalViews)} views — at or above target.`)
    if (raw.totalFollowers >= tgtFollowers) wins.push(`+${raw.totalFollowers.toLocaleString()} followers.`)
    if (avgER >= tgtER && raw.posts > 0) wins.push(`Avg ER ${avgER.toFixed(1)}% — hit target.`)
    if (raw.eliteCount >= tgtElite) wins.push(`${raw.eliteCount} elite videos — target met.`)
    if (raw.posts < tgtPosts * 0.8) misses.push(`Only ${raw.posts} posts vs ${tgtPosts} target.`)
    if (raw.totalViews < tgtViews * 0.7) misses.push(`Views ${fmtNum(raw.totalViews)} — below ${fmtNum(tgtViews)} target.`)
    if (raw.totalFollowers < tgtFollowers * 0.8) misses.push(`Follower gain ${raw.totalFollowers} vs ${tgtFollowers} target.`)
    if (avgER > 0 && avgER < tgtER * 0.85) misses.push(`Avg ER ${avgER.toFixed(1)}% — below ${tgtER}% target.`)
    if (raw.eliteCount < tgtElite) misses.push(`${raw.eliteCount} elite videos vs ${tgtElite} target.`)
    strategy.push(avgER < tgtER * 0.9
      ? 'Shift toward Hard Statement or Volume hooks — they outperform Authority.'
      : 'Posting cadence is solid. Focus on quality and ≥2 Elite posts next month.')
    const topPosts = [...raw.postList].sort((a, b) => b.views - a.views).slice(0, 5)
    const [y, m]   = monthKey.split('-').map(Number)
    const { grade, label } = gradeFor(total)
    return { monthKey, label: `${MONTH_NAMES[m - 1]} ${y}`, score: total, grade, gradeLabel: label, posts: raw.posts, views: raw.totalViews, avgER, followers: raw.totalFollowers, eliteCount: raw.eliteCount, components, topPosts, wins, misses, strategy }
  }

  const weekGrades: WeekGrade[] = [...weekMap.keys()].sort().map(k => buildWeekGrade(k, weekMap.get(k)!))
  const monthGrades: MonthGrade[] = [...monthMap.keys()].sort().map(k => buildMonthGrade(k, monthMap.get(k)!))

  return { weekGrades, monthGrades }
}

// ── EditableTarget ─────────────────────────────────────────────────────────

function EditableTarget({
  goalId,
  value,
  isPercent,
  onSave,
}: {
  goalId: string
  value: number
  isPercent: boolean
  onSave: (val: number) => void
}) {
  const [local, setLocal] = useState(isPercent ? value.toFixed(1) : String(Math.round(value)))
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved ] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleChange(val: string) {
    setLocal(val)
    setSaved(false)
    clearTimeout(timerRef.current)
    const n = parseFloat(val)
    if (!isNaN(n) && n >= 0) {
      timerRef.current = setTimeout(async () => {
        setSaving(true)
        const result = await updateGoalTarget(goalId, n)
        setSaving(false)
        if (!result.error) {
          onSave(n)
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        }
      }, 2000)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
      <span style={{ fontSize: 9, color: '#333' }}>target</span>
      <input
        type="number"
        min={0}
        step={isPercent ? 0.1 : 1}
        value={local}
        onChange={e => handleChange(e.target.value)}
        style={{
          width: 64, padding: '2px 5px', fontSize: 10, background: '#0d0d0d',
          border: `1px solid ${saving ? '#fbbf24' : saved ? '#39ff88' : '#333'}`,
          color: '#f2ede4', fontFamily: 'DM Sans, sans-serif', outline: 'none',
        }}
      />
      {isPercent && <span style={{ fontSize: 9, color: '#333' }}>%</span>}
      <span style={{
        width: 5, height: 5, borderRadius: '50%', display: 'block',
        background: saving ? '#fbbf24' : saved ? '#39ff88' : 'transparent',
      }} />
    </div>
  )
}

// ── GoalCard ───────────────────────────────────────────────────────────────

function GoalCard({
  label, actual, target, goalId, isPercent,
  daysElapsed, daysInMonth, onTargetUpdate,
}: {
  label: string; actual: number; target: number; goalId: string | null
  isPercent: boolean; daysElapsed: number; daysInMonth: number
  onTargetUpdate: (id: string, val: number) => void
}) {
  const [tgt, setTgt] = useState(target)
  const status   = paceStatus(actual, tgt, daysElapsed, daysInMonth)
  const pct      = progressPct(actual, tgt)
  const valueColor = status === 'behind' ? '#ff3b5f' : '#39ff88'

  const statusColors: Record<GoalStatus, { label: string; color: string; bg: string; border: string }> = {
    ahead:    { label: 'Ahead',    color: '#39ff88', bg: 'rgba(57,255,136,.1)',  border: 'rgba(57,255,136,.25)'  },
    on_track: { label: 'On Track', color: '#c9a96e', bg: 'rgba(201,169,110,.1)', border: 'rgba(201,169,110,.25)' },
    behind:   { label: 'Behind',   color: '#ff3b5f', bg: 'rgba(255,59,95,.1)',   border: 'rgba(255,59,95,.25)'   },
  }
  const sc = statusColors[status]

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '28px 24px 22px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '.2em', textTransform: 'uppercase', color: '#333' }}>
          {label}
        </p>
        <span style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', padding: '2px 8px', color: sc.color, background: sc.bg, border: `1px solid ${sc.border}` }}>
          {sc.label}
        </span>
      </div>

      <p style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 300, fontSize: 'clamp(22px,2.8vw,38px)', lineHeight: 1, color: valueColor }}>
        {isPercent ? actual.toFixed(1) + '%' : fmtNum(actual)}
      </p>

      {goalId ? (
        <EditableTarget
          goalId={goalId}
          value={tgt}
          isPercent={isPercent}
          onSave={val => { setTgt(val); onTargetUpdate(goalId, val) }}
        />
      ) : (
        <p style={{ fontSize: 10, color: '#2a2a2a', marginTop: 6 }}>
          target {isPercent ? tgt.toFixed(1) + '%' : fmtNum(tgt)}
        </p>
      )}

      <div style={{ marginTop: 14, height: 2, background: '#141414', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 1, background: valueColor, opacity: 0.8 }} />
      </div>
      <p style={{ fontSize: 9, marginTop: 4, color: '#2a2a2a' }}>{pct}% of monthly target</p>
    </div>
  )
}

// ── Main exported component ────────────────────────────────────────────────

export function GoalsDashboard({
  rawPosts,
  goals,
}: {
  rawPosts: RawGoalPost[]
  goals: RawGoal[]
}) {
  const { platform, setFilters } = usePortalFilters()
  const [visible,   setVisible  ] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [goalTargets, setGoalTargets] = useState<Record<string, number>>(
    () => Object.fromEntries(goals.map(g => [g.id, g.target])),
  )

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const now        = new Date()
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysElapsed = now.getDate()

  const filteredPosts = useMemo(
    () => filterByPlatform(rawPosts, platform, p => p.format ?? ''),
    [rawPosts, platform],
  )

  const currentMonthPosts = useMemo(
    () => filteredPosts.filter(p => p.date?.slice(0, 7) === currentKey),
    [filteredPosts, currentKey],
  )

  const actuals = useMemo(() => {
    let views = 0, followers = 0, eliteCount = 0
    for (const p of currentMonthPosts) {
      const { er, views: v, followers: f } = computeER(p)
      views += v
      followers += f
      if (er >= 12) eliteCount++
    }
    return { posts: currentMonthPosts.length, views, followers, eliteCount }
  }, [currentMonthPosts])

  const { weekGrades, monthGrades } = useMemo(
    () => computeReportCard(filteredPosts, goals),
    [filteredPosts, goals],
  )

  // Current month report card
  const currentMonthGrade = useMemo(() => {
    const cur = monthGrades.find(m => m.monthKey === currentKey)
    return cur ?? monthGrades[monthGrades.length - 1] ?? null
  }, [monthGrades, currentKey])

  function handleTargetUpdate(id: string, val: number) {
    setGoalTargets(prev => ({ ...prev, [id]: val }))
  }

  const findGoal = (metric: string) => goals.find(g => g.period === 'monthly' && g.metric === metric) ?? null

  const CARD_DEFS = [
    { label: 'Followers Gained', actual: actuals.followers, goalMetric: 'Followers Gained', isPercent: false, defaultTarget: 500 },
    { label: 'Posts This Month', actual: actuals.posts,     goalMetric: 'Posts',            isPercent: false, defaultTarget: 20  },
    { label: 'Total Views',      actual: actuals.views,     goalMetric: 'Total Views',      isPercent: false, defaultTarget: 200_000 },
    { label: 'Elite Videos',     actual: actuals.eliteCount,goalMetric: 'Elite Videos',     isPercent: false, defaultTarget: 2   },
  ]

  const [mo, yr] = currentKey ? [+currentKey.slice(5, 7), +currentKey.slice(0, 4)] : [0, 0]

  if (rawPosts.length === 0) {
    return (
      <EmptyState
        icon="target"
        headline="No data to track yet."
        body="Goal progress will appear here once your first content is imported."
      />
    )
  }

  return (
    <>
      {/* Hero header */}
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity .4s ease, transform .4s ease',
          marginBottom: 24, borderBottom: '1px solid #141414', paddingBottom: 24,
        }}
      >
        <p
          style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.26em', textTransform: 'uppercase',
            color: '#c9a96e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Monthly Targets
        </p>
        <h1 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 300,
          fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}>
          Performance Goals
        </h1>
        <p style={{ fontSize: 12, fontWeight: 300, marginTop: 4, color: '#444' }}>
          {MONTH_NAMES[(mo || 1) - 1]} {yr || now.getFullYear()}
        </p>
      </div>

      {/* Platform pills */}
      <div style={{ marginBottom: 28 }}>
        <PlatformPills platform={platform} onChange={p => setFilters({ platform: p })} />
      </div>

      {/* 4 Goal cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: '#141414', marginBottom: 10 }}>
        {CARD_DEFS.map(({ label, actual, goalMetric, isPercent, defaultTarget }) => {
          const goal = findGoal(goalMetric)
          const target = goal ? (goalTargets[goal.id] ?? goal.target) : defaultTarget
          return (
            <GoalCard
              key={label}
              label={label}
              actual={actual}
              target={target}
              goalId={goal?.id ?? null}
              isPercent={isPercent}
              daysElapsed={daysElapsed}
              daysInMonth={daysInMonth}
              onTargetUpdate={handleTargetUpdate}
            />
          )
        })}
      </div>

      <p style={{ fontSize: 8, color: '#252525', marginBottom: 40, letterSpacing: '.1em' }}>
        Click any target number to edit — saves automatically after 2 seconds
      </p>

      {/* Report Card snapshot */}
      {currentMonthGrade && (
        <div style={{ border: '1px solid #141414', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #0e0e0e' }}>
            <div>
              <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '.2em', textTransform: 'uppercase', color: '#333', marginBottom: 6 }}>
                Report Card · {currentMonthGrade.label}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 300, fontSize: 42, lineHeight: 1, color: gradeColor(currentMonthGrade.grade) }}>
                  {currentMonthGrade.grade}
                </span>
                <span style={{ fontSize: 20, color: '#333', fontWeight: 300 }}>
                  {currentMonthGrade.score}<span style={{ fontSize: 12, color: '#252525' }}>/100</span>
                </span>
                <span style={{ fontSize: 11, color: '#444' }}>{currentMonthGrade.gradeLabel}</span>
              </div>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              style={{
                padding: '9px 20px', fontSize: 10, fontWeight: 600,
                letterSpacing: '.14em', textTransform: 'uppercase',
                color: '#c9a96e', background: 'transparent',
                border: '1px solid rgba(201,169,110,.4)', cursor: 'pointer',
                transition: 'border-color .15s, background .15s',
                fontFamily: 'DM Sans, sans-serif',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,169,110,.08)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#c9a96e'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,169,110,.4)'
              }}
            >
              View Full Report Card
            </button>
          </div>

          {/* Snapshot stats */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #0e0e0e' }}>
            {[
              { label: 'Posts', value: currentMonthGrade.posts },
              { label: 'Views', value: fmtNum(currentMonthGrade.views) },
              { label: 'Followers', value: fmtNum(currentMonthGrade.followers) },
              { label: 'Avg ER%',   value: currentMonthGrade.avgER.toFixed(1) + '%' },
              { label: 'Elite',     value: currentMonthGrade.eliteCount },
            ].map(({ label, value }) => (
              <div key={label} style={{ flex: 1, padding: '16px 20px', borderRight: '1px solid #0e0e0e' }}>
                <p style={{ fontSize: 8, color: '#333', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</p>
                <p style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 300, fontSize: 18, color: '#f2ede4' }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Top wins/misses */}
          {(currentMonthGrade.wins.length > 0 || currentMonthGrade.misses.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              <div style={{ padding: '16px 20px', borderRight: '1px solid #0e0e0e' }}>
                <p style={{ fontSize: 8, color: '#39ff88', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8 }}>Wins</p>
                {currentMonthGrade.wins.slice(0, 2).map((w, i) => (
                  <p key={i} style={{ fontSize: 11, color: '#555', lineHeight: 1.6, marginBottom: 4 }}>{w}</p>
                ))}
              </div>
              <div style={{ padding: '16px 20px' }}>
                <p style={{ fontSize: 8, color: '#ff3b5f', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8 }}>Misses</p>
                {currentMonthGrade.misses.slice(0, 2).map((m, i) => (
                  <p key={i} style={{ fontSize: 11, color: '#555', lineHeight: 1.6, marginBottom: 4 }}>{m}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Report Card modal */}
      {modalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)', zIndex: 9000, overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '60px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
              <div>
                <p style={{ fontSize: 9, color: '#c9a96e', letterSpacing: '.24em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Performance Review
                </p>
                <h2 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 300, fontSize: 32, color: '#f2ede4' }}>
                  Report Card
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  width: 36, height: 36, background: 'transparent',
                  border: '1px solid #1e1e1e', color: '#444', cursor: 'pointer',
                  fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                ×
              </button>
            </div>
            <ReportCardClient weekGrades={weekGrades} monthGrades={monthGrades} />
          </div>
        </div>
      )}
    </>
  )
}

