'use client'

import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { updatePipelineItem, deletePipelineItem, linkYouTubeVideo, createPipelineItem, bulkDeletePipelineItems } from '@/app/(dashboard)/edit-actions'
import type { PipelineItem } from '@/app/(dashboard)/pipeline/page'
import { usePortalFilters, filterByPlatform, filterByScope } from '@/hooks/usePortalFilters'
import { Paginator } from '@/components/portal/Paginator'
import { PlatformPills, ScopeDropdown } from '@/components/portal/FilterBar'
import { EmptyState } from '@/components/portal/EmptyState'
import { useToast } from '@/components/portal/Toast'
import { usePillarColors } from '@/hooks/usePillarColors'
import { PipelineBulkImportModal } from '@/components/portal/PipelineBulkImportModal'

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
  tt: { label: 'TT', color: '#2dd4bf', bg: 'rgba(45,212,191,.1)'  },
  yt: { label: 'YT', color: '#4cc9ff', bg: 'rgba(76,201,255,.1)'  },
}

// Phase card color coding — per-status colors for active/hover states
const PHASE_CARD_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  ACTIVE:    { text: '#c9a96e', bg: 'rgba(201,169,110,0.07)', border: 'rgba(201,169,110,0.40)' },
  SCRIPTED:  { text: '#c9a96e', bg: 'rgba(201,169,110,0.07)', border: 'rgba(201,169,110,0.40)' },
  PLANNED:   { text: '#4cc9ff', bg: 'rgba(76,201,255,0.07)',  border: 'rgba(76,201,255,0.40)'  },
  FILMING:   { text: '#fbbf24', bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.40)'  },
  EDITING:   { text: '#fbbf24', bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.40)'  },
  REVIEWING: { text: '#ff3b5f', bg: 'rgba(255,59,95,0.07)',   border: 'rgba(255,59,95,0.40)'   },
  SCHEDULED: { text: '#4cc9ff', bg: 'rgba(76,201,255,0.07)',  border: 'rgba(76,201,255,0.40)'  },
  POSTED:    { text: '#39ff88', bg: 'rgba(57,255,136,0.07)',  border: 'rgba(57,255,136,0.40)'  },
  CANCELLED: { text: '#555555', bg: 'rgba(100,100,100,0.07)', border: 'rgba(100,100,100,0.30)' },
  ALL:       { text: '#888888', bg: 'rgba(136,136,136,0.07)', border: 'rgba(136,136,136,0.30)' },
}

const ACTIVE_STATUSES = new Set(['SCRIPTED','PLANNED','FILMING','EDITING','REVIEWING','SCHEDULED'])

// Auto-priority when status changes
const STATUS_PRIORITY: Record<string, number> = {
  REVIEWING: 1,
  FILMING:   2,
  SCRIPTED:  3,
  PLANNED:   4,
  EDITING:   5,
  SCHEDULED: 5,
  POSTED:    6,
  CANCELLED: 6,
}

type SortKey = 'priority' | 'status' | 'pillar' | 'week' | 'title'
type FilterKey = 'ALL' | 'ACTIVE' | string
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Week label helpers for calendar mini-map
function monWkLabel(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]}Wk${Math.ceil(d.getDate() / 7)}`
}

function get6Weeks(today: Date): string[] {
  const weeks: string[] = []
  const seen = new Set<string>()
  for (let i = -2; i <= 3; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i * 7)
    const label = monWkLabel(d)
    if (!seen.has(label)) { seen.add(label); weeks.push(label) }
  }
  return weeks
}

const STATUS_DOT: Record<string, string> = {
  SCRIPTED:  '#c9a96e',
  PLANNED:   '#4cc9ff',
  FILMING:   '#fbbf24',
  EDITING:   '#a78bfa',
  REVIEWING: '#ff3b5f',
  SCHEDULED: '#4cc9ff',
  POSTED:    '#39ff88',
  CANCELLED: '#333',
}

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

// ── Platform link button helper ────────────────────────────────────────────

function isPlatLinked(videoUrl: string | null, plat: 'ig' | 'tt'): boolean {
  if (!videoUrl) return false
  if (plat === 'ig') return videoUrl.includes('instagram.com') || videoUrl.includes('/p/')
  if (plat === 'tt') return videoUrl.includes('tiktok.com')
  return false
}

const PLAT_LINK_CFG = {
  ig: { label: 'IG', color: '#c9a96e', placeholder: 'https://www.instagram.com/p/... or reel URL' },
  tt: { label: 'TT', color: '#2dd4bf', placeholder: 'https://www.tiktok.com/@user/video/...' },
}

function PlatformLinkModal({
  item,
  plat,
  onClose,
  onLinked,
}: {
  item: PipelineItem
  plat: 'ig' | 'tt'
  onClose: () => void
  onLinked: (url: string) => void
}) {
  const cfg = PLAT_LINK_CFG[plat]
  const [input, setInput]   = useState(isPlatLinked(item.videoUrl, plat) ? (item.videoUrl ?? '') : '')
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  async function handleSave() {
    const val = input.trim()
    if (!val) return
    setSaving(true)
    setErrMsg('')
    const result = await updatePipelineItem(item.id, { video_url: val })
    setSaving(false)
    if (result.error) { setErrMsg(result.error); return }
    onLinked(val)
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
          borderTop: `2px solid ${cfg.color}`, padding: '28px 32px', width: 420, maxWidth: '90vw',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', color: cfg.color, marginBottom: 4 }}>
            Link {cfg.label === 'IG' ? 'Instagram' : 'TikTok'} Post
          </p>
          <p style={{ fontSize: 13, color: '#f2ede4', fontWeight: 300 }}>{item.title}</p>
          <p style={{ fontSize: 10, color: '#c9a96e', fontFamily: 'monospace', marginTop: 2 }}>{item.postId}</p>
        </div>

        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: '#2a2a2a', marginBottom: 6 }}>
            {cfg.label === 'IG' ? 'Instagram' : 'TikTok'} Post URL
          </p>
          <input
            autoFocus
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={cfg.placeholder}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{
              width: '100%', background: '#080808', border: '1px solid #1e1e1e',
              color: '#f2ede4', padding: '8px 10px', fontSize: 12,
              fontFamily: "'DM Sans', sans-serif", outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = cfg.color }}
            onBlur={e  => { e.target.style.borderColor = '#1e1e1e' }}
          />
          {errMsg && (
            <p style={{ fontSize: 10, color: '#ff3b5f', marginTop: 5 }}>{errMsg}</p>
          )}
        </div>

        {isPlatLinked(item.videoUrl, plat) && (
          <p style={{ fontSize: 9, color: '#2a2a2a', marginBottom: 16, wordBreak: 'break-all' }}>
            Currently linked: <span style={{ color: cfg.color }}>{item.videoUrl}</span>
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
              background: `rgba(${cfg.color === '#c9a96e' ? '201,169,110' : '45,212,191'},.1)`,
              border: `1px solid ${cfg.color}66`,
              color: cfg.color, cursor: saving ? 'wait' : 'pointer',
              opacity: !input.trim() ? 0.4 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Link Post'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDisplayId(postId: string, platform: string[]): string {
  // Pipe-separated multi-platform ID — return as-is
  if (postId.includes('|')) return postId
  if (/^#(ig|tt|yt|LF)\d+$/i.test(postId)) return postId
  const numMatch = postId.match(/^#?(\d+)$/)
  if (!numMatch) return postId
  const plat = platform[0] ?? 'ig'
  const prefix = plat === 'yt' ? 'yt' : plat === 'tt' ? 'tt' : 'ig'
  return `#${prefix}${numMatch[1].padStart(4, '0')}`
}

