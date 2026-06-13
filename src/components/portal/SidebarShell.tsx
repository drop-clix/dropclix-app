'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { exitImpersonation } from '@/app/admin/actions'
import { SignOutButton } from '@/components/portal/SignOutButton'

// ── Icons ─────────────────────────────────────────────────────────────────

function Ico({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
  )
}

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: <Ico d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" />,
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: <Ico d="M2 14V9M6 14V5M10 14V1M14 14V7" />,
  },
  {
    href: '/angles',
    label: 'Angles',
    icon: <Ico d="M2 13L8 3l6 10" />,
  },
  {
    href: '/pipeline',
    label: 'Pipeline',
    icon: <Ico d="M2 5h12M2 8h12M2 11h12" />,
  },
  {
    href: '/studio',
    label: 'Studio',
    icon: <Ico d="M5 2l8 6-8 6V2z" />,
  },
  {
    href: '/ads',
    label: 'Ads',
    icon: <Ico d="M8 2v12M5 4h4.5a2.5 2.5 0 010 5H5m0 3h5" />,
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: <Ico d="M2 4h12v10H2zM2 7h12M5 2v4M11 2v4" />,
  },
  {
    href: '/goals',
    label: 'Goals',
    icon: <Ico d="M8 2a6 6 0 100 12A6 6 0 008 2zM8 5a3 3 0 100 6 3 3 0 000-6zM8 7.5a.5.5 0 110 1 .5.5 0 010-1z" />,
  },
  {
    href: '/docs',
    label: 'Docs',
    icon: <Ico d="M4 2h6l4 4v8H4zM9 2v4h4" />,
    adminOnly: true,
  },
  {
    href: '/inbox',
    label: 'Inbox',
    icon: <Ico d="M2 5l6 4 6-4M2 5v7h12V5" />,
  },
]

// ── Hamburger icon ────────────────────────────────────────────────────────

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {open ? (
        <>
          <line x1="3" y1="3" x2="13" y2="13" />
          <line x1="13" y1="3" x2="3" y2="13" />
        </>
      ) : (
        <>
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="2" y1="8" x2="14" y2="8" />
          <line x1="2" y1="12" x2="14" y2="12" />
        </>
      )}
    </svg>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

const COLLAPSED_W = 56
const EXPANDED_W  = 220

// Tab key → href mapping (must match PATH_TO_TAB in layout.tsx)
const TAB_HREFS: Record<string, string> = {
  dashboard: '/',
  analytics: '/analytics',
  angles:    '/angles',
  pipeline:  '/pipeline',
  studio:    '/studio',
  ads:       '/ads',
  calendar:  '/calendar',
  goals:     '/goals',
  docs:      '/docs',
  // inbox intentionally omitted — not gated by enabled_tabs while stub
}

