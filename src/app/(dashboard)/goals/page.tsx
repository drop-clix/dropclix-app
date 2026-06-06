import { getPortalContext } from '@/lib/supabase/portal'
import { GoalsEditableCards } from '@/components/portal/GoalsClient'
import type { GoalRow as ClientGoalRow } from '@/components/portal/GoalsClient'
import { FilterBar } from '@/components/portal/FilterBar'

// ── Types ──────────────────────────────────────────────────────────────────

type GoalRow    = { id: string; metric: string; target: number; period: string }
type MonthData  = { posts: number; views: number; followers: number; er: number; eliteVideos: number }
type GoalStatus = 'ahead' | 'on_track' | 'behind'

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<GoalStatus, { label: string; color: string; bg: string; border: string }> = {
  ahead:    { label: 'Ahead',    color: '#39ff88', bg: 'rgba(57,255,136,.1)',  border: 'rgba(57,255,136,.25)'  },
  on_track: { label: 'On Track', color: '#c9a96e', bg: 'rgba(201,169,110,.1)', border: 'rgba(201,169,110,.25)' },
  behind:   { label: 'Behind',   color: '#ff3b5f', bg: 'rgba(255,59,95,.1)',   border: 'rgba(255,59,95,.25)'   },
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number, dp = 0): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return dp > 0 ? n.toFixed(dp) : n.toLocaleString()
}

function paceStatus(
  actual: number, target: number,
  daysElapsed: number, daysInMonth: number,
  lowerIsBetter = false,
): GoalStatus {
  if (target === 0) return 'on_track'
  const pace  = (actual / Math.max(1, daysElapsed)) * daysInMonth
  const ratio = lowerIsBetter ? target / pace : pace / target
  if (ratio >= 1.1) return 'ahead'
  if (ratio >= 0.8) return 'on_track'
  return 'behind'
}

function progressPct(actual: number, target: number): number {
  if (target === 0) return 100
  return Math.min(100, Math.round((actual / target) * 100))
}

// ── Sub-components (server-renderable JSX) ─────────────────────────────────

