'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import type { CalendarEvent } from '@/app/(dashboard)/calendar/page'
import { updateCalendarEvent, deleteCalendarEvent, getPostAnalyticsSnapshot, updatePipelineByPostId } from '@/app/(dashboard)/edit-actions'
import { useToast } from '@/components/portal/Toast'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyState } from '@/components/portal/EmptyState'
import { usePillarColors } from '@/hooks/usePillarColors'

// ── Constants ──────────────────────────────────────────────────────────────

const DAYS_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']

const PLAT: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ig: { label: 'IG', color: '#c9a96e', bg: 'rgba(201,169,110,.13)', border: 'rgba(201,169,110,.45)' },
  tt: { label: 'TT', color: '#a78bfa', bg: 'rgba(167,139,250,.12)', border: 'rgba(167,139,250,.4)'  },
  yt: { label: 'YT', color: '#4cc9ff', bg: 'rgba(76,201,255,.12)',  border: 'rgba(76,201,255,.4)'   },
}

const PIPELINE_STATUS_COLOR: Record<string, string> = {
  POSTED:    '#39ff88',
  SCRIPTED:  '#c9a96e',
  PLANNED:   '#4cc9ff',
  FILMING:   '#fbbf24',
  REVIEWING: '#ff3b5f',
  SCHEDULED: '#4cc9ff',
  CANCELLED: '#666',
}

const ALL_STATUSES_LIST = [
  'SCRIPTED','PLANNED','FILMING','EDITING','REVIEWING','SCHEDULED','POSTED','CANCELLED',
] as const

// ── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string { return new Date().toISOString().split('T')[0] }

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function buildGrid(year: number, month: number, events: CalendarEvent[]) {
  const firstDow  = new Date(year, month, 1).getDay()
  const daysInMon = new Date(year, month + 1, 0).getDate()
  const prevDays  = new Date(year, month, 0).getDate()
  const prevY = month === 0 ? year - 1 : year; const prevM = month === 0 ? 11 : month - 1
  const nextY = month === 11 ? year + 1 : year; const nextM = month === 11 ? 0 : month + 1
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const byDate: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    if (!byDate[ev.eventDate]) byDate[ev.eventDate] = []
    byDate[ev.eventDate].push(ev)
  }
  type Cell = { date: number; iso: string; current: boolean; evs: CalendarEvent[] }
  const cells: Cell[] = []
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevDays - i; const key = iso(prevY, prevM, d)
    cells.push({ date: d, iso: key, current: false, evs: byDate[key] ?? [] })
  }
  for (let d = 1; d <= daysInMon; d++) {
    const key = iso(year, month, d); cells.push({ date: d, iso: key, current: true, evs: byDate[key] ?? [] })
  }
  let nd = 1
  while (cells.length < 42) {
    const key = iso(nextY, nextM, nd); cells.push({ date: nd, iso: key, current: false, evs: byDate[key] ?? [] }); nd++
  }
  return cells
}

// ── SlideOverPanel ────────────────────────────────────────────────────────

