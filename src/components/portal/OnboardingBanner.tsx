'use client'

import { useState, useEffect } from 'react'
import { useClientConfig } from '@/lib/client-config-context'

const STORAGE_KEY = 'dropclix_onboarding_banner_dismissed'

export function OnboardingBanner({ postCount }: { postCount: number }) {
  const { isAdmin } = useClientConfig()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isAdmin) return
    if (postCount >= 5) return
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return
    } catch { /* localStorage unavailable */ }
    setVisible(true)
  }, [isAdmin, postCount])

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      style={{
        borderLeft: '3px solid #c9a96e',
        background: 'rgba(201,169,110,.04)',
        padding: '14px 20px',
        marginBottom: 28,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <div>
        <p style={{ fontSize: 11, fontWeight: 500, color: '#c9a96e', marginBottom: 4, letterSpacing: '.02em' }}>
          Welcome to your portal
        </p>
        <p style={{ fontSize: 10, color: '#555', fontWeight: 300, lineHeight: 1.7 }}>
          Your content manager is setting things up — your analytics and video data will appear here soon.
          Check back after your first batch of content is imported.
        </p>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#333',
          fontSize: 14,
          cursor: 'pointer',
          flexShrink: 0,
          lineHeight: 1,
          padding: '2px 4px',
        }}
      >
        ×
      </button>
    </div>
  )
}
