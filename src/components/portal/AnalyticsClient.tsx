'use client'

import { useState, useMemo, useRef } from 'react'
import type { PostRow, WindowData } from '@/app/(dashboard)/analytics/page'
import { updateAnalyticsMetric } from '@/app/(dashboard)/edit-actions'

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
  onSave: (field: EditableField, val: number) => void
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
    if (!result.error) onSave(field, n)
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

// ── Main component ─────────────────────────────────────────────────────────

export function AnalyticsClient({ posts: initialPosts }: { posts: PostRow[] }) {
  const [posts, setPosts] = useState<PostRow[]>(initialPosts)
  const [platform, setPlatform] = useState<string>('ig')
  const [win,      setWindow  ] = useState<WindowKey>('eom')
  const [pillar,   setPillar  ] = useState<string>('All')
  const [sortKey,  setSortKey ] = useState<SortKey>('views')
  const [sortDir,  setSortDir ] = useState<SortDir>('desc')

  function handleMetricSave(postUUID: string, field: EditableField, value: number) {
    setPosts(prev => prev.map(p => {
      if (p.uuid !== postUUID) return p
      const winData = { ...p[win], [field]: value } as WindowData
      return { ...p, [win]: winData }
    }))
  }

  const rows = useMemo(() => {
    let filtered = posts.filter(p => p.platform.includes(platform))
    if (pillar !== 'All') filtered = filtered.filter(p => p.pillar === pillar)
    return filtered.slice().sort((a, b) => {
      const wa = a[win]; const wb = b[win]
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
  }, [posts, platform, pillar, win, sortKey, sortDir])

  const kpis = useMemo(() => {
    const total = rows.length
    const totalViews = rows.reduce((s, r) => s + r[win].views, 0)
    const withViews  = rows.filter(r => r[win].views > 0)
    const avgER      = withViews.length ? withViews.reduce((s, r) => s + calcER(r[win]), 0) / withViews.length : 0
    const avgWatch   = withViews.length ? withViews.reduce((s, r) => s + r[win].watch_pct, 0) / withViews.length : 0
    const eliteCount = withViews.filter(r => calcER(r[win]) >= 12).length
    return { total, totalViews, avgER, avgWatch, eliteCount }
  }, [rows, win])

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
      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="flex gap-2">
          {['ig', 'tt', 'yt'].map(p => (
            <FilterTab key={p} label={PLATFORM_LABELS[p]} active={platform === p} onClick={() => setPlatform(p)} />
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: '#1a1a1a' }} />
        <div className="flex gap-2">
          {(Object.keys(WINDOW_LABELS) as WindowKey[]).map(w => (
            <FilterTab key={w} label={WINDOW_LABELS[w]} active={win === w} onClick={() => setWindow(w)} />
          ))}
        </div>
        <p className="ml-auto text-[9px] tracking-[.14em] uppercase" style={{ color: '#252525' }}>
          {rows.length} posts
        </p>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────── */}
      <div className="grid gap-px mb-8" style={{ gridTemplateColumns: 'repeat(4, 1fr)', background: '#141414' }}>
        <KpiCard label="Posts in View"    value={kpis.total.toString()}                               sub={`${platform.toUpperCase()} · ${WINDOW_LABELS[win]}`} />
        <KpiCard label="Total Views"      value={kpis.totalViews > 0 ? fmt(kpis.totalViews) : '—'}   sub="Sum for selected window" />
        <KpiCard label="Avg Engagement"   value={kpis.avgER > 0 ? kpis.avgER.toFixed(1) + '%' : '—'} sub="(Likes + cmts + shares + saves) / views" />
        <KpiCard label="Avg Watch %"      value={kpis.avgWatch > 0 ? kpis.avgWatch.toFixed(1) + '%' : '—'} sub={`${kpis.eliteCount} elite posts (ER ≥12%)`} />
      </div>

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
              rows.map((post, i) => {
                const w       = post[win]
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
                      postUUID={post.uuid} platform={platform} metricWindow={win} field="views" isPercent={false}
                      onSave={(f, v) => handleMetricSave(post.uuid, f, v)}
                    />
                    <EditableCell
                      value={w.likes} displayValue={hasData ? fmt(w.likes) : '—'} color={hasData ? '#aaa' : '#252525'}
                      postUUID={post.uuid} platform={platform} metricWindow={win} field="likes" isPercent={false}
                      onSave={(f, v) => handleMetricSave(post.uuid, f, v)}
                    />
                    <EditableCell
                      value={w.comments} displayValue={hasData ? fmt(w.comments) : '—'} color={hasData ? '#aaa' : '#252525'}
                      postUUID={post.uuid} platform={platform} metricWindow={win} field="comments" isPercent={false}
                      onSave={(f, v) => handleMetricSave(post.uuid, f, v)}
                    />
                    <EditableCell
                      value={w.saves} displayValue={hasData ? fmt(w.saves) : '—'} color={hasData ? '#aaa' : '#252525'}
                      postUUID={post.uuid} platform={platform} metricWindow={win} field="saves" isPercent={false}
                      onSave={(f, v) => handleMetricSave(post.uuid, f, v)}
                    />
                    <EditableCell
                      value={w.shares} displayValue={hasData ? fmt(w.shares) : '—'} color={hasData ? '#aaa' : '#252525'}
                      postUUID={post.uuid} platform={platform} metricWindow={win} field="shares" isPercent={false}
                      onSave={(f, v) => handleMetricSave(post.uuid, f, v)}
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
                      postUUID={post.uuid} platform={platform} metricWindow={win} field="watch_pct" isPercent={true}
                      onSave={(f, v) => handleMetricSave(post.uuid, f, v)}
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
