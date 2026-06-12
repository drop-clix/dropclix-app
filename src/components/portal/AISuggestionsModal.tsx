'use client'

import { useEffect, useRef } from 'react'

export type AISuggestion = { icon: string; headline: string; body: string; trigger: string }

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  suggestions: AISuggestion[]
  loading: boolean
}

function SparkIcon({ color = '#c9a96e', size = 16 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5L9.6 6.4L14.5 8L9.6 9.6L8 14.5L6.4 9.6L1.5 8L6.4 6.4L8 1.5Z" stroke={color} strokeWidth="1.2" />
    </svg>
  )
}

const ICON_COLORS: Record<string, string> = {
  trend:  '#39ff88',
  fire:   '#39ff88',
  spark:  '#c9a96e',
  hook:   '#c9a96e',
  pillar: '#4cc9ff',
  repair: '#ff3b5f',
  pace:   '#fbbf24',
  ad:     '#c9a96e',
}

export function AISuggestionsModal({ isOpen, onClose, title, subtitle, suggestions, loading }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 960,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        style={{
          width: '100%', maxWidth: 680,
          maxHeight: '84vh', overflowY: 'auto',
          background: 'rgba(6,6,6,0.98)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(201,169,110,0.18)',
          borderRadius: 10,
          boxShadow: '0 40px 120px rgba(0,0,0,0.85), 0 0 0 1px rgba(201,169,110,0.05), inset 0 1px 0 rgba(255,255,255,0.03)',
          animation: 'aiModalIn 0.22s cubic-bezier(0.16,1,0.3,1) forwards',
        }}
      >
        {/* Header */}
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SparkIcon color="#c9a96e" size={18} />
            <div>
              <p style={{ color: '#c9a96e', fontSize: 8, letterSpacing: '.22em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>AI Insights</p>
              <h2 className="font-jakarta" style={{ color: '#f2ede4', fontSize: 'clamp(18px,2vw,24px)', fontWeight: 300, lineHeight: 1.15 }}>{title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close insights"
            style={{
              width: 32, height: 32,
              border: '1px solid rgba(201,169,110,0.2)',
              background: 'rgba(201,169,110,0.05)',
              color: '#c9a96e',
              cursor: 'pointer',
              borderRadius: 6,
              fontSize: 16,
              lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 26px 28px' }}>
          {subtitle && (
            <p style={{ color: '#444', fontSize: 11, marginBottom: 20, lineHeight: 1.5 }}>{subtitle}</p>
          )}

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  style={{
                    height: 130,
                    background: 'rgba(255,255,255,0.025)',
                    borderRadius: 6,
                    animation: `aiSkeletonPulse 1.4s ease-in-out ${i * 0.12}s infinite`,
                  }}
                />
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <p style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: '32px 0' }}>No insights available.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
              {suggestions.map((s, i) => {
                const accentColor = ICON_COLORS[s.icon] ?? '#c9a96e'
                return (
                  <div
                    key={i}
                    style={{
                      background: '#070707',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderLeft: `2px solid ${accentColor}55`,
                      borderRadius: 6,
                      padding: '18px 18px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                      <SparkIcon color={accentColor} size={12} />
                      <p style={{ color: '#3a3a3a', fontSize: 8, letterSpacing: '.15em', textTransform: 'uppercase' }}>{s.icon}</p>
                    </div>
                    <h3 className="font-jakarta" style={{ color: '#f2ede4', fontSize: 15, fontWeight: 300, lineHeight: 1.3, marginBottom: 8 }}>{s.headline}</h3>
                    <p style={{ color: '#666', fontSize: 11, lineHeight: 1.55, marginBottom: 8 }}>{s.body}</p>
                    <p style={{ color: accentColor, fontSize: 10, opacity: 0.85 }}>{s.trigger}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
