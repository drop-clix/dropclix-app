'use client'
import { useState } from 'react'

export type StudioItem = {
  id: string
  postId: string
  title: string
  platform: string[]
  pillar: string | null
  status: string
  priority: number | null
  week: string | null
  scriptContent: string | null
  notes: string | null
}

type Tab = 'scripts' | 'production' | 'planned'

const STATUS_COLOR: Record<string, string> = {
  SCRIPTED:  '#c9a96e',
  FILMING:   '#f59e0b',
  REVIEWING: '#ef4444',
  PLANNED:   '#3a5a8a',
  POSTED:    '#4ade80',
  CANCELLED: '#2a2a2a',
}

const PLAT_COLOR: Record<string, string> = {
  ig: '#e1306c',
  tt: '#a855f7',
  yt: '#60a5fa',
}

function PlatBadge({ platform }: { platform: string }) {
  const color = PLAT_COLOR[platform] ?? '#555'
  const label = platform === 'ig' ? 'IG' : platform === 'tt' ? 'TT' : 'YT'
  return (
    <span style={{
      fontSize: 8, fontWeight: 600, letterSpacing: '.1em',
      padding: '2px 5px', borderRadius: 3,
      background: `${color}18`, border: `1px solid ${color}35`, color,
    }}>
      {label}
    </span>
  )
}

