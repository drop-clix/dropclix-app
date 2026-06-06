'use client'

import { useState, useRef, useEffect } from 'react'
import { usePortalFilters } from '@/hooks/usePortalFilters'
import type { PlatformFilter, WindowFilter, ScopeFilter } from '@/hooks/usePortalFilters'

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

function AllIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <circle cx="3" cy="3" r="1.2" fill="currentColor"/>
      <circle cx="9" cy="3" r="1.2" fill="currentColor"/>
      <circle cx="3" cy="9" r="1.2" fill="currentColor"/>
      <circle cx="9" cy="9" r="1.2" fill="currentColor"/>
    </svg>
  )
}

// ── Platform config ────────────────────────────────────────────────────────────

const PLATFORMS: { key: PlatformFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'All',  icon: <AllIcon /> },
  { key: 'ig',  label: 'IG',   icon: <IgIcon /> },
  { key: 'tt',  label: 'TT',   icon: <TtIcon /> },
  { key: 'yt',  label: 'YT',   icon: <YtIcon /> },
  { key: 'lf',  label: 'LF',   icon: <LfIcon /> },
]

// ── Window config ─────────────────────────────────────────────────────────────

const WINDOWS: { key: WindowFilter; label: string }[] = [
  { key: 'w24', label: '24HR' },
  { key: 'w3',  label: '3DAY' },
  { key: 'w7',  label: '7DAY' },
  { key: 'eom', label: 'EOM'  },
]

// ── Scope config ──────────────────────────────────────────────────────────────

const SCOPE_OPTIONS: { key: ScopeFilter; label: string }[] = [
  { key: 'all',   label: 'All Time'   },
  { key: 'week',  label: 'This Week'  },
  { key: 'month', label: 'This Month' },
  { key: 'jan',   label: 'January'    },
  { key: 'feb',   label: 'February'   },
  { key: 'mar',   label: 'March'      },
  { key: 'apr',   label: 'April'      },
  { key: 'may',   label: 'May'        },
  { key: 'jun',   label: 'June'       },
  { key: 'jul',   label: 'July'       },
  { key: 'aug',   label: 'August'     },
  { key: 'sep',   label: 'September'  },
  { key: 'oct',   label: 'October'    },
  { key: 'nov',   label: 'November'   },
  { key: 'dec',   label: 'December'   },
  { key: 'custom',label: 'Custom'     },
]

// ── FilterBar ─────────────────────────────────────────────────────────────────

