'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useInterpolatedStat } from '@/hooks/useInterpolatedStat'
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import type { PostRow, WindowData } from '@/app/(dashboard)/analytics/page'
import { updateAnalyticsMetric } from '@/app/(dashboard)/edit-actions'
import { usePortalFilters, filterByPlatform, filterByScope } from '@/hooks/usePortalFilters'
import { Paginator } from '@/components/portal/Paginator'
import { EmptyState } from '@/components/portal/EmptyState'
import { PostSlideOver } from '@/components/portal/PostSlideOver'
import { useToast } from '@/components/portal/Toast'
import { usePillarColors } from '@/hooks/usePillarColors'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function pct(n: number): string {
  return n > 0 ? n.toFixed(1) + '%' : '—'
}

function calcER(w: WindowData, platform?: string[]): number {
  if (!w.views) return 0
  const fourthMetric = platform?.includes('yt') ? w.followers : w.saves
  return ((w.likes + w.comments + w.shares + fourthMetric) / w.views) * 100
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
  none:   { color: '#555',    bg: 'rgba(255,255,255,.03)',border: '#1c1c1c',                label: '—'      },
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

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: 'w24', label: '24HR' },
  { key: 'w3',  label: '3DAY' },
  { key: 'w7',  label: '7DAY' },
  { key: 'eom', label: 'EOM'  },
]

// ── Editable metric cell ───────────────────────────────────────────────────

type EditableField = 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'watch_pct'

// ── Per-row component so useInterpolatedStat can be called as a hook ───────

