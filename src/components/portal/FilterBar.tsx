'use client'

import { useState, useRef, useEffect } from 'react'
import { usePortalFilters } from '@/hooks/usePortalFilters'
import { useClientConfig } from '@/lib/client-config-context'
import type { PlatformFilter, ScopeFilter } from '@/hooks/usePortalFilters'

// ── SVG icons ─────────────────────────────────────────────────────────────────

function IgIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2" width="10" height="10" rx="3" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="10.6" cy="3.4" r="0.75" fill="currentColor"/>
    </svg>
  )
}

function TtIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path
        d="M9.5 2.5C9.5 5 11 6 13 6V8C11.6 8 10.4 7.5 9.5 6.8V10.5C9.5 12.2 8.1 13.5 6.5 13.5S3.5 12.2 3.5 10.5 4.9 7.5 6.5 7.5c.25 0 .5.03.7.1V9.6C7 9.54 6.75 9.5 6.5 9.5 5.7 9.5 5 10.2 5 11s.7 1.5 1.5 1.5S8 11.8 8 11V1.5h1.5V2.5z"
        fill="currentColor"
      />
    </svg>
  )
}

function YtIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 16 12" fill="none">
      <rect x="0.6" y="0.6" width="14.8" height="10.8" rx="2.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M6.5 3.5L10.8 6L6.5 8.5V3.5Z" fill="currentColor"/>
    </svg>
  )
}

function LfIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3 5.5H5.5M8.5 5.5H11M3 8.5H5.5M8.5 8.5H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M5.5 2.5V11.5M8.5 2.5V11.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5"/>
    </svg>
  )
}

// ── Platform config (no ALL) ───────────────────────────────────────────────────

const PLATFORMS: { key: PlatformFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'ig',  label: 'IG',  icon: <IgIcon /> },
  { key: 'tt',  label: 'TT',  icon: <TtIcon /> },
  { key: 'yt',  label: 'YT',  icon: <YtIcon /> },
  { key: 'lf',  label: 'LF',  icon: <LfIcon /> },
]

// ── Scope config ───────────────────────────────────────────────────────────────

const FULL_SCOPE: { key: ScopeFilter; label: string }[] = [
  { key: 'all',  label: 'All Time'  },
  { key: 'week', label: 'This Week' },
  { key: 'jan',  label: 'January'   },
  { key: 'feb',  label: 'February'  },
  { key: 'mar',  label: 'March'     },
  { key: 'apr',  label: 'April'     },
  { key: 'may',  label: 'May'       },
  { key: 'jun',  label: 'June'      },
  { key: 'jul',  label: 'July'      },
  { key: 'aug',  label: 'August'    },
  { key: 'sep',  label: 'September' },
  { key: 'oct',  label: 'October'   },
  { key: 'nov',  label: 'November'  },
  { key: 'dec',  label: 'December'  },
]

const COMPACT_SCOPE: { key: ScopeFilter; label: string }[] = [
  { key: 'all',   label: 'All Time'   },
  { key: 'week',  label: 'This Week'  },
  { key: 'month', label: 'This Month' },
]

// ── PlatformPills (shared) ─────────────────────────────────────────────────────

export function PlatformPills({
  platform,
  onChange,
}: {
  platform: PlatformFilter
  onChange: (p: PlatformFilter) => void
}) {
  const { enabledPlatforms } = useClientConfig()
  const visiblePlatforms = PLATFORMS.filter(p => enabledPlatforms.includes(p.key))

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {visiblePlatforms.map(p => {
        const active = platform === p.key
        return (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              height: 30,
              padding: '0 11px',
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              fontFamily: 'DM Sans, sans-serif',
              cursor: 'pointer',
              border: `1px solid ${active ? 'rgba(201,169,110,.5)' : '#1e1e1e'}`,
              background: active ? '#c9a96e' : '#0d0d0d',
              color: active ? '#000' : '#3a3a3a',
              boxShadow: active ? '0 0 10px rgba(201,169,110,.2)' : 'none',
              transition: 'all .15s ease',
              borderRadius: 2,
            }}
            onMouseEnter={e => {
              if (!active) {
                const el = e.currentTarget as HTMLButtonElement
                el.style.color = '#c9a96e'
                el.style.borderColor = 'rgba(201,169,110,.25)'
                el.style.transform = 'translateY(-1px)'
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                const el = e.currentTarget as HTMLButtonElement
                el.style.color = '#3a3a3a'
                el.style.borderColor = '#1e1e1e'
                el.style.transform = 'translateY(0)'
              }
            }}
          >
            <span style={{ color: active ? '#000' : 'currentColor', display: 'flex', alignItems: 'center' }}>
              {p.icon}
            </span>
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

// ── ScopeDropdown (shared) ─────────────────────────────────────────────────────

export function ScopeDropdown({
  scope,
  onChange,
  compact = false,
}: {
  scope: ScopeFilter
  onChange: (s: ScopeFilter) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const options = compact ? COMPACT_SCOPE : FULL_SCOPE
  const label = options.find(o => o.key === scope)?.label
    ?? FULL_SCOPE.find(o => o.key === scope)?.label
    ?? 'All Time'

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          height: 30,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          fontFamily: 'DM Sans, sans-serif',
          color: scope !== 'all' ? '#c9a96e' : '#3a3a3a',
          background: scope !== 'all' ? 'rgba(201,169,110,.06)' : '#0d0d0d',
          border: `1px solid ${scope !== 'all' ? 'rgba(201,169,110,.3)' : '#1e1e1e'}`,
          cursor: 'pointer',
          borderRadius: 2,
          transition: 'all .15s',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 8, color: '#3a3a3a', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 200,
          background: '#0a0a0a',
          border: '1px solid #1e1e1e',
          minWidth: 148,
          boxShadow: '0 8px 24px rgba(0,0,0,.6)',
          maxHeight: 320,
          overflowY: 'auto',
        }}>
          {options.map(o => (
            <button
              key={o.key}
              onClick={() => { onChange(o.key); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 14px',
                fontSize: 11,
                fontFamily: 'DM Sans, sans-serif',
                color: scope === o.key ? '#c9a96e' : '#444',
                background: scope === o.key ? 'rgba(201,169,110,.06)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid #111',
                cursor: 'pointer',
                transition: 'all .1s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                if (scope !== o.key) el.style.background = '#111'
                el.style.color = '#c9a96e'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = scope === o.key ? 'rgba(201,169,110,.06)' : 'transparent'
                el.style.color = scope === o.key ? '#c9a96e' : '#444'
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── FilterBar ─────────────────────────────────────────────────────────────────
// showScope: show the time/scope dropdown (default false)
// scopeCompact: compact mode — ALL TIME / THIS WEEK / THIS MONTH (default false = full month list)

export function FilterBar({
  showScope = false,
  scopeCompact = false,
}: {
  showScope?: boolean
  scopeCompact?: boolean
}) {
  const { platform, scope, setFilters } = usePortalFilters()

  return (
    <div
      style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid #141414',
        marginBottom: 24,
      }}
    >
      <PlatformPills
        platform={platform}
        onChange={p => setFilters({ platform: p })}
      />

      {showScope && (
        <>
          <div style={{ width: 1, height: 22, background: '#1a1a1a', flexShrink: 0 }} />
          <ScopeDropdown
            scope={scope}
            onChange={s => setFilters({ scope: s })}
            compact={scopeCompact}
          />
        </>
      )}
    </div>
  )
}
