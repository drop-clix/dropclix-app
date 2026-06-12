'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'reset'
type ResetStatus = 'idle' | 'sending' | 'sent' | 'error'

export default function LoginPage() {
  const router = useRouter()

  // Login state
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  // Reset state
  const [mode, setMode]               = useState<Mode>('login')
  const [resetEmail, setResetEmail]   = useState('')
  const [resetStatus, setResetStatus] = useState<ResetStatus>('idle')
  const [resetError, setResetError]   = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !data.user) {
      setError(authError?.message ?? 'Login failed')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()

    router.refresh()
    router.push(profile?.role === 'admin' ? '/admin' : '/')
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setResetError(null)
    setResetStatus('sending')

    const supabase = createClient()
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    if (resetErr) {
      setResetError(resetErr.message)
      setResetStatus('error')
    } else {
      setResetStatus('sent')
    }
  }

  function enterResetMode() {
    setResetEmail(email) // pre-fill if they already typed their email
    setResetStatus('idle')
    setResetError(null)
    setMode('reset')
  }

  function enterLoginMode() {
    setMode('login')
    setResetStatus('idle')
    setResetError(null)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative"
      style={{ background: '#060606' }}
    >
      {/* Subtle radial glow */}
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
          <span
            className="font-jakarta text-sm font-light tracking-[.36em] uppercase text-gold-gradient"
          >
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
              {mode === 'login' ? (
                <>Sign in to your<br />account.</>
              ) : (
                <>Reset your<br />password.</>
              )}
            </h1>
          </div>

          {/* Login form */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="px-8 py-8 space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-[9px] font-medium tracking-[.2em] uppercase mb-2"
                  style={{ color: '#666' }}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-4 py-3 text-sm outline-none transition-colors"
                  style={{
                    background: '#0e0e0e',
                    border: '1px solid #1e1e1e',
                    color: '#f2ede4',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#c9a96e')}
                  onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="password"
                    className="block text-[9px] font-medium tracking-[.2em] uppercase"
                    style={{ color: '#666' }}
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={enterResetMode}
                    className="text-[9px] tracking-[.16em] uppercase transition-colors"
                    style={{ color: '#555' }}
                    onMouseEnter={e => ((e.target as HTMLElement).style.color = '#c9a96e')}
                    onMouseLeave={e => ((e.target as HTMLElement).style.color = '#555')}
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 text-sm outline-none transition-colors"
                  style={{
                    background: '#0e0e0e',
                    border: '1px solid #1e1e1e',
                    color: '#f2ede4',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
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
                disabled={loading}
                className="w-full py-4 text-[10px] font-bold tracking-[.22em] uppercase transition-all"
                style={{
                  background: loading ? '#a07840' : '#c9a96e',
                  color: '#060606',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          )}

          {/* Reset form */}
          {mode === 'reset' && (
            <div className="px-8 py-8 space-y-5">
              {resetStatus === 'sent' ? (
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
                    Check your email for a reset link.
                  </div>
                  <button
                    type="button"
                    onClick={enterLoginMode}
                    className="w-full py-4 text-[10px] font-bold tracking-[.22em] uppercase transition-all"
                    style={{
                      background: 'transparent',
                      color: '#c9a96e',
                      border: '1px solid rgba(201,169,110,0.3)',
                      cursor: 'pointer',
                    }}
                  >
                    ← Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-5">
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: '#555' }}
                  >
                    Enter your email and we'll send you a link to reset your password.
                  </p>

                  <div>
                    <label
                      htmlFor="reset-email"
                      className="block text-[9px] font-medium tracking-[.2em] uppercase mb-2"
                      style={{ color: '#666' }}
                    >
                      Email
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full px-4 py-3 text-sm outline-none transition-colors"
                      style={{
                        background: '#0e0e0e',
                        border: '1px solid #1e1e1e',
                        color: '#f2ede4',
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                      onFocus={e => (e.target.style.borderColor = '#c9a96e')}
                      onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
                    />
                  </div>

                  {resetError && (
                    <p
                      className="text-xs py-3 px-4 border"
                      style={{
                        color: '#c9a96e',
                        background: 'rgba(201,169,110,0.06)',
                        borderColor: 'rgba(201,169,110,0.2)',
                      }}
                    >
                      {resetError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={resetStatus === 'sending'}
                    className="w-full py-4 text-[10px] font-bold tracking-[.22em] uppercase transition-all"
                    style={{
                      background: resetStatus === 'sending' ? '#a07840' : '#c9a96e',
                      color: '#060606',
                      cursor: resetStatus === 'sending' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {resetStatus === 'sending' ? 'Sending…' : 'Send Reset Link'}
                  </button>

                  <button
                    type="button"
                    onClick={enterLoginMode}
                    className="w-full py-3 text-[9px] tracking-[.18em] uppercase transition-colors"
                    style={{ color: '#666', cursor: 'pointer' }}
                    onMouseEnter={e => ((e.target as HTMLElement).style.color = '#c9a96e')}
                    onMouseLeave={e => ((e.target as HTMLElement).style.color = '#444')}
                  >
                    ← Back to Sign In
                  </button>
                </form>
              )}
            </div>
          )}
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
