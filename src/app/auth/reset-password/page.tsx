'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Status = 'loading' | 'ready' | 'invalid' | 'submitting' | 'success' | 'error'

const inputStyle: React.CSSProperties = {
  background: '#0e0e0e',
  border: '1px solid #1e1e1e',
  color: '#f2ede4',
  fontFamily: 'DM Sans, sans-serif',
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [status, setStatus]           = useState<Status>('loading')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm]         = useState('')
  const [error, setError]             = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Hash is client-only — bail immediately if it doesn't look like a recovery link
    if (!window.location.hash.includes('type=recovery')) {
      setStatus('invalid')
      return
    }

    const supabase = createClient()

    // onAuthStateChange replays the last event on subscribe, so we won't miss it
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        clearTimeout(timerRef.current)
        setStatus('ready')
      }
    })

    // Fallback: if Supabase never emits PASSWORD_RECOVERY (bad token, expired), show invalid
    timerRef.current = setTimeout(() => {
      setStatus(prev => prev === 'loading' ? 'invalid' : prev)
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timerRef.current)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setStatus('submitting')
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    if (updateError) {
      setError(updateError.message)
      setStatus('ready')
      return
    }

    setStatus('success')
    setTimeout(() => router.push('/'), 2500)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative"
      style={{ background: '#060606' }}
    >
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(201,169,110,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="w-full max-w-sm relative z-10 px-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span
            className="font-jakarta text-sm font-light tracking-[.36em] uppercase"
            style={{ color: '#f2ede4' }}
          >
            Drop
          </span>
          <div style={{ width: 1, height: 18, background: 'rgba(201,169,110,.4)' }} />
          <span className="font-jakarta text-sm font-light tracking-[.36em] uppercase text-gold-gradient">
            Clix
          </span>
        </div>

        {/* Card */}
        <div
          className="w-full rounded-none border"
          style={{ background: '#080808', borderColor: '#1a1a1a' }}
        >
          {/* Card header */}
          <div className="px-8 pt-8 pb-6 border-b" style={{ borderColor: '#141414' }}>
            <p
              className="text-[9px] font-medium tracking-[.26em] uppercase mb-2"
              style={{ color: '#c9a96e' }}
            >
              Client Portal
            </p>
            <h1
              className="font-jakarta font-light"
              style={{ fontSize: 26, color: '#f2ede4', lineHeight: 1.1 }}
            >
              {status === 'invalid'
                ? <>Link expired.</>
                : status === 'success'
                ? <>All done.</>
                : <>Set a new<br />password.</>}
            </h1>
          </div>

          {/* Body */}
          <div className="px-8 py-8">

            {/* Loading */}
            {status === 'loading' && (
              <p className="text-xs" style={{ color: '#555' }}>
                Verifying your link…
              </p>
            )}

            {/* Invalid / expired */}
            {status === 'invalid' && (
              <div className="space-y-5">
                <p className="text-xs leading-relaxed" style={{ color: '#555' }}>
                  This reset link is invalid or has expired. Request a new one from the login page.
                </p>
                <a
                  href="/login"
                  className="block w-full py-4 text-center text-[10px] font-bold tracking-[.22em] uppercase transition-all"
                  style={{
                    background: '#c9a96e',
                    color: '#060606',
                  }}
                >
                  Back to Sign In
                </a>
              </div>
            )}

            {/* Success */}
            {status === 'success' && (
              <div className="space-y-5">
                <div
                  className="py-4 px-4 border text-sm"
                  style={{
                    color: '#c9a96e',
                    background: 'rgba(201,169,110,0.06)',
                    borderColor: 'rgba(201,169,110,0.2)',
                    lineHeight: 1.6,
                  }}
                >
                  Password updated — signing you in.
                </div>
                <div className="flex justify-center">
                  <div
                    className="text-[9px] tracking-[.2em] uppercase"
                    style={{ color: '#555' }}
                  >
                    Redirecting…
                  </div>
                </div>
              </div>
            )}

            {/* Form */}
            {(status === 'ready' || status === 'submitting' || status === 'error') && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-[9px] font-medium tracking-[.2em] uppercase mb-2"
                    style={{ color: '#444' }}
                  >
                    New Password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    autoFocus
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 text-sm outline-none transition-colors"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#c9a96e')}
                    onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-[9px] font-medium tracking-[.2em] uppercase mb-2"
                    style={{ color: '#444' }}
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 text-sm outline-none transition-colors"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#c9a96e')}
                    onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
                  />
                </div>

                {error && (
                  <p
                    className="text-xs py-3 px-4 border"
                    style={{
                      color: '#c9a96e',
                      background: 'rgba(201,169,110,0.06)',
                      borderColor: 'rgba(201,169,110,0.2)',
                    }}
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  className="w-full py-4 text-[10px] font-bold tracking-[.22em] uppercase transition-all"
                  style={{
                    background: status === 'submitting' ? '#a07840' : '#c9a96e',
                    color: '#060606',
                    cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {status === 'submitting' ? 'Updating…' : 'Update Password'}
                </button>

                <a
                  href="/login"
                  className="block w-full py-3 text-center text-[9px] tracking-[.18em] uppercase transition-colors"
                  style={{ color: '#444' }}
                  onMouseEnter={e => ((e.target as HTMLElement).style.color = '#c9a96e')}
                  onMouseLeave={e => ((e.target as HTMLElement).style.color = '#444')}
                >
                  ← Back to Sign In
                </a>
              </form>
            )}
          </div>
        </div>

        <p
          className="text-center mt-6 text-[9px] tracking-[.14em]"
          style={{ color: '#222' }}
        >
          © 2026 Drop CLIX
        </p>
      </div>
    </div>
  )
}
