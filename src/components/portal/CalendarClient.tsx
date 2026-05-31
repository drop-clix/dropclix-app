'use client'

import { useState, useMemo } from 'react'
import type { CalendarEvent } from '@/app/(dashboard)/calendar/page'

// ── Constants ──────────────────────────────────────────────────────────────

const DAYS_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_LONG = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

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
  CANCELLED: '#444',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function monthLabel(year: number, month: number): string {
  return `${MONTHS_LONG[month]} ${year}`
}

/** Build 42-cell grid (6 rows × 7 cols) for a given month */
function buildGrid(year: number, month: number, events: CalendarEvent[]) {
  const firstDow   = new Date(year, month, 1).getDay()         // 0=Sun
  const daysInMon  = new Date(year, month + 1, 0).getDate()
  const prevDays   = new Date(year, month, 0).getDate()        // days in prev month
  const prevY = month === 0 ? year - 1 : year
  const prevM = month === 0 ? 11 : month - 1
  const nextY = month === 11 ? year + 1 : year
  const nextM = month === 11 ? 0 : month + 1

  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  // Build event lookup by date
  const byDate: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    if (!byDate[ev.eventDate]) byDate[ev.eventDate] = []
    byDate[ev.eventDate].push(ev)
  }

  type Cell = { date: number; iso: string; current: boolean; evs: CalendarEvent[] }
  const cells: Cell[] = []

  // Leading days (prev month)
  for (let i = firstDow - 1; i >= 0; i--) {
    const d   = prevDays - i
    const key = iso(prevY, prevM, d)
    cells.push({ date: d, iso: key, current: false, evs: byDate[key] ?? [] })
  }

  // Current month
  for (let d = 1; d <= daysInMon; d++) {
    const key = iso(year, month, d)
    cells.push({ date: d, iso: key, current: true, evs: byDate[key] ?? [] })
  }

  // Trailing days (next month) — always fill to 42
  let nd = 1
  while (cells.length < 42) {
    const key = iso(nextY, nextM, nd)
    cells.push({ date: nd, iso: key, current: false, evs: byDate[key] ?? [] })
    nd++
  }

  return cells
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PlatBadge({ platform, small = false }: { platform: string; small?: boolean }) {
  const cfg = PLAT[platform] ?? PLAT.ig
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: small ? 7 : 8,
        fontWeight: 600,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        padding: small ? '1px 5px' : '2px 7px',
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  )
}

function EventPill({
  ev, onClick,
}: { ev: CalendarEvent; onClick: () => void }) {
  const cfg = PLAT[ev.platform] ?? PLAT.ig
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      title={ev.title}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '2px 5px',
        marginBottom: 2,
        background: cfg.bg,
        color: cfg.color,
        fontSize: 9,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
        borderLeft: `2px solid ${cfg.color}`,
      }}
    >
      {ev.title}
    </button>
  )
}

