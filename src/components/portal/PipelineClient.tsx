'use client'

import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { updatePipelineItem, deletePipelineItem, linkYouTubeVideo } from '@/app/(dashboard)/edit-actions'
import type { PipelineItem } from '@/app/(dashboard)/pipeline/page'
import { usePortalFilters, filterByPlatform, filterByScope } from '@/hooks/usePortalFilters'
import { Paginator } from '@/components/portal/Paginator'
import { PlatformPills, ScopeDropdown } from '@/components/portal/FilterBar'
import { EmptyState } from '@/components/portal/EmptyState'

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

const PRIORITY_CFG: Record<number, { stripe: string; row: string }> = {
  1: { stripe: '#ff3b5f', row: 'rgba(255,59,95,.04)'    },
  2: { stripe: '#fbbf24', row: 'rgba(251,191,36,.035)'  },
  3: { stripe: '#fbbf24', row: 'rgba(251,191,36,.035)'  },
  4: { stripe: '#4cc9ff', row: 'rgba(76,201,255,.03)'   },
  5: { stripe: '#4cc9ff', row: 'rgba(76,201,255,.03)'   },
  6: { stripe: '#39ff88', row: 'rgba(57,255,136,.025)'  },
}

const PLAT_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ig: { label: 'IG', color: '#c9a96e', bg: 'rgba(201,169,110,.1)' },
  tt: { label: 'TT', color: '#a78bfa', bg: 'rgba(167,139,250,.1)' },
  yt: { label: 'YT', color: '#4cc9ff', bg: 'rgba(76,201,255,.1)'  },
}

const ACTIVE_STATUSES = new Set(['SCRIPTED','PLANNED','FILMING','EDITING','REVIEWING','SCHEDULED'])

type SortKey = 'priority' | 'status' | 'pillar' | 'week' | 'title'
type FilterKey = 'ALL' | 'ACTIVE' | string
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ── YT Link Modal ──────────────────────────────────────────────────────────

function YTIcon({ size = 12, color = '#4cc9ff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M23.5 6.2s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.6 2 12 2 12 2s-4.6 0-7.3.1c-.6.1-1.9.1-3 1.3C.8 4.2.5 6.2.5 6.2S.2 8.5.2 10.8v2.1c0 2.3.3 4.6.3 4.6s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.2 21.7 12 21.8 12 21.8s4.6 0 7.3-.2c.6-.1 1.9-.1 3-1.2.9-.8 1.2-2.8 1.2-2.8s.3-2.3.3-4.6v-2.1C23.8 8.5 23.5 6.2 23.5 6.2zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z"/>
    </svg>
  )
}

