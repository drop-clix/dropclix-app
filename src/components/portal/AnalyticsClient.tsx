'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import type { PostRow, WindowData } from '@/app/(dashboard)/analytics/page'
import { updateAnalyticsMetric } from '@/app/(dashboard)/edit-actions'
import { usePortalFilters, filterByPlatform, filterByScope } from '@/hooks/usePortalFilters'
import { Paginator } from '@/components/portal/Paginator'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function pct(n: number): string {
  return n > 0 ? n.toFixed(1) + '%' : '—'
}

function calcER(w: WindowData): number {
  if (!w.views) return 0
  return ((w.likes + w.comments + w.shares + w.saves) / w.views) * 100
}

type Tier = 'elite' | 'strong' | 'avg' | 'kill' | 'none'

function tier(er: number, hasData: boolean): Tier {
  if (!hasData) return 'none'
  if (er >= 12) return 'elite'
  if (er >= 7)  return 'strong'
  if (er >= 4)  return 'avg'
  return 'kill'
}

const TIER_STYLES: Record<Tier, { color: string; bg: string; border: string; label: string }> = {
  elite:  { color: '#39ff88', bg: 'rgba(57,255,136,.1)',  border: 'rgba(57,255,136,.25)',  label: 'Elite'  },
  strong: { color: '#4cc9ff', bg: 'rgba(76,201,255,.1)',  border: 'rgba(76,201,255,.25)',  label: 'Strong' },
  avg:    { color: '#fbbf24', bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.25)',  label: 'Avg'    },
  kill:   { color: '#ff3b5f', bg: 'rgba(255,59,95,.1)',   border: 'rgba(255,59,95,.25)',   label: 'Kill'   },
  none:   { color: '#333',    bg: 'rgba(255,255,255,.03)',border: '#1c1c1c',                label: '—'      },
}

const DECISION_STYLES: Record<string, { color: string }> = {
  'Double Down': { color: '#c9a96e' },
  'Iterate':     { color: '#fbbf24' },
  'Kill':        { color: '#ff3b5f' },
}

const PLATFORM_LABELS: Record<string, string> = { ig: 'IG', tt: 'TT', yt: 'YT' }
const PILLARS = ['All','Sales Tips','Self Development','Service/Love','Volume/50-150','Time Management','Other']

type SortKey = 'date' | 'views' | 'likes' | 'comments' | 'saves' | 'shares' | 'er' | 'watch_pct'
type SortDir = 'asc' | 'desc'
type WindowKey = 'w24' | 'w3' | 'w7' | 'eom'

const WINDOW_LABELS: Record<WindowKey, string> = { w24: '24 Hr', w3: '3 Day', w7: '7 Day', eom: 'EOM' }

// ── Editable metric cell ───────────────────────────────────────────────────

type EditableField = 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'watch_pct'

