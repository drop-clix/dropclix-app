'use client'

import { useState, useMemo } from 'react'
import type { AdCampaign, AdCreative } from '@/app/(dashboard)/ads/page'

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n === 0) return '—'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K'
  return '$' + n.toFixed(2).replace(/\.00$/, '')
}

function fmtROAS(n: number): string {
  return n > 0 ? n.toFixed(1) + 'x' : '—'
}

function fmtNum(n: number): string {
  if (n === 0) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function fmtPct(n: number): string {
  return n > 0 ? n.toFixed(2) + '%' : '—'
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function dateRange(c: AdCampaign): string {
  const start = fmtDate(c.date)
  if (!c.endDate) return start
  // Collapse year if same year
  const s = new Date(c.date + 'T12:00:00')
  const e = new Date(c.endDate + 'T12:00:00')
  const endStr = e.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    year: s.getFullYear() !== e.getFullYear() ? 'numeric' : undefined,
  })
  return `${start} – ${endStr}`
}

// ── Sub-components ─────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, highlight = false,
}: {
  label: string
  value: string
  sub: string
  highlight?: boolean
}) {
  return (
    <div
      className="flex flex-col justify-between relative overflow-hidden"
      style={{
        background: '#0a0a0a',
        border: `1px solid ${highlight ? 'rgba(201,169,110,.25)' : '#141414'}`,
        padding: '22px 20px 18px',
      }}
    >
      <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-3" style={{ color: '#333' }}>
        {label}
      </p>
      <p
        className="font-jakarta font-light text-gold-gradient"
        style={{ fontSize: 'clamp(24px,3vw,40px)', lineHeight: 1 }}
      >
        {value}
      </p>
      <p className="text-[10px] font-light mt-1.5" style={{ color: '#2a2a2a' }}>
        {sub}
      </p>
    </div>
  )
}

type StatusFilter = 'all' | 'Active' | 'Completed'
type SortKey = 'date' | 'spend' | 'effectiveRevenue' | 'roas' | 'hires' | 'cpl' | 'cph'

// ── Main ───────────────────────────────────────────────────────────────────