function StatusBadge({ status }: { status: GoalStatus }) {
  const cfg = STATUS_CFG[status]
  return (
    <span
      style={{
        fontSize: 7, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase',
        padding: '2px 8px', color: cfg.color, background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.label}
    </span>
  )
}

function GoalCard({
  metric, target, actual, unit, daysElapsed, daysInMonth, note,
}: {
  metric: string; target: number; actual: number; unit: string
  daysElapsed: number; daysInMonth: number; note?: string
}) {
  const status  = paceStatus(actual, target, daysElapsed, daysInMonth)
  const pct     = progressPct(actual, target)
  const barColor = STATUS_CFG[status].color

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '28px 24px 22px', position: 'relative', overflow: 'hidden' }}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-[8px] font-medium tracking-[.2em] uppercase" style={{ color: '#333' }}>
          {metric}
        </p>
        <StatusBadge status={status} />
      </div>

      {/* Actual value */}
      <p className="font-jakarta font-light" style={{ fontSize: 'clamp(22px,2.8vw,38px)', lineHeight: 1, color: barColor }}>
        {unit === '%' ? actual.toFixed(1) + '%' : fmtNum(actual)}
      </p>

      {/* Target */}
      <p className="text-[10px] font-light mt-1" style={{ color: '#2a2a2a' }}>
        target {unit === '%' ? target.toFixed(1) + '%' : fmtNum(target)}
        {unit && unit !== '%' ? ` ${unit}` : ''}
      </p>

      {/* Progress bar */}
      <div style={{ marginTop: 12, height: 2, background: '#141414', borderRadius: 1, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`, height: '100%', borderRadius: 1,
            background: barColor, opacity: 0.8,
          }}
        />
      </div>
      <p className="text-[9px] mt-1" style={{ color: '#2a2a2a' }}>
        {pct}% of monthly target
      </p>

      {note && (
        <p className="text-[9px] font-light mt-2" style={{ color: '#333', fontStyle: 'italic' }}>
          {note}
        </p>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function GoalsPage() {
  const { supabase, clientId } = await getPortalContext()
  const cid = clientId ?? '00000000-0000-0000-0000-000000000000'

  type RawGoal = { metric: string; target: number; period: string }
  type RawPost = {
    post_id: string; date: string | null
    post_analytics: {
      metric_window: string; views: number; likes: number; comments: number
      shares: number; saves: number; followers: number; watch_pct: number
    }[]
  }

  const [goalsRes, postsRes] = await Promise.all([
    supabase.from('goals').select('id, metric, target, period').eq('client_id', cid),
    supabase.from('posts')
      .select('post_id, date, post_analytics(metric_window,views,likes,comments,shares,saves,followers,watch_pct)')
      .eq('client_id', cid),
  ])

  const goals   = (goalsRes.data ?? []) as unknown as RawGoal[]
  const rawPosts = (postsRes.data ?? []) as unknown as RawPost[]

  // Build goal lookups
  const monthly: Record<string, number> = {}
  const weekly:  Record<string, number> = {}
  for (const g of goals) {
    if (g.period === 'monthly') monthly[g.metric] = +g.target
    if (g.period === 'weekly')   weekly[g.metric]  = +g.target
  }

  // ── Compute month-by-month actuals ─────────────────────────────────────
  const byMonth = new Map<string, MonthData>()

  for (const p of rawPosts) {
    if (!p.date) continue
    const key = p.date.slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, { posts: 0, views: 0, followers: 0, er: 0, eliteVideos: 0 })
    const m   = byMonth.get(key)!
    const eom = p.post_analytics.find(a => a.metric_window === 'eom')
    m.posts++
    if (eom) {
      m.views     += eom.views     ?? 0
      m.followers += eom.followers ?? 0
      // accumulate weighted ER components
      const engagement = (eom.likes ?? 0) + (eom.comments ?? 0) + (eom.shares ?? 0) + (eom.saves ?? 0)
      const er = eom.views > 0 ? (engagement / eom.views) * 100 : 0
      m.er += er   // will average below
      if (er >= 12) m.eliteVideos++
    }
  }
  // Average ER per month (sum → avg)
  for (const [, m] of byMonth) {
    if (m.posts > 0) m.er = m.er / m.posts
  }

  // Sorted month keys
  const sortedMonths = [...byMonth.keys()].sort()

  // ── Current month context ──────────────────────────────────────────────
  const now          = new Date()
  const currentKey   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysElapsed  = now.getDate()

  // Fall back to most recent month with data if current month is empty
  const displayKey    = byMonth.has(currentKey) ? currentKey : sortedMonths[sortedMonths.length - 1] ?? currentKey
  const currentData   = byMonth.get(displayKey) ?? { posts: 0, views: 0, followers: 0, er: 0, eliteVideos: 0 }
  const [dispY, dispM] = displayKey.split('-').map(Number)
  const isCurrentMonth = displayKey === currentKey

  // ── Generate "What Needs to Happen" action items ───────────────────────
  const actions: string[] = []

  // Posts gap
  if (monthly['Posts']) {
    const postsGap      = monthly['Posts'] - currentData.posts
    const weeksLeft     = Math.max(1, Math.ceil((daysInMonth - daysElapsed) / 7))
    const postsPerWeek  = Math.max(1, Math.ceil(postsGap / weeksLeft))
    if (postsGap > 0) {
      actions.push(
        `Publish ${postsPerWeek} video${postsPerWeek !== 1 ? 's' : ''} this week — you're at ${currentData.posts}/${monthly['Posts']} posts for the month with ${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} to go.`,
      )
    } else {
      actions.push(`Posts goal hit — ${currentData.posts}/${monthly['Posts']} this month. Keep the cadence.`)
    }
  }

  // ER gap
  if (monthly['Avg ER%'] && currentData.posts > 0) {
    const erGap = monthly['Avg ER%'] - currentData.er
    if (erGap > 0.5) {
      actions.push(
        `Engagement rate is ${currentData.er.toFixed(1)}% vs ${monthly['Avg ER%']}% target. ` +
        `Use Hard Statement or Volume hooks — they average 6.1% and 8.6% ER vs 5.0% for Authority.`,
      )
    } else if (erGap <= 0) {
      actions.push(`ER target hit at ${currentData.er.toFixed(1)}% — continue prioritising Volume/50-150 content.`)
    } else {
      actions.push(
        `ER is ${currentData.er.toFixed(1)}% — ${erGap.toFixed(1)}pp below target. ` +
        `Volume/50-150 pillar averages 7.1% ER; weight your next posts toward it.`,
      )
    }
  }

  // Views gap — actionable advice
  if (monthly['Total Views']) {
    const viewsGap = monthly['Total Views'] - currentData.views
    if (viewsGap > 0) {
      actions.push(
        `Views are ${fmtNum(currentData.views)} vs ${fmtNum(monthly['Total Views'])} target. ` +
        `Your best pillar (Volume/50-150) averages 37.5K views/post — 2–3 more posts from it closes the gap fast.`,
      )
    }
  }

  const actionItems = actions.slice(0, 3)

  // ── Historical comparison data (for table) ─────────────────────────────
  const histMonths = sortedMonths.slice(-6) // last 6 months max

  return (
    <div className="p-10 max-w-[1000px]">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
        <p className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
           style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Monthly Targets
        </p>
        <h1 className="font-jakarta font-light"
            style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}>
          Goals
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#444' }}>
          {MONTH_NAMES[dispM - 1]} {dispY}
          {!isCurrentMonth && (
            <span style={{ color: '#2a2a2a' }}> · showing most recent month with data</span>
          )}
        </p>
      </div>

      <FilterBar />

      {/* ── What needs to happen this week ──────────────────────── */}
      <div className="mb-8" style={{ border: '1px solid rgba(201,169,110,.2)', borderLeft: '3px solid #c9a96e' }}>
        <div className="px-6 pt-5 pb-2" style={{ borderBottom: '1px solid #141414' }}>
          <p className="text-[9px] font-medium tracking-[.24em] uppercase" style={{ color: '#c9a96e' }}>
            What Needs to Happen This Week
          </p>
        </div>
        <div className="px-6 py-4 flex flex-col gap-3">
          {actionItems.length === 0 ? (
            <p className="text-[12px] font-light" style={{ color: '#444' }}>
              No goals set yet — targets loaded from defaults.
            </p>
          ) : (
            actionItems.map((item, i) => (
              <div key={i} className="flex gap-3">
                <span
                  className="font-jakarta font-light shrink-0 mt-0.5"
                  style={{ fontSize: 11, color: '#c9a96e' }}
                >
                  {i + 1}.
                </span>
                <p className="text-[12px] font-light" style={{ color: '#f2ede4', lineHeight: 1.7 }}>
                  {item}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Monthly goal cards + weekly targets (editable) ──────── */}
      <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
         style={{ color: '#c9a96e' }}>
        <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
        Monthly Goals — {MONTH_NAMES[dispM - 1]}
      </p>
      <GoalsEditableCards
        monthlyGoals={goals.filter(g => g.period === 'monthly') as ClientGoalRow[]}
        weeklyGoals={goals.filter(g => g.period === 'weekly') as ClientGoalRow[]}
        currentData={{
          posts:     currentData.posts,
          views:     currentData.views,
          followers: currentData.followers,
          er:        currentData.er,
        }}
        daysElapsed={isCurrentMonth ? daysElapsed : daysInMonth}
        daysInMonth={daysInMonth}
      />

      {/* ── Historical comparison ─────────────────────────────────── */}
      <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
         style={{ color: '#c9a96e' }}>
        <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
        Monthly History vs Targets
      </p>
      <div style={{ border: '1px solid #141414', overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
              <th className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase"
                  style={{ color: '#2a2a2a' }}>Month</th>
              {[
                { key: 'Posts',            tgt: monthly['Posts'],            label: 'Posts'      },
                { key: 'Total Views',      tgt: monthly['Total Views'],      label: 'Views'      },
                { key: 'Followers Gained', tgt: monthly['Followers Gained'], label: 'Followers'  },
                { key: 'Avg ER%',          tgt: monthly['Avg ER%'],          label: 'Avg ER%'    },
              ].map(col => (
                <th key={col.key}
                    className="text-right px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase"
                    style={{ color: '#2a2a2a' }}>
                  {col.label}
                  <span style={{ display: 'block', color: '#1e1e1e', fontSize: 7, letterSpacing: '.1em', fontWeight: 400, marginTop: 1 }}>
                    (tgt {col.key === 'Avg ER%' ? (col.tgt ?? 0).toFixed(1) + '%' : fmtNum(col.tgt ?? 0)})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {histMonths.map((mk, i) => {
              const m     = byMonth.get(mk)!
              const [y, mo] = mk.split('-').map(Number)
              const isCur = mk === currentKey

              const cols = [
                { val: m.posts,     tgt: monthly['Posts'],            isNum: true,  isPct: false },
                { val: m.views,     tgt: monthly['Total Views'],      isNum: true,  isPct: false },
                { val: m.followers, tgt: monthly['Followers Gained'], isNum: true,  isPct: false },
                { val: m.er,        tgt: monthly['Avg ER%'],          isNum: false, isPct: true  },
              ]

              return (
                <tr key={mk}
                    style={{
                      borderBottom: i < histMonths.length - 1 ? '1px solid #0e0e0e' : 'none',
                      background: isCur ? 'rgba(201,169,110,.03)' : i % 2 === 0 ? '#060606' : '#070707',
                    }}>
                  <td className="px-5 py-4">
                    <span className="text-[11px] font-light" style={{ color: isCur ? '#c9a96e' : '#f2ede4' }}>
                      {MONTH_NAMES[mo - 1].slice(0, 3)} {y}
                    </span>
                    {isCur && (
                      <span className="text-[8px] ml-2" style={{ color: '#c9a96e', opacity: .6 }}>current</span>
                    )}
                  </td>
                  {cols.map((col, ci) => {
                    const hit   = col.tgt ? col.val >= col.tgt : false
                    const close = col.tgt ? col.val >= col.tgt * 0.8 : false
                    const color = hit ? '#39ff88' : close ? '#c9a96e' : '#ff3b5f'
                    const display = col.isPct
                      ? `${col.val.toFixed(1)}%`
                      : fmtNum(col.val)
                    return (
                      <td key={ci} className="px-5 py-3 text-right">
                        <span className="text-[12px] font-light" style={{ color: col.val > 0 ? color : '#252525' }}>
                          {col.val > 0 ? display : '—'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {[
          { color: '#39ff88', label: 'At or above target' },
          { color: '#c9a96e', label: 'Within 20% of target' },
          { color: '#ff3b5f', label: 'More than 20% below target' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span style={{ width: 6, height: 6, background: color, opacity: .8, display: 'block' }} />
            <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#252525' }}>{label}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[9px]" style={{ color: '#1e1e1e' }}>
        Targets seeded May 2026. Analytics data from eom (end-of-month) window per post.
        ER = (likes + comments + shares + saves) / views × 100.
      </p>

    </div>
  )
}