function EditableCell({
  value,
  displayValue,
  color,
  postUUID,
  platform,
  metricWindow,
  field,
  isPercent,
  onSave,
}: {
  value: number
  displayValue: string
  color: string
  postUUID: string
  platform: string
  metricWindow: string
  field: EditableField
  isPercent: boolean
  onSave: (field: EditableField, val: number, decision?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(String(isPercent ? value.toFixed(2) : Math.round(value)))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleBlur() {
    const n = parseFloat(local)
    if (isNaN(n) || n < 0) { setLocal(String(isPercent ? value.toFixed(2) : Math.round(value))); setEditing(false); return }
    setSaving(true)
    const result = await updateAnalyticsMetric(postUUID, platform, metricWindow, field, n)
    setSaving(false)
    if (!result.error) onSave(field, n, result.decision)
    setEditing(false)
  }

  if (editing) {
    return (
      <td className="px-5 py-3">
        <input
          ref={inputRef}
          type="number"
          min={0}
          step={isPercent ? 0.01 : 1}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === 'Enter') inputRef.current?.blur(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            width: 80, padding: '3px 6px', fontSize: 11, textAlign: 'right',
            background: '#0d0d0d', border: '1px solid #c9a96e',
            color: '#f2ede4', fontFamily: 'DM Sans, sans-serif', outline: 'none',
            opacity: saving ? 0.6 : 1,
          }}
          autoFocus
        />
      </td>
    )
  }

  return (
    <td
      className="px-5 py-4 text-[12px] font-light text-right"
      style={{ color, cursor: 'text' }}
      onClick={() => { setEditing(true); setLocal(String(isPercent ? value.toFixed(2) : Math.round(value))) }}
      title="Click to edit"
    >
      {displayValue}
    </td>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[9px] font-medium tracking-[.16em] uppercase px-4 py-2.5 transition-colors"
      style={{
        color:      active ? '#c9a96e' : '#333',
        background: active ? 'rgba(201,169,110,.07)' : 'transparent',
        border:     `1px solid ${active ? 'rgba(201,169,110,.4)' : '#1a1a1a'}`,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      className="flex flex-col justify-between relative overflow-hidden"
      style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '28px 24px 22px' }}
    >
      <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#333' }}>{label}</p>
      <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(26px,3vw,42px)', lineHeight: 1 }}>{value}</p>
      <p className="text-[10px] font-light mt-2" style={{ color: '#2a2a2a' }}>{sub}</p>
    </div>
  )
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <span style={{ color: '#252525', marginLeft: 4, fontSize: 9 }}>↕</span>
  return <span style={{ color: '#c9a96e', marginLeft: 4, fontSize: 9 }}>{dir === 'desc' ? '↓' : '↑'}</span>
}

// ── Analytics chart helpers ────────────────────────────────────────────────

const CHART_GRID  = 'rgba(255,255,255,.04)'
const CHART_TICK  = '#333'

function tierColor(er: number): string {
  return er >= 12 ? '#39ff88' : er >= 7 ? '#4cc9ff' : er >= 4 ? '#fbbf24' : '#ff3b5f'
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: readonly any[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', padding: '8px 12px', fontSize: 10, fontFamily: 'DM Sans, sans-serif' }}>
      {label != null && <p style={{ color: '#444', marginBottom: 4 }}>{String(label)}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? '#c9a96e' }}>{p.name}: {p.value?.toLocaleString?.() ?? p.value}</p>
      ))}
    </div>
  )
}

type ReachViewMode = 'top10' | 'last10' | 'all'