function AnalyticsTableRow({
  post,
  index,
  activeWin,
  pillarColors,
  onOpen,
  onSave,
}: {
  post: PostRow
  index: number
  activeWin: WindowKey
  pillarColors: Map<string, string>
  onOpen: (post: PostRow) => void
  onSave: (uuid: string, field: EditableField, val: number, decision?: string) => void
}) {
  const w           = post[activeWin]
  const er          = calcER(w, post.platform)
  const t           = tier(er, w.views > 0)
  const ts          = TIER_STYLES[t]
  const ds          = DECISION_STYLES[post.decision] ?? { color: '#666' }
  const hasData     = w.views > 0
  const pillarColor = pillarColors.get(post.pillar ?? '') ?? '#1a1a1a'

  // Interpolate view count for recently polled videos (within 7 days)
  const liveViews = useInterpolatedStat(
    w.views,
    w.prevViews ?? null,
    w.lastPolledAt ?? w.recordedAt,
    w.prevRecordedAt,
    7,
  )

  return (
    <tr
      style={{
        background:   index % 2 === 0 ? '#060606' : '#070707',
        borderBottom: '1px solid #0e0e0e',
        transition:   'background .15s',
        cursor: 'pointer',
      }}
      onClick={() => onOpen(post)}
      onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
      onMouseLeave={e => (e.currentTarget.style.background = index % 2 === 0 ? '#060606' : '#070707')}
    >
      <td style={{ width: 3, padding: 0, background: `${pillarColor}cc` }} />
      <td className="px-5 py-4">
        <span className="text-[10px] font-medium tracking-[.08em]" style={{ fontFamily: 'monospace', color: '#c9a96e' }}>
          {post.postId}
        </span>
      </td>
      <td className="px-5 py-4" style={{ maxWidth: 200 }}>
        <span
          className="text-[12px] font-light block overflow-hidden"
          style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 200 }}
          title={post.title}
        >
          {post.title}
        </span>
      </td>
      <td className="px-5 py-4 text-[11px] font-light" style={{ color: '#666', whiteSpace: 'nowrap' }}>
        {post.date || '—'}
      </td>
      <td className="px-5 py-4">
        <span
          className="text-[8px] font-medium tracking-[.1em] uppercase px-2 py-1"
          style={{ color: '#555', background: '#0d0d0d', border: '1px solid #1a1a1a', whiteSpace: 'nowrap' }}
        >
          {post.pillar}
        </span>
      </td>
      {/* Views — interpolated for recently polled videos */}
      <EditableCell
        value={w.views} displayValue={hasData ? fmt(liveViews) : '—'} color={hasData ? '#f2ede4' : '#3a3a3a'}
        postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="views" isPercent={false}
        onSave={(f, v, d) => onSave(post.uuid, f, v, d)}
      />
      <EditableCell
        value={w.likes} displayValue={hasData ? fmt(w.likes) : '—'} color={hasData ? '#aaa' : '#3a3a3a'}
        postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="likes" isPercent={false}
        onSave={(f, v, d) => onSave(post.uuid, f, v, d)}
      />
      <EditableCell
        value={w.comments} displayValue={hasData ? fmt(w.comments) : '—'} color={hasData ? '#aaa' : '#3a3a3a'}
        postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="comments" isPercent={false}
        onSave={(f, v, d) => onSave(post.uuid, f, v, d)}
      />
      <EditableCell
        value={w.saves} displayValue={hasData ? fmt(w.saves) : '—'} color={hasData ? '#aaa' : '#3a3a3a'}
        postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="saves" isPercent={false}
        onSave={(f, v, d) => onSave(post.uuid, f, v, d)}
      />
      <EditableCell
        value={w.shares} displayValue={hasData ? fmt(w.shares) : '—'} color={hasData ? '#aaa' : '#3a3a3a'}
        postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="shares" isPercent={false}
        onSave={(f, v, d) => onSave(post.uuid, f, v, d)}
      />
      <td className="px-5 py-4">
        <div className="flex items-center gap-2 justify-end">
          <span className="text-[12px] font-light" style={{ color: hasData ? ts.color : '#3a3a3a' }}>
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
        value={w.watch_pct} displayValue={hasData ? pct(w.watch_pct) : '—'} color={hasData ? '#aaa' : '#3a3a3a'}
        postUUID={post.uuid} platform={post.platform[0] ?? 'ig'} metricWindow={activeWin} field="watch_pct" isPercent={true}
        onSave={(f, v, d) => onSave(post.uuid, f, v, d)}
      />
      <td className="px-5 py-4">
        <span className="text-[9px] font-medium tracking-[.1em] uppercase" style={{ color: ds.color }}>
          {post.decision || '—'}
        </span>
      </td>
    </tr>
  )
}

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
      onClick={e => { e.stopPropagation(); setEditing(true); setLocal(String(isPercent ? value.toFixed(2) : Math.round(value))) }}
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
        color:      active ? '#c9a96e' : '#666',
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
      <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>{label}</p>
      <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(26px,3vw,42px)', lineHeight: 1 }}>{value}</p>
      <p className="text-[10px] font-light mt-2" style={{ color: '#555' }}>{sub}</p>
    </div>
  )
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <span style={{ color: '#666', marginLeft: 4, fontSize: 9 }}>↕</span>
  return <span style={{ color: '#c9a96e', marginLeft: 4, fontSize: 9 }}>{dir === 'desc' ? '↓' : '↑'}</span>
}

// ── Analytics chart helpers ────────────────────────────────────────────────

const CHART_GRID  = 'rgba(255,255,255,.04)'
const CHART_TICK  = '#555'

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
      {label != null && <p style={{ color: '#666', marginBottom: 4 }}>{String(label)}</p>}
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
      er:    calcER(r[win], r.platform),
    }))
  }, [rows, win, mode])

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '20px 20px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555' }}>
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
                color:      mode === m ? '#c9a96e' : '#555',
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
        er:   +calcER(r[win], r.platform).toFixed(1),
        color: tierColor(calcER(r[win], r.platform)),
      })),
    [rows, win]
  )

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '20px 20px 16px' }}>
      <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555', marginBottom: 14 }}>
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

function chartGlow(platform: string): string {
  if (platform === 'yt' || platform === 'lf') return '#4cc9ff'
  if (platform === 'tt') return '#2dd4bf'
  return '#c9a96e'
}