function EventDetailCard({ ev }: { ev: CalendarEvent }) {
  const platCfg  = PLAT[ev.platform] ?? PLAT.ig
  const statusColor = ev.pipelineStatus
    ? (PIPELINE_STATUS_COLOR[ev.pipelineStatus] ?? '#555')
    : '#333'

  return (
    <div
      style={{
        background: '#0a0a0a',
        border: '1px solid #141414',
        borderLeft: `3px solid ${platCfg.color}`,
        padding: '14px 18px',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[13px] font-light" style={{ color: '#f2ede4', lineHeight: 1.3 }}>
          {ev.title}
        </p>
        <PlatBadge platform={ev.platform} />
      </div>

      <div
        className="grid gap-x-6 gap-y-1"
        style={{ gridTemplateColumns: 'repeat(3, auto)', justifyContent: 'start' }}
      >
        {[
          ['Post ID',  ev.postId],
          ['Type',     ev.contentType],
          ['Time',     ev.postTime],
          ['Caption',  ev.captionStatus],
          ['CTA',      ev.cta],
        ].map(([label, val]) => (
          <div key={label}>
            <p className="text-[7px] font-medium tracking-[.14em] uppercase" style={{ color: '#2a2a2a' }}>
              {label}
            </p>
            <p className="text-[10px] font-light" style={{ color: '#555' }}>
              {val || '—'}
            </p>
          </div>
        ))}

        {ev.pipelineStatus && (
          <div>
            <p className="text-[7px] font-medium tracking-[.14em] uppercase" style={{ color: '#2a2a2a' }}>
              Pipeline
            </p>
            <p
              className="text-[10px] font-medium tracking-[.1em] uppercase"
              style={{ color: statusColor }}
            >
              {ev.pipelineStatus}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function CalendarClient({
  events,
}: {
  events: CalendarEvent[]
  earliestISO: string | null
  latestISO: string | null
}) {
  const today = todayISO()
  // Default to month of most recent event (May 2026)
  const lastEvent = events[events.length - 1]
  const initParts  = (lastEvent?.eventDate ?? today).split('-').map(Number)

  const [year,    setYear   ] = useState(initParts[0])
  const [month,   setMonth  ] = useState(initParts[1] - 1)  // 0-indexed
  const [view,    setView   ] = useState<'calendar' | 'agenda'>('calendar')
  const [selDate, setSelDate] = useState<string | null>(null)
  const [selEvIdx, setSelEvIdx] = useState<number>(0)  // which event on selDate

  // Navigation
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelDate(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelDate(null)
  }
  function goToday() {
    const [y, m] = today.split('-').map(Number)
    setYear(y); setMonth(m - 1); setSelDate(today)
  }

  // Calendar grid (memoised)
  const grid = useMemo(() => buildGrid(year, month, events), [year, month, events])

  // Events for the selected date
  const selEvents = useMemo(
    () => (selDate ? events.filter(e => e.eventDate === selDate) : []),
    [selDate, events],
  )

  // Agenda: group all events by month string
  const agendaGroups = useMemo(() => {
    const groups: { monthKey: string; label: string; evs: CalendarEvent[] }[] = []
    const seen = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = ev.eventDate.slice(0, 7)
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key)!.push(ev)
    }
    for (const [key, evs] of seen) {
      const [y, m] = key.split('-').map(Number)
      groups.push({ monthKey: key, label: `${MONTHS_LONG[m - 1]} ${y}`, evs })
    }
    return groups
  }, [events])

  // Stat strip for current month
  const monthEvents = useMemo(
    () => events.filter(e => e.eventDate.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)),
    [events, year, month],
  )
  const igCount = monthEvents.filter(e => e.platform === 'ig').length
  const ytCount = monthEvents.filter(e => e.platform === 'yt').length
  const ttCount = monthEvents.filter(e => e.platform === 'tt').length

  return (
    <div>

      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">

        {/* Month nav */}
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="text-[9px] font-medium tracking-[.14em] uppercase px-3 py-1.5 transition-colors"
            style={{ color: '#444', background: '#080808', border: '1px solid #1a1a1a', cursor: 'pointer' }}
          >
            ‹ Prev
          </button>

          <span
            className="font-jakarta font-light"
            style={{ fontSize: 18, color: '#f2ede4', minWidth: 180, textAlign: 'center' }}
          >
            {monthLabel(year, month)}
          </span>

          <button
            onClick={nextMonth}
            className="text-[9px] font-medium tracking-[.14em] uppercase px-3 py-1.5 transition-colors"
            style={{ color: '#444', background: '#080808', border: '1px solid #1a1a1a', cursor: 'pointer' }}
          >
            Next ›
          </button>

          <button
            onClick={goToday}
            className="text-[9px] font-medium tracking-[.14em] uppercase px-3 py-1.5 transition-colors"
            style={{ color: '#c9a96e', background: 'transparent', border: '1px solid rgba(201,169,110,.3)', cursor: 'pointer' }}
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Month stat strip */}
          <div className="flex gap-2 text-[9px]" style={{ color: '#333' }}>
            {monthEvents.length > 0 && (
              <>
                <span>{monthEvents.length} posts</span>
                {igCount > 0 && <span style={{ color: PLAT.ig.color }}>{igCount} IG</span>}
                {ytCount > 0 && <span style={{ color: PLAT.yt.color }}>{ytCount} YT</span>}
                {ttCount > 0 && <span style={{ color: PLAT.tt.color }}>{ttCount} TT</span>}
              </>
            )}
            {monthEvents.length === 0 && <span style={{ color: '#1e1e1e' }}>No events this month</span>}
          </div>

          {/* View toggle */}
          <div className="flex gap-1">
            {(['calendar', 'agenda'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="text-[9px] font-medium tracking-[.14em] uppercase px-3 py-1.5 transition-colors"
                style={{
                  color:      view === v ? '#c9a96e' : '#333',
                  background: view === v ? 'rgba(201,169,110,.07)' : 'transparent',
                  border:     `1px solid ${view === v ? 'rgba(201,169,110,.4)' : '#1a1a1a'}`,
                  cursor: 'pointer',
                }}
              >
                {v === 'calendar' ? '⊞ Calendar' : '≡ Agenda'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar view ────────────────────────────────────────── */}
      {view === 'calendar' && (
        <>
          {/* Grid */}
          <div style={{ border: '1px solid #141414' }}>
            {/* Day headers */}
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #141414' }}
            >
              {DAYS_SHORT.map(d => (
                <div
                  key={d}
                  className="text-center py-2 text-[8px] font-medium tracking-[.18em] uppercase"
                  style={{ color: '#2a2a2a' }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Cells */}
            <div className="grid" style={{ gridTemplateColumns: 'repeat(7,1fr)' }}>
              {grid.map((cell, idx) => {
                const isToday    = cell.iso === today
                const isSelected = cell.iso === selDate
                const hasPosts   = cell.evs.length > 0

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (!cell.current) return
                      setSelDate(isSelected ? null : cell.iso)
                      setSelEvIdx(0)
                    }}
                    style={{
                      minHeight: 82,
                      padding: '6px 5px 4px',
                      borderRight:  idx % 7 !== 6 ? '1px solid #0e0e0e' : 'none',
                      borderBottom: idx < 35       ? '1px solid #0e0e0e' : 'none',
                      background: isSelected
                        ? '#0d0d0d'
                        : hasPosts && cell.current ? '#070707' : '#060606',
                      opacity: cell.current ? 1 : 0.3,
                      cursor: cell.current ? (hasPosts ? 'pointer' : 'default') : 'default',
                      outline: isSelected ? '1px solid rgba(201,169,110,.3)' : 'none',
                      outlineOffset: -1,
                      transition: 'background .1s',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Date number */}
                    <div
                      className="text-[10px] font-light mb-1.5 flex items-center gap-1"
                      style={{
                        color: isToday ? '#c9a96e' : cell.current ? '#666' : '#2a2a2a',
                        fontWeight: isToday ? 600 : 300,
                      }}
                    >
                      {cell.date}
                      {isToday && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: 4, height: 4,
                            borderRadius: '50%',
                            background: '#c9a96e',
                          }}
                        />
                      )}
                    </div>

                    {/* Event pills */}
                    {cell.evs.slice(0, 3).map((ev, i) => (
                      <EventPill
                        key={ev.id}
                        ev={ev}
                        onClick={() => {
                          setSelDate(cell.iso)
                          setSelEvIdx(i)
                        }}
                      />
                    ))}
                    {cell.evs.length > 3 && (
                      <span className="text-[8px]" style={{ color: '#333' }}>
                        +{cell.evs.length - 3} more
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Selected date detail ─────────────────────────────── */}
          {selDate && selEvents.length > 0 && (
            <div style={{ border: '1px solid #141414', marginTop: 16 }}>
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: '1px solid #141414' }}
              >
                <p className="text-[11px] font-light" style={{ color: '#c9a96e' }}>
                  {isoToDisplay(selDate)}
                </p>
                <div className="flex gap-1">
                  {selEvents.length > 1 && selEvents.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelEvIdx(i)}
                      style={{
                        width: 20, height: 20,
                        fontSize: 9,
                        background: selEvIdx === i ? 'rgba(201,169,110,.15)' : 'transparent',
                        border: `1px solid ${selEvIdx === i ? 'rgba(201,169,110,.4)' : '#1a1a1a'}`,
                        color: selEvIdx === i ? '#c9a96e' : '#333',
                        cursor: 'pointer',
                      }}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelDate(null)}
                    style={{
                      width: 20, height: 20, fontSize: 10,
                      background: 'transparent', border: '1px solid #1a1a1a',
                      color: '#333', cursor: 'pointer', marginLeft: 4,
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="p-5">
                {selEvents[selEvIdx] && (
                  <EventDetailCard ev={selEvents[selEvIdx]} />
                )}
              </div>
            </div>
          )}

          {selDate && selEvents.length === 0 && (
            <div
              className="mt-4 px-5 py-4 text-[11px] font-light"
              style={{ color: '#2a2a2a', border: '1px solid #0e0e0e' }}
            >
              No events on {isoToDisplay(selDate)}.
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-4 mt-4 flex-wrap">
            {Object.entries(PLAT).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span style={{
                  width: 8, height: 8, display: 'block',
                  background: cfg.bg, border: `1px solid ${cfg.border}`,
                }} />
                <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#2a2a2a' }}>
                  {cfg.label}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#c9a96e', display: 'block' }} />
              <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#2a2a2a' }}>Today</span>
            </div>
          </div>
        </>
      )}

      {/* ── Agenda view ──────────────────────────────────────────── */}
      {view === 'agenda' && (
        <div>
          {agendaGroups.map(group => (
            <div key={group.monthKey} className="mb-8">
              {/* Month heading */}
              <div
                className="flex items-center gap-3 mb-3"
                style={{ borderBottom: '1px solid #141414', paddingBottom: 10 }}
              >
                <p className="text-[9px] font-medium tracking-[.24em] uppercase" style={{ color: '#c9a96e' }}>
                  {group.label}
                </p>
                <span className="text-[9px]" style={{ color: '#252525' }}>
                  {group.evs.length} posts
                </span>
              </div>

              {/* Event rows */}
              <div style={{ border: '1px solid #141414' }}>
                {group.evs.map((ev, i) => {
                  const platCfg  = PLAT[ev.platform] ?? PLAT.ig
                  const statusColor = ev.pipelineStatus
                    ? (PIPELINE_STATUS_COLOR[ev.pipelineStatus] ?? '#555')
                    : '#2a2a2a'

                  return (
                    <div
                      key={ev.id}
                      className="flex items-center gap-4 px-4 py-3"
                      style={{
                        borderBottom: i < group.evs.length - 1 ? '1px solid #0e0e0e' : 'none',
                        background: i % 2 === 0 ? '#060606' : '#070707',
                        borderLeft: `3px solid ${platCfg.color}`,
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#060606' : '#070707')}
                    >
                      {/* Date */}
                      <div style={{ minWidth: 80 }}>
                        <p className="text-[10px] font-medium" style={{ color: '#c9a96e' }}>
                          {new Date(ev.eventDate + 'T12:00:00').toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric',
                          })}
                        </p>
                        <p className="text-[9px]" style={{ color: '#252525' }}>
                          {ev.postTime !== '—' ? ev.postTime : ''}
                        </p>
                      </div>

                      {/* Platform badge */}
                      <PlatBadge platform={ev.platform} small />

                      {/* Title */}
                      <p
                        className="flex-1 text-[12px] font-light overflow-hidden"
                        style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                        title={ev.title}
                      >
                        {ev.title}
                      </p>

                      {/* Content type */}
                      <span
                        className="text-[8px] font-medium tracking-[.1em] uppercase px-2 py-0.5 hidden sm:inline"
                        style={{ color: '#444', background: '#0d0d0d', border: '1px solid #1a1a1a', whiteSpace: 'nowrap' }}
                      >
                        {ev.contentType !== '—' ? ev.contentType : '—'}
                      </span>

                      {/* Post ID */}
                      <span
                        className="text-[10px] font-light"
                        style={{ fontFamily: 'monospace', color: '#333', minWidth: 50 }}
                      >
                        {ev.postId}
                      </span>

                      {/* Pipeline status */}
                      {ev.pipelineStatus && (
                        <span
                          className="text-[8px] font-medium tracking-[.1em] uppercase"
                          style={{ color: statusColor, minWidth: 64, textAlign: 'right' }}
                        >
                          {ev.pipelineStatus}
                        </span>
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
