import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortalNav } from '@/components/portal/PortalNav'
import { SignOutButton } from '@/components/portal/SignOutButton'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, email, client_id')
    .eq('id', user.id)
    .single()

  // Admin users go to their own page, not the client dashboard
  if (profile?.role === 'admin') redirect('/admin')

  const { data: client } = profile?.client_id
    ? await supabase
        .from('clients')
        .select('name, slug')
        .eq('id', profile.client_id)
        .single()
    : { data: null }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#060606' }}>

      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        className="flex flex-col shrink-0"
        style={{
          width: 220,
          background: '#060606',
          borderRight: '1px solid #141414',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-6"
          style={{ height: 64, borderBottom: '1px solid #141414' }}
        >
          <span
            className="font-jakarta font-light tracking-[.36em] uppercase text-[11px]"
            style={{ color: '#f2ede4' }}
          >
            Drop
          </span>
          <div style={{ width: 1, height: 16, background: 'rgba(201,169,110,.35)' }} />
          <span
            className="font-jakarta font-light tracking-[.36em] uppercase text-[11px] text-gold-gradient"
          >
            Clix
          </span>
        </div>

        {/* Client badge */}
        <div className="px-6 py-5" style={{ borderBottom: '1px solid #141414' }}>
          <p
            className="text-[8px] font-medium tracking-[.2em] uppercase mb-1"
            style={{ color: '#2a2a2a' }}
          >
            Client
          </p>
          <p
            className="text-[12px] font-light"
            style={{ color: '#f2ede4' }}
          >
            {client?.name ?? profile?.email ?? 'Portal'}
          </p>
        </div>

        {/* Nav */}
        <div className="flex-1 py-4 overflow-y-auto">
          <PortalNav />
        </div>

        {/* Bottom: sign out */}
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ borderTop: '1px solid #141414' }}
        >
          <p
            className="text-[9px] tracking-[.1em] truncate max-w-[120px]"
            style={{ color: '#2a2a2a' }}
          >
            {profile?.email ?? user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      {/* ── Main content ────────────────────────── */}
      <main className="flex-1 overflow-y-auto" style={{ background: '#060606' }}>
        {children}
      </main>

    </div>
  )
}
