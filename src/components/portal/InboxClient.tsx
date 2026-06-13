'use client'

import { useState } from 'react'

type Platform = 'all' | 'ig' | 'tt' | 'yt'

const PLAT_CFG: Record<string, { label: string; color: string }> = {
  ig: { label: 'Instagram', color: '#c9a96e' },
  tt: { label: 'TikTok',    color: '#2dd4bf' },
  yt: { label: 'YouTube',   color: '#4cc9ff' },
}

const PILLS: { key: Platform; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ig',  label: 'Instagram' },
  { key: 'tt',  label: 'TikTok' },
  { key: 'yt',  label: 'YouTube' },
]

function PlatformPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '.14em',
        textTransform: 'uppercase' as const,
        borderRadius: 3,
        border: active ? '1px solid rgba(201,169,110,.4)' : '1px solid #1e1e1e',
        background: active ? 'rgba(201,169,110,.08)' : 'transparent',
        color: active ? '#c9a96e' : '#666',
        cursor: 'pointer',
        transition: 'all .12s',
      }}
    >
      {children}
    </button>
  )
}

export function InboxClient() {
  const [platform, setPlatform] = useState<Platform>('all')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Filter bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 32,
        paddingBottom: 20,
        borderBottom: '1px solid #141414',
      }}>
        {PILLS.map(p => (
          <PlatformPill key={p.key} active={platform === p.key} onClick={() => setPlatform(p.key)}>
            {p.label}
          </PlatformPill>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 9, color: '#444', letterSpacing: '.1em', textTransform: 'uppercase' as const }}>
          0 messages
        </div>
      </div>

      {/* Empty state */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 40px',
        textAlign: 'center',
        gap: 16,
      }}>
        {/* Icon */}
        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'rgba(201,169,110,.06)',
          border: '1px solid rgba(201,169,110,.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="#c9a96e" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 5l6 4 6-4M2 5v7h12V5" />
          </svg>
        </div>

        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#f2ede4', margin: '0 0 6px' }}>
            No messages yet
          </p>
          <p style={{ fontSize: 11, color: '#555', margin: 0, maxWidth: 320, lineHeight: 1.6 }}>
            Connect your platforms to see comments and messages here.
            {platform !== 'all' && (
              <> {PLAT_CFG[platform]?.label} integration coming soon.</>
            )}
          </p>
        </div>

        {/* Platform badges */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {Object.entries(PLAT_CFG).map(([key, cfg]) => (
            <div
              key={key}
              style={{
                padding: '5px 12px',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '.12em',
                textTransform: 'uppercase' as const,
                borderRadius: 3,
                border: `1px solid ${cfg.color}33`,
                color: `${cfg.color}99`,
                background: `${cfg.color}08`,
              }}
            >
              {cfg.label}
            </div>
          ))}
        </div>

        {/* Reply button (disabled, tooltip) */}
        <div style={{ position: 'relative' as const, display: 'inline-block', marginTop: 8 }}>
          <button
            disabled
            title="Connect platform to reply"
            style={{
              padding: '8px 20px',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '.14em',
              textTransform: 'uppercase' as const,
              borderRadius: 3,
              border: '1px solid #222',
              background: '#0d0d0d',
              color: '#333',
              cursor: 'not-allowed',
            }}
          >
            Reply
          </button>
        </div>
      </div>
    </div>
  )
}