// Filter pipe-separated IDs to show only the segment matching the active platform filter
function idForPlatform(postId: string, activePlatform: string): string {
  if (activePlatform === 'all') return postId
  if (!postId.includes('|')) return postId // single-platform ID, show as-is

  const parts = postId.split('|').map(p => p.trim())
  const match = parts.find(p => {
    const lower = p.toLowerCase()
    if (activePlatform === 'ig')  return lower.startsWith('#ig')
    if (activePlatform === 'tt')  return lower.startsWith('#tt')
    if (activePlatform === 'yt')  return lower.startsWith('#yt')
    if (activePlatform === 'lf')  return lower.startsWith('#lf')
    return false
  })
  return match ?? '—'
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
  const { toast } = useToast()
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
        toast(result.error, 'error')
      } else {
        onUpdate(item.id, uiPatch)
        setStates(s => ({ ...s, [dbField]: 'saved' }))
        toast(`Saved · ${formatDisplayId(item.postId, item.platform)} updated`)
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
        toast(result.error, 'error')
      } else {
        onUpdate(item.id, uiPatch)
        setStates(s => ({ ...s, [dbField]: 'saved' }))
        toast(`Saved · ${formatDisplayId(item.postId, item.platform)} updated`)
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
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '.14em',
    textTransform: 'uppercase' as const,
    color: '#555',
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
                const autoPri = STATUS_PRIORITY[next] ?? parseInt(priority, 10)
                setStatus(next)
                setPriority(String(autoPri))
                clearTimeout(timers.current['status'])
                clearTimeout(timers.current['priority'])
                setStates(s => ({ ...s, status: 'saving', priority: 'saving' }))
                setTimeout(async () => {
                  const result = await updatePipelineItem(item.id, { status: next, priority: autoPri })
                  if (result.error) {
                    setStates(s => ({ ...s, status: 'error', priority: 'error' }))
                    toast(result.error, 'error')
                  } else {
                    onUpdate(item.id, { status: next, priority: autoPri })
                    setStates(s => ({ ...s, status: 'saved', priority: 'saved' }))
                    toast(`Saved · ${formatDisplayId(item.postId, item.platform)} updated`)
                    setTimeout(() => setStates(s => ({ ...s, status: 'idle', priority: 'idle' })), 1500)
                  }
                }, 0)
              }
            }}
          >
            {ALL_STATUSES.map(s => (
              <option key={s} value={s} style={{ background: '#0a0a0a' }}>{s}</option>
            ))}
          </select>
        </div>

        {/* Priority — auto-derived from status, never editable */}
        <div>
          <label style={labelStyle}>Priority</label>
          <div style={{
            ...inputStyle, cursor: 'default', display: 'flex', alignItems: 'center', gap: 6,
            color: PRIORITY_CFG[parseInt(priority, 10)]?.stripe ?? '#555',
            fontWeight: 600, fontSize: 13, userSelect: 'none',
          }}>
            {priority}
            <span style={{ fontSize: 9, color: '#2a2a2a', fontWeight: 400, letterSpacing: '.1em', textTransform: 'uppercase' }}>auto</span>
          </div>
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
                  const autoPri = STATUS_PRIORITY[finalStatus] ?? parseInt(priority, 10)
                  const update: Record<string, unknown> = {
                    status: finalStatus,
                    platform: modalPlatforms,
                    priority: autoPri,
                  }
                  if (pendingStatus === 'SCRIPTED') {
                    update.scheduled_date = modalDate.slice(0, 10)
                  } else {
                    update.posted_at = iso
                  }
                  setStatus(finalStatus)
                  setPlatform(modalPlatforms)
                  setPriority(String(autoPri))
                  if (pendingStatus !== 'SCRIPTED') setPostedAtLocal(modalDate)
                  setStates(s => ({ ...s, status: 'saving', priority: 'saving' }))
                  const result = await updatePipelineItem(item.id, update)
                  if (result.error) {
                    setStates(s => ({ ...s, status: 'error', priority: 'error' }))
                  } else {
                    onUpdate(item.id, {
                      status: finalStatus,
                      platform: modalPlatforms,
                      priority: autoPri,
                      ...(pendingStatus !== 'SCRIPTED' ? { postedAt: iso } : { scheduledDate: modalDate.slice(0, 10) }),
                    })
                    setStates(s => ({ ...s, status: 'saved', priority: 'saved' }))
                    setTimeout(() => setStates(s => ({ ...s, status: 'idle', priority: 'idle' })), 1500)
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

// ── Mark as Posted Modal ───────────────────────────────────────────────────

function parseVideoUrl(url: string, platforms: string[]): string {
  const s = url.trim()
  if (!s) return ''
  // YT: youtu.be/ID or ?v=ID
  const ytShort = s.match(/youtu\.be\/([A-Za-z0-9_-]{10,12})/)
  if (ytShort) return ytShort[1]
  const ytFull = s.match(/[?&]v=([A-Za-z0-9_-]{10,12})/)
  if (ytFull) return ytFull[1]
  // IG: /reel/ID or /p/ID or /tv/ID
  const ig = s.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/)
  if (ig) return ig[1]
  // TT: /video/ID
  const tt = s.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/)
  if (tt) return tt[1]
  // If it doesn't look like a URL, treat as raw ID
  if (!s.startsWith('http')) return s
  return s
}

