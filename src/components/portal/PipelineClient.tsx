'use client'

import { useState, useMemo } from 'react'
import { updatePipelineStatus } from '@/app/(dashboard)/pipeline/actions'
import type { PipelineItem } from '@/app/(dashboard)/pipeline/page'

// ── Constants ──────────────────────────────────────────────────────────────

const ALL_STATUSES = [
  'SCRIPTED', 'PLANNED', 'FILMING', 'EDITING',
  'REVIEWING', 'SCHEDULED', 'POSTED', 'CANCELLED',
] as const

const STATUS_CFG: Record<string, { color: string; bg: string; border: string }> = {
  SCRIPTED:  { color: '#c9a96e', bg: 'rgba(201,169,110,.12)', border: 'rgba(201,169,110,.35)' },
  PLANNED:   { color: '#4cc9ff', bg: 'rgba(76,201,255,.10)',  border: 'rgba(76,201,255,.30)'  },
  FILMING:   { color: '#fbbf24', bg: 'rgba(251,191,36,.10)',  border: 'rgba(251,191,36,.30)'  },
  EDITING:   { color: '#a78bfa', bg: 'rgba(167,139,250,.10)', border: 'rgba(167,139,250,.30)' },
  REVIEWING: { color: '#ff3b5f', bg: 'rgba(255,59,95,.10)',   border: 'rgba(255,59,95,.30)'   },
  SCHEDULED: { color: '#4cc9ff', bg: 'rgba(76,201,255,.10)',  border: 'rgba(76,201,255,.30)'  },
  POSTED:    { color: '#39ff88', bg: 'rgba(57,255,136,.10)',  border: 'rgba(57,255,136,.30)'  },
  CANCELLED: { color: '#444',    bg: 'rgba(100,100,100,.08)', border: '#2a2a2a'                },
}

// Priority → left border + row tint
const PRIORITY_CFG: Record<number, { stripe: string; row: string }> = {
  1: { stripe: '#ff3b5f', row: 'rgba(255,59,95,.04)'    }, // urgent / reviewing
  2: { stripe: '#fbbf24', row: 'rgba(251,191,36,.035)'  },
  3: { stripe: '#fbbf24', row: 'rgba(251,191,36,.035)'  },
  4: { stripe: '#4cc9ff', row: 'rgba(76,201,255,.03)'   },
  5: { stripe: '#4cc9ff', row: 'rgba(76,201,255,.03)'   },
  6: { stripe: '#39ff88', row: 'rgba(57,255,136,.025)'  }, // posted / done
}

const PLAT_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ig: { label: 'IG', color: '#c9a96e', bg: 'rgba(201,169,110,.1)' },
  tt: { label: 'TT', color: '#a78bfa', bg: 'rgba(167,139,250,.1)' },
  yt: { label: 'YT', color: '#4cc9ff', bg: 'rgba(76,201,255,.1)'  },
}

const ACTIVE_STATUSES = new Set(['SCRIPTED','PLANNED','FILMING','EDITING','REVIEWING','SCHEDULED'])

type SortKey = 'priority' | 'status' | 'pillar' | 'week' | 'title'
type FilterKey = 'ALL' | 'ACTIVE' | string  // status or 'ALL' or 'ACTIVE'

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.CANCELLED
  return (
    <span
      className="text-[7px] font-medium tracking-[.12em] uppercase px-2 py-0.5"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {status}
    </span>
  )
}

