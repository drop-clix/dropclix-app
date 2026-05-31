import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/portal/SignOutButton'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, email')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  // Fetch all clients for overview
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email, slug, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen p-10" style={{ background: '#060606' }}>
      <div className="max-w-3xl">

        {/* Header */}
        <div className="flex items-start justify-between mb-10" style={{ borderBottom: '1px solid #141414', paddingBottom: 28 }}>
          <div>
            <div className="flex items-center gap-3 mb-2">
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
            <h1
              className="font-jakarta font-light"
              style={{ fontSize: 36, color: '#f2ede4', lineHeight: 1.06 }}
            >
              Admin
            </h1>
            <p className="text-[11px] font-light mt-1" style={{ color: '#444' }}>
              {profile.email}
            </p>
          </div>
          <SignOutButton />
        </div>

        {/* Clients */}
        <div>
          <p
            className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
            style={{ color: '#c9a96e' }}
          >
            <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
            Clients
          </p>

          {!clients || clients.length === 0 ? (
            <div
              className="px-6 py-10 text-center text-[11px] font-light"
              style={{ background: '#080808', border: '1px solid #141414', color: '#2a2a2a' }}
            >
              No clients yet — add clients to Supabase to get started.
            </div>
          ) : (
            <div className="flex flex-col gap-px" style={{ background: '#141414' }}>
              {clients.map(client => (
                <div
                  key={client.id}
                  className="flex items-center justify-between px-6 py-4"
                  style={{ background: '#0a0a0a' }}
                >
                  <div>
                    <p className="text-[13px] font-light" style={{ color: '#f2ede4' }}>
                      {client.name}
                    </p>
                    <p className="text-[10px] font-light mt-0.5" style={{ color: '#444' }}>
                      {client.email}
                    </p>
                  </div>
                  <p
                    className="text-[8px] tracking-[.14em] uppercase px-2 py-1"
                    style={{ background: '#141414', color: '#c9a96e' }}
                  >
                    {client.slug}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Session status */}
        <div
          className="mt-10 px-6 py-5 text-[11px] font-light"
          style={{ background: '#080808', border: '1px solid #141414', color: '#444', lineHeight: 1.8 }}
        >
          <span style={{ color: '#c9a96e' }}>Session 3 complete.</span>{' '}
          Login page styled. Dashboard page live with Supabase queries.
          Next: Session 4 — Analytics + Pipeline tabs.
        </div>

      </div>
    </div>
  )
}