function MarkAsPostedModal({
  item,
  onClose,
  onPosted,
}: {
  item: PipelineItem
  onClose: () => void
  onPosted: (iso: string, videoId: string) => void
}) {
  const [dateVal, setDateVal] = useState<string>(() => {
    const d = new Date(); d.setSeconds(0, 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [urlVal,  setUrlVal ] = useState('')
  const [saving,  setSaving ] = useState(false)

  const parsedId = useMemo(() => parseVideoUrl(urlVal, item.platform), [urlVal, item.platform])

  async function handleConfirm() {
    setSaving(true)
    const iso = new Date(dateVal).toISOString()
    const update: Record<string, unknown> = { status: 'POSTED', posted_at: iso, priority: 6 }
    if (parsedId) update.video_url = urlVal.trim()
    await updatePipelineItem(item.id, update)
    setSaving(false)
    onPosted(iso, parsedId)
    onClose()
  }

  const inp = {
    background: '#080808', border: '1px solid #1e1e1e',
    color: '#f2ede4', padding: '8px 10px', fontSize: 12,
    fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '100%',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.82)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#070707', border: '1px solid #1e1e1e', borderTop: '2px solid #39ff88', padding: '32px 36px', width: 440, maxWidth: '94vw' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', color: '#39ff88', marginBottom: 4 }}>Mark as Posted</p>
            <p style={{ fontSize: 14, color: '#f2ede4', fontWeight: 300, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
            <p style={{ fontSize: 10, color: '#c9a96e', fontFamily: 'monospace', marginTop: 2 }}>{item.postId}</p>
          </div>
          <button onClick={onClose} style={{ fontSize: 18, color: '#333', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555', marginBottom: 6 }}>When was it posted?</p>
            <input type="datetime-local" style={inp} value={dateVal} onChange={e => setDateVal(e.target.value)}
              onFocus={e => (e.target.style.borderColor = '#39ff88')} onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
          </div>
          <div>
            <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555', marginBottom: 6 }}>Video URL (optional)</p>
            <input type="text" style={inp} value={urlVal} placeholder="https://youtu.be/… or instagram.com/reel/…"
              onChange={e => setUrlVal(e.target.value)}
              onFocus={e => (e.target.style.borderColor = '#39ff88')} onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
            {parsedId && urlVal && (
              <p style={{ fontSize: 9, color: '#39ff88', marginTop: 5 }}>Extracted ID: <span style={{ fontFamily: 'monospace' }}>{parsedId}</span></p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: 'transparent', border: '1px solid #1e1e1e', color: '#444', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={saving} style={{ padding: '8px 22px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: 'rgba(57,255,136,.1)', border: '1px solid rgba(57,255,136,.4)', color: '#39ff88', cursor: saving ? 'wait' : 'pointer', fontWeight: 600 }}>
            {saving ? 'Saving…' : '✓ Mark Posted'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────

function DeleteConfirmModal({
  count,
  onConfirm,
  onCancel,
  deleting,
}: {
  count: number
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#070707', border: '1px solid #1e1e1e',
        borderTop: '2px solid #ff3b5f',
        padding: '32px 36px', width: 380, maxWidth: '94vw',
      }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', color: '#ff3b5f', marginBottom: 8 }}>
            Confirm Delete
          </p>
          <p style={{ fontSize: 16, color: '#f2ede4', fontWeight: 300, lineHeight: 1.4 }}>
            Delete {count} video{count !== 1 ? 's' : ''}?
          </p>
          <p style={{ fontSize: 11, color: '#444', marginTop: 6, fontWeight: 300 }}>
            This cannot be undone. IDs are never renumbered — gaps are permanent.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              padding: '8px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid #1e1e1e', color: '#444', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: '8px 22px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
              background: 'rgba(255,59,95,.12)', border: '1px solid rgba(255,59,95,.4)',
              color: '#ff3b5f', cursor: deleting ? 'wait' : 'pointer', fontWeight: 600,
              opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting ? 'Deleting…' : `Delete ${count}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Video Modal ────────────────────────────────────────────────────────

type NextIds = { ig: string; tt: string; yt: string; lf: string }

function AddVideoModal({
  nextIds,
  onClose,
  onCreated,
}: {
  nextIds: NextIds
  onClose: () => void
  onCreated: (item: PipelineItem) => void
}) {
  const { toast } = useToast()
  const [title,    setTitle   ] = useState('')
  const [platforms,setPlatforms] = useState<string[]>([])
  const [status,   setStatus  ] = useState('PLANNED')
  const [pillar,   setPillar  ] = useState('')
  const [week,     setWeek    ] = useState('')
  const [script,   setScript  ] = useState('')
  const [saving,   setSaving  ] = useState(false)
  const [err,      setErr     ] = useState('')

  const computedId = useMemo(() => {
    if (!platforms.length) return ''
    const parts: string[] = []
    if (platforms.includes('ig')) parts.push(nextIds.ig)
    if (platforms.includes('tt')) parts.push(nextIds.tt)
    if (platforms.includes('yt')) parts.push(nextIds.yt)
    if (platforms.includes('lf')) parts.push(nextIds.lf)
    return parts.join(' | ')
  }, [platforms, nextIds])

  function togglePlat(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function handleSave() {
    if (!title.trim())    { setErr('Title is required'); return }
    if (!platforms.length){ setErr('Select at least one platform'); return }
    setSaving(true); setErr('')
    const autoPri = STATUS_PRIORITY[status] ?? 4
    const result = await createPipelineItem({
      postId:        computedId,
      title:         title.trim(),
      platform:      platforms,
      status,
      priority:      autoPri,
      pillar:        pillar.trim() || null,
      week:          week.trim() || null,
      scriptContent: script.trim() || null,
    })
    setSaving(false)
    if (result.error) { setErr(result.error); toast(result.error, 'error'); return }
    toast(`Added to pipeline · ${computedId}`)
    onCreated({
      id:            result.id!,
      postId:        computedId,
      title:         title.trim(),
      platform:      platforms,
      pillar:        pillar.trim() || '—',
      status,
      priority:      autoPri,
      week:          week.trim() || '—',
      scheduledDate: null,
      postedAt:      null,
      ytType:        null,
      ytId:          null,
      videoUrl:      null,
      scriptContent: script.trim() || null,
      notes:         null,
    })
    onClose()
  }

  const inp = {
    background: '#080808', border: '1px solid #1e1e1e',
    color: '#f2ede4', padding: '7px 10px', fontSize: 12,
    fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '100%',
  }
  const lbl = {
    fontSize: 9, fontWeight: 600 as const, letterSpacing: '.14em',
    textTransform: 'uppercase' as const, color: '#555', marginBottom: 5, display: 'block',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,.80)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#070707', border: '1px solid #1e1e1e',
        borderTop: '2px solid #c9a96e', padding: '32px 36px',
        width: 520, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: 4 }}>
              New Video
            </p>
            <p style={{ fontSize: 18, color: '#f2ede4', fontWeight: 300 }}>Add to Pipeline</p>
          </div>
          <button onClick={onClose} style={{ fontSize: 18, color: '#333', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          {/* Platform */}
          <div>
            <label style={lbl}>Platform *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['ig', 'tt', 'yt'] as const).map(p => {
                const cfg = PLAT_CFG[p]; const on = platforms.includes(p)
                return (
                  <button key={p} type="button" onClick={() => togglePlat(p)} style={{
                    padding: '7px 18px', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                    letterSpacing: '.1em', textTransform: 'uppercase',
                    color: on ? cfg.color : '#444',
                    background: on ? cfg.bg : 'transparent',
                    border: `1px solid ${on ? cfg.color + '60' : '#1e1e1e'}`,
                    transition: 'all .15s',
                  }}>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ID (read-only) */}
          <div>
            <label style={lbl}>ID (auto-generated)</label>
            <div style={{
              ...inp, display: 'flex', alignItems: 'center', gap: 8,
              color: computedId ? '#c9a96e' : '#333',
              fontFamily: 'monospace', letterSpacing: computedId ? '.06em' : undefined,
              cursor: 'default',
            }}>
              {computedId || <span style={{ color: '#2a2a2a', fontFamily: 'DM Sans, sans-serif', fontSize: 11 }}>Select a platform above</span>}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={lbl}>Title *</label>
            <input autoFocus style={inp} value={title} placeholder="Video title…"
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              onFocus={e => (e.target.style.borderColor = '#c9a96e')}
              onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
          </div>

          {/* Status — priority auto-derives from this */}
          <div>
            <label style={lbl}>Status</label>
            <select style={{ ...inp, appearance: 'none', cursor: 'pointer' }} value={status}
              onChange={e => setStatus(e.target.value)}>
              {ALL_STATUSES.map(s => <option key={s} value={s} style={{ background: '#0a0a0a' }}>{s}</option>)}
            </select>
            <p style={{ fontSize: 8, color: '#2a2a2a', marginTop: 4, letterSpacing: '.08em' }}>
              Priority auto-set: {STATUS_PRIORITY[status] ?? 4}
            </p>
          </div>

          {/* Pillar + Week row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Pillar</label>
              <input style={inp} value={pillar} placeholder="e.g. Sales Tips"
                onChange={e => setPillar(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#c9a96e')}
                onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
            </div>
            <div>
              <label style={lbl}>Week</label>
              <input style={inp} value={week} placeholder="e.g. JunWk2"
                onChange={e => setWeek(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#c9a96e')}
                onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
            </div>
          </div>

          {/* Script */}
          <div>
            <label style={lbl}>Script (optional)</label>
            <textarea style={{ ...inp, height: 100, resize: 'vertical', lineHeight: 1.6 }}
              value={script} placeholder="Script content…"
              onChange={e => setScript(e.target.value)}
              onFocus={e => (e.target.style.borderColor = '#c9a96e')}
              onBlur={e  => (e.target.style.borderColor = '#1e1e1e')} />
          </div>
        </div>

        {err && <p style={{ fontSize: 11, color: '#ff3b5f', marginTop: 14 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
            background: 'transparent', border: '1px solid #1e1e1e', color: '#444', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '9px 24px', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase',
            background: saving ? 'rgba(201,169,110,.06)' : 'rgba(201,169,110,.12)',
            border: '1px solid rgba(201,169,110,.5)', color: '#c9a96e',
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1, fontWeight: 600,
          }}>
            {saving ? 'Saving…' : '+ Add Video'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

export function PipelineClient({
  initialItems,
  nextIds = { ig: '#ig0001', tt: '#tt0001', yt: '#yt0001', lf: '#LF0001' },
}: {
  initialItems: PipelineItem[]
  nextIds?: NextIds
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const linkedItemId = searchParams.get('item')
  const { toast } = useToast()
  const [items,        setItems       ] = useState<PipelineItem[]>(initialItems)
  const [filter,  setFilter ] = useState<FilterKey>(() => (searchParams.get('phase') as FilterKey) ?? 'ACTIVE')
  const [search,  setSearch ] = useState('')
  const [weekFilter, setWeekFilter] = useState<string | null>(null)
  const [sortKey,      setSortKey     ] = useState<SortKey>('priority')
  const [sortDir,      setSortDir     ] = useState<'asc' | 'desc'>('asc')
  const [editingId,    setEditingId   ] = useState<string | null>(null)
  const [hoveredId,    setHoveredId   ] = useState<string | null>(null)
  const [hoverPreviewId, setHoverPreviewId] = useState<string | null>(null)
  const [hoverPos,       setHoverPos      ] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [saveError,    setSaveError   ] = useState<string | null>(null)
  const [page,         setPage        ] = useState(1)
  const [ytLinkItem,   setYtLinkItem  ] = useState<PipelineItem | null>(null)
  const [platLinkItem, setPlatLinkItem] = useState<{ item: PipelineItem; plat: 'ig' | 'tt' } | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [markPostedItem, setMarkPostedItem] = useState<PipelineItem | null>(null)
  const [selectedIds,      setSelectedIds     ] = useState<Set<string>>(new Set())
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [bulkDeleting,      setBulkDeleting    ] = useState(false)
  const [hoveredCardKey,    setHoveredCardKey  ] = useState<FilterKey | null>(null)

  const { platform, scope, from, to, setFilters } = usePortalFilters()
  const pillarColors = usePillarColors(useMemo(() => items.map(i => i.pillar ?? ''), [items]))

  const today = useMemo(() => new Date(), [])
  const currentWeek = useMemo(() => monWkLabel(today), [today])
  const weekLabels   = useMemo(() => get6Weeks(today), [today])

  useEffect(() => { setPage(1) }, [platform, scope, from, to, filter, search, weekFilter])

  // Platform-filtered base (used for both counts and rows)
  const platFiltered = useMemo(() => {
    let out = items.slice()
    if (platform === 'lf') {
      out = out.filter(i => i.platform.includes('yt') && (i.ytType === 'Long-form' || i.ytType === 'LF'))
    } else if (platform === 'yt') {
      out = out.filter(i => i.platform.includes('yt') && i.ytType !== 'Long-form' && i.ytType !== 'LF')
    } else if (platform !== 'all') {
      out = out.filter(i => i.platform.includes(platform))
    }
    return out
  }, [items, platform])

  // Phase counts — respect active platform pill
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: platFiltered.length, ACTIVE: 0 }
    for (const item of platFiltered) {
      c[item.status] = (c[item.status] ?? 0) + 1
      if (ACTIVE_STATUSES.has(item.status)) c.ACTIVE++
    }
    return c
  }, [platFiltered])

  // Filtered + sorted rows (start from platFiltered — platform already applied)
  const rows = useMemo(() => {
    let out = platFiltered.slice()
    if (filter === 'ACTIVE') out = out.filter(i => ACTIVE_STATUSES.has(i.status))
    else if (filter !== 'ALL') out = out.filter(i => i.status === filter)
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
    if (weekFilter) {
      out = out.filter(i => i.week === weekFilter)
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
  }, [platFiltered, filter, scope, from, to, search, weekFilter, sortKey, sortDir])

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
    const deleted = items.find(i => i.id === id)
    setItems(prev => prev.filter(i => i.id !== id))
    if (editingId === id) setEditingId(null)
    if (deleted) toast(`Deleted · ${deleted.title}`, 'info')
  }

  function handleYtLinked(itemId: string, ytId: string) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ytId } : i))
  }

  function handlePlatLinked(itemId: string, url: string) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, videoUrl: url } : i))
  }

  function handleCreated(item: PipelineItem) {
    setItems(prev => [item, ...prev])
    setFilter('ACTIVE')
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    const ids = [...selectedIds]
    const result = await bulkDeletePipelineItems(ids)
    setBulkDeleting(false)
    setDeleteConfirmOpen(false)
    if (result.error) {
      toast(result.error, 'error')
    } else {
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)))
      setSelectedIds(new Set())
      if (editingId && selectedIds.has(editingId)) setEditingId(null)
      toast(`Deleted ${ids.length} item${ids.length !== 1 ? 's' : ''}`, 'info')
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allPageSelected = pagedRows.length > 0 && pagedRows.every(r => selectedIds.has(r.id))

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

  const phaseCards: { key: FilterKey; label: string }[] = [
    { key: 'ACTIVE',    label: 'Active'    },
    { key: 'SCRIPTED',  label: 'Scripted'  },
    { key: 'PLANNED',   label: 'Planned'   },
    { key: 'FILMING',   label: 'Filming'   },
    { key: 'EDITING',   label: 'Editing'   },
    { key: 'REVIEWING', label: 'Reviewing' },
    { key: 'SCHEDULED', label: 'Scheduled' },
    { key: 'POSTED',    label: 'Posted'    },
    { key: 'CANCELLED', label: 'Cancelled' },
    { key: 'ALL',       label: 'All'       },
  ]

  return (
    <div>

      {/* Add Video modal */}
      {addModalOpen && (
        <AddVideoModal
          nextIds={nextIds}
          onClose={() => setAddModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Bulk Import modal */}
      {bulkImportOpen && (
        <PipelineBulkImportModal
          nextIds={nextIds}
          onClose={() => setBulkImportOpen(false)}
          onImported={() => { setFilter('ACTIVE'); router.refresh() }}
        />
      )}

      {/* YT Link modal */}
      {ytLinkItem && (
        <YTLinkModal
          item={ytLinkItem}
          onClose={() => setYtLinkItem(null)}
          onLinked={ytId => handleYtLinked(ytLinkItem.id, ytId)}
        />
      )}

      {/* IG / TT Link modal */}
      {platLinkItem && (
        <PlatformLinkModal
          item={platLinkItem.item}
          plat={platLinkItem.plat}
          onClose={() => setPlatLinkItem(null)}
          onLinked={url => handlePlatLinked(platLinkItem.item.id, url)}
        />
      )}

      {/* Bulk delete confirm modal */}
      {deleteConfirmOpen && (
        <DeleteConfirmModal
          count={selectedIds.size}
          onConfirm={handleBulkDelete}
          onCancel={() => setDeleteConfirmOpen(false)}
          deleting={bulkDeleting}
        />
      )}

      {/* Mark as Posted modal */}
      {markPostedItem && (
        <MarkAsPostedModal
          item={markPostedItem}
          onClose={() => setMarkPostedItem(null)}
          onPosted={(iso, _videoId) => {
            handleUpdate(markPostedItem.id, { status: 'POSTED', postedAt: iso })
            toast(`Marked as Posted · ${markPostedItem.title}`, 'success')
          }}
        />
      )}

      {/* ── Action buttons ────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 mb-5">
        {selectedIds.size > 0 && (
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            style={{
              padding: '9px 18px', fontSize: 10, fontWeight: 600, letterSpacing: '.14em',
              textTransform: 'uppercase', background: 'rgba(255,59,95,.1)',
              border: '1px solid rgba(255,59,95,.4)', color: '#ff3b5f',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all .15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,59,95,.18)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,59,95,.6)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,59,95,.1)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,59,95,.4)'
            }}
          >
            <span style={{ fontSize: 12, lineHeight: 1 }}>×</span>
            Delete {selectedIds.size} Selected
          </button>
        )}
        <button
          onClick={() => setBulkImportOpen(true)}
          style={{
            padding: '9px 18px',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            background: 'transparent',
            border: '1px solid #1e1e1e',
            color: '#555',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all .15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#333'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#888'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e1e1e'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#555'
          }}
        >
          <span style={{ fontSize: 12, lineHeight: 1 }}>⇪</span>
          Bulk Import
        </button>
        <button
          onClick={() => setAddModalOpen(true)}
          style={{
            padding: '9px 20px',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            background: 'rgba(201,169,110,.10)',
            border: '1px solid rgba(201,169,110,.45)',
            color: '#c9a96e',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            transition: 'all .15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,169,110,.18)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,169,110,.7)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,169,110,.10)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,169,110,.45)'
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          Add Video
        </button>
      </div>

      {/* ── Phase stat cards ─────────────────────────────────────── */}
      <div
        className="mb-8"
        style={{ overflowX: 'auto' }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${phaseCards.length}, 1fr)`,
            gap: '1px',
            background: '#141414',
            minWidth: 600,
          }}
        >
          {phaseCards.map(pc => {
            const active      = filter === pc.key
            const hovered     = hoveredCardKey === pc.key
            const highlighted = active || hovered
            const pcColors    = PHASE_CARD_COLORS[pc.key] ?? PHASE_CARD_COLORS.ALL
            const count       = counts[pc.key] ?? 0
            return (
              <button
                key={pc.key}
                onClick={() => { setFilter(pc.key); setWeekFilter(null) }}
                onMouseEnter={() => setHoveredCardKey(pc.key)}
                onMouseLeave={() => setHoveredCardKey(null)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '12px 6px 10px',
                  background: highlighted ? pcColors.bg : '#0a0a0a',
                  border: `1px solid ${highlighted ? pcColors.border : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'background .12s, border-color .12s',
                }}
              >
                <span
                  className="font-jakarta font-light mb-1"
                  style={{
                    fontSize: 22,
                    lineHeight: 1,
                    color: highlighted ? pcColors.text : 'rgba(255,255,255,0.45)',
                    textShadow: highlighted ? `0 0 14px ${pcColors.text}55` : 'none',
                    transition: 'color .12s',
                  }}
                >
                  {count}
                </span>
                <span
                  style={{
                    fontSize: 7,
                    fontWeight: 600,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: highlighted ? pcColors.text : 'rgba(255,255,255,0.28)',
                    transition: 'color .12s',
                  }}
                >
                  {pc.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Platform pills ───────────────────────────────────────── */}
      <div className="mb-4">
        <PlatformPills
          platform={platform}
          onChange={p => setFilters({ platform: p })}
        />
      </div>

      {/* ── Calendar mini-map (Feature 10) ───────────────────────── */}
      <div className="mb-5" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 6, minWidth: 480 }}>
          {weekLabels.map(wk => {
            const isCurrent = wk === currentWeek
            const isActive  = weekFilter === wk
            const weekItems = items.filter(i => i.week === wk)
            const dotsByStatus = weekItems.slice(0, 8)
            return (
              <button
                key={wk}
                onClick={() => setWeekFilter(isActive ? null : wk)}
                style={{
                  flex: 1, minWidth: 72, padding: '8px 6px',
                  background: isActive ? 'rgba(201,169,110,.08)' : '#0a0a0a',
                  border: isCurrent
                    ? '1px solid rgba(201,169,110,.4)'
                    : isActive
                      ? '1px solid rgba(201,169,110,.35)'
                      : '1px solid #141414',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { if (!isActive && !isCurrent) (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a' }}
                onMouseLeave={e => { if (!isActive && !isCurrent) (e.currentTarget as HTMLButtonElement).style.borderColor = '#141414' }}
              >
                <p style={{
                  fontSize: 8, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
                  color: isCurrent ? '#c9a96e' : isActive ? '#c9a96e' : 'rgba(255,255,255,0.32)',
                  textShadow: (isCurrent || isActive) ? '0 0 8px rgba(201,169,110,0.3)' : '0 0 6px rgba(255,255,255,0.08)',
                  marginBottom: 6,
                }}>
                  {wk}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', minHeight: 14 }}>
                  {dotsByStatus.map((item, idx) => (
                    <span
                      key={idx}
                      title={`${item.status}: ${item.title}`}
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: STATUS_DOT[item.status] ?? '#333',
                        display: 'inline-block',
                        opacity: 0.85,
                      }}
                    />
                  ))}
                  {weekItems.length === 0 && (
                    <span style={{ fontSize: 8, color: '#1e1e1e' }}>—</span>
                  )}
                </div>
                <p style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
                  {weekItems.length > 0 ? `${weekItems.length} item${weekItems.length !== 1 ? 's' : ''}` : ''}
                </p>
              </button>
            )
          })}
        </div>
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

      {/* Hover preview popover (Feature 6) */}
      {hoverPreviewId && (() => {
        const item = items.find(i => i.id === hoverPreviewId)
        if (!item) return null
        return (
          <div
            style={{
              position: 'fixed',
              top: Math.max(8, hoverPos.top - 10),
              left: hoverPos.left,
              zIndex: 7000,
              background: '#0c0c0c',
              border: '1px solid #1e1e1e',
              borderLeft: `3px solid ${pillarColors.get(item.pillar ?? '') ?? '#333'}`,
              padding: '12px 14px',
              minWidth: 260,
              maxWidth: 340,
              pointerEvents: 'none',
              boxShadow: '0 8px 32px rgba(0,0,0,.7)',
              transform: 'translateY(-100%)',
            }}
          >
            <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              {item.platform.map(p => {
                const cfg = PLAT_CFG[p] ?? { label: p.toUpperCase(), color: '#555', bg: '#0d0d0d' }
                return <span key={p} style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', padding: '2px 6px', color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30` }}>{cfg.label}</span>
              })}
            </div>
            <p style={{ fontSize: 11, color: '#f2ede4', fontWeight: 300, marginBottom: 6 }}>{item.title}</p>
            {item.scriptContent && (
              <p style={{ fontSize: 10, color: '#555', lineHeight: 1.5, marginBottom: 6, borderTop: '1px solid #141414', paddingTop: 6 }}>
                {item.scriptContent.slice(0, 100)}{item.scriptContent.length > 100 ? '…' : ''}
              </p>
            )}
            {item.notes && (
              <p style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>
                {String(item.notes).slice(0, 80)}{String(item.notes).length > 80 ? '…' : ''}
              </p>
            )}
          </div>
        )
      })()}

      {/* ── Table ────────────────────────────────────────────────── */}
      <div style={{ border: '1px solid #141414', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
              <th style={{ width: 4, padding: 0, background: '#060606' }} />
              <th style={{ width: 36, padding: '0 10px', background: '#060606', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedIds(prev => new Set([...prev, ...pagedRows.map(r => r.id)]))
                    } else {
                      setSelectedIds(prev => {
                        const next = new Set(prev)
                        pagedRows.forEach(r => next.delete(r.id))
                        return next
                      })
                    }
                  }}
                  style={{ cursor: 'pointer', accentColor: '#ff3b5f', width: 13, height: 13 }}
                  title={allPageSelected ? 'Deselect all' : 'Select all on page'}
                />
              </th>
              <th className="text-left px-4 py-4 text-[9px] font-medium tracking-[.14em] uppercase select-none"
                  style={{ color: '#555', whiteSpace: 'nowrap', width: 76, background: '#060606' }}>ID</th>
              <th onClick={() => toggleSort('title')}
                  className="text-left px-4 py-4 text-[9px] font-medium tracking-[.14em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'title' ? '#c9a96e' : '#555', background: '#060606' }}>
                Title{arrow('title')}
              </th>
              <th className="text-left px-4 py-4 text-[9px] font-medium tracking-[.14em] uppercase"
                  style={{ color: '#555', whiteSpace: 'nowrap', width: 90, background: '#060606' }}>Platform</th>
              <th onClick={() => toggleSort('pillar')}
                  className="text-left px-4 py-4 text-[9px] font-medium tracking-[.14em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'pillar' ? '#c9a96e' : '#555', whiteSpace: 'nowrap', width: 140, background: '#060606' }}>
                Pillar{arrow('pillar')}
              </th>
              <th onClick={() => toggleSort('week')}
                  className="text-left px-4 py-4 text-[9px] font-medium tracking-[.14em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'week' ? '#c9a96e' : '#555', whiteSpace: 'nowrap', width: 110, background: '#060606' }}>
                Week{arrow('week')}
              </th>
              <th onClick={() => toggleSort('priority')}
                  className="text-left px-4 py-4 text-[9px] font-medium tracking-[.14em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'priority' ? '#c9a96e' : '#555', whiteSpace: 'nowrap', width: 60, background: '#060606' }}>
                Pri{arrow('priority')}
              </th>
              <th onClick={() => toggleSort('status')}
                  className="text-left px-4 py-4 text-[9px] font-medium tracking-[.14em] uppercase select-none cursor-pointer"
                  style={{ color: sortKey === 'status' ? '#c9a96e' : '#555', whiteSpace: 'nowrap', width: 160, background: '#060606' }}>
                Status{arrow('status')}
              </th>
              <th className="text-left px-3 py-4 text-[9px] font-medium tracking-[.12em] uppercase"
                  style={{ color: '#c9a96e', width: 30, background: '#060606' }}>IG</th>
              <th className="text-left px-3 py-4 text-[9px] font-medium tracking-[.12em] uppercase"
                  style={{ color: '#2dd4bf', width: 30, background: '#060606' }}>TT</th>
              <th className="text-left px-3 py-4 text-[9px] font-medium tracking-[.12em] uppercase"
                  style={{ color: '#4cc9ff', width: 30, background: '#060606' }}>YT</th>
              <th className="text-left px-4 py-4 text-[9px] font-medium tracking-[.14em] uppercase"
                  style={{ color: '#555', width: 80, background: '#060606' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-16" style={{ color: '#444' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20, opacity: 0.4 }}>◇</span>
                    <p style={{ fontSize: 12, fontWeight: 300, color: '#555' }}>
                      {weekFilter
                        ? `Nothing in ${weekFilter} — assign a week in the edit panel.`
                        : search
                          ? `No results for "${search}".`
                          : filter !== 'ALL' && filter !== 'ACTIVE'
                            ? `Nothing in ${filter.charAt(0) + filter.slice(1).toLowerCase()} yet — click + Add Video to start.`
                            : 'No pipeline items match this filter.'}
                    </p>
                    {(weekFilter || (filter !== 'ALL' && filter !== 'ACTIVE' && !search)) && (
                      <button
                        onClick={() => setAddModalOpen(true)}
                        style={{
                          fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                          padding: '6px 14px', marginTop: 4,
                          background: 'rgba(201,169,110,.08)', border: '1px solid rgba(201,169,110,.3)',
                          color: '#c9a96e', cursor: 'pointer',
                        }}
                      >
                        + Add Video
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              pagedRows.map(item => {
                const pCfg      = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG[4]
                const isEditing = editingId === item.id
                const isHovered = hoveredId === item.id
                const pillarColor = pillarColors.get(item.pillar ?? '') ?? '#2a2a2a'
                const primaryPlatColor = PLAT_CFG[item.platform[0]] ? PLAT_CFG[item.platform[0]].color : '#2a2a2a'
                const igLinked = isPlatLinked(item.videoUrl, 'ig')
                const ttLinked = isPlatLinked(item.videoUrl, 'tt')

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
                      onMouseEnter={e => {
                        setHoveredId(item.id)
                        clearTimeout(hoverTimer.current)
                        const rect = (e.currentTarget as HTMLTableRowElement).getBoundingClientRect()
                        hoverTimer.current = setTimeout(() => {
                          setHoverPreviewId(item.id)
                          setHoverPos({ top: rect.top, left: rect.left + 100 })
                        }, 800)
                      }}
                      onMouseLeave={() => {
                        setHoveredId(null)
                        clearTimeout(hoverTimer.current)
                        setHoverPreviewId(null)
                      }}
                    >
                      {/* Platform color stripe (primary platform) */}
                      <td style={{ width: 4, padding: 0, background: `${primaryPlatColor}bb` }} />

                      {/* Checkbox */}
                      <td
                        style={{ width: 36, padding: '0 10px', textAlign: 'center' }}
                        onClick={e => { e.stopPropagation(); toggleSelect(item.id) }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          onClick={e => e.stopPropagation()}
                          style={{
                            cursor: 'pointer',
                            accentColor: '#ff3b5f',
                            width: 13, height: 13,
                            opacity: (isHovered || selectedIds.has(item.id)) ? 1 : 0.18,
                            transition: 'opacity .15s',
                          }}
                        />
                      </td>

                      {/* ID */}
                      <td className="px-4 py-4">
                        {(() => {
                          const displayId = idForPlatform(formatDisplayId(item.postId, item.platform), platform)
                          return (
                            <span className="text-[10px] font-medium" style={{ fontFamily: 'monospace', color: displayId === '—' ? '#2a2a2a' : '#c9a96e' }}>
                              {displayId}
                            </span>
                          )
                        })()}
                      </td>

                      {/* Title */}
                      <td className="px-4 py-4" style={{ maxWidth: 240 }}>
                        <span
                          className="text-[12px] font-light block overflow-hidden"
                          style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 240, textShadow: '0 0 6px rgba(255,255,255,0.06)' }}
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
                      <td className="px-4 py-4 text-[11px] font-light" style={{ color: '#777', whiteSpace: 'nowrap' }}>
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

                      {/* IG link */}
                      <td className="px-2 py-4" onClick={e => e.stopPropagation()}>
                        {item.platform.includes('ig') ? (
                          <button
                            onClick={e => { e.stopPropagation(); setPlatLinkItem({ item, plat: 'ig' }) }}
                            title={igLinked ? `Linked: Instagram` : 'Link Instagram post'}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 22, height: 20, cursor: 'pointer', fontSize: 7, fontWeight: 700,
                              letterSpacing: '.08em', textTransform: 'uppercase',
                              background: igLinked ? 'rgba(201,169,110,.15)' : 'transparent',
                              border: `1px solid ${igLinked ? 'rgba(201,169,110,.4)' : '#1e1e1e'}`,
                              color: igLinked ? '#c9a96e' : '#2a2a2a',
                              borderRadius: 3,
                            }}
                          >IG</button>
                        ) : <span style={{ width: 22, display: 'block' }} />}
                      </td>

                      {/* TT link */}
                      <td className="px-2 py-4" onClick={e => e.stopPropagation()}>
                        {item.platform.includes('tt') ? (
                          <button
                            onClick={e => { e.stopPropagation(); setPlatLinkItem({ item, plat: 'tt' }) }}
                            title={ttLinked ? `Linked: TikTok` : 'Link TikTok video'}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 22, height: 20, cursor: 'pointer', fontSize: 7, fontWeight: 700,
                              letterSpacing: '.08em', textTransform: 'uppercase',
                              background: ttLinked ? 'rgba(45,212,191,.15)' : 'transparent',
                              border: `1px solid ${ttLinked ? 'rgba(45,212,191,.4)' : '#1e1e1e'}`,
                              color: ttLinked ? '#2dd4bf' : '#2a2a2a',
                              borderRadius: 3,
                            }}
                          >TT</button>
                        ) : <span style={{ width: 22, display: 'block' }} />}
                      </td>

                      {/* YT link */}
                      <td className="px-2 py-4" onClick={e => e.stopPropagation()}>
                        {item.platform.includes('yt') || item.ytType != null ? (
                          <button
                            onClick={e => { e.stopPropagation(); setYtLinkItem(item) }}
                            title={item.ytId ? `Linked: ${item.ytId}` : 'Link YouTube video'}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 22, height: 20, cursor: 'pointer',
                              background: item.ytId ? 'rgba(76,201,255,.1)' : 'transparent',
                              border: `1px solid ${item.ytId ? 'rgba(76,201,255,.4)' : '#1e1e1e'}`,
                              borderRadius: 3,
                            }}
                          >
                            <YTIcon size={10} color={item.ytId ? '#4cc9ff' : '#2a2a2a'} />
                          </button>
                        ) : <span style={{ width: 22, display: 'block' }} />}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4">
                        <div
                          className="flex gap-1.5"
                          style={{ opacity: (isHovered || isEditing) ? 1 : 0, transition: 'opacity .15s' }}
                          onClick={e => e.stopPropagation()}
                        >
                          {item.status !== 'POSTED' && item.status !== 'CANCELLED' && (
                            <button
                              onClick={e => { e.stopPropagation(); setMarkPostedItem(item) }}
                              style={{
                                fontSize: 9, padding: '2px 7px', cursor: 'pointer',
                                color: '#39ff88', background: 'transparent',
                                border: '1px solid rgba(57,255,136,.25)',
                                whiteSpace: 'nowrap',
                              }}
                              title="Mark as Posted"
                            >
                              ✓
                            </button>
                          )}
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
                        <td colSpan={13} style={{ padding: 0 }}>
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
            <span className="text-[9px] tracking-[.12em] uppercase" style={{ color: '#444' }}>
              {label}
            </span>
          </div>
        ))}
        <span className="text-[9px] tracking-[.12em] uppercase ml-2" style={{ color: '#333' }}>
          Click any row to edit
        </span>
      </div>

    </div>
  )
}
