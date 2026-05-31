'use client'

import { useState, useRef } from 'react'
import { updateGoalTarget } from '@/app/(dashboard)/edit-actions'

// ── Types ──────────────────────────────────────────────────────────────────

export type GoalRow = { id: string; metric: string; period: 'monthly' | 'weekly'; target: number }
export type CurrentData = { posts: number; views: number; followers: number; er: number }

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n > 0 ? n.toLocaleString() : '0'
}

type GoalStatus = 'ahead' | 'on_track' | 'behind'

const STATUS_CFG: Record<GoalStatus, { label: string; color: string; bg: string; border: string }> = {
  ahead:    { label: 'Ahead',    color: '#39ff88', bg: 'rgba(57,255,136,.1)',  border: 'rgba(57,255,136,.25)'  },
  on_track: { label: 'On Track', color: '#c9a96e', bg: 'rgba(201,169,110,.1)', border: 'rgba(201,169,110,.25)' },
  behind:   { label: 'Behind',   color: '#ff3b5f', bg: 'rgba(255,59,95,.1)',   border: 'rgba(255,59,95,.25)'   },
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
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(isPercent ? value.toFixed(1) : String(Math.round(value)))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

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
        // Field stays focused — no blur called
      }, 2000)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        title="Click to edit target"
        style={{
          background: 'none', border: 'none', cursor: 'text', padding: 0,
          textDecoration: 'underline dotted #2a2a2a', textUnderlineOffset: 3,
        }}
      >
        <span className="text-[10px] font-light" style={{ color: '#2a2a2a' }}>
          target {isPercent ? value.toFixed(1) + '%' : fmtNum(value)}
        </span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <span className="text-[9px]" style={{ color: '#2a2a2a' }}>target</span>
      <input
        ref={inputRef}
        type="number"
        min={0}
        step={isPercent ? 0.1 : 1}
        value={local}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        autoFocus
        style={{
          width: 72, padding: '2px 5px', fontSize: 10,
          background: '#0d0d0d', border: `1px solid ${saving ? '#fbbf24' : saved ? '#39ff88' : '#c9a96e'}`,
          color: '#f2ede4', fontFamily: 'DM Sans, sans-serif', outline: 'none',
        }}
      />
      {isPercent && <span className="text-[9px]" style={{ color: '#333' }}>%</span>}
      {saving && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', display: 'block' }} />}
      {saved  && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#39ff88', display: 'block' }} />}
    </div>
  )
}

// ── GoalCard with editing ──────────────────────────────────────────────────

function GoalCard({
  goal,
  actual,
  unit,
  daysElapsed,
  daysInMonth,
  onTargetUpdate,
}: {
  goal: GoalRow
  actual: number
  unit: string
  daysElapsed: number
  daysInMonth: number
  onTargetUpdate: (id: string, val: number) => void
}) {
  const [target, setTarget] = useState(goal.target)
  const status   = paceStatus(actual, target, daysElapsed, daysInMonth)
  const pct      = progressPct(actual, target)
  const barColor = STATUS_CFG[status].color

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '22px 20px 18px', position: 'relative', overflow: 'hidden' }}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-[8px] font-medium tracking-[.2em] uppercase" style={{ color: '#333' }}>
          {goal.metric}
        </p>
        <span
          style={{
            fontSize: 7, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase',
            padding: '2px 8px', color: STATUS_CFG[status].color,
            background: STATUS_CFG[status].bg, border: `1px solid ${STATUS_CFG[status].border}`,
          }}
        >
          {STATUS_CFG[status].label}
        </span>
      </div>

      <p className="font-jakarta font-light" style={{ fontSize: 'clamp(22px,2.8vw,38px)', lineHeight: 1, color: barColor }}>
        {unit === '%' ? actual.toFixed(1) + '%' : fmtNum(actual)}
      </p>

      <EditableTarget
        goalId={goal.id}
        value={target}
        isPercent={unit === '%'}
        onSave={val => { setTarget(val); onTargetUpdate(goal.id, val) }}
      />

      <div style={{ marginTop: 12, height: 2, background: '#141414', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 1, background: barColor, opacity: 0.8 }} />
      </div>
      <p className="text-[9px] mt-1" style={{ color: '#2a2a2a' }}>{pct}% of monthly target</p>
    </div>
  )
}

// ── WeeklyGoalCard with editing ────────────────────────────────────────────

function WeeklyGoalCard({
  goal,
  onTargetUpdate,
}: {
  goal: GoalRow
  onTargetUpdate: (id: string, val: number) => void
}) {
  const [target, setTarget] = useState(goal.target)
  const isPercent = goal.metric === 'Avg ER%'

  return (
    <div className="flex-1 flex flex-col items-center py-4 px-3" style={{ background: '#0a0a0a' }}>
      <p className="text-[7px] font-medium tracking-[.18em] uppercase mb-2 text-center" style={{ color: '#2a2a2a' }}>
        {goal.metric}
      </p>
      <p className="font-jakarta font-light" style={{ fontSize: 22, lineHeight: 1, color: '#c9a96e' }}>
        {isPercent ? target.toFixed(1) + '%' : fmtNum(target)}
      </p>
      <p className="text-[8px] mt-1 mb-2" style={{ color: '#252525' }}>per week</p>
      <EditableTarget
        goalId={goal.id}
        value={target}
        isPercent={isPercent}
        onSave={val => { setTarget(val); onTargetUpdate(goal.id, val) }}
      />
    </div>
  )
}

// ── Main exported component ────────────────────────────────────────────────

export function GoalsEditableCards({
  monthlyGoals,
  weeklyGoals,
  currentData,
  daysElapsed,
  daysInMonth,
}: {
  monthlyGoals: GoalRow[]
  weeklyGoals: GoalRow[]
  currentData: CurrentData
  daysElapsed: number
  daysInMonth: number
}) {
  const [goals, setGoals] = useState([...monthlyGoals, ...weeklyGoals])

  function handleTargetUpdate(id: string, val: number) {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, target: val } : g))
  }

  const metricToActual: Record<string, { actual: number; unit: string }> = {
    'Posts':            { actual: currentData.posts,     unit: '' },
    'Total Views':      { actual: currentData.views,     unit: 'views' },
    'Followers Gained': { actual: currentData.followers, unit: 'followers' },
    'Avg ER%':          { actual: currentData.er,        unit: '%' },
  }

  const monthly = goals.filter(g => g.period === 'monthly')
  const weekly  = goals.filter(g => g.period === 'weekly')

  return (
    <>
      {/* Monthly goal cards */}
      <div className="grid gap-px mb-10" style={{ gridTemplateColumns: 'repeat(4,1fr)', background: '#141414' }}>
        {monthly.map(goal => {
          const m = metricToActual[goal.metric]
          if (!m) return null
          return (
            <GoalCard
              key={goal.id}
              goal={goal}
              actual={m.actual}
              unit={m.unit}
              daysElapsed={daysElapsed}
              daysInMonth={daysInMonth}
              onTargetUpdate={handleTargetUpdate}
            />
          )
        })}
      </div>

      {/* Weekly goals */}
      {weekly.length > 0 && (
        <>
          <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
            <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
            Weekly Targets
          </p>
          <div className="flex gap-px mb-10" style={{ background: '#141414' }}>
            {weekly.map(goal => (
              <WeeklyGoalCard key={goal.id} goal={goal} onTargetUpdate={handleTargetUpdate} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
