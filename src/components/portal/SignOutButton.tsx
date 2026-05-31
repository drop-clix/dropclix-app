'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-[9px] font-medium tracking-[.16em] uppercase transition-colors"
      style={{ color: '#333', cursor: 'pointer' }}
      onMouseEnter={e => ((e.target as HTMLElement).style.color = '#c9a96e')}
      onMouseLeave={e => ((e.target as HTMLElement).style.color = '#333')}
    >
      Sign Out
    </button>
  )
}
