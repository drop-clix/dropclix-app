'use client'

import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area,
} from 'recharts'
import type { AdCampaign, AdCreative } from '@/app/(dashboard)/ads/page'
import {
  updateAdCampaign, deleteAdCampaign,
  updateAdCreative, deleteAdCreative,
} from '@/app/(dashboard)/edit-actions'
import { Paginator } from '@/components/portal/Paginator'
import { EmptyState } from '@/components/portal/EmptyState'
import { AISuggestionsModal } from '@/components/portal/AISuggestionsModal'
import type { AISuggestion } from '@/components/portal/AISuggestionsModal'

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n === 0) return '—'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K'
  return '$' + n.toFixed(2).replace(/\.00$/, '')
}

function fmtROAS(n: number): string { return n > 0 ? n.toFixed(1) + 'x' : '—' }

function fmtNum(n: number): string {
  if (n === 0) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function fmtPct(n: number): string { return n > 0 ? n.toFixed(2) + '%' : '—' }

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function dateRange(c: AdCampaign): string {
  const start = fmtDate(c.date)
  if (!c.endDate) return start
  const s = new Date(c.date + 'T12:00:00')
  const e = new Date(c.endDate + 'T12:00:00')
  const endStr = e.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    year: s.getFullYear() !== e.getFullYear() ? 'numeric' : undefined,
  })
  return `${start} – ${endStr}`
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SparkIcon({ color = '#c9a96e', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5L9.6 6.4L14.5 8L9.6 9.6L8 14.5L6.4 9.6L1.5 8L6.4 6.4L8 1.5Z" stroke={color} strokeWidth="1.2" />
    </svg>
  )
}

function KpiCard({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div
      className="flex flex-col justify-between relative overflow-hidden"
      style={{ background: '#0a0a0a', border: `1px solid ${highlight ? 'rgba(201,169,110,.25)' : '#141414'}`, padding: '28px 24px 22px' }}
    >
      <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>{label}</p>
      <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(26px,3vw,42px)', lineHeight: 1 }}>{value}</p>
      <p className="text-[10px] font-light mt-2" style={{ color: '#555' }}>{sub}</p>
    </div>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function SaveDot({ s }: { s: SaveState }) {
  const color = s === 'saving' ? '#fbbf24' : s === 'saved' ? '#39ff88' : s === 'error' ? '#ff3b5f' : 'transparent'
  return <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: color, marginLeft: 4, transition: 'background .2s' }} />
}

const inputStyle = {
  background: '#080808', border: '1px solid #1e1e1e',
  color: '#f2ede4', padding: '4px 7px', fontSize: 11,
  fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '100%',
}

const labelStyle = {
  fontSize: 7, fontWeight: 600 as const, letterSpacing: '.16em',
  textTransform: 'uppercase' as const, color: '#555',
  display: 'flex', alignItems: 'center', gap: 2, marginBottom: 4,
}

// ── Campaign edit panel ────────────────────────────────────────────────────