function YTLinkModal({
  item,
  onClose,
  onLinked,
}: {
  item: PipelineItem
  onClose: () => void
  onLinked: (ytId: string) => void
}) {
  const [input, setInput]     = useState(item.ytId ?? '')
  const [saving, setSaving]   = useState(false)
  const [errMsg, setErrMsg]   = useState('')

  async function handleSave() {
    const val = input.trim()
    if (!val) return
    setSaving(true)
    setErrMsg('')
    const result = await linkYouTubeVideo(item.postId, val)
    setSaving(false)
    if (result.error) { setErrMsg(result.error); return }
    onLinked(result.ytId!)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0a0a0a', border: '1px solid #1e1e1e',
          borderTop: '2px solid #4cc9ff', padding: '28px 32px', width: 420, maxWidth: '90vw',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', color: '#4cc9ff', marginBottom: 4 }}>
            Link YouTube Video
          </p>
          <p style={{ fontSize: 13, color: '#f2ede4', fontWeight: 300 }}>{item.title}</p>
          <p style={{ fontSize: 10, color: '#c9a96e', fontFamily: 'monospace', marginTop: 2 }}>{item.postId}</p>
        </div>

        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: '#2a2a2a', marginBottom: 6 }}>
            YouTube URL or Video ID
          </p>
          <input
            autoFocus
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="https://youtu.be/abc123XYZ89 or abc123XYZ89"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{
              width: '100%', background: '#080808', border: '1px solid #1e1e1e',
              color: '#f2ede4', padding: '8px 10px', fontSize: 12,
              fontFamily: "'DM Sans', sans-serif", outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = '#4cc9ff' }}
            onBlur={e =>  { e.target.style.borderColor = '#1e1e1e' }}
          />
          {errMsg && (
            <p style={{ fontSize: 10, color: '#ff3b5f', marginTop: 5 }}>{errMsg}</p>
          )}
        </div>

        {item.ytId && (
          <p style={{ fontSize: 9, color: '#2a2a2a', marginBottom: 16 }}>
            Currently linked: <span style={{ color: '#4cc9ff', fontFamily: 'monospace' }}>{item.ytId}</span>
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid #1e1e1e', color: '#333', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!input.trim() || saving}
            style={{
              padding: '7px 20px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
              background: 'rgba(76,201,255,.1)', border: '1px solid rgba(76,201,255,.4)',
              color: '#4cc9ff', cursor: saving ? 'wait' : 'pointer',
              opacity: !input.trim() ? 0.4 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Link Video'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDisplayId(postId: string, platform: string[]): string {
  if (/^#(ig|tt|yt|LF)\d+$/i.test(postId)) return postId
  const numMatch = postId.match(/^#?(\d+)$/)
  if (!numMatch) return postId
  const plat = platform[0] ?? 'ig'
  const prefix = plat === 'yt' ? 'yt' : plat === 'tt' ? 'tt' : 'ig'
  return `#${prefix}${numMatch[1].padStart(4, '0')}`
}

// Convert ISO/UTC string → datetime-local input value (local time)
function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nowLocal(): string {
  const d = new Date()
  d.setSeconds(0, 0)
  return isoToLocal(d.toISOString())
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

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

function SaveDot({ state }: { state: SaveState }) {
  const color = state === 'saving' ? '#fbbf24' : state === 'saved' ? '#39ff88' : state === 'error' ? '#ff3b5f' : 'transparent'
  return (
    <span
      style={{
        display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
        background: color, marginLeft: 4, flexShrink: 0, transition: 'background .2s',
      }}
      title={state === 'error' ? 'Save failed' : state === 'saved' ? 'Saved' : ''}
    />
  )
}

// ── Edit Panel ─────────────────────────────────────────────────────────────

function ItemEditPanel({
  item,
  onUpdate,
  onDelete,
  onClose,
}: {
  item: PipelineItem
  onUpdate: (id: string, patch: Partial<PipelineItem>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [title,       setTitle      ] = useState(item.title)
  const [status,      setStatus     ] = useState(item.status)
  const [priority,    setPriority   ] = useState(String(item.priority))
  const [pillar,      setPillar     ] = useState(item.pillar)
  const [week,        setWeek       ] = useState(item.week)
  const [platform,    setPlatform   ] = useState<string[]>(item.platform)
  const [script,      setScript     ] = useState(item.scriptContent ?? '')
  const [postedAtLocal, setPostedAtLocal] = useState<string>(() => isoToLocal(item.postedAt) || nowLocal())
  const [deleting, setDeleting] = useState(false)

  // Smart date popup state
  const [dateModal,     setDateModal    ] = useState(false)
  const [pendingStatus, setPendingStatus] = useState('')
  const [modalPlatforms,setModalPlatforms] = useState<string[]>(item.platform.length ? item.platform : ['ig'])
  const [modalDate,     setModalDate    ] = useState(() => isoToLocal(item.postedAt) || nowLocal())

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [states, setStates] = useState<Record<string, SaveState>>({})

  function fieldState(f: string): SaveState { return states[f] ?? 'idle' }

  function schedule(dbField: string, value: unknown, uiPatch: Partial<PipelineItem>) {
    clearTimeout(timers.current[dbField])
    setStates(s => ({ ...s, [dbField]: 'idle' }))
    timers.current[dbField] = setTimeout(async () => {
      setStates(s => ({ ...s, [dbField]: 'saving' }))
      const result = await updatePipelineItem(item.id, { [dbField]: value })
      if (result.error) {
        setStates(s => ({ ...s, [dbField]: 'error' }))
      } else {
        onUpdate(item.id, uiPatch)
        setStates(s => ({ ...s, [dbField]: 'saved' }))
        setTimeout(() => setStates(s => ({ ...s, [dbField]: 'idle' })), 1500)
      }
    }, 2000)
  }

  function scheduleImmediate(dbField: string, value: unknown, uiPatch: Partial<PipelineItem>) {
    clearTimeout(timers.current[dbField])
    setStates(s => ({ ...s, [dbField]: 'saving' }))
    setTimeout(async () => {
      const result = await updatePipelineItem(item.id, { [dbField]: value })
      if (result.error) {
        setStates(s => ({ ...s, [dbField]: 'error' }))
      } else {
        onUpdate(item.id, uiPatch)
        setStates(s => ({ ...s, [dbField]: 'saved' }))
        setTimeout(() => setStates(s => ({ ...s, [dbField]: 'idle' })), 1500)
      }
    }, 0)
  }

  async function handleDelete() {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    setDeleting(true)
    const result = await deletePipelineItem(item.id)
    if (result.error) { alert(`Error: ${result.error}`); setDeleting(false); return }
    onDelete(item.id)
  }

  function togglePlatform(p: string) {
    const next = platform.includes(p) ? platform.filter(x => x !== p) : [...platform, p]
    setPlatform(next)
    scheduleImmediate('platform', next, { platform: next })
  }

  // When the user picks a posted datetime, auto-adjust status and sync calendar
  function applyPostedAt(localVal: string) {
    setPostedAtLocal(localVal)
    if (!localVal) return
    const iso = new Date(localVal).toISOString()
    const isFuture = new Date(localVal) > new Date()

    // Auto-flip status: future → SCHEDULED, past → POSTED
    const targetStatus = isFuture ? 'SCHEDULED' : 'POSTED'
    if (targetStatus !== status) {
      setStatus(targetStatus)
      // Save both status + posted_at in one batch to keep UI snappy
      clearTimeout(timers.current['posted_at'])
      setStates(s => ({ ...s, posted_at: 'saving', status: 'saving' }))
      setTimeout(async () => {
        const r1 = await updatePipelineItem(item.id, { status: targetStatus, posted_at: iso })
        if (r1.error) {
          setStates(s => ({ ...s, posted_at: 'error', status: 'error' }))
        } else {
          onUpdate(item.id, { status: targetStatus, postedAt: iso })
          setStates(s => ({ ...s, posted_at: 'saved', status: 'saved' }))
          setTimeout(() => setStates(s => ({ ...s, posted_at: 'idle', status: 'idle' })), 1500)
        }
      }, 0)
    } else {
      scheduleImmediate('posted_at', iso, { postedAt: iso })
    }
  }

  const showDatePicker = status === 'POSTED' || status === 'SCHEDULED'
  const dateIsFuture = postedAtLocal ? new Date(postedAtLocal) > new Date() : false

  const inputStyle = {
    background: '#080808',
    border: '1px solid #1e1e1e',
    color: '#f2ede4',
    padding: '5px 8px',
    fontSize: 11,
    fontFamily: 'DM Sans, sans-serif',
    outline: 'none',
    width: '100%',
  }

  const labelStyle = {
    fontSize: 7,
    fontWeight: 600,
    letterSpacing: '.16em',
    textTransform: 'uppercase' as const,
    color: '#2a2a2a',
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    marginBottom: 4,
  }

  return (
    <div
      style={{
        background: '#070707',
        borderBottom: '1px solid #141414',
        borderLeft: '3px solid #c9a96e',
        padding: '28px 32px',
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <span className="text-[9px] font-medium tracking-[.2em] uppercase" style={{ color: '#c9a96e' }}>
          Editing · {formatDisplayId(item.postId, item.platform)}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              fontSize: 9, padding: '3px 10px', cursor: 'pointer',
              color: '#ff3b5f', background: 'rgba(255,59,95,.06)',
              border: '1px solid rgba(255,59,95,.2)',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button
            onClick={onClose}
            style={{
              fontSize: 9, padding: '3px 10px', cursor: 'pointer',
              color: '#444', background: 'transparent', border: '1px solid #1e1e1e',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>

        {/* Title */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>
            Title <SaveDot state={fieldState('title')} />
          </label>
          <input
            style={inputStyle}
            value={title}
            onChange={e => { setTitle(e.target.value); schedule('title', e.target.value, { title: e.target.value }) }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
          />
        </div>

        {/* Status */}
        <div>
          <label style={labelStyle}>
            Status <SaveDot state={fieldState('status')} />
          </label>
          <select
            style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}
            value={status}
            onChange={e => {
              const next = e.target.value
              const needsDatePrompt =
                (next === 'POSTED' || next === 'SCRIPTED') &&
                !item.scheduledDate && !item.postedAt
              if (needsDatePrompt) {
                setPendingStatus(next)
                setModalPlatforms(platform.length ? [...platform] : ['ig'])
                setModalDate(nowLocal())
                setDateModal(true)
              } else {
                setStatus(next)
                scheduleImmediate('status', next, { status: next })
              }
            }}
          >
            {ALL_STATUSES.map(s => (
              <option key={s} value={s} style={{ background: '#0a0a0a' }}>{s}</option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label style={labelStyle}>
            Priority (1–6) <SaveDot state={fieldState('priority')} />
          </label>
          <input
            type="number"
            min={1} max={6}
            style={inputStyle}
            value={priority}
            onChange={e => {
              setPriority(e.target.value)
              const n = parseInt(e.target.value, 10)
              if (n >= 1 && n <= 6) schedule('priority', n, { priority: n })
            }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
          />
        </div>

        {/* Week */}
        <div>
          <label style={labelStyle}>
            Week <SaveDot state={fieldState('week')} />
          </label>
          <input
            style={inputStyle}
            value={week}
            onChange={e => { setWeek(e.target.value); schedule('week', e.target.value, { week: e.target.value }) }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
          />
        </div>

        {/* Pillar */}
        <div>
          <label style={labelStyle}>
            Pillar <SaveDot state={fieldState('pillar')} />
          </label>
          <input
            style={inputStyle}
            value={pillar}
            onChange={e => { setPillar(e.target.value); schedule('pillar', e.target.value, { pillar: e.target.value }) }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
          />
        </div>

        {/* Platform */}
        <div>
          <label style={labelStyle}>
            Platform <SaveDot state={fieldState('platform')} />
          </label>
          <div className="flex gap-2 mt-1">
            {(['ig', 'tt', 'yt'] as const).map(p => {
              const cfg = PLAT_CFG[p]
              const on  = platform.includes(p)
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  style={{
                    padding: '4px 10px', cursor: 'pointer', fontSize: 9,
                    color:      on ? cfg.color : '#333',
                    background: on ? cfg.bg : 'transparent',
                    border:     `1px solid ${on ? cfg.color + '60' : '#1e1e1e'}`,
                    fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
                  }}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Posted / Scheduled datetime picker ── */}
        {showDatePicker && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div
              style={{
                background: '#050505',
                border: `1px solid ${dateIsFuture ? 'rgba(76,201,255,.25)' : 'rgba(57,255,136,.2)'}`,
                borderLeft: `3px solid ${dateIsFuture ? '#4cc9ff' : '#39ff88'}`,
                padding: '14px 16px',
              }}
            >
              <label style={{ ...labelStyle, color: dateIsFuture ? '#4cc9ff' : '#39ff88' }}>
                {dateIsFuture ? 'Scheduled For' : 'Posted On'}
                <SaveDot state={fieldState('posted_at')} />
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="datetime-local"
                  style={{ ...inputStyle, width: 'auto', flex: 1, maxWidth: 240 }}
                  value={postedAtLocal}
                  onChange={e => applyPostedAt(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = dateIsFuture ? '#4cc9ff' : '#39ff88')}
                  onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
                />
                <span style={{ fontSize: 9, color: '#333', whiteSpace: 'nowrap' }}>
                  {dateIsFuture
                    ? '↑ status auto-set to SCHEDULED'
                    : '↑ status auto-set to POSTED'}
                </span>
              </div>
              <p style={{ fontSize: 9, color: '#252525', marginTop: 6, lineHeight: 1.5 }}>
                Future date → SCHEDULED · Past date → POSTED · Synced to calendar automatically
              </p>
            </div>
          </div>
        )}

        {/* Script */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>
            Script <SaveDot state={fieldState('script_content')} />
          </label>
          <textarea
            style={{
              ...inputStyle,
              height: 140,
              resize: 'vertical',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
            value={script}
            onChange={e => {
              setScript(e.target.value)
              schedule('script_content', e.target.value || null, { scriptContent: e.target.value || null })
            }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
            placeholder="Script content…"
          />
        </div>

      </div>

      {/* ── Smart date popup ─────────────────────────────────────────────── */}
      {dateModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setDateModal(false) }}
        >
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #1e1e1e',
            borderTop: `3px solid ${pendingStatus === 'POSTED' ? '#39ff88' : '#c9a96e'}`,
            padding: '28px 32px',
            width: 380,
            maxWidth: '90vw',
          }}>
            <p style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: pendingStatus === 'POSTED' ? '#39ff88' : '#c9a96e', marginBottom: 4 }}>
              {pendingStatus}
            </p>
            <p style={{ fontSize: 13, color: '#f2ede4', marginBottom: 24, fontWeight: 300 }}>
              {pendingStatus === 'POSTED'
                ? 'When was this posted?'
                : 'When is this scheduled?'}
            </p>

            {/* Platform selection */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: '#2a2a2a', marginBottom: 8 }}>
                Platform
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['ig', 'tt', 'yt'] as const).map(p => {
                  const cfg = PLAT_CFG[p]
                  const on  = modalPlatforms.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setModalPlatforms(prev =>
                        prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                      )}
                      style={{
                        padding: '6px 14px', cursor: 'pointer', fontSize: 9,
                        color:      on ? cfg.color : '#333',
                        background: on ? cfg.bg : 'transparent',
                        border:     `1px solid ${on ? cfg.color + '60' : '#1e1e1e'}`,
                        fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
                        borderRadius: 3,
                      }}
                    >
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Date/time */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: '#2a2a2a', marginBottom: 8 }}>
                Date & Time
              </p>
              <input
                type="datetime-local"
                value={modalDate}
                onChange={e => setModalDate(e.target.value)}
                style={{
                  background: '#080808', border: '1px solid #1e1e1e',
                  color: '#f2ede4', padding: '7px 10px', fontSize: 12,
                  fontFamily: "'DM Sans', sans-serif", outline: 'none', width: '100%',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDateModal(false)}
                style={{
                  padding: '8px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                  background: 'transparent', border: '1px solid #1e1e1e', color: '#333', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDateModal(false)
                  if (!modalDate) return
                  const iso = new Date(modalDate).toISOString()
                  const finalStatus = pendingStatus === 'SCRIPTED'
                    ? 'SCRIPTED'
                    : new Date(modalDate) > new Date() ? 'SCHEDULED' : 'POSTED'
                  const update: Record<string, unknown> = {
                    status: finalStatus,
                    platform: modalPlatforms,
                  }
                  if (pendingStatus === 'SCRIPTED') {
                    update.scheduled_date = modalDate.slice(0, 10)
                  } else {
                    update.posted_at = iso
                  }
                  setStatus(finalStatus)
                  setPlatform(modalPlatforms)
                  if (pendingStatus !== 'SCRIPTED') setPostedAtLocal(modalDate)
                  setStates(s => ({ ...s, status: 'saving' }))
                  const result = await updatePipelineItem(item.id, update)
                  if (result.error) {
                    setStates(s => ({ ...s, status: 'error' }))
                  } else {
                    onUpdate(item.id, {
                      status: finalStatus,
                      platform: modalPlatforms,
                      ...(pendingStatus !== 'SCRIPTED' ? { postedAt: iso } : { scheduledDate: modalDate.slice(0, 10) }),
                    })
                    setStates(s => ({ ...s, status: 'saved' }))
                    setTimeout(() => setStates(s => ({ ...s, status: 'idle' })), 1500)
                  }
                }}
                style={{
                  padding: '8px 20px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                  background: pendingStatus === 'POSTED' ? 'rgba(57,255,136,.1)' : 'rgba(201,169,110,.1)',
                  border: `1px solid ${pendingStatus === 'POSTED' ? 'rgba(57,255,136,.4)' : 'rgba(201,169,110,.4)'}`,
                  color: pendingStatus === 'POSTED' ? '#39ff88' : '#c9a96e',
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export function PipelineClient({ initialItems }: { initialItems: PipelineItem[] }) {
  const searchParams = useSearchParams()
  const linkedItemId = searchParams.get('item')
  const [items,        setItems       ] = useState<PipelineItem[]>(initialItems)
  const [filter,  setFilter ] = useState<FilterKey>(() => (searchParams.get('phase') as FilterKey) ?? 'ACTIVE')
  const [search,  setSearch ] = useState('')
  const [sortKey,      setSortKey     ] = useState<SortKey>('priority')
  const [sortDir,      setSortDir     ] = useState<'asc' | 'desc'>('asc')
  const [editingId,    setEditingId   ] = useState<string | null>(null)
  const [hoveredId,    setHoveredId   ] = useState<string | null>(null)
  const [saveError,    setSaveError   ] = useState<string | null>(null)
  const [page,         setPage        ] = useState(1)
  const [ytLinkItem,   setYtLinkItem  ] = useState<PipelineItem | null>(null)

  const { platform, scope, from, to, setFilters } = usePortalFilters()

  useEffect(() => { setPage(1) }, [platform, scope, from, to, filter, search])

  // Phase counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: items.length, ACTIVE: 0 }
    for (const item of items) {
      c[item.status] = (c[item.status] ?? 0) + 1
      if (ACTIVE_STATUSES.has(item.status)) c.ACTIVE++
    }
    return c
  }, [items])

  // Filtered + sorted rows
  const rows = useMemo(() => {
    let out = items.slice()
    if (filter === 'ACTIVE') out = out.filter(i => ACTIVE_STATUSES.has(i.status))
    else if (filter !== 'ALL') out = out.filter(i => i.status === filter)
    // Global platform filter
    out = filterByPlatform(out, platform)
    // Global scope filter (by scheduledDate or postedAt or week derivation — use a helper date)
    if (scope !== 'all') {
      out = filterByScope(
        out.map(i => ({
          ...i,
          date: i.postedAt?.split('T')[0] ?? i.scheduledDate ?? '',
        })),
        scope, from, to,
      ).map(i => {
        const original = out.find(o => o.id === i.id)
        return original!
      })
    }
    const q = search.toLowerCase().trim()
    if (q) {
      out = out.filter(i =>
        [i.postId, i.title, i.pillar, i.week, i.notes ?? '', i.status].join(' ').toLowerCase().includes(q),
      )
    }
    out.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'priority') cmp = a.priority - b.priority
      else {
        const av = a[sortKey as keyof PipelineItem] ?? ''
        const bv = b[sortKey as keyof PipelineItem] ?? ''
        cmp = String(av).localeCompare(String(bv))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [items, filter, platform, scope, from, to, search, sortKey, sortDir])

  const pagedRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page])

  useEffect(() => {
    if (!linkedItemId) return
    const index = rows.findIndex(item => item.id === linkedItemId)
    if (index < 0) return
    queueMicrotask(() => {
      setEditingId(linkedItemId)
      setPage(Math.floor(index / PAGE_SIZE) + 1)
    })
  }, [linkedItemId, rows])

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  function handleUpdate(id: string, patch: Partial<PipelineItem>) {
    setSaveError(null)
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  function handleDelete(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    if (editingId === id) setEditingId(null)
  }

  function handleYtLinked(itemId: string, ytId: string) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ytId } : i))
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  if (initialItems.length === 0) {
    return (
      <EmptyState
        icon="pipeline"
        headline="No content in the pipeline yet."
        body="Your content manager will add upcoming videos here — check back soon."
      />
    )
  }

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

      {/* YT Link modal */}
      {ytLinkItem && (
        <YTLinkModal
          item={ytLinkItem}
          onClose={() => setYtLinkItem(null)}
          onLinked={ytId => handleYtLinked(ytLinkItem.id, ytId)}
        />
      )}

      {/* ── Phase cards ──────────────────────────────────────────── */}
      <div
        className="grid gap-px mb-8"
        style={{ gridTemplateColumns: `repeat(${phaseCards.length}, 1fr)`, background: '#141414' }}
      >
        {phaseCards.map(pc => {
          const active = filter === pc.key
          const count  = counts[pc.key] ?? 0
          return (
            <button
              key={pc.key}
              onClick={() => setFilter(pc.key)}
              className="flex flex-col items-center py-4 px-3 transition-colors"
              style={{
                background: active ? 'rgba(201,169,110,.06)' : '#0a0a0a',
                borderBottom: active ? `2px solid ${pc.color}` : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              <span
                className="font-jakarta font-light mb-1"
                style={{ fontSize: 26, color: active ? pc.color : '#2a2a2a', lineHeight: 1 }}
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

      {/* ── Platform pills ───────────────────────────────────────── */}
      <div className="mb-4">
        <PlatformPills
          platform={platform}
          onChange={p => setFilters({ platform: p })}
        />
      </div>

      {/* ── Search + scope ───────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search title, ID, pillar, week…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-1.5 text-[11px] outline-none"
          style={{
            background: '#080808', border: '1px solid #1a1a1a',
            color: '#f2ede4', fontFamily: 'DM Sans, sans-serif',
          }}
          onFocus={e => (e.target.style.borderColor = '#c9a96e')}
          onBlur={e  => (e.target.style.borderColor = '#1a1a1a')}
        />
        <ScopeDropdown
          scope={scope}
          onChange={s => setFilters({ scope: s })}
          compact
        />
      </div>

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
              <th style={{ width: 4, padding: 0 }} />
              <th className="text-left px-4 py-4 text-[8px] font-medium tracking-[.16em] uppercase select-none"
                  style={{ color: '#2a2a2a', whiteSpace: 'nowrap', width: 76 }}>ID</th>
              <th onClick={() => toggleSort('title')}
                  className="text-left px-4 py-4 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'title' ? '#c9a96e' : '#2a2a2a' }}>
                Title{arrow('title')}
              </th>
              <th className="text-left px-4 py-4 text-[8px] font-medium tracking-[.16em] uppercase"
                  style={{ color: '#2a2a2a', whiteSpace: 'nowrap', width: 90 }}>Platform</th>
              <th onClick={() => toggleSort('pillar')}
                  className="text-left px-4 py-4 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'pillar' ? '#c9a96e' : '#2a2a2a', whiteSpace: 'nowrap', width: 140 }}>
                Pillar{arrow('pillar')}
              </th>
              <th onClick={() => toggleSort('week')}
                  className="text-left px-4 py-4 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'week' ? '#c9a96e' : '#2a2a2a', whiteSpace: 'nowrap', width: 110 }}>
                Week{arrow('week')}
              </th>
              <th onClick={() => toggleSort('priority')}
                  className="text-left px-4 py-4 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'priority' ? '#c9a96e' : '#2a2a2a', whiteSpace: 'nowrap', width: 60 }}>
                Pri{arrow('priority')}
              </th>
              <th onClick={() => toggleSort('status')}
                  className="text-left px-4 py-4 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'status' ? '#c9a96e' : '#2a2a2a', whiteSpace: 'nowrap', width: 160 }}>
                Status{arrow('status')}
              </th>
              <th className="text-left px-4 py-4 text-[8px] font-medium tracking-[.16em] uppercase"
                  style={{ color: '#2a2a2a', width: 40 }}>YT</th>
              <th className="text-left px-4 py-4 text-[8px] font-medium tracking-[.16em] uppercase"
                  style={{ color: '#2a2a2a', width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-16 text-[11px]" style={{ color: '#2a2a2a' }}>
                  No pipeline items match this filter.
                </td>
              </tr>
            ) : (
              pagedRows.map(item => {
                const pCfg      = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG[4]
                const isEditing = editingId === item.id
                const isHovered = hoveredId === item.id

                return (
                  <Fragment key={item.id}>
                    <tr
                      style={{
                        background:   isEditing ? '#0d0d0d' : pCfg.row,
                        borderBottom: '1px solid #0e0e0e',
                        outline: isEditing ? '1px solid rgba(201,169,110,.2)' : 'none',
                        outlineOffset: -1,
                        transition: 'background .15s',
                        cursor: 'pointer',
                      }}
                      onClick={() => setEditingId(isEditing ? null : item.id)}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      {/* Priority stripe */}
                      <td style={{ width: 4, padding: 0, background: pCfg.stripe }} />

                      {/* ID */}
                      <td className="px-4 py-4">
                        <span className="text-[10px] font-medium" style={{ fontFamily: 'monospace', color: '#c9a96e' }}>
                          {formatDisplayId(item.postId, item.platform)}
                        </span>
                      </td>

                      {/* Title */}
                      <td className="px-4 py-4" style={{ maxWidth: 240 }}>
                        <span
                          className="text-[12px] font-light block overflow-hidden"
                          style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 240 }}
                          title={item.title}
                        >
                          {item.title}
                        </span>
                      </td>

                      {/* Platform */}
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-0.5">
                          {item.platform.map(p => <PlatBadge key={p} plat={p} />)}
                        </div>
                      </td>

                      {/* Pillar */}
                      <td className="px-4 py-4">
                        <span
                          className="text-[8px] font-medium tracking-[.1em] uppercase px-2 py-1"
                          style={{ color: '#555', background: '#0d0d0d', border: '1px solid #1a1a1a', whiteSpace: 'nowrap' }}
                        >
                          {item.pillar}
                        </span>
                      </td>

                      {/* Week */}
                      <td className="px-4 py-4 text-[11px] font-light" style={{ color: '#444', whiteSpace: 'nowrap' }}>
                        {item.week}
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-4 text-center">
                        <span className="text-[11px] font-medium" style={{ color: pCfg.stripe }}>
                          {item.priority}
                        </span>
                      </td>

                      {/* Status + optional posted/scheduled date */}
                      <td className="px-4 py-4">
                        <StatusBadge status={item.status} />
                        {item.postedAt && (item.status === 'POSTED' || item.status === 'SCHEDULED') && (
                          <div
                            className="text-[8px] font-light mt-1"
                            style={{ color: item.status === 'SCHEDULED' ? '#4cc9ff' : '#39ff88', opacity: 0.8 }}
                          >
                            {formatDateShort(item.postedAt)}
                          </div>
                        )}
                      </td>

                      {/* YT link indicator */}
                      <td className="px-3 py-4" onClick={e => e.stopPropagation()}>
                        {item.platform.includes('yt') || item.ytType != null ? (
                          <button
                            onClick={e => { e.stopPropagation(); setYtLinkItem(item) }}
                            title={item.ytId ? `Linked: ${item.ytId}` : 'Link YouTube video'}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 24, height: 24, cursor: 'pointer',
                              background: item.ytId ? 'rgba(76,201,255,.1)' : 'transparent',
                              border: `1px solid ${item.ytId ? 'rgba(76,201,255,.4)' : '#1e1e1e'}`,
                              borderRadius: 3,
                            }}
                          >
                            <YTIcon size={11} color={item.ytId ? '#4cc9ff' : '#2a2a2a'} />
                          </button>
                        ) : null}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4">
                        <div
                          className="flex gap-1.5"
                          style={{ opacity: (isHovered || isEditing) ? 1 : 0, transition: 'opacity .15s' }}
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); setEditingId(isEditing ? null : item.id) }}
                            style={{
                              fontSize: 10, padding: '2px 7px', cursor: 'pointer',
                              color: isEditing ? '#c9a96e' : '#555',
                              background: isEditing ? 'rgba(201,169,110,.08)' : 'transparent',
                              border: `1px solid ${isEditing ? 'rgba(201,169,110,.35)' : '#1e1e1e'}`,
                            }}
                            title="Edit"
                          >
                            ✎
                          </button>
                          <button
                            onClick={async e => {
                              e.stopPropagation()
                              if (!confirm(`Delete "${item.title}"?`)) return
                              const r = await deletePipelineItem(item.id)
                              if (!r.error) handleDelete(item.id)
                            }}
                            style={{
                              fontSize: 10, padding: '2px 7px', cursor: 'pointer',
                              color: '#ff3b5f', background: 'transparent',
                              border: '1px solid rgba(255,59,95,.2)',
                            }}
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Edit panel */}
                    {isEditing && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0 }}>
                          <ItemEditPanel
                            item={item}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                            onClose={() => setEditingId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <Paginator page={page} total={rows.length} perPage={PAGE_SIZE} onChange={setPage} />

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
        <span className="text-[8px] tracking-[.12em] uppercase ml-2" style={{ color: '#1e1e1e' }}>
          Click any row to edit
        </span>
      </div>

    </div>
  )
}