function ReachByPostChart({ rows, win }: { rows: PostRow[]; win: WindowKey }) {
  const [mode, setMode] = useState<ReachViewMode>('top10')

  const chartData = useMemo(() => {
    let sorted = rows.slice().sort((a, b) => b[win].views - a[win].views)
    if (mode === 'top10')  sorted = sorted.slice(0, 10)
    if (mode === 'last10') sorted = sorted.slice().sort((a, b) => a[win].views - b[win].views).slice(0, 10)
    return sorted.map(r => ({
      name:  r.postId,
      views: r[win].views,
      er:    calcER(r[win]),
    }))
  }, [rows, win, mode])

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '20px 20px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#333' }}>
          Reach by Post
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['top10', 'last10', 'all'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase',
                padding: '3px 8px', cursor: 'pointer',
                color:      mode === m ? '#c9a96e' : '#333',
                background: mode === m ? 'rgba(201,169,110,.08)' : 'transparent',
                border:     `1px solid ${mode === m ? 'rgba(201,169,110,.35)' : '#1e1e1e'}`,
              }}
            >
              {m === 'top10' ? 'Top 10' : m === 'last10' ? 'Last 10' : 'All'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 24, left: -12 }}>
            <CartesianGrid vertical={false} stroke={CHART_GRID} />
            <XAxis
              dataKey="name"
              tick={{ fill: CHART_TICK, fontSize: 8 }}
              tickLine={false}
              axisLine={false}
              angle={-45}
              textAnchor="end"
              interval={0}
              height={40}
            />
            <YAxis tick={{ fill: CHART_TICK, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtViews} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="views" name="Views" radius={[2, 2, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={tierColor(d.er)} fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function EROverTimeChart({ rows, win }: { rows: PostRow[]; win: WindowKey }) {
  const chartData = useMemo(() =>
    rows
      .filter(r => r.date)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(r => ({
        name: r.date.slice(5),   // "MM-DD"
        er:   +calcER(r[win]).toFixed(1),
        color: tierColor(calcER(r[win])),
      })),
    [rows, win]
  )

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '20px 20px 16px' }}>
      <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#333', marginBottom: 14 }}>
        ER% Over Time
      </p>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={CHART_GRID} />
            <XAxis
              dataKey="name"
              tick={{ fill: CHART_TICK, fontSize: 8 }}
              tickLine={false}
              axisLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
            />
            <YAxis
              tick={{ fill: CHART_TICK, fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => v + '%'}
              domain={[0, 'dataMax + 2']}
            />
            <Tooltip content={(props: any) => <ChartTooltip active={props.active} payload={props.payload} label={props.label} />} />
            <Line
              type="monotone"
              dataKey="er"
              name="ER%"
              stroke="#c9a96e"
              strokeWidth={1.5}
              dot={(props: any) => {
                const { cx, cy, payload } = props
                return <circle key={payload.name} cx={cx} cy={cy} r={3} fill={payload.color} stroke="none" />
              }}
              activeDot={{ r: 5, fill: '#c9a96e' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export function AnalyticsClient({ posts: initialPosts }: { posts: PostRow[] }) {
  const [posts, setPosts] = useState<PostRow[]>(initialPosts)
  const [pillar,  setPillar ] = useState<string>('All')
  const [sortKey, setSortKey] = useState<SortKey>('views')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page,    setPage   ] = useState(1)

  const { platform, win, scope, from, to } = usePortalFilters()

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [platform, win, scope, from, to, pillar])

  function handleMetricSave(postUUID: string, field: EditableField, value: number, decision?: string) {
    setPosts(prev => prev.map(p => {
      if (p.uuid !== postUUID) return p
      const winData = { ...p[win as WindowKey], [field]: value } as WindowData
      const updated = { ...p, [win as WindowKey]: winData }
      if (decision !== undefined) updated.decision = decision
      return updated
    }))
  }

  const rows = useMemo(() => {
    let filtered = filterByPlatform(posts, platform, p => p.format)
    filtered = filterByScope(filtered, scope, from, to)
    if (pillar !== 'All') filtered = filtered.filter(p => p.pillar === pillar)
    const wk = win as WindowKey
    return filtered.slice().sort((a, b) => {
      const wa = a[wk]; const wb = b[wk]
      let av = 0, bv = 0
      if (sortKey === 'date')          { av = new Date(a.date).getTime(); bv = new Date(b.date).getTime() }
      else if (sortKey === 'er')       { av = calcER(wa); bv = calcER(wb) }
      else if (sortKey === 'views')    { av = wa.views;    bv = wb.views }
      else if (sortKey === 'likes')    { av = wa.likes;    bv = wb.likes }
      else if (sortKey === 'comments') { av = wa.comments; bv = wb.comments }
      else if (sortKey === 'saves')    { av = wa.saves;    bv = wb.saves }
      else if (sortKey === 'shares')   { av = wa.shares;   bv = wb.shares }
      else if (sortKey === 'watch_pct'){ av = wa.watch_pct; bv = wb.watch_pct }
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [posts, platform, pillar, win, scope, from, to, sortKey, sortDir])

  const activeWin = win as WindowKey

  const kpis = useMemo(() => {
    const total = rows.length
    const totalViews = rows.reduce((s, r) => s + r[activeWin].views, 0)
    const withViews  = rows.filter(r => r[activeWin].views > 0)
    const avgER      = withViews.length ? withViews.reduce((s, r) => s + calcER(r[activeWin]), 0) / withViews.length : 0
    const avgWatch   = withViews.length ? withViews.reduce((s, r) => s + r[activeWin].watch_pct, 0) / withViews.length : 0
    const eliteCount = withViews.filter(r => calcER(r[activeWin]) >= 12).length
    return { total, totalViews, avgER, avgWatch, eliteCount }
  }, [rows, activeWin])

  const pagedRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const TH = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      onClick={() => handleSort(col)}
      className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase select-none"
      style={{ color: sortKey === col ? '#c9a96e' : '#2a2a2a', cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {label}<SortIcon col={col} sortKey={sortKey} dir={sortDir} />
    </th>
  )

  return (
    <div>
      {/* ── KPI strip ───────────────────────────────────────────── */}
      <div className="grid gap-px mb-8" style={{ gridTemplateColumns: 'repeat(4, 1fr)', background: '#141414' }}>
        <KpiCard label="Posts in View"    value={kpis.total.toString()}                               sub={`${platform === 'all' ? 'All platforms' : platform.toUpperCase()} · ${WINDOW_LABELS[activeWin]}`} />
        <KpiCard label="Total Views"      value={kpis.totalViews > 0 ? fmt(kpis.totalViews) : '—'}   sub="Sum for selected window" />
        <KpiCard label="Avg Engagement"   value={kpis.avgER > 0 ? kpis.avgER.toFixed(1) + '%' : '—'} sub="(Likes + cmts + shares + saves) / views" />
        <KpiCard label="Avg Watch %"      value={kpis.avgWatch > 0 ? kpis.avgWatch.toFixed(1) + '%' : '—'} sub={`${kpis.eliteCount} elite posts (ER ≥12%)`} />
      </div>

      {/* ── Charts ──────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="grid gap-px mb-8" style={{ gridTemplateColumns: '1fr 1fr', background: '#141414' }}>
          <ReachByPostChart rows={rows} win={activeWin} />
          <EROverTimeChart rows={rows} win={activeWin} />
        </div>
      )}

      {/* ── Pillar filter ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-8">
        <span className="text-[8px] tracking-[.18em] uppercase self-center mr-1" style={{ color: '#252525' }}>Pillar</span>
        {PILLARS.map(p => (
          <button
            key={p}
            onClick={() => setPillar(p)}
            className="text-[8px] font-medium tracking-[.12em] uppercase px-3 py-2 transition-colors"
            style={{
              color:      pillar === p ? '#c9a96e' : '#333',
              background: pillar === p ? 'rgba(201,169,110,.08)' : 'transparent',
              border:     `1px solid ${pillar === p ? 'rgba(201,169,110,.35)' : '#1a1a1a'}`,
              cursor: 'pointer',
            }}
          >
            {p}
          </button>
        ))}
        <span className="ml-auto text-[9px] tracking-[.14em] uppercase self-center" style={{ color: '#252525' }}>
          {rows.length} posts
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      <div style={{ border: '1px solid #141414', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
              <th className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase" style={{ color: '#2a2a2a', whiteSpace: 'nowrap' }}>ID</th>
              <th className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase" style={{ color: '#2a2a2a', minWidth: 180 }}>Title</th>
              <TH label="Date"    col="date"      />
              <th className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase" style={{ color: '#2a2a2a', whiteSpace: 'nowrap' }}>Pillar</th>
              <TH label="Views"   col="views"     />
              <TH label="Likes"   col="likes"     />
              <TH label="Cmts"    col="comments"  />
              <TH label="Saves"   col="saves"     />
              <TH label="Shares"  col="shares"    />
              <TH label="ER %"    col="er"        />
              <TH label="Watch %" col="watch_pct" />
              <th className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase" style={{ color: '#2a2a2a', whiteSpace: 'nowrap' }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-16 text-[11px]" style={{ color: '#2a2a2a' }}>
                  No posts found for this filter.
                </td>
              </tr>
            ) : (
              pagedRows.map((post, i) => {
                const w       = post[activeWin]
                const er      = calcER(w)
                const t       = tier(er, w.views > 0)
                const ts      = TIER_STYLES[t]
                const ds      = DECISION_STYLES[post.decision] ?? { color: '#444' }
                const hasData = w.views > 0

                return (
                  <tr
                    key={post.postId}
                    style={{
                      background:   i % 2 === 0 ? '#060606' : '#070707',
                      borderBottom: '1px solid #0e0e0e',
                      transition:   'background .15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#060606' : '#070707')}
                  >
                    {/* ID */}
                    <td className="px-5 py-4">
                      <span className="text-[10px] font-medium tracking-[.08em]" style={{ fontFamily: 'monospace', color: '#c9a96e' }}>
                        {post.postId}
                      </span>
                    </td>

                    {/* Title */}
                    <td className="px-5 py-4" style={{ maxWidth: 200 }}>
                      <span
                        className="text-[12px] font-light block overflow-hidden"
                        style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 200 }}
                        title={post.title}
                      >
                        {post.title}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4 text-[11px] font-light" style={{ color: '#444', whiteSpace: 'nowrap' }}>
                      {post.date || '—'}
                    </td>

                    {/* Pillar */}
                    <td className="px-5 py-4">
                      <span
                        className="text-[8px] font-medium tracking-[.1em] uppercase px-2 py-1"
                        style={{ color: '#555', background: '#0d0d0d', border: '1px solid #1a1a1a', whiteSpace: 'nowrap' }}
                      >
                        {post.pillar}
                      </span>
                    </td>

                    {/* Editable metric cells */}
                    <EditableCell
                      value={w.views} displayValue={hasData ? fmt(w.views) : '—'} color={hasData ? '#f2ede4' : '#252525'}
                      postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="views" isPercent={false}
                      onSave={(f, v, d) => handleMetricSave(post.uuid, f, v, d)}
                    />
                    <EditableCell
                      value={w.likes} displayValue={hasData ? fmt(w.likes) : '—'} color={hasData ? '#aaa' : '#252525'}
                      postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="likes" isPercent={false}
                      onSave={(f, v, d) => handleMetricSave(post.uuid, f, v, d)}
                    />
                    <EditableCell
                      value={w.comments} displayValue={hasData ? fmt(w.comments) : '—'} color={hasData ? '#aaa' : '#252525'}
                      postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="comments" isPercent={false}
                      onSave={(f, v, d) => handleMetricSave(post.uuid, f, v, d)}
                    />
                    <EditableCell
                      value={w.saves} displayValue={hasData ? fmt(w.saves) : '—'} color={hasData ? '#aaa' : '#252525'}
                      postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="saves" isPercent={false}
                      onSave={(f, v, d) => handleMetricSave(post.uuid, f, v, d)}
                    />
                    <EditableCell
                      value={w.shares} displayValue={hasData ? fmt(w.shares) : '—'} color={hasData ? '#aaa' : '#252525'}
                      postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="shares" isPercent={false}
                      onSave={(f, v, d) => handleMetricSave(post.uuid, f, v, d)}
                    />

                    {/* ER % + tier (computed, not directly editable) */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-[12px] font-light" style={{ color: hasData ? ts.color : '#252525' }}>
                          {hasData ? er.toFixed(1) + '%' : '—'}
                        </span>
                        {hasData && (
                          <span
                            className="text-[7px] font-medium tracking-[.1em] uppercase px-1.5 py-0.5"
                            style={{ color: ts.color, background: ts.bg, border: `1px solid ${ts.border}` }}
                          >
                            {ts.label}
                          </span>
                        )}
                      </div>
                    </td>

                    <EditableCell
                      value={w.watch_pct} displayValue={hasData ? pct(w.watch_pct) : '—'} color={hasData ? '#aaa' : '#252525'}
                      postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="watch_pct" isPercent={true}
                      onSave={(f, v, d) => handleMetricSave(post.uuid, f, v, d)}
                    />

                    {/* Decision */}
                    <td className="px-5 py-4">
                      <span className="text-[9px] font-medium tracking-[.1em] uppercase" style={{ color: ds.color }}>
                        {post.decision || '—'}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Paginator page={page} total={rows.length} perPage={PAGE_SIZE} onChange={setPage} />

      <p className="mt-3 text-[9px]" style={{ color: '#1e1e1e' }}>
        Click any metric cell to edit · ER = (likes + comments + shares + saves) / views
      </p>

      {/* Tier legend */}
      <div className="flex gap-4 mt-2 flex-wrap">
        {(['elite','strong','avg','kill'] as Tier[]).map(t => {
          const s = TIER_STYLES[t]
          return (
            <div key={t} className="flex items-center gap-1.5">
              <span style={{ width: 6, height: 6, borderRadius: 1, background: s.color, display: 'block', opacity: .8 }} />
              <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#333' }}>
                {s.label} {t === 'elite' ? '≥12%' : t === 'strong' ? '7-12%' : t === 'avg' ? '4-7%' : '<4%'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