export function AdsClient({
  campaigns,
  creatives,
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey,      setSortKey     ] = useState<SortKey>('date')
  const [sortDir,      setSortDir     ] = useState<'asc' | 'desc'>('asc')
  const [expandedId,   setExpandedId  ] = useState<string | null>(null)

  const counts = useMemo(() => {
    const all = campaigns.length
    const active    = campaigns.filter(c => c.status === 'Active').length
    const completed = campaigns.filter(c => c.status === 'Completed').length
    return { all, active, completed }
  }, [campaigns])

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

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'date' ? 'asc' : 'desc') }
  }

  const arrow = (k: SortKey) =>
    sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const TH = ({
    label, col, right = false,
  }: { label: string; col: SortKey; right?: boolean }) => (
    <th
      onClick={() => handleSort(col)}
      className={`px-4 py-3 text-[8px] font-medium tracking-[.16em] uppercase select-none cursor-pointer ${right ? 'text-right' : 'text-left'}`}
      style={{ color: sortKey === col ? '#c9a96e' : '#2a2a2a', whiteSpace: 'nowrap' }}
    >
      {label}{arrow(col)}
    </th>
  )

  // Creatives grouped by campaign
  const creativesByCampaign = useMemo(() => {
    const m: Record<string, AdCreative[]> = {}
    for (const cr of creatives) {
      const key = cr.campaignId ?? '__none__'
      if (!m[key]) m[key] = []
      m[key].push(cr)
    }
    return m
  }, [creatives])

  return (
    <div>

      {/* ── KPI cards ──────────────────────────────────────────────── */}
      <div
        className="grid gap-px mb-8"
        style={{ gridTemplateColumns: 'repeat(4,1fr)', background: '#141414' }}
      >
        <KpiCard
          label="Total Spend"
          value={fmtMoney(totalSpend)}
          sub={`${campaigns.length} campaigns`}
        />
        <KpiCard
          label="Estimated Revenue"
          value={fmtMoney(totalRevenue)}
          sub="Based on reported ROAS"
          highlight={totalRevenue > 0}
        />
        <KpiCard
          label="Portfolio ROAS"
          value={fmtROAS(portfolioROAS)}
          sub="Revenue ÷ total spend"
          highlight={portfolioROAS > 1}
        />
        <KpiCard
          label="Total Hires"
          value={totalHires > 0 ? totalHires.toString() : '—'}
          sub={totalHires > 0 ? `$${(totalSpend / totalHires).toFixed(0)} per hire` : 'No hires tracked'}
        />
      </div>

      {/* ── Status toggle + campaign table ─────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[9px] font-medium tracking-[.24em] uppercase flex items-center gap-3"
           style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
          Campaign Performance
        </p>

        {/* Toggle */}
        <div className="flex gap-1">
          {([
            ['all',       `All (${counts.all})`],
            ['Active',    `Active (${counts.active})`],
            ['Completed', `Completed (${counts.completed})`],
          ] as [StatusFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className="text-[9px] font-medium tracking-[.14em] uppercase px-3 py-1.5 transition-colors"
              style={{
                color:      statusFilter === val ? '#c9a96e' : '#333',
                background: statusFilter === val ? 'rgba(201,169,110,.07)' : 'transparent',
                border:     `1px solid ${statusFilter === val ? 'rgba(201,169,110,.4)' : '#1a1a1a'}`,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Campaign table ─────────────────────────────────────────── */}
      <div style={{ border: '1px solid #141414', overflowX: 'auto', marginBottom: 48 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
              <th className="text-left px-4 py-3 text-[8px] font-medium tracking-[.16em] uppercase"
                  style={{ color: '#2a2a2a', minWidth: 200 }}>Campaign</th>
              <TH label="Date"    col="date" />
              <th className="text-left px-4 py-3 text-[8px] font-medium tracking-[.16em] uppercase"
                  style={{ color: '#2a2a2a', whiteSpace: 'nowrap' }}>Platform</th>
              <TH label="Spend"   col="spend"           right />
              <TH label="Revenue" col="effectiveRevenue" right />
              <TH label="ROAS"    col="roas"             right />
              <TH label="Leads"   col="cpl"              right />
              <TH label="Hires"   col="hires"            right />
              <TH label="CPL"     col="cpl"              right />
              <TH label="CPH"     col="cph"              right />
              <th className="text-left px-4 py-3 text-[8px] font-medium tracking-[.16em] uppercase"
                  style={{ color: '#2a2a2a', whiteSpace: 'nowrap' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-[11px]"
                    style={{ color: '#2a2a2a' }}>
                  No campaigns match this filter.
                </td>
              </tr>
            ) : rows.map((c, i) => {
              const isWinner   = c.roas > 0
              const isExpanded = expandedId === c.id
              const hasCreatives = (creativesByCampaign[c.id] ?? []).length > 0

              return (
                <>
                  <tr
                    key={c.id}
                    onClick={() => hasCreatives && setExpandedId(isExpanded ? null : c.id)}
                    style={{
                      background:   isWinner
                        ? 'rgba(201,169,110,.03)'
                        : i % 2 === 0 ? '#060606' : '#070707',
                      borderBottom: '1px solid #0e0e0e',
                      borderLeft:   isWinner ? '3px solid rgba(201,169,110,.5)' : '3px solid transparent',
                      cursor: hasCreatives ? 'pointer' : 'default',
                      transition: 'background .15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
                    onMouseLeave={e => (e.currentTarget.style.background =
                      isWinner ? 'rgba(201,169,110,.03)' : i % 2 === 0 ? '#060606' : '#070707')}
                  >
                    {/* Campaign name */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="text-[12px] font-light"
                          style={{ color: isWinner ? '#f2ede4' : '#ccc' }}
                        >
                          {c.name}
                        </span>
                        <span className="text-[9px]" style={{ color: '#333' }}>
                          {c.objective}
                          {hasCreatives && (
                            <span style={{ color: '#c9a96e', marginLeft: 6 }}>
                              {isExpanded ? '▾ creatives' : '▸ creatives'}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Date range */}
                    <td className="px-4 py-3 text-[11px] font-light" style={{ color: '#444', whiteSpace: 'nowrap' }}>
                      {dateRange(c)}
                    </td>

                    {/* Platform */}
                    <td className="px-4 py-3">
                      <span
                        className="text-[7px] font-medium tracking-[.12em] uppercase px-2 py-1"
                        style={{
                          color: '#1778f2',
                          background: 'rgba(23,120,242,.1)',
                          border: '1px solid rgba(23,120,242,.25)',
                        }}
                      >
                        Meta
                      </span>
                    </td>

                    {/* Spend */}
                    <td className="px-4 py-3 text-right">
                      <span className="text-[12px] font-light" style={{ color: '#f2ede4' }}>
                        {fmtMoney(c.spend)}
                      </span>
                    </td>

                    {/* Revenue */}
                    <td className="px-4 py-3 text-right">
                      <span
                        className="text-[12px] font-light"
                        style={{ color: c.effectiveRevenue > 0 ? '#39ff88' : '#252525' }}
                      >
                        {c.effectiveRevenue > 0 ? fmtMoney(c.effectiveRevenue) : '—'}
                      </span>
                    </td>

                    {/* ROAS */}
                    <td className="px-4 py-3 text-right">
                      <span
                        className="font-jakarta font-light"
                        style={{
                          fontSize: c.roas > 0 ? 15 : 12,
                          color: c.roas > 0 ? '#c9a96e' : '#252525',
                        }}
                      >
                        {fmtROAS(c.roas)}
                      </span>
                    </td>

                    {/* Leads */}
                    <td className="px-4 py-3 text-right text-[12px] font-light"
                        style={{ color: c.leads > 0 ? '#aaa' : '#252525' }}>
                      {c.leads > 0 ? c.leads : '—'}
                    </td>

                    {/* Hires */}
                    <td className="px-4 py-3 text-right">
                      <span
                        className="text-[12px] font-light"
                        style={{ color: c.hires > 0 ? '#39ff88' : '#252525' }}
                      >
                        {c.hires > 0 ? c.hires : '—'}
                      </span>
                    </td>

                    {/* CPL */}
                    <td className="px-4 py-3 text-right text-[12px] font-light"
                        style={{ color: c.cpl > 0 ? '#aaa' : '#252525' }}>
                      {c.cpl > 0 ? fmtMoney(c.cpl) : '—'}
                    </td>

                    {/* CPH */}
                    <td className="px-4 py-3 text-right text-[12px] font-light"
                        style={{ color: c.cph > 0 ? '#aaa' : '#252525' }}>
                      {c.cph > 0 ? fmtMoney(c.cph) : '—'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className="text-[7px] font-medium tracking-[.12em] uppercase px-2 py-0.5"
                        style={
                          c.status === 'Active'
                            ? { color: '#39ff88', background: 'rgba(57,255,136,.1)', border: '1px solid rgba(57,255,136,.25)' }
                            : { color: '#444',    background: 'rgba(100,100,100,.08)', border: '1px solid #1e1e1e' }
                        }
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>

                  {/* Creatives expand */}
                  {isExpanded && hasCreatives && (
                    <tr key={`${c.id}-creatives`}>
                      <td colSpan={11} style={{ padding: 0 }}>
                        <div
                          style={{
                            background: '#070707',
                            borderBottom: '1px solid #141414',
                            padding: '16px 24px 16px 28px',
                            borderLeft: '3px solid rgba(201,169,110,.3)',
                          }}
                        >
                          <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-3"
                             style={{ color: '#c9a96e' }}>
                            Creatives
                          </p>
                          <div className="flex flex-col gap-2">
                            {(creativesByCampaign[c.id] ?? []).map(cr => (
                              <div
                                key={cr.id}
                                className="flex items-center gap-6"
                                style={{ borderBottom: '1px solid #0e0e0e', paddingBottom: 8 }}
                              >
                                <span className="text-[11px] font-light" style={{ color: '#f2ede4', minWidth: 180 }}>
                                  {cr.name}
                                </span>
                                <span
                                  className="text-[7px] font-medium tracking-[.1em] uppercase px-2 py-0.5"
                                  style={{
                                    color: '#888',
                                    background: '#0d0d0d',
                                    border: '1px solid #1a1a1a',
                                  }}
                                >
                                  {cr.type}
                                </span>
                                <span className="text-[9px]" style={{ color: '#333' }}>
                                  {cr.status}
                                </span>
                                {cr.impressions > 0 && (
                                  <>
                                    <span className="text-[9px]" style={{ color: '#444' }}>
                                      {fmtNum(cr.impressions)} impressions
                                    </span>
                                    <span className="text-[9px]" style={{ color: '#444' }}>
                                      {fmtPct(cr.ctr)} CTR
                                    </span>
                                  </>
                                )}
                                {cr.impressions === 0 && (
                                  <span className="text-[9px]" style={{ color: '#252525' }}>
                                    No impression data
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Secondary metrics strip ─────────────────────────────────── */}
      <div>
        <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
           style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
          Campaign Details
        </p>
        <div
          className="grid gap-px"
          style={{ gridTemplateColumns: 'repeat(3,1fr)', background: '#141414' }}
        >
          {campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter).map(c => (
            <div
              key={c.id}
              className="flex flex-col gap-3"
              style={{ background: '#0a0a0a', padding: '20px 20px' }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-light" style={{ color: '#f2ede4' }}>
                  {c.name}
                </p>
                <span
                  className="text-[7px] font-medium tracking-[.1em] uppercase px-1.5 py-0.5 shrink-0"
                  style={{
                    color: c.status === 'Active' ? '#39ff88' : '#333',
                    background: c.status === 'Active' ? 'rgba(57,255,136,.08)' : 'transparent',
                    border: `1px solid ${c.status === 'Active' ? 'rgba(57,255,136,.25)' : '#1a1a1a'}`,
                  }}
                >
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
                    <p className="text-[7px] font-medium tracking-[.12em] uppercase mb-0.5"
                       style={{ color: '#2a2a2a' }}>
                      {label}
                    </p>
                    <p className="text-[11px] font-light" style={{ color: '#555' }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue note */}
      <p className="mt-4 text-[9px]" style={{ color: '#1e1e1e' }}>
        Revenue estimated as ROAS × Spend where direct revenue was not recorded.
        Hat Toss ROAS based on 5 hires × attributed rep revenue.
      </p>

    </div>
  )
}