function PlatBadge({ plat }: { plat: string }) {
  const cfg = PLAT_CFG[plat] ?? { label: plat.toUpperCase(), color: '#555', bg: '#0d0d0d' }
  return (
    <span
      className="text-[7px] font-medium tracking-[.1em] uppercase px-1.5 py-0.5 mr-0.5"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30` }}
    >
      {cfg.label}
    </span>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export function PipelineClient({ initialItems }: { initialItems: PipelineItem[] }) {
  const [items,      setItems     ] = useState<PipelineItem[]>(initialItems)
  const [filter,     setFilter    ] = useState<FilterKey>('ACTIVE')
  const [platFilter, setPlatFilter] = useState<string>('all')
  const [pillarFilter, setPillarFilter] = useState<string>('All')
  const [search,     setSearch    ] = useState('')
  const [sortKey,    setSortKey   ] = useState<SortKey>('priority')
  const [sortDir,    setSortDir   ] = useState<'asc' | 'desc'>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pendingId,  setPendingId ] = useState<string | null>(null)
  const [saveError,  setSaveError ] = useState<string | null>(null)

  // Phase counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: items.length, ACTIVE: 0 }
    for (const item of items) {
      c[item.status] = (c[item.status] ?? 0) + 1
      if (ACTIVE_STATUSES.has(item.status)) c.ACTIVE++
    }
    return c
  }, [items])

  // Distinct pillars
  const pillars = useMemo(
    () => ['All', ...Array.from(new Set(items.map(i => i.pillar).filter(Boolean))).sort()],
    [items],
  )

  // Filtered + sorted rows
  const rows = useMemo(() => {
    let out = items.slice()

    // Status filter
    if (filter === 'ACTIVE') out = out.filter(i => ACTIVE_STATUSES.has(i.status))
    else if (filter !== 'ALL') out = out.filter(i => i.status === filter)

    // Platform filter
    if (platFilter !== 'all') out = out.filter(i => i.platform.includes(platFilter))

    // Pillar filter
    if (pillarFilter !== 'All') out = out.filter(i => i.pillar === pillarFilter)

    // Search
    const q = search.toLowerCase().trim()
    if (q) {
      out = out.filter(i =>
        [i.postId, i.title, i.pillar, i.week, i.notes ?? '', i.status]
          .join(' ').toLowerCase().includes(q),
      )
    }

    // Sort
    out.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'priority') {
        cmp = a.priority - b.priority
      } else {
        const av = a[sortKey as keyof PipelineItem] ?? ''
        const bv = b[sortKey as keyof PipelineItem] ?? ''
        cmp = String(av).localeCompare(String(bv))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return out
  }, [items, filter, platFilter, pillarFilter, search, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'priority' ? 'asc' : 'asc') }
  }

  async function handleStatusChange(item: PipelineItem, newStatus: string) {
    if (pendingId) return
    const oldStatus = item.status
    setSaveError(null)
    setPendingId(item.id)

    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i))

    const result = await updatePipelineStatus(item.id, newStatus)

    if (result?.error) {
      // Revert
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: oldStatus } : i))
      setSaveError(`Failed to save: ${result.error}`)
    }

    setPendingId(null)
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  // Sort arrow
  const arrow = (key: SortKey) =>
    sortKey === key
      ? sortDir === 'asc' ? ' ↑' : ' ↓'
      : ' ↕'

  // Phase card data
  const phaseCards: { key: FilterKey; label: string; color: string }[] = [
    { key: 'ACTIVE',    label: 'Active',    color: '#c9a96e' },
    { key: 'SCRIPTED',  label: 'Scripted',  color: STATUS_CFG.SCRIPTED.color },
    { key: 'PLANNED',   label: 'Planned',   color: STATUS_CFG.PLANNED.color  },
    { key: 'FILMING',   label: 'Filming',   color: STATUS_CFG.FILMING.color  },
    { key: 'REVIEWING', label: 'Reviewing', color: STATUS_CFG.REVIEWING.color },
    { key: 'POSTED',    label: 'Posted',    color: STATUS_CFG.POSTED.color   },
    { key: 'ALL',       label: 'All',       color: '#444' },
  ]

  return (
    <div>

      {/* ── Phase cards ──────────────────────────────────────────── */}
      <div
        className="grid gap-px mb-6"
        style={{
          gridTemplateColumns: `repeat(${phaseCards.length}, 1fr)`,
          background: '#141414',
        }}
      >
        {phaseCards.map(pc => {
          const active = filter === pc.key
          const count  = counts[pc.key] ?? 0
          return (
            <button
              key={pc.key}
              onClick={() => setFilter(pc.key)}
              className="flex flex-col items-center py-3 px-2 transition-colors"
              style={{
                background: active ? 'rgba(201,169,110,.06)' : '#0a0a0a',
                borderBottom: active ? `2px solid ${pc.color}` : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              <span
                className="font-jakarta font-light mb-1"
                style={{ fontSize: 22, color: active ? pc.color : '#2a2a2a', lineHeight: 1 }}
              >
                {count}
              </span>
              <span
                className="text-[7px] font-medium tracking-[.14em] uppercase"
                style={{ color: active ? pc.color : '#2a2a2a' }}
              >
                {pc.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Filter row ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Platform */}
        <div className="flex gap-1">
          {['all', 'ig', 'tt', 'yt'].map(p => (
            <button
              key={p}
              onClick={() => setPlatFilter(p)}
              className="text-[9px] font-medium tracking-[.16em] uppercase px-3 py-1.5 transition-colors"
              style={{
                color:      platFilter === p ? '#c9a96e' : '#333',
                background: platFilter === p ? 'rgba(201,169,110,.07)' : 'transparent',
                border:     `1px solid ${platFilter === p ? 'rgba(201,169,110,.4)' : '#1a1a1a'}`,
                cursor: 'pointer',
              }}
            >
              {p === 'all' ? 'All Platforms' : p.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search title, ID, pillar, week…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-[11px] outline-none"
          style={{
            background: '#080808',
            border: '1px solid #1a1a1a',
            color: '#f2ede4',
            fontFamily: 'DM Sans, sans-serif',
            maxWidth: 320,
          }}
          onFocus={e  => (e.target.style.borderColor = '#c9a96e')}
          onBlur={e   => (e.target.style.borderColor = '#1a1a1a')}
        />

        {/* Row count */}
        <p className="ml-auto text-[9px] tracking-[.14em] uppercase" style={{ color: '#252525' }}>
          {rows.length} of {items.length} items
        </p>
      </div>

      {/* ── Pillar filter ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <span className="text-[8px] tracking-[.18em] uppercase self-center mr-1" style={{ color: '#252525' }}>
          Pillar
        </span>
        {pillars.map(p => (
          <button
            key={p}
            onClick={() => setPillarFilter(p)}
            className="text-[8px] font-medium tracking-[.12em] uppercase px-2.5 py-1 transition-colors"
            style={{
              color:      pillarFilter === p ? '#c9a96e' : '#333',
              background: pillarFilter === p ? 'rgba(201,169,110,.08)' : 'transparent',
              border:     `1px solid ${pillarFilter === p ? 'rgba(201,169,110,.35)' : '#1a1a1a'}`,
              cursor: 'pointer',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Save error */}
      {saveError && (
        <p
          className="text-[11px] px-4 py-2 mb-4"
          style={{ color: '#ff3b5f', background: 'rgba(255,59,95,.06)', border: '1px solid rgba(255,59,95,.2)' }}
        >
          {saveError}
        </p>
      )}

      {/* ── Table ────────────────────────────────────────────────── */}
      <div style={{ border: '1px solid #141414', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
              {/* Priority stripe column header */}
              <th style={{ width: 4, padding: 0 }} />
              <th
                className="text-left px-3 py-3 text-[8px] font-medium tracking-[.16em] uppercase select-none"
                style={{ color: '#2a2a2a', whiteSpace: 'nowrap', width: 76 }}
              >
                ID
              </th>
              <th
                onClick={() => toggleSort('title')}
                className="text-left px-3 py-3 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                style={{ color: sortKey === 'title' ? '#c9a96e' : '#2a2a2a' }}
              >
                Title{arrow('title')}
              </th>
              <th
                className="text-left px-3 py-3 text-[8px] font-medium tracking-[.16em] uppercase"
                style={{ color: '#2a2a2a', whiteSpace: 'nowrap', width: 90 }}
              >
                Platform
              </th>
              <th
                onClick={() => toggleSort('pillar')}
                className="text-left px-3 py-3 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                style={{ color: sortKey === 'pillar' ? '#c9a96e' : '#2a2a2a', whiteSpace: 'nowrap', width: 140 }}
              >
                Pillar{arrow('pillar')}
              </th>
              <th
                onClick={() => toggleSort('week')}
                className="text-left px-3 py-3 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                style={{ color: sortKey === 'week' ? '#c9a96e' : '#2a2a2a', whiteSpace: 'nowrap', width: 110 }}
              >
                Week{arrow('week')}
              </th>
              <th
                onClick={() => toggleSort('priority')}
                className="text-left px-3 py-3 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                style={{ color: sortKey === 'priority' ? '#c9a96e' : '#2a2a2a', whiteSpace: 'nowrap', width: 60 }}
              >
                Pri{arrow('priority')}
              </th>
              <th
                onClick={() => toggleSort('status')}
                className="text-left px-3 py-3 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                style={{ color: sortKey === 'status' ? '#c9a96e' : '#2a2a2a', whiteSpace: 'nowrap', width: 160 }}
              >
                Status{arrow('status')}
              </th>
              <th
                className="text-left px-3 py-3 text-[8px] font-medium tracking-[.16em] uppercase"
                style={{ color: '#2a2a2a', whiteSpace: 'nowrap', width: 70 }}
              >
                Script
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-16 text-[11px]" style={{ color: '#2a2a2a' }}>
                  No pipeline items match this filter.
                </td>
              </tr>
            ) : (
              rows.map(item => {
                const pCfg      = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG[4]
                const isPending = pendingId === item.id
                const isExpanded = expandedId === item.id
                const hasScript = !!item.scriptContent

                return (
                  <>
                    <tr
                      key={item.id}
                      style={{
                        background:   pCfg.row,
                        borderBottom: '1px solid #0e0e0e',
                        opacity: isPending ? 0.6 : 1,
                        transition: 'opacity .2s, background .15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
                      onMouseLeave={e => (e.currentTarget.style.background = pCfg.row)}
                    >
                      {/* Priority stripe */}
                      <td
                        style={{
                          width: 4, padding: 0,
                          background: pCfg.stripe,
                        }}
                      />

                      {/* ID */}
                      <td className="px-3 py-3">
                        <span
                          className="text-[10px] font-medium"
                          style={{ fontFamily: 'monospace', color: '#c9a96e' }}
                        >
                          {item.postId}
                        </span>
                      </td>

                      {/* Title */}
                      <td className="px-3 py-3" style={{ maxWidth: 260 }}>
                        <span
                          className="text-[12px] font-light block overflow-hidden"
                          style={{
                            color: '#f2ede4',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            maxWidth: 260,
                          }}
                          title={item.title}
                        >
                          {item.title}
                        </span>
                      </td>

                      {/* Platform */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-0.5">
                          {item.platform.map(p => <PlatBadge key={p} plat={p} />)}
                        </div>
                      </td>

                      {/* Pillar */}
                      <td className="px-3 py-3">
                        <span
                          className="text-[8px] font-medium tracking-[.1em] uppercase px-2 py-1"
                          style={{ color: '#555', background: '#0d0d0d', border: '1px solid #1a1a1a', whiteSpace: 'nowrap' }}
                        >
                          {item.pillar}
                        </span>
                      </td>

                      {/* Week */}
                      <td className="px-3 py-3 text-[11px] font-light" style={{ color: '#444', whiteSpace: 'nowrap' }}>
                        {item.week}
                      </td>

                      {/* Priority number */}
                      <td className="px-3 py-3 text-center">
                        <span
                          className="text-[11px] font-medium"
                          style={{ color: pCfg.stripe }}
                        >
                          {item.priority}
                        </span>
                      </td>

                      {/* Status dropdown */}
                      <td className="px-3 py-3">
                        <select
                          value={item.status}
                          disabled={isPending}
                          onChange={e => handleStatusChange(item, e.target.value)}
                          className="text-[9px] font-medium tracking-[.1em] uppercase outline-none"
                          style={{
                            background: '#080808',
                            border: `1px solid ${STATUS_CFG[item.status]?.border ?? '#1a1a1a'}`,
                            color: STATUS_CFG[item.status]?.color ?? '#555',
                            padding: '4px 8px',
                            cursor: isPending ? 'not-allowed' : 'pointer',
                            fontFamily: 'DM Sans, sans-serif',
                            appearance: 'none',
                            width: '100%',
                          }}
                        >
                          {ALL_STATUSES.map(s => (
                            <option key={s} value={s} style={{ background: '#0a0a0a', color: '#f2ede4' }}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Script */}
                      <td className="px-3 py-3 text-center">
                        {hasScript ? (
                          <button
                            onClick={() => toggleExpand(item.id)}
                            className="text-[8px] font-medium tracking-[.12em] uppercase px-2 py-1 transition-colors"
                            style={{
                              color:      isExpanded ? '#c9a96e' : '#444',
                              background: isExpanded ? 'rgba(201,169,110,.08)' : 'transparent',
                              border:     `1px solid ${isExpanded ? 'rgba(201,169,110,.4)' : '#1a1a1a'}`,
                              cursor: 'pointer',
                            }}
                          >
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        ) : (
                          <span style={{ color: '#1e1e1e', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>

                    {/* Script expand row */}
                    {isExpanded && hasScript && (
                      <tr key={`${item.id}-script`}>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <div
                            style={{
                              background: '#070707',
                              borderBottom: '1px solid #141414',
                              padding: '20px 24px 20px 28px',
                              borderLeft: `3px solid ${STATUS_CFG.SCRIPTED.color}`,
                            }}
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <StatusBadge status="SCRIPTED" />
                              <span className="text-[10px] font-light" style={{ color: '#444' }}>
                                {item.postId} · {item.title}
                              </span>
                            </div>
                            <pre
                              className="text-[12px] font-light leading-relaxed"
                              style={{
                                color: '#888',
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'DM Sans, sans-serif',
                                maxWidth: 720,
                              }}
                            >
                              {item.scriptContent}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Priority legend */}
      <div className="flex flex-wrap gap-4 mt-3">
        {[
          { label: 'Urgent / Reviewing', color: '#ff3b5f' },
          { label: 'High Priority',      color: '#fbbf24' },
          { label: 'Planned',            color: '#4cc9ff' },
          { label: 'Done / Posted',      color: '#39ff88' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, background: color, opacity: .7, display: 'block', flexShrink: 0 }} />
            <span className="text-[8px] tracking-[.12em] uppercase" style={{ color: '#252525' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

    </div>
  )
}