export function FilterBar() {
  const { platform, win, scope, from, to, setFilters } = usePortalFilters()
  const [scopeOpen, setScopeOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeWinIdx = WINDOWS.findIndex(w => w.key === win)
  const scopeLabel = SCOPE_OPTIONS.find(s => s.key === scope)?.label ?? 'All Time'

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setScopeOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid #141414',
        marginBottom: 24,
        paddingBottom: 0,
      }}
    >
      {/* ── Platform pills ───────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {PLATFORMS.map(p => {
          const active = platform === p.key
          return (
            <button
              key={p.key}
              onClick={() => setFilters({ platform: p.key })}
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
                  (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,169,110,.25)'
                  ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = '#3a3a3a'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#1e1e1e'
                  ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
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

      {/* ── Divider ──────────────────────────────────── */}
      <div style={{ width: 1, height: 22, background: '#1a1a1a', flexShrink: 0 }} />

      {/* ── Window segmented control ──────────────────── */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 2,
          overflow: 'hidden',
          height: 30,
          flexShrink: 0,
        }}
      >
        {/* Sliding indicator */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: 58,
            background: 'rgba(201,169,110,.08)',
            borderRight: '1px solid rgba(201,169,110,.25)',
            borderLeft:  activeWinIdx > 0 ? '1px solid rgba(201,169,110,.25)' : 'none',
            transform: `translateX(${activeWinIdx * 58}px)`,
            transition: 'transform .15s ease',
            pointerEvents: 'none',
          }}
        />
        {WINDOWS.map((w, i) => (
          <button
            key={w.key}
            onClick={() => setFilters({ win: w.key })}
            style={{
              width: 58,
              height: '100%',
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: '.16em',
              textTransform: 'uppercase',
              fontFamily: 'DM Sans, sans-serif',
              color: win === w.key ? '#c9a96e' : '#2e2e2e',
              background: 'transparent',
              border: 'none',
              borderRight: i < WINDOWS.length - 1 ? '1px solid #131313' : 'none',
              cursor: 'pointer',
              position: 'relative',
              zIndex: 1,
              transition: 'color .15s',
            }}
            onMouseEnter={e => {
              if (win !== w.key) (e.currentTarget as HTMLButtonElement).style.color = '#666'
            }}
            onMouseLeave={e => {
              if (win !== w.key) (e.currentTarget as HTMLButtonElement).style.color = '#2e2e2e'
            }}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* ── Divider ──────────────────────────────────── */}
      <div style={{ width: 1, height: 22, background: '#1a1a1a', flexShrink: 0 }} />

      {/* ── Scope dropdown ────────────────────────────── */}
      <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setScopeOpen(v => !v)}
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
          <span>{scopeLabel}</span>
          <span
            style={{
              fontSize: 8,
              color: '#3a3a3a',
              transform: scopeOpen ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform .15s',
              display: 'inline-block',
            }}
          >
            ▾
          </span>
        </button>

        {scopeOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 100,
              background: '#0a0a0a',
              border: '1px solid #1e1e1e',
              minWidth: 160,
              boxShadow: '0 8px 24px rgba(0,0,0,.6)',
            }}
          >
            {SCOPE_OPTIONS.filter(s => s.key !== 'custom').map(s => (
              <button
                key={s.key}
                onClick={() => {
                  setFilters({ scope: s.key })
                  setScopeOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  fontSize: 11,
                  fontFamily: 'DM Sans, sans-serif',
                  color: scope === s.key ? '#c9a96e' : '#444',
                  background: scope === s.key ? 'rgba(201,169,110,.06)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #111',
                  cursor: 'pointer',
                  transition: 'all .1s',
                }}
                onMouseEnter={e => {
                  if (scope !== s.key) (e.currentTarget as HTMLButtonElement).style.background = '#111'
                  ;(e.currentTarget as HTMLButtonElement).style.color = '#c9a96e'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = scope === s.key ? 'rgba(201,169,110,.06)' : 'transparent'
                  ;(e.currentTarget as HTMLButtonElement).style.color = scope === s.key ? '#c9a96e' : '#444'
                }}
              >
                {s.label}
              </button>
            ))}

            {/* Custom separator + option */}
            <div style={{ borderTop: '1px solid #1e1e1e' }}>
              <button
                onClick={() => {
                  setFilters({ scope: 'custom' })
                  setScopeOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  fontSize: 11,
                  fontFamily: 'DM Sans, sans-serif',
                  color: scope === 'custom' ? '#c9a96e' : '#444',
                  background: scope === 'custom' ? 'rgba(201,169,110,.06)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#111'
                  ;(e.currentTarget as HTMLButtonElement).style.color = '#c9a96e'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = scope === 'custom' ? 'rgba(201,169,110,.06)' : 'transparent'
                  ;(e.currentTarget as HTMLButtonElement).style.color = scope === 'custom' ? '#c9a96e' : '#444'
                }}
              >
                Custom Range
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Custom date range inputs */}
      {scope === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
          <input
            type="date"
            value={from ?? ''}
            onChange={e => setFilters({ from: e.target.value || null })}
            style={{
              height: 30, padding: '0 8px',
              fontSize: 10, fontFamily: 'DM Sans, sans-serif',
              background: '#0d0d0d', border: '1px solid #1e1e1e',
              color: '#c9a96e', outline: 'none', cursor: 'pointer',
              borderRadius: 2,
            }}
          />
          <span style={{ fontSize: 10, color: '#2a2a2a' }}>→</span>
          <input
            type="date"
            value={to ?? ''}
            onChange={e => setFilters({ to: e.target.value || null })}
            style={{
              height: 30, padding: '0 8px',
              fontSize: 10, fontFamily: 'DM Sans, sans-serif',
              background: '#0d0d0d', border: '1px solid #1e1e1e',
              color: '#c9a96e', outline: 'none', cursor: 'pointer',
              borderRadius: 2,
            }}
          />
        </div>
      )}
    </div>
  )
}