function ScriptCard({ item }: { item: StudioItem }) {
  const [open, setOpen] = useState(false)
  const statusColor = STATUS_COLOR[item.status] ?? '#555'
  const hasScript   = !!item.scriptContent

  return (
    <div style={{
      background: '#0a0a0a',
      border: `1px solid ${open ? 'rgba(201,169,110,.2)' : '#141414'}`,
      borderLeft: `3px solid ${statusColor}`,
      borderRadius: 6, marginBottom: 10, overflow: 'hidden',
      transition: 'border-color .2s',
    }}>
      {/* Card Header */}
      <div style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 9, color: '#c9a96e', fontFamily: 'monospace' }}>{item.postId}</span>
              <span style={{ fontSize: 9, color: statusColor, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                {item.status}
              </span>
              {item.platform.map(p => <PlatBadge key={p} platform={p} />)}
              {item.week && (
                <span style={{ fontSize: 9, color: '#333', letterSpacing: '.08em' }}>Week {item.week}</span>
              )}
            </div>
            <p style={{ fontSize: 13, color: '#f2ede4', margin: 0, fontWeight: 400, lineHeight: 1.3 }}>
              {item.title}
            </p>
            {item.pillar && (
              <p style={{ fontSize: 9, color: '#444', margin: '4px 0 0', letterSpacing: '.08em' }}>{item.pillar}</p>
            )}
          </div>

          {/* Priority dot + expand button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {item.priority === 1 && (
              <span style={{ fontSize: 8, color: '#ef4444', letterSpacing: '.1em', textTransform: 'uppercase' }}>URGENT</span>
            )}
            {hasScript && (
              <button
                onClick={() => setOpen(v => !v)}
                style={{
                  fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                  padding: '5px 10px', borderRadius: 3,
                  background: open ? 'rgba(201,169,110,.12)' : 'rgba(201,169,110,.06)',
                  border: '1px solid rgba(201,169,110,.2)',
                  color: '#c9a96e', cursor: 'pointer', transition: 'background .15s',
                }}
              >
                {open ? 'Hide' : 'Read Script'}
              </button>
            )}
            {!hasScript && (
              <span style={{ fontSize: 9, color: '#2a2a2a', letterSpacing: '.08em' }}>No script</span>
            )}
          </div>
        </div>
      </div>

      {/* Script Content */}
      {open && hasScript && (
        <div style={{
          padding: '0 22px 20px',
          borderTop: '1px solid #141414',
          marginTop: 0,
        }}>
          <div style={{
            padding: '14px 16px',
            marginTop: 12,
            background: '#060606',
            border: '1px solid #141414',
            borderRadius: 4,
            fontSize: 12,
            color: '#ccc',
            lineHeight: 1.75,
            whiteSpace: 'pre-wrap',
            fontFamily: "'DM Sans', sans-serif",
            maxHeight: 360,
            overflowY: 'auto',
          }}>
            {item.scriptContent}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductionRow({ item }: { item: StudioItem }) {
  const statusColor = STATUS_COLOR[item.status] ?? '#555'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px 20px',
      background: '#0a0a0a',
      border: '1px solid #141414',
      borderLeft: `3px solid ${statusColor}`,
      borderRadius: 5, marginBottom: 6,
      fontSize: 10,
    }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {item.platform.map(p => <PlatBadge key={p} platform={p} />)}
      </div>
      <span style={{ color: '#c9a96e', fontFamily: 'monospace', minWidth: 44, fontSize: 9 }}>{item.postId}</span>
      <span style={{ flex: 1, color: '#f2ede4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
      {item.pillar && (
        <span style={{ color: '#444', fontSize: 9, whiteSpace: 'nowrap', display: 'none' }}>{item.pillar}</span>
      )}
      {item.week && (
        <span style={{ color: '#333', fontSize: 9, whiteSpace: 'nowrap' }}>Wk {item.week}</span>
      )}
      <span style={{
        fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase',
        padding: '3px 7px', borderRadius: 3,
        background: `${statusColor}15`, border: `1px solid ${statusColor}30`, color: statusColor,
      }}>
        {item.status}
      </span>
    </div>
  )
}

export function StudioClient({ items }: { items: StudioItem[] }) {
  const [tab, setTab] = useState<Tab>('scripts')

  const scripted   = items.filter(i => i.status === 'SCRIPTED')
  const production = items.filter(i => i.status === 'FILMING' || i.status === 'REVIEWING')
  const planned    = items.filter(i => i.status === 'PLANNED')

  const statusCounts = {
    PLANNED:   items.filter(i => i.status === 'PLANNED').length,
    SCRIPTED:  scripted.length,
    FILMING:   items.filter(i => i.status === 'FILMING').length,
    REVIEWING: items.filter(i => i.status === 'REVIEWING').length,
    POSTED:    items.filter(i => i.status === 'POSTED').length,
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'scripts',    label: 'Scripts to Review', count: scripted.length },
    { key: 'production', label: 'In Production',     count: production.length },
    { key: 'planned',    label: 'Planned',            count: planned.length },
  ]

  return (
    <div>
      {/* Phase Funnel */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 32,
        background: '#0a0a0a', border: '1px solid #141414',
        borderRadius: 6, padding: '20px 24px',
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        {Object.entries(statusCounts).map(([status, count], i, arr) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div style={{ textAlign: 'center', padding: '0 10px' }}>
              <p style={{ fontSize: 16, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, margin: 0, color: STATUS_COLOR[status] ?? '#555' }}>
                {count}
              </p>
              <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#333', margin: '2px 0 0' }}>
                {status}
              </p>
            </div>
            {i < arr.length - 1 && (
              <span style={{ color: '#1e1e1e', fontSize: 14, margin: '0 2px' }}>→</span>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 18px', fontSize: 9,
              fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase',
              background: tab === t.key ? 'rgba(201,169,110,.08)' : 'transparent',
              color: tab === t.key ? '#c9a96e' : '#3a3a3a',
              border: `1px solid ${tab === t.key ? 'rgba(201,169,110,.3)' : '#1e1e1e'}`,
              borderRadius: 4, cursor: 'pointer', transition: 'all .15s',
            }}
          >
            {t.label}
            <span style={{
              marginLeft: 6, fontSize: 8,
              padding: '1px 5px', borderRadius: 8,
              background: tab === t.key ? 'rgba(201,169,110,.15)' : '#141414',
              color: tab === t.key ? '#c9a96e' : '#444',
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'scripts' && (
        <div>
          {scripted.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: '#333' }}>No scripts awaiting review.</p>
            </div>
          ) : (
            scripted
              .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
              .map(item => <ScriptCard key={item.id} item={item} />)
          )}
        </div>
      )}

      {tab === 'production' && (
        <div>
          {production.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: '#333' }}>Nothing in production right now.</p>
            </div>
          ) : (
            <>
              {items.filter(i => i.status === 'FILMING').length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 10 }}>
                    Filming
                  </p>
                  {items.filter(i => i.status === 'FILMING')
                    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
                    .map(item => <ProductionRow key={item.id} item={item} />)}
                </div>
              )}
              {items.filter(i => i.status === 'REVIEWING').length > 0 && (
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 10 }}>
                    Reviewing
                  </p>
                  {items.filter(i => i.status === 'REVIEWING')
                    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
                    .map(item => <ProductionRow key={item.id} item={item} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'planned' && (
        <div>
          {planned.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: '#333' }}>No planned items.</p>
            </div>
          ) : (
            planned
              .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
              .map(item => <ProductionRow key={item.id} item={item} />)
          )}
        </div>
      )}
    </div>
  )
}
