'use client'

import { useState, useEffect } from 'react'

export function WelcomeOverlay({ clientName }: { clientName: string }) {
  const [visible,   setVisible  ] = useState(false)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    const key = `dropclix_welcomed_${clientName}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      setVisible(true)
      const t1 = setTimeout(() => setAnimating(true), 1800)
      const t2 = setTimeout(() => setVisible(false), 2600)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [clientName])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(6,6,6,0.95)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        transform: animating ? 'translateY(-100%)' : 'translateY(0)',
        opacity: animating ? 0 : 1,
        transition: 'transform 700ms cubic-bezier(.4,0,.2,1), opacity 500ms ease',
        pointerEvents: 'none',
      }}
    >
      {/* Drop CLIX logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40 }}>
        <span style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 300, letterSpacing: '.4em',
          textTransform: 'uppercase', fontSize: 13, color: '#f2ede4',
        }}>
          Drop
        </span>
        <div style={{ width: 1, height: 20, background: 'rgba(201,169,110,.4)' }} />
        <span style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 300, letterSpacing: '.4em',
          textTransform: 'uppercase', fontSize: 13,
          background: 'linear-gradient(135deg,#e8d5a3,#c9a96e)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Clix
        </span>
      </div>

      {/* Welcome text */}
      <p style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 300,
        fontSize: 'clamp(26px,4vw,46px)',
        letterSpacing: '.02em',
        background: 'linear-gradient(135deg,#e8d5a3 30%,#c9a96e)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        textAlign: 'center',
        lineHeight: 1.2,
        margin: 0,
      }}>
        Welcome back, {clientName}
      </p>

      {/* Divider */}
      <div style={{ marginTop: 28, width: 48, height: 1, background: 'rgba(201,169,110,.35)' }} />
    </div>
  )
}
