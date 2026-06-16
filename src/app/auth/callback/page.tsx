'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Read code from URL directly — avoids useSearchParams Suspense requirement
    const code = new URLSearchParams(window.location.search).get('code')

    if (!code) {
      router.replace('/login?error=auth_failed')
      return
    }

    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        clearTimeout(timerRef.current)
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()
        router.replace(profile?.role === 'admin' ? '/admin' : '/')
      }
    })

    // Exchange code using browser client — has localStorage access for the PKCE verifier
    supabase.auth.exchangeCodeForSession(code).catch((err: Error) => {
      console.error('[auth/callback] exchangeCodeForSession failed:', err.message)
    })

    timerRef.current = setTimeout(() => {
      subscription.unsubscribe()
      router.replace('/login?error=auth_failed')
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timerRef.current)
    }
  }, [router])

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
              Signing you<br />in…
            </h1>
          </div>

          <div className="px-8 py-8">
            <p className="text-xs" style={{ color: '#555' }}>
              Verifying your link…
            </p>
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