function ChartCard({
  title,
  children,
  platform,
}: {
  title: string
  children: React.ReactNode
  platform: string
}) {
  const glow = chartGlow(platform)
  const [full, setFull] = useState(false)
  return (
    <div
      style={{
        position: full ? 'fixed' : 'relative',
        inset: full ? 32 : 'auto',
        zIndex: full ? 800 : 1,
        background: '#0a0a0a',
        border: '1px solid #171717',
        borderRadius: 6,
        padding: 20,
        boxShadow: `0 0 56px ${glow}1f, 0 18px 50px rgba(0,0,0,.35)`,
        transition: 'transform .15s ease, border-color .15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#242424' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#171717' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-[8px] font-medium tracking-[.18em] uppercase" style={{ color: '#c9a96e' }}>{title}</p>
          <span title="Hover for exact values. Click post points to open the snapshot." style={{ width: 16, height: 16, border: '1px solid #252525', color: '#555', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>i</span>
        </div>
        <button
          type="button"
          aria-label="Expand chart"
          onClick={() => setFull(v => !v)}
          style={{ width: 28, height: 28, border: '1px solid #1f1f1f', borderRadius: 4, background: '#0d0d0d', color: '#c9a96e', cursor: 'pointer', transition: 'all .15s ease' }}
        >
          {full ? 'x' : '[]'}
        </button>
      </div>
      <div style={{ height: full ? 'calc(100vh - 150px)' : 260 }}>{children}</div>
    </div>
  )
}

function PostSnapshot({
  post,
  win,
  onClose,
}: {
  post: PostRow
  win: WindowKey
  onClose: () => void
}) {
  const metric = post[win]
  const er = calcER(metric, post.platform)
  const g = er >= 12 ? 'A' : er >= 7 ? 'B' : er >= 4 ? 'C' : er >= 2 ? 'D' : 'F'
  const color = er >= 12 ? '#39ff88' : er >= 7 ? '#4cc9ff' : er >= 4 ? '#fbbf24' : '#ff3b5f'
  const stats = [
    metric.watch_pct >= 35 ? 'High watch rate' : '',
    metric.shares >= 20 ? 'Above avg shares' : '',
    er >= 12 ? 'Elite ER' : '',
    metric.followers > 0 ? 'Follower gain' : '',
  ].filter(Boolean).slice(0, 3)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={e => { if (e.currentTarget === e.target) onClose() }}>
      <div style={{ width: 420, maxWidth: '100%', background: '#0a0a0a', border: '1px solid #242424', borderRadius: 8, boxShadow: '0 24px 80px rgba(0,0,0,.7)' }}>
        <div style={{ padding: 22, borderBottom: '1px solid #171717' }}>
          <p className="text-[10px] tracking-[.18em] uppercase mb-2" style={{ color: '#c9a96e' }}>{post.postId}</p>
          <h3 className="font-jakarta font-light text-[22px]" style={{ color: '#f2ede4', lineHeight: 1.2 }}>{post.title}</h3>
        </div>
        <div style={{ padding: 22 }}>
          <div className="flex items-center gap-3 mb-5">
            <span className="font-jakarta text-[34px]" style={{ color }}>{g}</span>
            <div>
              <p className="text-[12px]" style={{ color: '#f2ede4' }}>{er.toFixed(1)}% ER</p>
              <p className="text-[10px]" style={{ color: '#555' }}>{fmt(metric.views)} reach - {post.decision || 'No decision'}</p>
            </div>
          </div>
          <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {[
              ['Views', fmt(metric.views)],
              ['Watch', pct(metric.watch_pct)],
              ['Followers', fmt(metric.followers)],
            ].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid #171717', borderRadius: 5, padding: 12 }}>
                <p className="text-[8px] tracking-[.16em] uppercase mb-2" style={{ color: '#555' }}>{label}</p>
                <p className="text-[16px]" style={{ color: '#f2ede4' }}>{value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(stats.length ? stats : ['Needs stronger hook']).map(stat => (
              <span key={stat} className="text-[9px] px-2 py-1" style={{ color: '#c9a96e', background: 'rgba(201,169,110,.08)', border: '1px solid rgba(201,169,110,.25)', borderRadius: 4 }}>{stat}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

type ChartPostPoint = {
  name: string
  post: PostRow
  views: number
  er: number
  date: string
  color: string
}

function AdvancedAnalyticsCharts({
  rows,
  win,
  platform,
  onOpen,
}: {
  rows: PostRow[]
  win: WindowKey
  platform: string
  onOpen: (post: PostRow) => void
}) {
  const [reachMode, setReachMode] = useState<'top' | 'last' | 'all'>('top')
  const postPoints = useMemo<ChartPostPoint[]>(() => {
    let source = rows.slice()
    if (reachMode === 'top') source = source.sort((a, b) => b[win].views - a[win].views).slice(0, 10)
    if (reachMode === 'last') source = source.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).reverse()
    return source.map(post => {
      const er = calcER(post[win], post.platform)
      return { name: post.postId, post, views: post[win].views, er: +er.toFixed(1), date: post.date.slice(5), color: tierColor(er) }
    })
  }, [rows, win, reachMode])

  const erPoints = useMemo(() => rows.slice().sort((a, b) => a.date.localeCompare(b.date)).map(post => {
    const er = calcER(post[win], post.platform)
    return { name: post.date.slice(5), post, er: +er.toFixed(1), color: tierColor(er) }
  }), [rows, win])

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; posts: number; reach: number; followers: number }>()
    for (const post of rows) {
      const key = post.date.slice(0, 7)
      const cur = map.get(key) ?? { month: key.slice(5), posts: 0, reach: 0, followers: 0 }
      cur.posts += 1
      cur.reach += post[win].views
      cur.followers += post[win].followers
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      ...m,
      growth: m.reach > 0 ? +((m.followers / m.reach) * 100).toFixed(2) : 0,
    }))
  }, [rows, win])

  const pillars = useMemo(() => {
    const map = new Map<string, { pillar: string; er: number; count: number }>()
    for (const post of rows) {
      const key = post.pillar || 'Other'
      const cur = map.get(key) ?? { pillar: key, er: 0, count: 0 }
      cur.er += calcER(post[win], post.platform)
      cur.count += 1
      map.set(key, cur)
    }
    return [...map.values()].map(p => ({ ...p, avgER: +(p.er / p.count).toFixed(1) })).sort((a, b) => b.avgER - a.avgER)
  }, [rows, win])

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="grid gap-6 analytics-chart-row" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <ChartCard title="Monthly Views / Reach by Post" platform={platform}>
          <div className="flex gap-1 mb-3">
            {(['top', 'last', 'all'] as const).map(mode => (
              <button key={mode} type="button" onClick={() => setReachMode(mode)} style={{ fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', padding: '4px 9px', border: `1px solid ${reachMode === mode ? 'rgba(201,169,110,.45)' : '#1f1f1f'}`, color: reachMode === mode ? '#c9a96e' : '#666', background: reachMode === mode ? 'rgba(201,169,110,.08)' : '#0d0d0d', cursor: 'pointer' }}>
                {mode === 'top' ? 'Top' : mode === 'last' ? 'Last 10' : 'All'}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={postPoints} margin={{ top: 8, right: 8, bottom: 30, left: -12 }}>
              <CartesianGrid vertical={false} stroke={CHART_GRID} />
              <XAxis dataKey="name" tick={{ fill: CHART_TICK, fontSize: 8 }} tickLine={false} axisLine={false} angle={-45} textAnchor="end" interval={0} height={42} />
              <YAxis tick={{ fill: CHART_TICK, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtViews} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="views" name="Reach" radius={[3, 3, 0, 0]} onClick={(data: any) => data?.post && onOpen(data.post)} cursor="pointer">
                {postPoints.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.78} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="ER% Over Time" platform={platform}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={erPoints} margin={{ top: 8, right: 8, bottom: 10, left: -12 }} onClick={(state: any) => state?.activePayload?.[0]?.payload?.post && onOpen(state.activePayload[0].payload.post)}>
              <CartesianGrid vertical={false} stroke={CHART_GRID} />
              <XAxis dataKey="name" tick={{ fill: CHART_TICK, fontSize: 8 }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(erPoints.length / 8) - 1)} />
              <YAxis tick={{ fill: CHART_TICK, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v + '%'} domain={[0, 'dataMax + 2']} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="er" name="ER%" stroke="#c9a96e" strokeWidth={1.6} dot={(props: any) => <circle key={props.payload.name} cx={props.cx} cy={props.cy} r={3} fill={props.payload.color} stroke="none" style={{ cursor: 'pointer' }} />} activeDot={{ r: 5, fill: '#c9a96e' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 analytics-chart-row" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <ChartCard title="Posts Volume vs Growth %" platform={platform}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ top: 8, right: 8, bottom: 10, left: -12 }}>
              <CartesianGrid vertical={false} stroke={CHART_GRID} />
              <XAxis dataKey="month" tick={{ fill: CHART_TICK, fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="posts" tick={{ fill: CHART_TICK, fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="growth" orientation="right" tick={{ fill: CHART_TICK, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v + '%'} />
              <Tooltip content={<ChartTooltip />} />
              <Bar yAxisId="posts" dataKey="posts" name="Posts" fill="#c9a96e" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
              <Line yAxisId="growth" type="monotone" dataKey="growth" name="Growth %" stroke="#39ff88" strokeWidth={1.7} dot={{ r: 3, fill: '#39ff88', strokeWidth: 0 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Avg ER% by Content Pillar" platform={platform}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={pillars} margin={{ top: 8, right: 28, bottom: 10, left: 20 }}>
              <CartesianGrid horizontal={false} stroke={CHART_GRID} />
              <XAxis type="number" tick={{ fill: CHART_TICK, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v + '%'} />
              <YAxis type="category" dataKey="pillar" width={118} tick={{ fill: '#555', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="avgER" name="Avg ER" radius={[0, 3, 3, 0]}>
                {pillars.map((p, i) => <Cell key={i} fill={tierColor(p.avgER)} fillOpacity={0.78} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export function AnalyticsClient({ posts: initialPosts }: { posts: PostRow[] }) {
  const [posts, setPosts] = useState<PostRow[]>(initialPosts)
  const [search,  setSearch ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('views')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page,    setPage   ] = useState(1)
  const [snapshotPost, setSnapshotPost] = useState<PostRow | null>(null)
  const [slidePost, setSlidePost] = useState<PostRow | null>(null)

  const { toast } = useToast()
  const { platform, win, scope, from, to, setFilters } = usePortalFilters()
  const pillarColors = usePillarColors(useMemo(() => posts.map(p => p.pillar ?? ''), [posts]))

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [platform, win, scope, from, to, search])

  function handleMetricSave(postUUID: string, field: EditableField, value: number, decision?: string) {
    setPosts(prev => prev.map(p => {
      if (p.uuid !== postUUID) return p
      const winData = { ...p[win as WindowKey], [field]: value } as WindowData
      const updated = { ...p, [win as WindowKey]: winData }
      if (decision !== undefined) updated.decision = decision
      toast(`Saved · ${p.postId} updated`)
      return updated
    }))
  }

  const rows = useMemo(() => {
    let filtered = filterByPlatform(posts, platform, p => p.format)
    filtered = filterByScope(filtered, scope, from, to)
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      filtered = filtered.filter(p => {
        const w = p[win as WindowKey]
        const er = calcER(w, p.platform).toFixed(1)
        return (
          p.postId.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.date.toLowerCase().includes(q) ||
          p.pillar.toLowerCase().includes(q) ||
          p.hook.toLowerCase().includes(q) ||
          p.format.toLowerCase().includes(q) ||
          (p.decision || '').toLowerCase().includes(q) ||
          String(w.views).includes(q) ||
          String(w.likes).includes(q) ||
          String(w.comments).includes(q) ||
          String(w.saves).includes(q) ||
          String(w.shares).includes(q) ||
          er.includes(q) ||
          String(w.watch_pct).includes(q)
        )
      })
    }
    const wk = win as WindowKey
    return filtered.slice().sort((a, b) => {
      const wa = a[wk]; const wb = b[wk]
      let av = 0, bv = 0
      if (sortKey === 'date')          { av = new Date(a.date).getTime(); bv = new Date(b.date).getTime() }
      else if (sortKey === 'er')       { av = calcER(wa, a.platform); bv = calcER(wb, b.platform) }
      else if (sortKey === 'views')    { av = wa.views;    bv = wb.views }
      else if (sortKey === 'likes')    { av = wa.likes;    bv = wb.likes }
      else if (sortKey === 'comments') { av = wa.comments; bv = wb.comments }
      else if (sortKey === 'saves')    { av = wa.saves;    bv = wb.saves }
      else if (sortKey === 'shares')   { av = wa.shares;   bv = wb.shares }
      else if (sortKey === 'watch_pct'){ av = wa.watch_pct; bv = wb.watch_pct }
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [posts, platform, search, win, scope, from, to, sortKey, sortDir])

  const activeWin = win as WindowKey

  const kpis = useMemo(() => {
    const total = rows.length
    const totalViews = rows.reduce((s, r) => s + r[activeWin].views, 0)
    const withViews  = rows.filter(r => r[activeWin].views > 0)
    const avgER      = withViews.length ? withViews.reduce((s, r) => s + calcER(r[activeWin], r.platform), 0) / withViews.length : 0
    const avgWatch   = withViews.length ? withViews.reduce((s, r) => s + r[activeWin].watch_pct, 0) / withViews.length : 0
    const eliteCount = withViews.filter(r => calcER(r[activeWin], r.platform) >= 12).length
    return { total, totalViews, avgER, avgWatch, eliteCount }
  }, [rows, activeWin])

  const pagedRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page])

  if (posts.length === 0) {
    return (
      <EmptyState
        icon="chart"
        headline="No analytics data yet."
        body="Your content manager will add your videos here — check back soon."
      />
    )
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const TH = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      onClick={() => handleSort(col)}
      className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase select-none"
      style={{ color: sortKey === col ? '#c9a96e' : '#555', cursor: 'pointer', whiteSpace: 'nowrap', background: '#060606' }}
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

      {/* ── Search bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6" style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: 2 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by ID, title, pillar, decision, views…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#f2ede4', fontSize: 12, padding: '6px 0',
            fontFamily: 'DM Sans, sans-serif',
          }}
          onFocus={e => { (e.target.closest('div') as HTMLDivElement).style.borderBottomColor = '#c9a96e' }}
          onBlur={e  => { (e.target.closest('div') as HTMLDivElement).style.borderBottomColor = '#1a1a1a' }}
        />
        {search && (
          <button
            onClick={() => { setSearch(''); setPage(1) }}
            style={{ color: '#555', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
            aria-label="Clear search"
          >×</button>
        )}
      </div>

      {/* Slide-over for row click (Feature 3) */}
      {slidePost && (
        <PostSlideOver
          post={{
            postId:   slidePost.postId,
            title:    slidePost.title,
            platform: slidePost.platform,
            date:     slidePost.date,
            pillar:   slidePost.pillar,
            hook:     slidePost.hook,
            decision: slidePost.decision,
            w24: slidePost.w24,
            w3:  slidePost.w3,
            w7:  slidePost.w7,
            eom: slidePost.eom,
          }}
          onClose={() => setSlidePost(null)}
        />
      )}

      {/* ── Table ───────────────────────────────────────────────── */}
      <div style={{ border: '1px solid #141414', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            {/* Window selector row */}
            <tr style={{ background: '#060606', borderBottom: '1px solid #111' }}>
              <th colSpan={13} style={{ padding: '8px 12px', background: '#060606' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: '#555', letterSpacing: '.12em' }}>
                    {rows.length} posts
                  </span>
                  {/* Sliding window segmented control */}
                  <div style={{ position: 'relative', display: 'flex', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 2, height: 26, overflow: 'hidden' }}>
                    <div
                      style={{
                        position: 'absolute', top: 0, left: 0, height: '100%', width: 52,
                        background: 'rgba(201,169,110,.09)',
                        borderRight: '1px solid rgba(201,169,110,.25)',
                        borderLeft: WINDOWS.findIndex(w => w.key === activeWin) > 0 ? '1px solid rgba(201,169,110,.25)' : 'none',
                        transform: `translateX(${WINDOWS.findIndex(w => w.key === activeWin) * 52}px)`,
                        transition: 'transform .15s ease',
                        pointerEvents: 'none',
                      }}
                    />
                    {WINDOWS.map((w, i) => (
                      <button
                        key={w.key}
                        onClick={() => setFilters({ win: w.key })}
                        style={{
                          width: 52, height: '100%',
                          fontSize: 8, fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase',
                          fontFamily: 'DM Sans, sans-serif',
                          color: activeWin === w.key ? '#c9a96e' : '#555',
                          background: 'transparent', border: 'none',
                          borderRight: i < WINDOWS.length - 1 ? '1px solid #131313' : 'none',
                          cursor: 'pointer', position: 'relative', zIndex: 1,
                          transition: 'color .15s',
                        }}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              </th>
            </tr>
            <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
              <th style={{ width: 3, padding: 0, background: '#060606' }} />
              <th className="text-left px-5 py-4 text-[9px] font-medium tracking-[.14em] uppercase" style={{ color: '#555', whiteSpace: 'nowrap', background: '#060606' }}>ID</th>
              <th className="text-left px-5 py-4 text-[9px] font-medium tracking-[.14em] uppercase" style={{ color: '#555', minWidth: 180, background: '#060606' }}>Title</th>
              <TH label="Date"    col="date"      />
              <th className="text-left px-5 py-4 text-[9px] font-medium tracking-[.14em] uppercase" style={{ color: '#555', whiteSpace: 'nowrap', background: '#060606' }}>Pillar</th>
              <TH label="Views"   col="views"     />
              <TH label="Likes"   col="likes"     />
              <TH label="Cmts"    col="comments"  />
              <TH label="Saves"   col="saves"     />
              <TH label="Shares"  col="shares"    />
              <TH label="ER %"    col="er"        />
              <TH label="Watch %" col="watch_pct" />
              <th className="text-left px-5 py-4 text-[9px] font-medium tracking-[.14em] uppercase" style={{ color: '#555', whiteSpace: 'nowrap', background: '#060606' }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-16 text-[11px]" style={{ color: '#666' }}>
                  No posts found for this filter.
                </td>
              </tr>
            ) : (
              pagedRows.map((post, i) => (
                <AnalyticsTableRow
                  key={post.postId}
                  post={post}
                  index={i}
                  activeWin={activeWin}
                  pillarColors={pillarColors}
                  onOpen={setSlidePost}
                  onSave={handleMetricSave}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <Paginator page={page} total={rows.length} perPage={PAGE_SIZE} onChange={setPage} />

      {rows.length > 0 && (
        <AdvancedAnalyticsCharts rows={rows} win={activeWin} platform={platform} onOpen={setSnapshotPost} />
      )}

      <p className="mt-3 text-[9px]" style={{ color: '#666' }}>
        Click any metric cell to edit · IG ER uses saves · YT ER uses subscribers gained
      </p>

      {/* Tier legend */}
      <div className="flex gap-4 mt-2 flex-wrap">
        {(['elite','strong','avg','kill'] as Tier[]).map(t => {
          const s = TIER_STYLES[t]
          return (
            <div key={t} className="flex items-center gap-1.5">
              <span style={{ width: 6, height: 6, borderRadius: 1, background: s.color, display: 'block', opacity: .8 }} />
              <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#555' }}>
                {s.label} {t === 'elite' ? '≥12%' : t === 'strong' ? '7-12%' : t === 'avg' ? '4-7%' : '<4%'}
              </span>
            </div>
          )
        })}
      </div>

      {snapshotPost && (
        <PostSnapshot post={snapshotPost} win={activeWin} onClose={() => setSnapshotPost(null)} />
      )}
    </div>
  )
}
