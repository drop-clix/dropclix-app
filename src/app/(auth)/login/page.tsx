'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

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

    // Role-based redirect
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()

    router.refresh()
    router.push(profile?.role === 'admin' ? '/admin' : '/')
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
              Sign in to your<br />account.
            </h1>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="px-8 py-8 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-[9px] font-medium tracking-[.2em] uppercase mb-2"
                style={{ color: '#444' }}
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
              <label
                htmlFor="password"
                className="block text-[9px] font-medium tracking-[.2em] uppercase mb-2"
                style={{ color: '#444' }}
              >
                Password
              </label>
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