function SlideOverPanel({
  ev,
  pillarColors,
  onUpdate,
  onDelete,
  onClose,
}: {
  ev: CalendarEvent
  pillarColors: Map<string, string>
  onUpdate: (id: string, patch: Partial<CalendarEvent>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const { toast } = useToast()
  const [date,       setDate      ] = useState(ev.eventDate)
  const [platform,   setPlatformS ] = useState(ev.platform)
  const [status,     setStatus    ] = useState(ev.pipelineStatus ?? '')
  const [link,       setLink      ] = useState(ev.videoUrl ?? '')
  const [pillar,     setPillarS   ] = useState(ev.pillar ?? '')
  const [notes,      setNotes     ] = useState(ev.userNotes ?? '')
  const [delConfirm, setDelConfirm] = useState(false)
  const [deleting,   setDeleting  ] = useState(false)
  const [saving,     setSaving    ] = useState<Record<string, SaveState>>({})

  type AnalyticsSnap = { windows: { window: string; views: number; likes: number; comments: number; shares: number; saves: number; watchPct: number; er: number }[]; platform: string }
  const [analyticsData,    setAnalyticsData   ] = useState<AnalyticsSnap | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [showChart,        setShowChart        ] = useState(false)

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    setAnalyticsData(null); setShowChart(false)
    if (ev.pipelineStatus !== 'POSTED' || !ev.postId) return
    setAnalyticsLoading(true)
    getPostAnalyticsSnapshot(ev.postId).then(r => {
      setAnalyticsLoading(false)
      if (r.windows?.length) {
        setAnalyticsData({ windows: r.windows, platform: r.platform ?? 'ig' })
        setTimeout(() => setShowChart(true), 200)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id])

  const ss = (f: string): SaveState => saving[f] ?? 'idle'

  type CalFields = Parameters<typeof updateCalendarEvent>[1]
  type PipeFields = Parameters<typeof updatePipelineByPostId>[1]

  function schedCal(dbField: string, value: string, patch: Partial<CalendarEvent>) {
    clearTimeout(timers.current[dbField])
    timers.current[dbField] = setTimeout(async () => {
      setSaving(s => ({ ...s, [dbField]: 'saving' }))
      const res = await updateCalendarEvent(ev.id, { [dbField]: value } as CalFields)
      if (res.error) { setSaving(s => ({ ...s, [dbField]: 'error' })); toast(res.error, 'error') }
      else { onUpdate(ev.id, patch); setSaving(s => ({ ...s, [dbField]: 'saved' })); setTimeout(() => setSaving(s => ({ ...s, [dbField]: 'idle' })), 1500) }
    }, 1500)
  }

  function schedPipe(dbField: string, value: string, patch: Partial<CalendarEvent>) {
    if (!ev.postId) return
    clearTimeout(timers.current[dbField])
    timers.current[dbField] = setTimeout(async () => {
      setSaving(s => ({ ...s, [dbField]: 'saving' }))
      const res = await updatePipelineByPostId(ev.postId, { [dbField]: value } as PipeFields)
      if (res.error) { setSaving(s => ({ ...s, [dbField]: 'error' })); toast(res.error, 'error') }
      else { onUpdate(ev.id, patch); setSaving(s => ({ ...s, [dbField]: 'saved' })); setTimeout(() => setSaving(s => ({ ...s, [dbField]: 'idle' })), 1500) }
    }, 1500)
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await deleteCalendarEvent(ev.id)
    if (res.error) { toast(res.error, 'error'); setDeleting(false); return }
    onDelete(ev.id); onClose()
  }

  const platCfg = PLAT[platform] ?? PLAT.ig
  const inp: React.CSSProperties = {
    background: '#080808', border: '1px solid #1e1e1e', color: '#f2ede4',
    padding: '5px 8px', fontSize: 11, fontFamily: 'DM Sans, sans-serif',
    outline: 'none', width: '100%',
  }
  const lbl: React.CSSProperties = {
    fontSize: 7, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase',
    color: '#555', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 4,
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 8001, width: 420, maxWidth: '92vw',
        background: '#070707', borderLeft: '1px solid #1a1a1a', borderTop: `3px solid ${platCfg.color}`,
        display: 'flex', flexDirection: 'column', boxShadow: '-32px 0 72px rgba(0,0,0,.8)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #141414', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', color: platCfg.color, marginBottom: 5 }}>
                {isoToDisplay(date)}
              </p>
              <p style={{ fontSize: 15, color: '#f2ede4', fontWeight: 300, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.title}
              </p>
              {ev.postId && <p style={{ fontSize: 10, color: '#c9a96e', fontFamily: 'monospace', marginTop: 4 }}>{ev.postId}</p>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {status && (() => { const c = PIPELINE_STATUS_COLOR[status] ?? '#555'; return <span key="st" style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', padding: '2px 8px', color: c, background: `${c}18`, border: `1px solid ${c}40` }}>{status}</span> })()}
                {pillar && (() => { const pc = pillarColors.get(pillar) ?? '#555'; return <span key="pi" style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', padding: '2px 8px', color: pc, background: `${pc}18`, border: `1px solid ${pc}40` }}>{pillar}</span> })()}
              </div>
            </div>
            <button onClick={onClose} style={{ fontSize: 18, color: '#555', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, flexShrink: 0, marginTop: -2 }}>×</button>
          </div>
        </div>

        {/* Scrollable edit fields */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gap: 14 }}>

            {/* Date */}
            <div>
              <label style={lbl}>Date <SaveDot s={ss('event_date')} /></label>
              <input type="date" style={inp} value={date}
                onChange={e => { setDate(e.target.value); schedCal('event_date', e.target.value, { eventDate: e.target.value }) }}
                onFocus={e => (e.target.style.borderColor = platCfg.color)}
                onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
            </div>

            {/* Platform */}
            <div>
              <label style={lbl}>Platform <SaveDot s={ss('platform')} /></label>
              <div style={{ display: 'flex', gap: 6 }}>
                {Object.entries(PLAT).map(([k, v]) => (
                  <button key={k} type="button"
                    onClick={() => { setPlatformS(k); schedCal('platform', k, { platform: k }) }}
                    style={{
                      padding: '4px 14px', cursor: 'pointer', fontSize: 9, fontWeight: 600,
                      letterSpacing: '.1em', textTransform: 'uppercase',
                      color:      platform === k ? v.color : '#666',
                      background: platform === k ? v.bg    : 'transparent',
                      border:    `1px solid ${platform === k ? v.color + '60' : '#1e1e1e'}`,
                      transition: 'all .12s',
                    }}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            {ev.postId && (
              <div>
                <label style={lbl}>Status <SaveDot s={ss('status')} /></label>
                <select style={{ ...inp, appearance: 'none', cursor: 'pointer' }} value={status}
                  onChange={e => { setStatus(e.target.value); schedPipe('status', e.target.value, { pipelineStatus: e.target.value }) }}>
                  <option value="" style={{ background: '#0a0a0a' }}>— no status —</option>
                  {ALL_STATUSES_LIST.map(s => <option key={s} value={s} style={{ background: '#0a0a0a' }}>{s}</option>)}
                </select>
              </div>
            )}

            {/* Link */}
            {ev.postId && (
              <div>
                <label style={lbl}>Video Link <SaveDot s={ss('video_url')} /></label>
                <input type="text" style={inp} value={link}
                  placeholder="https://youtu.be/… or instagram.com/reel/…"
                  onChange={e => { setLink(e.target.value); schedPipe('video_url', e.target.value, { videoUrl: e.target.value }) }}
                  onFocus={e => (e.target.style.borderColor = platCfg.color)}
                  onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
              </div>
            )}

            {/* Pillar */}
            {ev.postId && (
              <div>
                <label style={lbl}>Pillar <SaveDot s={ss('pillar')} /></label>
                <input type="text" style={inp} value={pillar} placeholder="e.g. Sales Tips"
                  onChange={e => { setPillarS(e.target.value); schedPipe('pillar', e.target.value, { pillar: e.target.value }) }}
                  onFocus={e => (e.target.style.borderColor = platCfg.color)}
                  onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
              </div>
            )}

            {/* Notes */}
            <div>
              <label style={lbl}>Notes <SaveDot s={ss('user_notes')} /></label>
              <textarea style={{ ...inp, height: 72, resize: 'none', lineHeight: 1.5 }} value={notes}
                placeholder="Optional notes…"
                onChange={e => { setNotes(e.target.value); schedCal('user_notes', e.target.value, { userNotes: e.target.value }) }}
                onFocus={e => (e.target.style.borderColor = platCfg.color)}
                onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
            </div>
          </div>

          {/* Analytics snapshot (POSTED) */}
          {ev.pipelineStatus === 'POSTED' && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #141414' }}>
              <p style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: '#39ff88', marginBottom: 12 }}>Performance Snapshot</p>
              {analyticsLoading && <div style={{ display: 'flex', gap: 6, padding: '8px 0', alignItems: 'center' }}>{[0,1,2].map(i => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#39ff88', display: 'block', opacity: 0.5, animation: `dotPulse .8s ease-in-out ${i*0.2}s infinite` }} />)}</div>}
              {!analyticsLoading && analyticsData && analyticsData.windows.length > 0 && (() => {
                const best = analyticsData.windows[analyticsData.windows.length - 1]
                const chartData = analyticsData.windows.map(w => ({ name: w.window === 'w24' ? '24h' : w.window === 'w3' ? '3d' : w.window === 'w7' ? '7d' : 'EOM', views: w.views }))
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                      {[
                        { label: 'Views',    value: best.views >= 1000 ? `${(best.views/1000).toFixed(1)}K` : String(best.views) },
                        { label: 'ER%',      value: `${best.er}%` },
                        { label: 'Likes',    value: best.likes >= 1000 ? `${(best.likes/1000).toFixed(1)}K` : String(best.likes) },
                        { label: 'Comments', value: String(best.comments) },
                        { label: 'Shares',   value: String(best.shares) },
                        { label: 'Watch%',   value: best.watchPct ? `${best.watchPct.toFixed(0)}%` : '—' },
                      ].map(kpi => (
                        <div key={kpi.label} style={{ background: '#0a0a0a', border: '1px solid #141414', padding: '7px 9px' }}>
                          <p style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#555', marginBottom: 3 }}>{kpi.label}</p>
                          <p style={{ fontSize: 13, color: '#f2ede4', fontWeight: 300 }}>{kpi.value}</p>
                        </div>
                      ))}
                    </div>
                    {showChart && chartData.length >= 2 && (
                      <ResponsiveContainer width="100%" height={70}>
                        <BarChart data={chartData} barCategoryGap="30%">
                          <XAxis dataKey="name" tick={{ fill: '#555', fontSize: 8 }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          <Tooltip cursor={{ fill: 'rgba(57,255,136,.05)' }} contentStyle={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 0, fontSize: 10 }} labelStyle={{ color: '#39ff88' }} itemStyle={{ color: '#aaa' }} formatter={(v: unknown) => [Number(v).toLocaleString(), 'Views']} />
                          <Bar dataKey="views" fill="#39ff88" fillOpacity={0.7} radius={[1,1,0,0]} isAnimationActive animationDuration={800} animationEasing="ease-out" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </>
                )
              })()}
              {!analyticsLoading && (!analyticsData || analyticsData.windows.length === 0) && (
                <p style={{ fontSize: 11, color: '#555', fontWeight: 300 }}>No analytics data for <span style={{ color: '#c9a96e', fontFamily: 'monospace' }}>{ev.postId}</span>.</p>
              )}
            </div>
          )}

          {/* Delete */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #141414' }}>
            {!delConfirm ? (
              <button onClick={() => setDelConfirm(true)} style={{ width: '100%', padding: '8px 16px', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: '#ff3b5f', background: 'rgba(255,59,95,.04)', border: '1px solid rgba(255,59,95,.2)', cursor: 'pointer' }}>Delete Event</button>
            ) : (
              <div style={{ background: 'rgba(255,59,95,.06)', border: '1px solid rgba(255,59,95,.25)', padding: '12px 14px' }}>
                <p style={{ fontSize: 10, color: '#ff3b5f', marginBottom: 10, fontWeight: 300 }}>Delete this event? This cannot be undone.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setDelConfirm(false)} style={{ flex: 1, padding: '6px', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', background: 'transparent', border: '1px solid #1e1e1e', color: '#666', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '6px', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', background: 'rgba(255,59,95,.12)', border: '1px solid rgba(255,59,95,.4)', color: '#ff3b5f', cursor: deleting ? 'wait' : 'pointer', opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Deleting…' : 'Confirm Delete'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── PlatBadge ─────────────────────────────────────────────────────────────

function PlatBadge({ platform, small = false }: { platform: string; small?: boolean }) {
  const cfg = PLAT[platform] ?? PLAT.ig
  return (
    <span style={{
      display: 'inline-block', fontSize: small ? 7 : 8, fontWeight: 600, letterSpacing: '.1em',
      textTransform: 'uppercase', padding: small ? '1px 5px' : '2px 7px',
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  )
}

// ── EventPill ─────────────────────────────────────────────────────────────

function EventPill({
  ev,
  isDragging,
  pillarColor,
  onClick,
  onDragStart,
  onTouchStart,
}: {
  ev: CalendarEvent
  isDragging: boolean
  pillarColor: string
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onTouchStart: (e: React.TouchEvent) => void
}) {
  const cfg = PLAT[ev.platform] ?? PLAT.ig
  const leftBorderColor = pillarColor !== '#2a2a2a' ? pillarColor : cfg.color
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onTouchStart={onTouchStart}
      onClick={e => { e.stopPropagation(); onClick() }}
      title={ev.title}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '2px 5px', marginBottom: 2,
        background: cfg.bg, color: cfg.color, fontSize: 9, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'grab',
        fontFamily: 'DM Sans, sans-serif', borderLeft: `2px solid ${leftBorderColor}`,
        opacity: isDragging ? 0.35 : 1,
        transition: 'opacity .15s',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {ev.title}
    </button>
  )
}

// ── EventEditPanel ────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function SaveDot({ s }: { s: SaveState }) {
  const color = s === 'saving' ? '#fbbf24' : s === 'saved' ? '#39ff88' : s === 'error' ? '#ff3b5f' : 'transparent'
  return <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: color, marginLeft: 4, transition: 'background .2s' }} />
}

function EventEditPanel({
  ev,
  onUpdate,
  onDelete,
  onClose,
}: {
  ev: CalendarEvent
  onUpdate: (id: string, patch: Partial<CalendarEvent>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [title,         setTitle        ] = useState(ev.title)
  const [platform,      setPlatform     ] = useState(ev.platform)
  const [eventDate,     setEventDate    ] = useState(ev.eventDate)
  const [postId,        setPostId       ] = useState(ev.postId)
  const [postTime,      setPostTime     ] = useState(ev.postTime === '—' ? '' : ev.postTime)
  const [captionStatus, setCaptionStatus] = useState(ev.captionStatus === '—' ? '' : ev.captionStatus)
  const [cta,           setCta          ] = useState(ev.cta === '—' ? '' : ev.cta)
  const [contentType,   setContentType  ] = useState(ev.contentType === '—' ? '' : ev.contentType)
  const [deleting, setDeleting] = useState(false)

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const st = (f: string): SaveState => states[f] ?? 'idle'

  function schedule(field: string, value: unknown, noteKey?: string) {
    clearTimeout(timers.current[field])
    timers.current[field] = setTimeout(async () => {
      setStates(s => ({ ...s, [field]: 'saving' }))
      const fields = noteKey
        ? { [noteKey]: value as string }
        : { [field]: value as string }
      const result = await updateCalendarEvent(ev.id, fields)
      if (result.error) {
        setStates(s => ({ ...s, [field]: 'error' }))
      } else {
        const patch: Partial<CalendarEvent> = noteKey
          ? { [field]: value as string }
          : { [field]: value as string }
        onUpdate(ev.id, patch)
        setStates(s => ({ ...s, [field]: 'saved' }))
        setTimeout(() => setStates(s => ({ ...s, [field]: 'idle' })), 1500)
      }
    }, 2000)
  }

  function scheduleNow(field: string, value: unknown, noteKey?: string) {
    clearTimeout(timers.current[field])
    setTimeout(async () => {
      setStates(s => ({ ...s, [field]: 'saving' }))
      const fields = noteKey ? { [noteKey]: value as string } : { [field]: value as string }
      const result = await updateCalendarEvent(ev.id, fields)
      if (result.error) {
        setStates(s => ({ ...s, [field]: 'error' }))
      } else {
        const patch: Partial<CalendarEvent> = { [field]: value as string }
        onUpdate(ev.id, patch)
        setStates(s => ({ ...s, [field]: 'saved' }))
        setTimeout(() => setStates(s => ({ ...s, [field]: 'idle' })), 1500)
      }
    }, 0)
  }

  async function handleDelete() {
    if (!confirm(`Delete event "${ev.title}"?`)) return
    setDeleting(true)
    const r = await deleteCalendarEvent(ev.id)
    if (r.error) { alert(r.error); setDeleting(false); return }
    onDelete(ev.id)
    onClose()
  }

  const inputStyle = {
    background: '#080808', border: '1px solid #1e1e1e', color: '#f2ede4',
    padding: '4px 7px', fontSize: 11, fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '100%',
  }
  const labelStyle = {
    fontSize: 7, fontWeight: 600 as const, letterSpacing: '.16em', textTransform: 'uppercase' as const,
    color: '#555', display: 'flex', alignItems: 'center', gap: 2, marginBottom: 4,
  }
  const platCfg = PLAT[platform] ?? PLAT.ig

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #141414', borderLeft: `3px solid ${platCfg.color}`, padding: '22px 24px' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[9px] font-medium tracking-[.2em] uppercase" style={{ color: platCfg.color }}>Edit Event</span>
        <div className="flex gap-2">
          <button onClick={handleDelete} disabled={deleting}
            style={{ fontSize: 9, padding: '2px 8px', cursor: 'pointer', color: '#ff3b5f', background: 'rgba(255,59,95,.06)', border: '1px solid rgba(255,59,95,.2)', opacity: deleting ? 0.5 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button onClick={onClose} style={{ fontSize: 9, padding: '2px 8px', cursor: 'pointer', color: '#666', background: 'transparent', border: '1px solid #1e1e1e' }}>Done</button>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Title <SaveDot s={st('title')} /></label>
          <input style={inputStyle} value={title}
            onChange={e => { setTitle(e.target.value); schedule('title', e.target.value) }}
            onFocus={e => (e.target.style.borderColor = platCfg.color)}
            onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Platform <SaveDot s={st('platform')} /></label>
          <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={platform}
            onChange={e => { setPlatform(e.target.value); scheduleNow('platform', e.target.value) }}>
            {Object.entries(PLAT).map(([k, v]) => <option key={k} value={k} style={{ background: '#0a0a0a' }}>{v.label}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Date <SaveDot s={st('event_date')} /></label>
          <input type="date" style={inputStyle} value={eventDate}
            onChange={e => { setEventDate(e.target.value); scheduleNow('eventDate', e.target.value, 'event_date') }}
            onFocus={e => (e.target.style.borderColor = platCfg.color)}
            onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Post ID <SaveDot s={st('postId')} /></label>
          <input style={inputStyle} value={postId}
            onChange={e => { setPostId(e.target.value); schedule('postId', e.target.value, 'post_id') }}
            onFocus={e => (e.target.style.borderColor = platCfg.color)}
            onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Post Time <SaveDot s={st('postTime')} /></label>
          <input style={inputStyle} placeholder="e.g. 12:00 PM" value={postTime}
            onChange={e => { setPostTime(e.target.value); schedule('postTime', e.target.value, 'post_time') }}
            onFocus={e => (e.target.style.borderColor = platCfg.color)}
            onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Caption Status <SaveDot s={st('captionStatus')} /></label>
          <input style={inputStyle} placeholder="e.g. Ready" value={captionStatus}
            onChange={e => { setCaptionStatus(e.target.value); schedule('captionStatus', e.target.value, 'caption_status') }}
            onFocus={e => (e.target.style.borderColor = platCfg.color)}
            onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Content Type <SaveDot s={st('contentType')} /></label>
          <input style={inputStyle} placeholder="e.g. Podcast Clip" value={contentType}
            onChange={e => { setContentType(e.target.value); schedule('contentType', e.target.value, 'content_type') }}
            onFocus={e => (e.target.style.borderColor = platCfg.color)}
            onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>CTA <SaveDot s={st('cta')} /></label>
          <input style={inputStyle} placeholder="e.g. DM to book" value={cta}
            onChange={e => { setCta(e.target.value); schedule('cta', e.target.value, 'cta') }}
            onFocus={e => (e.target.style.borderColor = platCfg.color)}
            onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function CalendarClient({
  events: initialEvents,
}: {
  events: CalendarEvent[]
  earliestISO: string | null
  latestISO: string | null
}) {
  const searchParams = useSearchParams()
  const linkedPost = searchParams.get('post')
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const pillarColors = usePillarColors(useMemo(() => events.map(e => e.pillar ?? ''), [events]))
  const [slideOverEv, setSlideOverEv] = useState<CalendarEvent | null>(null)
  const today = todayISO()
  const lastEvent = events[events.length - 1]
  const initParts = (lastEvent?.eventDate ?? today).split('-').map(Number)

  const [year,       setYear      ] = useState(initParts[0])
  const [month,      setMonth     ] = useState(initParts[1] - 1)
  const [view,       setView      ] = useState<'calendar' | 'agenda'>('calendar')
  const [selDate,    setSelDate   ] = useState<string | null>(null)
  const [selEvIdx,   setSelEvIdx  ] = useState<number>(0)
  const [editingId,  setEditingId ] = useState<string | null>(null)
  const [hoveredId,  setHoveredId ] = useState<string | null>(null)

  // ── Drag state ────────────────────────────────────────────────────────────
  const [dragEventId, setDragEventId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [droppedDate, setDroppedDate] = useState<string | null>(null)

  // Touch drag state (managed via refs to avoid re-renders during move)
  type TouchInfo = { eventId: string; fromDate: string; title: string; color: string; active: boolean; startX: number; startY: number }
  const touchRef = useRef<TouchInfo | null>(null)
  const [touchGhost, setTouchGhost] = useState<{ x: number; y: number; title: string; color: string } | null>(null)

  // Keep a stable reference to handleEventMove for use in document-level listeners
  const handleEventMoveRef = useRef<(id: string, fromDate: string, toDate: string) => void>(() => {})

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
    setSelDate(null); setEditingId(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
    setSelDate(null); setEditingId(null)
  }
  function goToday() {
    const [y, m] = today.split('-').map(Number)
    setYear(y); setMonth(m - 1); setSelDate(today)
  }

  const grid = useMemo(() => buildGrid(year, month, events), [year, month, events])

  const selEvents = useMemo(
    () => (selDate ? events.filter(e => e.eventDate === selDate) : []),
    [selDate, events],
  )

  const agendaGroups = useMemo(() => {
    const seen = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = ev.eventDate.slice(0, 7)
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key)!.push(ev)
    }
    const groups: { monthKey: string; label: string; evs: CalendarEvent[] }[] = []
    for (const [key, evs] of seen) {
      const [y, m] = key.split('-').map(Number)
      groups.push({ monthKey: key, label: `${MONTHS_LONG[m - 1]} ${y}`, evs })
    }
    return groups
  }, [events])

  const monthEvents = useMemo(
    () => events.filter(e => e.eventDate.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)),
    [events, year, month],
  )
  const igCount = monthEvents.filter(e => e.platform === 'ig').length
  const ytCount = monthEvents.filter(e => e.platform === 'yt').length
  const ttCount = monthEvents.filter(e => e.platform === 'tt').length

  function handleEventUpdate(id: string, patch: Partial<CalendarEvent>) {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  function handleEventDelete(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id))
    if (selDate) {
      const remaining = events.filter(e => e.eventDate === selDate && e.id !== id)
      if (remaining.length === 0) setSelDate(null)
      else setSelEvIdx(0)
    }
  }

  // ── Event move (drag result) ───────────────────────────────────────────────
  const handleEventMove = useCallback(async (eventId: string, fromDate: string, toDate: string) => {
    if (toDate === fromDate) return
    // Optimistic update
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, eventDate: toDate } : e))
    setDroppedDate(toDate)
    setTimeout(() => setDroppedDate(null), 700)

    const result = await updateCalendarEvent(eventId, { event_date: toDate })
    if (result.error) {
      // Revert on failure
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, eventDate: fromDate } : e))
    }
  }, [])

  useEffect(() => {
    handleEventMoveRef.current = handleEventMove
  }, [handleEventMove])

  // ── Document-level touch handlers (added once on mount) ───────────────────
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      const drag = touchRef.current
      if (!drag) return
      const touch = e.touches[0]
      const dx = touch.clientX - drag.startX
      const dy = touch.clientY - drag.startY
      if (!drag.active) {
        // Activate after 8px movement
        if (Math.hypot(dx, dy) > 8) {
          drag.active = true
          setTouchGhost({ x: touch.clientX, y: touch.clientY, title: drag.title, color: drag.color })
        }
        return
      }
      e.preventDefault()
      setTouchGhost(g => g ? { ...g, x: touch.clientX, y: touch.clientY } : null)
    }

    const onTouchEnd = (e: TouchEvent) => {
      const drag = touchRef.current
      touchRef.current = null
      setTouchGhost(null)
      if (!drag?.active) return
      const touch = e.changedTouches[0]
      // Hit-test to find the target cell using data-caldate attribute
      const el = document.elementFromPoint(touch.clientX, touch.clientY)
      const cellEl = el?.closest('[data-caldate]')
      const newDate = cellEl?.getAttribute('data-caldate')
      if (newDate) {
        handleEventMoveRef.current(drag.eventId, drag.fromDate, newDate)
      }
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function onPillDragStart(e: React.DragEvent, ev: CalendarEvent) {
    setDragEventId(ev.id)
    e.dataTransfer.setData('eventId', ev.id)
    e.dataTransfer.setData('fromDate', ev.eventDate)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onPillTouchStart(e: React.TouchEvent, ev: CalendarEvent) {
    const touch = e.touches[0]
    const cfg = PLAT[ev.platform] ?? PLAT.ig
    touchRef.current = {
      eventId: ev.id,
      fromDate: ev.eventDate,
      title: ev.title,
      color: cfg.color,
      active: false,
      startX: touch.clientX,
      startY: touch.clientY,
    }
  }

  function onCellDragOver(e: React.DragEvent, isoDate: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(isoDate)
  }

  function onCellDragLeave() {
    setDragOverDate(null)
  }

  function onCellDrop(e: React.DragEvent, isoDate: string) {
    e.preventDefault()
    const eventId  = e.dataTransfer.getData('eventId')
    const fromDate = e.dataTransfer.getData('fromDate')
    setDragEventId(null)
    setDragOverDate(null)
    if (eventId) handleEventMove(eventId, fromDate, isoDate)
  }

  function onDragEnd() {
    setDragEventId(null)
    setDragOverDate(null)
  }

  const selEv = selEvents[selEvIdx]
  const isEditingSelected = selEv && editingId === selEv.id

  useEffect(() => {
    if (!linkedPost) return
    const match = events.find(ev => ev.postId === linkedPost)
    if (!match) return
    const [y, m] = match.eventDate.split('-').map(Number)
    const idx = events.filter(ev => ev.eventDate === match.eventDate).findIndex(ev => ev.id === match.id)
    queueMicrotask(() => {
      setYear(y)
      setMonth(m - 1)
      setView('calendar')
      setSelDate(match.eventDate)
      setSelEvIdx(Math.max(0, idx))
      setEditingId(match.id)
    })
  }, [linkedPost, events])

  if (initialEvents.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        headline="No calendar events yet."
        body="Your content manager will add scheduled and posted videos here — check back soon."
      />
    )
  }

  return (
    <div>

      {/* ── Event slide-over ─────────────────────────────────────── */}
      {slideOverEv && (
        <SlideOverPanel
          ev={slideOverEv}
          pillarColors={pillarColors}
          onUpdate={handleEventUpdate}
          onDelete={handleEventDelete}
          onClose={() => setSlideOverEv(null)}
        />
      )}

      {/* ── Touch drag ghost ─────────────────────────────────────── */}
      {touchGhost && (
        <div
          style={{
            position: 'fixed',
            left: touchGhost.x - 60,
            top: touchGhost.y - 14,
            width: 130,
            padding: '3px 7px',
            background: '#0d0d0d',
            color: touchGhost.color,
            borderLeft: `2px solid ${touchGhost.color}`,
            fontSize: 9,
            pointerEvents: 'none',
            zIndex: 9999,
            opacity: 0.9,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: `0 4px 20px rgba(0,0,0,.6)`,
          }}
        >
          {touchGhost.title}
        </div>
      )}

      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="text-[9px] font-medium tracking-[.14em] uppercase px-4 py-2.5 transition-colors"
            style={{ color: '#666', background: '#080808', border: '1px solid #1a1a1a', cursor: 'pointer' }}>‹ Prev</button>
          <span className="font-jakarta font-light" style={{ fontSize: 18, color: '#f2ede4', minWidth: 180, textAlign: 'center' }}>
            {`${MONTHS_LONG[month]} ${year}`}
          </span>
          <button onClick={nextMonth} className="text-[9px] font-medium tracking-[.14em] uppercase px-4 py-2.5 transition-colors"
            style={{ color: '#666', background: '#080808', border: '1px solid #1a1a1a', cursor: 'pointer' }}>Next ›</button>
          <button onClick={goToday} className="text-[9px] font-medium tracking-[.14em] uppercase px-4 py-2.5 transition-colors"
            style={{ color: '#c9a96e', background: 'transparent', border: '1px solid rgba(201,169,110,.3)', cursor: 'pointer' }}>Today</button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-[9px]" style={{ color: '#555' }}>
            {monthEvents.length > 0 && (
              <>
                <span>{monthEvents.length} posts</span>
                {igCount > 0 && <span style={{ color: PLAT.ig.color }}>{igCount} IG</span>}
                {ytCount > 0 && <span style={{ color: PLAT.yt.color }}>{ytCount} YT</span>}
                {ttCount > 0 && <span style={{ color: PLAT.tt.color }}>{ttCount} TT</span>}
              </>
            )}
            {monthEvents.length === 0 && <span style={{ color: '#666' }}>No events this month</span>}
          </div>
          <div className="flex gap-1">
            {(['calendar', 'agenda'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="text-[9px] font-medium tracking-[.14em] uppercase px-4 py-2.5 transition-colors"
                style={{
                  color:      view === v ? '#c9a96e' : '#666',
                  background: view === v ? 'rgba(201,169,110,.07)' : 'transparent',
                  border:     `1px solid ${view === v ? 'rgba(201,169,110,.4)' : '#1a1a1a'}`,
                  cursor: 'pointer',
                }}>
                {v === 'calendar' ? '⊞ Calendar' : '≡ Agenda'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar view ────────────────────────────────────────── */}
      {view === 'calendar' && (
        <>
          <div style={{ border: '1px solid #141414' }}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #141414' }}>
              {DAYS_SHORT.map(d => (
                <div key={d} className="text-center py-2 text-[8px] font-medium tracking-[.18em] uppercase" style={{ color: '#555' }}>{d}</div>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(7,1fr)' }}>
              {grid.map((cell, idx) => {
                const isToday    = cell.iso === today
                const isSelected = cell.iso === selDate
                const hasPosts   = cell.evs.length > 0
                const isDragOver = dragOverDate === cell.iso
                const wasDropped = droppedDate === cell.iso

                return (
                  <div
                    key={idx}
                    data-caldate={cell.current ? cell.iso : undefined}
                    onDragOver={cell.current ? e => onCellDragOver(e, cell.iso) : undefined}
                    onDragLeave={cell.current ? onCellDragLeave : undefined}
                    onDrop={cell.current ? e => onCellDrop(e, cell.iso) : undefined}
                    onClick={() => {
                      if (!cell.current) return
                      setSelDate(isSelected ? null : cell.iso)
                      setSelEvIdx(0)
                      setEditingId(null)
                    }}
                    style={{
                      height: 100, overflow: 'hidden', padding: '8px 7px 6px',
                      borderRight:  idx % 7 !== 6 ? '1px solid #0e0e0e' : 'none',
                      borderBottom: idx < 35       ? '1px solid #0e0e0e' : 'none',
                      background: isDragOver
                        ? 'rgba(201,169,110,.09)'
                        : wasDropped
                        ? 'rgba(57,255,136,.08)'
                        : isSelected ? '#0d0d0d' : hasPosts && cell.current ? '#070707' : '#060606',
                      opacity: cell.current ? 1 : 0.3,
                      cursor: cell.current ? (hasPosts ? 'pointer' : 'default') : 'default',
                      outline: isDragOver
                        ? '1px solid rgba(201,169,110,.5)'
                        : isSelected ? '1px solid rgba(201,169,110,.3)' : 'none',
                      outlineOffset: -1,
                      transition: 'background .12s, outline .12s',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div className="text-[10px] font-light mb-1.5 flex items-center gap-1"
                      style={{ color: isToday ? '#c9a96e' : cell.current ? '#666' : '#2a2a2a', fontWeight: isToday ? 600 : 300 }}>
                      {cell.date}
                      {isToday && <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: '#c9a96e' }} />}
                    </div>
                    {cell.evs.slice(0, 2).map((ev, i) => (
                      <EventPill
                        key={ev.id}
                        ev={ev}
                        isDragging={dragEventId === ev.id}
                        pillarColor={pillarColors.get(ev.pillar ?? '') ?? '#2a2a2a'}
                        onClick={() => { setSelDate(cell.iso); setSelEvIdx(i); setEditingId(null); setSlideOverEv(ev) }}
                        onDragStart={e => onPillDragStart(e, ev)}
                        onTouchStart={e => onPillTouchStart(e, ev)}
                      />
                    ))}
                    {cell.evs.length > 2 && <span className="text-[8px]" style={{ color: '#555' }}>+{cell.evs.length - 2} more</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected date detail */}
          {selDate && selEvents.length > 0 && (
            <div style={{ border: '1px solid #141414', marginTop: 16 }}>
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #141414' }}>
                <p className="text-[11px] font-light" style={{ color: '#c9a96e' }}>{isoToDisplay(selDate)}</p>
                <div className="flex gap-1">
                  {selEvents.length > 1 && selEvents.map((_, i) => (
                    <button key={i} onClick={() => { setSelEvIdx(i); setEditingId(null) }}
                      style={{
                        width: 20, height: 20, fontSize: 9, cursor: 'pointer',
                        background: selEvIdx === i ? 'rgba(201,169,110,.15)' : 'transparent',
                        border: `1px solid ${selEvIdx === i ? 'rgba(201,169,110,.4)' : '#1a1a1a'}`,
                        color: selEvIdx === i ? '#c9a96e' : '#666',
                      }}>
                      {i + 1}
                    </button>
                  ))}
                  {selEv && (
                    <button
                      onClick={() => setEditingId(editingId === selEv.id ? null : selEv.id)}
                      style={{
                        width: 24, height: 20, fontSize: 10, cursor: 'pointer',
                        color: editingId === selEv.id ? '#c9a96e' : '#555',
                        background: editingId === selEv.id ? 'rgba(201,169,110,.08)' : 'transparent',
                        border: `1px solid ${editingId === selEv.id ? 'rgba(201,169,110,.35)' : '#1e1e1e'}`,
                        marginLeft: 4,
                      }}
                      title="Edit event"
                    >✎</button>
                  )}
                  <button
                    onClick={() => { setSelDate(null); setEditingId(null) }}
                    style={{ width: 20, height: 20, fontSize: 10, background: 'transparent', border: '1px solid #1a1a1a', color: '#555', cursor: 'pointer', marginLeft: 4 }}>
                    ×
                  </button>
                </div>
              </div>

              <div className="p-5">
                {selEv && (
                  isEditingSelected ? (
                    <EventEditPanel
                      ev={selEv}
                      onUpdate={handleEventUpdate}
                      onDelete={handleEventDelete}
                      onClose={() => setEditingId(null)}
                    />
                  ) : (
                    <EventDetailCard ev={selEv} />
                  )
                )}
              </div>
            </div>
          )}

          {selDate && selEvents.length === 0 && !dragEventId && (
            <div className="mt-4 px-5 py-4 text-[11px] font-light" style={{ color: '#555', border: '1px solid #0e0e0e' }}>
              No events on {isoToDisplay(selDate)}.
            </div>
          )}

          <div className="flex gap-4 mt-4 flex-wrap">
            {Object.entries(PLAT).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, display: 'block', background: cfg.bg, border: `1px solid ${cfg.border}` }} />
                <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#555' }}>{cfg.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#c9a96e', display: 'block' }} />
              <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#555' }}>Today</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#666' }}>Drag events to reschedule</span>
            </div>
          </div>
        </>
      )}

      {/* ── Agenda view ──────────────────────────────────────────── */}
      {view === 'agenda' && (
        <div>
          {agendaGroups.map(group => (
            <div key={group.monthKey} className="mb-8">
              <div className="flex items-center gap-3 mb-3" style={{ borderBottom: '1px solid #141414', paddingBottom: 10 }}>
                <p className="text-[9px] font-medium tracking-[.24em] uppercase" style={{ color: '#c9a96e' }}>{group.label}</p>
                <span className="text-[9px]" style={{ color: '#555' }}>{group.evs.length} posts</span>
              </div>
              <div style={{ border: '1px solid #141414' }}>
                {group.evs.map((ev, i) => {
                  const platCfg    = PLAT[ev.platform] ?? PLAT.ig
                  const statusColor = ev.pipelineStatus ? (PIPELINE_STATUS_COLOR[ev.pipelineStatus] ?? '#555') : '#2a2a2a'
                  const isHov      = hoveredId === ev.id
                  const isEd       = editingId === ev.id

                  return (
                    <div key={ev.id}>
                      <div
                        className="flex items-center gap-4 px-5 py-4"
                        onMouseEnter={() => setHoveredId(ev.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                          borderBottom: i < group.evs.length - 1 ? '1px solid #0e0e0e' : 'none',
                          background: isEd ? '#0d0d0d' : i % 2 === 0 ? '#060606' : '#070707',
                          borderLeft: `3px solid ${platCfg.color}`,
                          transition: 'background .1s',
                        }}
                      >
                        <div style={{ minWidth: 80 }}>
                          <p className="text-[10px] font-medium" style={{ color: '#c9a96e' }}>
                            {new Date(ev.eventDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-[9px]" style={{ color: '#555' }}>{ev.postTime !== '—' ? ev.postTime : ''}</p>
                        </div>
                        <PlatBadge platform={ev.platform} small />
                        <p className="flex-1 text-[12px] font-light overflow-hidden" style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={ev.title}>
                          {ev.title}
                        </p>
                        <span className="text-[8px] font-medium tracking-[.1em] uppercase px-2 py-0.5 hidden sm:inline"
                          style={{ color: '#666', background: '#0d0d0d', border: '1px solid #1a1a1a', whiteSpace: 'nowrap' }}>
                          {ev.contentType !== '—' ? ev.contentType : '—'}
                        </span>
                        <span className="text-[10px] font-light" style={{ fontFamily: 'monospace', color: '#555', minWidth: 50 }}>{ev.postId}</span>
                        {ev.pipelineStatus && (
                          <span className="text-[8px] font-medium tracking-[.1em] uppercase" style={{ color: statusColor, minWidth: 64, textAlign: 'right' }}>
                            {ev.pipelineStatus}
                          </span>
                        )}

                        {/* Hover actions */}
                        <div className="flex gap-1.5" style={{ opacity: (isHov || isEd) ? 1 : 0, transition: 'opacity .15s', flexShrink: 0 }}>
                          <button
                            onClick={() => setEditingId(isEd ? null : ev.id)}
                            style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer', color: isEd ? '#c9a96e' : '#555', background: isEd ? 'rgba(201,169,110,.08)' : 'transparent', border: `1px solid ${isEd ? 'rgba(201,169,110,.35)' : '#1e1e1e'}` }}
                            title="Edit">✎</button>
                          <button
                            onClick={async () => { if (!confirm(`Delete "${ev.title}"?`)) return; const r = await deleteCalendarEvent(ev.id); if (!r.error) handleEventDelete(ev.id) }}
                            style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer', color: '#ff3b5f', background: 'transparent', border: '1px solid rgba(255,59,95,.2)' }}
                            title="Delete">×</button>
                        </div>
                      </div>

                      {/* Inline edit panel for agenda */}
                      {isEd && (
                        <div style={{ borderBottom: i < group.evs.length - 1 ? '1px solid #0e0e0e' : 'none', padding: '0 0 0 3px' }}>
                          <EventEditPanel
                            ev={ev}
                            onUpdate={handleEventUpdate}
                            onDelete={handleEventDelete}
                            onClose={() => setEditingId(null)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

// ── EventDetailCard (read-only view) ───────────────────────────────────────

function EventDetailCard({ ev }: { ev: CalendarEvent }) {
  const platCfg     = PLAT[ev.platform] ?? PLAT.ig
  const statusColor = ev.pipelineStatus ? (PIPELINE_STATUS_COLOR[ev.pipelineStatus] ?? '#555') : '#555'

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #141414', borderLeft: `3px solid ${platCfg.color}`, padding: '22px 24px' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[13px] font-light" style={{ color: '#f2ede4', lineHeight: 1.3 }}>{ev.title}</p>
        <PlatBadge platform={ev.platform} />
      </div>
      <div className="grid gap-x-6 gap-y-1" style={{ gridTemplateColumns: 'repeat(3, auto)', justifyContent: 'start' }}>
        {[['Post ID', ev.postId], ['Type', ev.contentType], ['Time', ev.postTime], ['Caption', ev.captionStatus], ['CTA', ev.cta]].map(([label, val]) => (
          <div key={label}>
            <p className="text-[7px] font-medium tracking-[.14em] uppercase" style={{ color: '#555' }}>{label}</p>
            <p className="text-[10px] font-light" style={{ color: '#555' }}>{val || '—'}</p>
          </div>
        ))}
        {ev.pipelineStatus && (
          <div>
            <p className="text-[7px] font-medium tracking-[.14em] uppercase" style={{ color: '#555' }}>Pipeline</p>
            <p className="text-[10px] font-medium tracking-[.1em] uppercase" style={{ color: statusColor }}>{ev.pipelineStatus}</p>
          </div>
        )}
      </div>
    </div>
  )
}
