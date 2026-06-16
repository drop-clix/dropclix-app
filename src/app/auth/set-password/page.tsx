'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Status = 'ready' | 'submitting' | 'success'

const inputStyle: React.CSSProperties = {
  background: '#0e0e0e',
  border: '1px solid #1e1e1e',
  color: '#f2ede4',
  fontFamily: 'DM Sans, sans-serif',
}

export default function SetPasswordPage() {
  const router = useRouter()
  const [status,      setStatus     ] = useState<Status>('ready')
  const [newPassword, setNewPassword] = useState('')
  const [confirm,     setConfirm    ] = useState('')
  const [error,       setError      ] = useState<string | null>(null)

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
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    })

    if (updateError) {
      if (updateError.message.toLowerCase().includes('session')) {
        router.replace('/login')
        return
      }
      setError(updateError.message)
      setStatus('ready')
      return
    }

    setStatus('success')
    setTimeout(() => router.replace('/'), 2000)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative"
      style={{ background: '#060606' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(201,169,110,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="w-full max-w-sm relative z-10 px-4">
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

        <div
          className="w-full rounded-none border"
          style={{ background: '#080808', borderColor: '#1a1a1a' }}
        >
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
              {status === 'success'
                ? <>All done.</>
                : <>Create your<br />password.</>}
            </h1>
          </div>

          <div className="px-8 py-8">
            {status === 'success' ? (
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
                  Password set — taking you to your dashboard.
                </div>
                <div className="flex justify-center">
                  <div className="text-[9px] tracking-[.2em] uppercase" style={{ color: '#555' }}>
                    Redirecting…
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <p className="text-xs leading-relaxed" style={{ color: '#555' }}>
                  You&apos;re almost in. Set a password to secure your account.
                </p>

                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-[9px] font-medium tracking-[.2em] uppercase mb-2"
                    style={{ color: '#666' }}
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
                    style={{ color: '#666' }}
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
                  {status === 'submitting' ? 'Setting password…' : 'Set Password'}
                </button>
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
