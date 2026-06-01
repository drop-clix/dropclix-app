'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button
      onClick={handleSignOut}
      title="Sign Out"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        color: '#333', cursor: 'pointer', background: 'transparent', border: 'none',
        transition: 'color .15s',
        fontSize: 9, fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase',
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#c9a96e')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#333')}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 8H2M6 5l-3 3 3 3M10 3h3a1 1 0 011 1v8a1 1 0 01-1 1h-3" />
      </svg>
      {!iconOnly && <span>Sign Out</span>}
    </button>
  )
}