function CampaignEditPanel({
  campaign,
  onUpdate,
  onDelete,
  onClose,
}: {
  campaign: AdCampaign
  onUpdate: (id: string, patch: Partial<AdCampaign>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [name,      setName     ] = useState(campaign.name)
  const [objective, setObjective] = useState(campaign.objective)
  const [status,    setStatus   ] = useState(campaign.status)
  const [spend,     setSpend    ] = useState(String(campaign.spend))
  const [leads,     setLeads    ] = useState(String(campaign.leads))
  const [hires,     setHires    ] = useState(String(campaign.hires))
  const [date,      setDate     ] = useState(campaign.date)
  const [deleting,  setDeleting ] = useState(false)

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const st = (f: string): SaveState => states[f] ?? 'idle'

  function schedule(field: string, value: unknown, patch: Partial<AdCampaign>) {
    clearTimeout(timers.current[field])
    timers.current[field] = setTimeout(async () => {
      setStates(s => ({ ...s, [field]: 'saving' }))
      const result = await updateAdCampaign(campaign.id, { [field]: value })
      if (result.error) {
        setStates(s => ({ ...s, [field]: 'error' }))
      } else {
        onUpdate(campaign.id, patch)
        setStates(s => ({ ...s, [field]: 'saved' }))
        setTimeout(() => setStates(s => ({ ...s, [field]: 'idle' })), 1500)
      }
    }, 2000)
  }

  function scheduleNow(field: string, value: unknown, patch: Partial<AdCampaign>) {
    clearTimeout(timers.current[field])
    setTimeout(async () => {
      setStates(s => ({ ...s, [field]: 'saving' }))
      const result = await updateAdCampaign(campaign.id, { [field]: value })
      if (result.error) {
        setStates(s => ({ ...s, [field]: 'error' }))
      } else {
        onUpdate(campaign.id, patch)
        setStates(s => ({ ...s, [field]: 'saved' }))
        setTimeout(() => setStates(s => ({ ...s, [field]: 'idle' })), 1500)
      }
    }, 0)
  }

  async function handleDelete() {
    if (!confirm(`Delete campaign "${campaign.name}"?`)) return
    setDeleting(true)
    const r = await deleteAdCampaign(campaign.id)
    if (r.error) { alert(r.error); setDeleting(false); return }
    onDelete(campaign.id)
  }

  return (
    <div style={{ background: '#070707', borderBottom: '1px solid #141414', borderLeft: '3px solid #c9a96e', padding: '28px 32px' }}>
      <div className="flex items-center justify-between mb-5">
        <span className="text-[9px] font-medium tracking-[.2em] uppercase" style={{ color: '#c9a96e' }}>Editing Campaign</span>
        <div className="flex gap-2">
          <button onClick={handleDelete} disabled={deleting}
            style={{ fontSize: 9, padding: '3px 10px', cursor: 'pointer', color: '#ff3b5f', background: 'rgba(255,59,95,.06)', border: '1px solid rgba(255,59,95,.2)', opacity: deleting ? 0.5 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button onClick={onClose} style={{ fontSize: 9, padding: '3px 10px', cursor: 'pointer', color: '#666', background: 'transparent', border: '1px solid #1e1e1e' }}>Close</button>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Name <SaveDot s={st('name')} /></label>
          <input style={inputStyle} value={name}
            onChange={e => { setName(e.target.value); schedule('name', e.target.value, { name: e.target.value }) }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Objective <SaveDot s={st('objective')} /></label>
          <input style={inputStyle} value={objective}
            onChange={e => { setObjective(e.target.value); schedule('objective', e.target.value, { objective: e.target.value }) }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Status <SaveDot s={st('status')} /></label>
          <select style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }} value={status}
            onChange={e => { setStatus(e.target.value); scheduleNow('status', e.target.value, { status: e.target.value }) }}>
            {['Active','Completed','Paused'].map(s => <option key={s} value={s} style={{ background: '#0a0a0a' }}>{s}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Start Date <SaveDot s={st('date')} /></label>
          <input type="date" style={inputStyle} value={date}
            onChange={e => { setDate(e.target.value); scheduleNow('date', e.target.value, { date: e.target.value }) }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Spend ($) <SaveDot s={st('spend')} /></label>
          <input type="number" min={0} step={0.01} style={inputStyle} value={spend}
            onChange={e => { setSpend(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) schedule('spend', n, { spend: n }) }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Leads <SaveDot s={st('leads')} /></label>
          <input type="number" min={0} step={1} style={inputStyle} value={leads}
            onChange={e => { setLeads(e.target.value); const n = parseInt(e.target.value, 10); if (!isNaN(n)) schedule('leads', n, { leads: n }) }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
        </div>

        <div>
          <label style={labelStyle}>Hires <SaveDot s={st('hires')} /></label>
          <input type="number" min={0} step={1} style={inputStyle} value={hires}
            onChange={e => { setHires(e.target.value); const n = parseInt(e.target.value, 10); if (!isNaN(n)) schedule('hires', n, { hires: n }) }}
            onFocus={e => (e.target.style.borderColor = '#c9a96e')}
            onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
        </div>
      </div>
    </div>
  )
}

// ── Creative inline row ────────────────────────────────────────────────────

function CreativeRow({
  creative,
  onUpdate,
  onDelete,
}: {
  creative: AdCreative
  onUpdate: (id: string, patch: Partial<AdCreative>) => void
  onDelete: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [type,   setType  ] = useState(creative.type)
  const [status, setStatus] = useState(creative.status)
  const [impressions, setImpressions] = useState(String(creative.impressions))
  const [ctr, setCtr] = useState(String(creative.ctr))
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const st = (f: string): SaveState => states[f] ?? 'idle'

  function schedule(field: string, value: unknown, patch: Partial<AdCreative>) {
    clearTimeout(timers.current[field])
    timers.current[field] = setTimeout(async () => {
      setStates(s => ({ ...s, [field]: 'saving' }))
      const result = await updateAdCreative(creative.id, { [field]: value })
      if (result.error) { setStates(s => ({ ...s, [field]: 'error' })); return }
      onUpdate(creative.id, patch)
      setStates(s => ({ ...s, [field]: 'saved' }))
      setTimeout(() => setStates(s => ({ ...s, [field]: 'idle' })), 1500)
    }, 2000)
  }

  async function handleDelete() {
    if (!confirm(`Delete creative "${creative.name}"?`)) return
    const r = await deleteAdCreative(creative.id)
    if (!r.error) onDelete(creative.id)
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: '1px solid #0e0e0e', paddingBottom: 8, marginBottom: 8 }}
    >
      {!editing ? (
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-light" style={{ color: '#f2ede4', minWidth: 180 }}>{creative.name}</span>
          <span className="text-[7px] font-medium tracking-[.1em] uppercase px-2 py-0.5"
            style={{ color: '#888', background: '#0d0d0d', border: '1px solid #1a1a1a' }}>{type}</span>
          <span className="text-[9px]" style={{ color: '#555' }}>{status}</span>
          {creative.impressions > 0 && (
            <>
              <span className="text-[9px]" style={{ color: '#666' }}>{fmtNum(creative.impressions)} impr.</span>
              <span className="text-[9px]" style={{ color: '#666' }}>{fmtPct(creative.ctr)} CTR</span>
            </>
          )}
          {creative.impressions === 0 && <span className="text-[9px]" style={{ color: '#555' }}>No impression data</span>}

          <div className="flex gap-1.5 ml-auto" style={{ opacity: hovered ? 1 : 0, transition: 'opacity .15s' }}>
            <button onClick={() => setEditing(true)}
              style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer', color: '#555', background: 'transparent', border: '1px solid #1e1e1e' }}
              title="Edit">✎</button>
            <button onClick={handleDelete}
              style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer', color: '#ff3b5f', background: 'transparent', border: '1px solid rgba(255,59,95,.2)' }}
              title="Delete">×</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div>
            <label style={labelStyle}>Type <SaveDot s={st('type')} /></label>
            <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={type}
              onChange={e => { setType(e.target.value); schedule('type', e.target.value, { type: e.target.value }) }}>
              {['video','image','carousel'].map(t => <option key={t} value={t} style={{ background: '#0a0a0a' }}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Status <SaveDot s={st('status')} /></label>
            <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={status}
              onChange={e => { setStatus(e.target.value); schedule('status', e.target.value, { status: e.target.value }) }}>
              {['Testing','Winner','Loser','Paused'].map(s => <option key={s} value={s} style={{ background: '#0a0a0a' }}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Impressions <SaveDot s={st('impressions')} /></label>
            <input type="number" min={0} style={inputStyle} value={impressions}
              onChange={e => { setImpressions(e.target.value); const n = parseInt(e.target.value, 10); if (!isNaN(n)) schedule('impressions', n, { impressions: n }) }}
              onFocus={e => (e.target.style.borderColor = '#c9a96e')}
              onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
          </div>
          <div>
            <label style={labelStyle}>CTR (%) <SaveDot s={st('ctr')} /></label>
            <input type="number" min={0} step={0.01} style={inputStyle} value={ctr}
              onChange={e => { setCtr(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) schedule('ctr', n, { ctr: n }) }}
              onFocus={e => (e.target.style.borderColor = '#c9a96e')}
              onBlur={e => (e.target.style.borderColor = '#1e1e1e')} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button onClick={() => setEditing(false)}
              style={{ fontSize: 9, padding: '2px 10px', cursor: 'pointer', color: '#666', background: 'transparent', border: '1px solid #1e1e1e' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'Active' | 'Completed'
type SortKey = 'date' | 'spend' | 'effectiveRevenue' | 'roas' | 'hires' | 'cpl' | 'cph'

// ── Main ───────────────────────────────────────────────────────────────────

export function AdsClient({
  campaigns: initialCampaigns,
  creatives: initialCreatives,
  totalSpend,
  totalRevenue,
  totalHires,
  portfolioROAS,
}: {
  campaigns: AdCampaign[]
  creatives: AdCreative[]
  totalSpend: number
  totalRevenue: number
  totalHires: number
  portfolioROAS: number
}) {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>(initialCampaigns)
  const [creatives, setCreatives] = useState<AdCreative[]>(initialCreatives)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey,      setSortKey     ] = useState<SortKey>('date')
  const [sortDir,      setSortDir     ] = useState<'asc' | 'desc'>('asc')
  const [editingId,    setEditingId   ] = useState<string | null>(null)
  const [hoveredId,    setHoveredId   ] = useState<string | null>(null)
  const [page,         setPage        ] = useState(1)
  const [aiModalOpen,  setAiModalOpen ] = useState(false)
  const [adsSuggestions, setAdsSuggestions] = useState<AISuggestion[]>([])
  const [adsLoading,   setAdsLoading  ] = useState(false)

  useEffect(() => { setPage(1) }, [statusFilter, sortKey])

  const counts = useMemo(() => ({
    all: campaigns.length,
    active: campaigns.filter(c => c.status === 'Active').length,
    completed: campaigns.filter(c => c.status === 'Completed').length,
  }), [campaigns])

  const rows = useMemo(() => {
    let out = campaigns.slice()
    if (statusFilter !== 'all') out = out.filter(c => c.status === statusFilter)
    out.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'date')            cmp = a.date.localeCompare(b.date)
      else if (sortKey === 'spend')      cmp = a.spend - b.spend
      else if (sortKey === 'effectiveRevenue') cmp = a.effectiveRevenue - b.effectiveRevenue
      else if (sortKey === 'roas')       cmp = a.roas - b.roas
      else if (sortKey === 'hires')      cmp = a.hires - b.hires
      else if (sortKey === 'cpl')        cmp = a.cpl - b.cpl
      else if (sortKey === 'cph')        cmp = a.cph - b.cph
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [campaigns, statusFilter, sortKey, sortDir])

  const pagedRows = useMemo(() => rows.slice((page - 1) * 10, page * 10), [rows, page])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'date' ? 'asc' : 'desc') }
  }

  const arrow = (k: SortKey) => sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const TH = ({ label, col, right = false }: { label: string; col: SortKey; right?: boolean }) => (
    <th
      onClick={() => handleSort(col)}
      className={`px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer ${right ? 'text-right' : 'text-left'}`}
      style={{ color: sortKey === col ? '#c9a96e' : '#555', whiteSpace: 'nowrap' }}
    >
      {label}{arrow(col)}
    </th>
  )

  const creativesByCampaign = useMemo(() => {
    const m: Record<string, AdCreative[]> = {}
    for (const cr of creatives) {
      const key = cr.campaignId ?? '__none__'
      if (!m[key]) m[key] = []
      m[key].push(cr)
    }
    return m
  }, [creatives])

  function handleCampaignUpdate(id: string, patch: Partial<AdCampaign>) {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  function handleCampaignDelete(id: string) {
    setCampaigns(prev => prev.filter(c => c.id !== id))
    if (editingId === id) setEditingId(null)
  }

  function handleCreativeUpdate(id: string, patch: Partial<AdCreative>) {
    setCreatives(prev => prev.map(cr => cr.id === id ? { ...cr, ...patch } : cr))
  }

  function handleCreativeDelete(id: string) {
    setCreatives(prev => prev.filter(cr => cr.id !== id))
  }

  async function openAiInsights() {
    setAiModalOpen(true)
    setAdsLoading(true)
    try {
      const payload = campaigns.map(c => ({
        name:   c.name,
        status: c.status,
        spend:  c.spend,
        roas:   c.roas,
        ctr:    c.ctr,
        cpm:    c.cpm,
        leads:  c.leads,
        hires:  c.hires,
      }))
      const res  = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ads', campaigns: payload, platform: 'all', posts: [] }),
      })
      const json = await res.json() as { suggestions?: AISuggestion[] }
      setAdsSuggestions(json.suggestions ?? [])
    } catch {
      setAdsSuggestions([])
    } finally {
      setAdsLoading(false)
    }
  }

  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon="ad"
        headline="No ad campaigns tracked yet."
        body="Ad campaign performance data will appear here once campaigns are imported."
      />
    )
  }

  // Recalculate summary KPIs from current state
  const liveTotalSpend   = campaigns.reduce((s, c) => s + c.spend, 0)
  const liveTotalRevenue = campaigns.reduce((s, c) => s + c.effectiveRevenue, 0)
  const liveTotalHires   = campaigns.reduce((s, c) => s + c.hires, 0)
  const liveROAS = liveTotalSpend > 0 ? liveTotalRevenue / liveTotalSpend : 0

  return (
    <div>

      {/* ── KPI cards ──────────────────────────────────────────────── */}
      <div className="grid gap-px mb-10" style={{ gridTemplateColumns: 'repeat(4,1fr)', background: '#141414' }}>
        <KpiCard label="Total Spend"       value={fmtMoney(liveTotalSpend)}   sub={`${campaigns.length} campaigns`} />
        <KpiCard label="Estimated Revenue" value={fmtMoney(liveTotalRevenue)} sub="Based on reported ROAS" highlight={liveTotalRevenue > 0} />
        <KpiCard label="Portfolio ROAS"    value={fmtROAS(liveROAS)}          sub="Revenue ÷ total spend"   highlight={liveROAS > 1} />
        <KpiCard label="Total Hires"
          value={liveTotalHires > 0 ? liveTotalHires.toString() : '—'}
          sub={liveTotalHires > 0 ? `$${(liveTotalSpend / liveTotalHires).toFixed(0)} per hire` : 'No hires tracked'} />
      </div>

      {/* ── Charts ─────────────────────────────────────────────────── */}
      {campaigns.length >= 2 && (() => {
        const chartData = campaigns.map(c => ({
          name: c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name,
          spend: c.spend,
          roas: c.roas,
          ctr: c.ctr,
          cpm: c.cpm,
        }))
        const tooltipStyle = { background: '#0d0d0d', border: '1px solid #1e1e1e', fontSize: 11, color: '#f2ede4' }
        return (
          <div className="grid gap-px mb-8" style={{ gridTemplateColumns: '1fr 1fr', background: '#141414' }}>
            {/* Spend + ROAS */}
            <div style={{ background: '#0a0a0a', padding: '24px 20px 16px' }}>
              <p className="text-[8px] font-medium tracking-[.18em] uppercase mb-4" style={{ color: '#555' }}>Spend & ROAS by Campaign</p>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,.04)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#444' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="spend" tick={{ fontSize: 8, fill: '#444' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v >= 1000 ? (v/1000).toFixed(0)+'K' : v}`} width={44} />
                  <YAxis yAxisId="roas" orientation="right" tick={{ fontSize: 8, fill: '#444' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(1)}x`} width={36} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [n === 'roas' ? `${Number(v).toFixed(2)}x` : `$${Number(v).toLocaleString()}`, n === 'roas' ? 'ROAS' : 'Spend']} />
                  <Bar yAxisId="spend" dataKey="spend" fill="rgba(201,169,110,.35)" radius={[2,2,0,0]} />
                  <Line yAxisId="roas" dataKey="roas" stroke="#c9a96e" strokeWidth={2} dot={{ r: 3, fill: '#c9a96e' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* CTR + CPM */}
            <div style={{ background: '#0a0a0a', padding: '24px 20px 16px' }}>
              <p className="text-[8px] font-medium tracking-[.18em] uppercase mb-4" style={{ color: '#555' }}>CTR & CPM by Campaign</p>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,.04)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#444' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="ctr" tick={{ fontSize: 8, fill: '#444' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(1)}%`} width={36} />
                  <YAxis yAxisId="cpm" orientation="right" tick={{ fontSize: 8, fill: '#444' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(1)}`} width={36} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [n === 'ctr' ? `${Number(v).toFixed(2)}%` : `$${Number(v).toFixed(2)}`, n === 'ctr' ? 'CTR' : 'CPM']} />
                  <Area yAxisId="cpm" dataKey="cpm" fill="rgba(76,201,255,.06)" stroke="rgba(76,201,255,.3)" strokeWidth={1} />
                  <Line yAxisId="ctr" dataKey="ctr" stroke="#4cc9ff" strokeWidth={2} dot={{ r: 3, fill: '#4cc9ff' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}

      {/* ── Status toggle + AI Insights ────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[9px] font-medium tracking-[.24em] uppercase flex items-center gap-3" style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
          Campaign Performance
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openAiInsights}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px',
              background: 'rgba(201,169,110,0.07)',
              border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 5,
              color: '#c9a96e',
              fontSize: 10,
              cursor: 'pointer',
              transition: 'all .15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <SparkIcon size={12} />
            AI Insights
          </button>
          <div className="flex gap-1">
            {([['all', `All (${counts.all})`], ['Active', `Active (${counts.active})`], ['Completed', `Completed (${counts.completed})`]] as [StatusFilter, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setStatusFilter(val)}
                className="text-[9px] font-medium tracking-[.14em] uppercase px-4 py-2.5 transition-colors"
                style={{
                  color:      statusFilter === val ? '#c9a96e' : '#666',
                  background: statusFilter === val ? 'rgba(201,169,110,.07)' : 'transparent',
                  border:     `1px solid ${statusFilter === val ? 'rgba(201,169,110,.4)' : '#1a1a1a'}`,
                  cursor: 'pointer',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Campaign table ─────────────────────────────────────────── */}
      <div style={{ border: '1px solid #141414', overflowX: 'auto', marginBottom: 48 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
              <th className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase" style={{ color: '#555', minWidth: 200 }}>Campaign</th>
              <TH label="Date"    col="date" />
              <th className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase" style={{ color: '#555', whiteSpace: 'nowrap' }}>Platform</th>
              <TH label="Spend"   col="spend"            right />
              <TH label="Revenue" col="effectiveRevenue"  right />
              <TH label="ROAS"    col="roas"              right />
              <TH label="Leads"   col="cpl"               right />
              <TH label="Hires"   col="hires"             right />
              <TH label="CPL"     col="cpl"               right />
              <TH label="CPH"     col="cph"               right />
              <th className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase" style={{ color: '#555', whiteSpace: 'nowrap' }}>Status</th>
              <th className="text-left px-5 py-4 text-[8px] font-medium tracking-[.16em] uppercase" style={{ color: '#555', width: 70 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-12 text-[11px]" style={{ color: '#555' }}>No campaigns match this filter.</td></tr>
            ) : pagedRows.map((c, i) => {
              const isWinner   = c.roas > 0
              const isEditing  = editingId === c.id
              const isHovered  = hoveredId === c.id
              const cCreatives = creativesByCampaign[c.id] ?? []

              return (
                <Fragment key={c.id}>
                  <tr
                    onClick={() => setEditingId(isEditing ? null : c.id)}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      background: isEditing ? '#0d0d0d' : isWinner ? 'rgba(201,169,110,.03)' : i % 2 === 0 ? '#060606' : '#070707',
                      borderBottom: '1px solid #0e0e0e',
                      borderLeft: isWinner ? '3px solid rgba(201,169,110,.5)' : '3px solid transparent',
                      cursor: 'pointer',
                      outline: isEditing ? '1px solid rgba(201,169,110,.2)' : 'none',
                      outlineOffset: -1,
                      transition: 'background .15s',
                    }}
                  >
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12px] font-light" style={{ color: isWinner ? '#f2ede4' : '#ccc' }}>{c.name}</span>
                        <span className="text-[9px]" style={{ color: '#555' }}>{c.objective}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[11px] font-light" style={{ color: '#666', whiteSpace: 'nowrap' }}>{dateRange(c)}</td>
                    <td className="px-5 py-4">
                      <span className="text-[7px] font-medium tracking-[.12em] uppercase px-2 py-1"
                        style={{ color: '#1778f2', background: 'rgba(23,120,242,.1)', border: '1px solid rgba(23,120,242,.25)' }}>Meta</span>
                    </td>
                    <td className="px-5 py-4 text-right"><span className="text-[12px] font-light" style={{ color: '#f2ede4' }}>{fmtMoney(c.spend)}</span></td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-[12px] font-light" style={{ color: c.effectiveRevenue > 0 ? '#39ff88' : '#3a3a3a' }}>
                        {c.effectiveRevenue > 0 ? fmtMoney(c.effectiveRevenue) : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-jakarta font-light" style={{ fontSize: c.roas > 0 ? 15 : 12, color: c.roas > 0 ? '#c9a96e' : '#3a3a3a' }}>
                        {fmtROAS(c.roas)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-[12px] font-light" style={{ color: c.leads > 0 ? '#aaa' : '#3a3a3a' }}>{c.leads > 0 ? c.leads : '—'}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-[12px] font-light" style={{ color: c.hires > 0 ? '#39ff88' : '#3a3a3a' }}>{c.hires > 0 ? c.hires : '—'}</span>
                    </td>
                    <td className="px-5 py-4 text-right text-[12px] font-light" style={{ color: c.cpl > 0 ? '#aaa' : '#3a3a3a' }}>{c.cpl > 0 ? fmtMoney(c.cpl) : '—'}</td>
                    <td className="px-5 py-4 text-right text-[12px] font-light" style={{ color: c.cph > 0 ? '#aaa' : '#3a3a3a' }}>{c.cph > 0 ? fmtMoney(c.cph) : '—'}</td>
                    <td className="px-5 py-4">
                      <span className="text-[7px] font-medium tracking-[.12em] uppercase px-2 py-0.5"
                        style={c.status === 'Active'
                          ? { color: '#39ff88', background: 'rgba(57,255,136,.1)', border: '1px solid rgba(57,255,136,.25)' }
                          : { color: '#666',    background: 'rgba(100,100,100,.08)', border: '1px solid #1e1e1e' }}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5" style={{ opacity: (isHovered || isEditing) ? 1 : 0, transition: 'opacity .15s' }}>
                        <button
                          onClick={e => { e.stopPropagation(); setEditingId(isEditing ? null : c.id) }}
                          style={{ fontSize: 10, padding: '2px 7px', cursor: 'pointer', color: isEditing ? '#c9a96e' : '#555', background: isEditing ? 'rgba(201,169,110,.08)' : 'transparent', border: `1px solid ${isEditing ? 'rgba(201,169,110,.35)' : '#1e1e1e'}` }}
                          title="Edit">✎</button>
                        <button
                          onClick={async e => { e.stopPropagation(); if (!confirm(`Delete "${c.name}"?`)) return; const r = await deleteAdCampaign(c.id); if (!r.error) handleCampaignDelete(c.id) }}
                          style={{ fontSize: 10, padding: '2px 7px', cursor: 'pointer', color: '#ff3b5f', background: 'transparent', border: '1px solid rgba(255,59,95,.2)' }}
                          title="Delete">×</button>
                      </div>
                    </td>
                  </tr>

                  {/* Edit panel */}
                  {isEditing && (
                    <tr>
                      <td colSpan={12} style={{ padding: 0 }}>
                        <CampaignEditPanel
                          campaign={c}
                          onUpdate={handleCampaignUpdate}
                          onDelete={handleCampaignDelete}
                          onClose={() => setEditingId(null)}
                        />
                        {/* Creatives section within edit panel */}
                        {cCreatives.length > 0 && (
                          <div style={{ background: '#070707', borderBottom: '1px solid #141414', borderLeft: '3px solid rgba(201,169,110,.3)', padding: '24px 32px' }}>
                            <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-3" style={{ color: '#c9a96e' }}>Creatives</p>
                            {cCreatives.map(cr => (
                              <CreativeRow
                                key={cr.id}
                                creative={cr}
                                onUpdate={handleCreativeUpdate}
                                onDelete={handleCreativeDelete}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <Paginator page={page} total={rows.length} perPage={10} onChange={setPage} />

      {/* ── Campaign Details strip ──────────────────────────────────── */}
      <div>
        <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
          Campaign Details
        </p>
        <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(3,1fr)', background: '#141414' }}>
          {campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter).map(c => (
            <div key={c.id} className="flex flex-col gap-3" style={{ background: '#0a0a0a', padding: '28px 24px' }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-light" style={{ color: '#f2ede4' }}>{c.name}</p>
                <span className="text-[7px] font-medium tracking-[.1em] uppercase px-1.5 py-0.5 shrink-0"
                  style={{ color: c.status === 'Active' ? '#39ff88' : '#333', background: c.status === 'Active' ? 'rgba(57,255,136,.08)' : 'transparent', border: `1px solid ${c.status === 'Active' ? 'rgba(57,255,136,.25)' : '#1a1a1a'}` }}>
                  {c.status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Impressions', value: fmtNum(c.impressions) },
                  { label: 'Reach',       value: fmtNum(c.reach) },
                  { label: 'Clicks',      value: fmtNum(c.clicks) },
                  { label: 'CTR',         value: fmtPct(c.ctr) },
                  { label: 'CPM',         value: c.cpm > 0 ? fmtMoney(c.cpm) : '—' },
                  { label: 'CPC',         value: c.cpc > 0 ? fmtMoney(c.cpc) : '—' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[7px] font-medium tracking-[.12em] uppercase mb-0.5" style={{ color: '#555' }}>{label}</p>
                    <p className="text-[11px] font-light" style={{ color: '#555' }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[9px]" style={{ color: '#666' }}>
        Revenue estimated as ROAS × Spend. Click any campaign row to edit.
      </p>

      <AISuggestionsModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title="Ad Campaign Insights"
        subtitle="Powered by Claude · Actionable recommendations based on your campaign data"
        suggestions={adsSuggestions}
        loading={adsLoading}
      />
    </div>
  )
}