export function SidebarShell({
  clientName,
  userEmail,
  isImpersonating,
  enabledTabs,
  isAdmin = false,
  children,
}: {
  clientName: string
  userEmail: string | null
  isImpersonating: boolean
  enabledTabs: string[]
  isAdmin?: boolean
  children: React.ReactNode
}) {
  const [pinned,  setPinned ] = useState(false)
  const [hovered, setHovered] = useState(false)
  const expanded = pinned || hovered
  const path = usePathname()

  const visibleNavItems = NAV_ITEMS.filter(item => {
    if ('adminOnly' in item && (item as { adminOnly?: boolean }).adminOnly && !isAdmin) return false
    const tabKey = Object.entries(TAB_HREFS).find(([, href]) => href === item.href)?.[0]
    return tabKey ? enabledTabs.includes(tabKey) : true
  })

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#060606' }}>

      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: expanded ? EXPANDED_W : COLLAPSED_W,
          minWidth: expanded ? EXPANDED_W : COLLAPSED_W,
          background: '#060606',
          borderRight: '1px solid #141414',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 200ms ease, min-width 200ms ease',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* ── Top: hamburger + logo ────────────── */}
        <div
          style={{
            height: 64,
            borderBottom: '1px solid #141414',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setPinned(p => !p)}
            style={{
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: pinned ? '#c9a96e' : '#555',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'color .2s',
            }}
            title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          >
            <HamburgerIcon open={pinned} />
          </button>

          {/* Logo — only visible when expanded */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: expanded ? 1 : 0,
              transition: 'opacity 150ms ease',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 300,
                letterSpacing: '.36em',
                textTransform: 'uppercase',
                fontSize: 11,
                color: '#f2ede4',
              }}
            >
              Drop
            </span>
            <div style={{ width: 1, height: 14, background: 'rgba(201,169,110,.35)', flexShrink: 0 }} />
            <span
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 300,
                letterSpacing: '.36em',
                textTransform: 'uppercase',
                fontSize: 11,
                background: 'linear-gradient(135deg,#e8d5a3,#c9a96e)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Clix
            </span>
          </div>
        </div>

        {/* ── Client badge ─────────────────────── */}
        <div
          style={{
            borderBottom: '1px solid #141414',
            padding: expanded ? '20px 20px' : '16px',
            transition: 'padding 200ms ease',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {expanded ? (
            <>
              <p style={{ fontSize: 8, letterSpacing: '.2em', textTransform: 'uppercase', color: '#555', marginBottom: 6 }}>
                Client
              </p>
              <p style={{ fontSize: 13, fontWeight: 300, color: '#f2ede4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {clientName}
              </p>
            </>
          ) : (
            <div
              style={{
                width: 24, height: 24,
                background: 'rgba(201,169,110,.1)',
                border: '1px solid rgba(201,169,110,.2)',
                borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <span style={{ fontSize: 9, color: '#c9a96e', fontWeight: 600, letterSpacing: '.06em' }}>
                {clientName.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* ── Nav ──────────────────────────────── */}
        <nav
          style={{
            flex: 1,
            padding: expanded ? '20px 10px' : '20px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflowY: 'auto',
            overflowX: 'hidden',
            transition: 'padding 200ms ease',
          }}
        >
          {visibleNavItems.map(item => {
            const active = path === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                title={!expanded ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: expanded ? 10 : 0,
                  justifyContent: expanded ? 'flex-start' : 'center',
                  padding: expanded ? '9px 10px' : '9px 0',
                  color: active ? '#c9a96e' : '#666',
                  background: active ? 'rgba(201,169,110,.07)' : 'transparent',
                  borderLeft: active ? '2px solid #c9a96e' : '2px solid transparent',
                  borderRadius: 3,
                  transition: 'color .15s, background .15s, border-color .15s, gap 200ms ease, padding 200ms ease',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textDecoration: 'none',
                  flexShrink: 0,
                  marginLeft: 2,
                  marginRight: 2,
                }}
                onMouseEnter={e => {
                  if (!active) {
                    const el = e.currentTarget as HTMLAnchorElement
                    el.style.color = '#aaa'
                    el.style.background = 'rgba(255,255,255,0.03)'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    const el = e.currentTarget as HTMLAnchorElement
                    el.style.color = '#666'
                    el.style.background = 'transparent'
                  }
                }}
              >
                <span style={{ flexShrink: 0 }}>{item.icon}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '.18em',
                    textTransform: 'uppercase',
                    opacity: expanded ? 1 : 0,
                    maxWidth: expanded ? 160 : 0,
                    overflow: 'hidden',
                    transition: 'opacity 150ms ease 50ms, max-width 200ms ease',
                  }}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* ── Bottom: exit / sign out ──────────── */}
        <div
          style={{
            borderTop: '1px solid #141414',
            padding: expanded ? '16px 20px' : '14px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'space-between' : 'center',
            flexShrink: 0,
            transition: 'padding 200ms ease',
            overflow: 'hidden',
          }}
        >
          {isImpersonating ? (
            <form action={exitImpersonation} style={{ width: '100%', display: 'flex', justifyContent: expanded ? 'flex-start' : 'center' }}>
              <button
                type="submit"
                title="Exit Portal"
                style={{
                  fontSize: 9,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  color: '#c9a96e',
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8h8M10 5l3 3-3 3M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3" />
                </svg>
                {expanded && <span>Exit Portal</span>}
              </button>
            </form>
          ) : (
            <>
              {expanded && (
                <p style={{ fontSize: 9, letterSpacing: '.1em', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                  {userEmail ?? ''}
                </p>
              )}
              <SignOutButton iconOnly={!expanded} />
            </>
          )}
        </div>
      </aside>

      {/* ── Main content ────────────────────────── */}
      <main className="flex-1 overflow-y-auto" style={{ background: '#060606' }}>
        {children}
      </main>

    </div>
  )
}
