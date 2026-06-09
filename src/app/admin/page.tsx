import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/portal/SignOutButton'
import { AdminYouTubeSection } from './AdminYouTubeSection'
import { AdminClientsSection, type ClientRow } from './AdminClientsSection'

export default async function AdminPage() {
  // Auth check uses the regular (anon) client — only needs the user's session.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, email')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  // All data queries use the service-role client — bypasses RLS entirely.
  const adm = createAdminClient()

  const [clientsRes, connectionsRes, postsRes] = await Promise.all([
    adm
      .from('clients')
      .select('id, name, email, slug, created_at, monthly_retainer, enabled_platforms, enabled_tabs')
      .order('created_at', { ascending: false }),
    adm
      .from('platform_connections')
      .select('client_id, channel_name, channel_id, subscriber_count, created_at, last_synced_at')
      .eq('platform', 'youtube'),
    adm
      .from('posts')
      .select('client_id, date')
      .order('date', { ascending: false }),
  ])

  const rawClients = (clientsRes.data ?? []) as unknown as {
    id: string
    name: string
    email: string
    slug: string
    created_at: string
    monthly_retainer: number | null
    enabled_platforms: string[] | null
    enabled_tabs: string[] | null
  }[]

  const allPosts = (postsRes.data ?? []) as unknown as { client_id: string; date: string | null }[]

  const postCountMap    = new Map<string, number>()
  const lastActivityMap = new Map<string, string | null>()
  for (const post of allPosts) {
    const cid = post.client_id
    postCountMap.set(cid, (postCountMap.get(cid) ?? 0) + 1)
    if (!lastActivityMap.has(cid)) lastActivityMap.set(cid, post.date ?? null)
  }

  const clients: ClientRow[] = rawClients.map(c => ({
    id:                c.id,
    name:              c.name,
    email:             c.email,
    slug:              c.slug,
    created_at:        c.created_at,
    monthly_retainer:  c.monthly_retainer,
    postCount:         postCountMap.get(c.id) ?? 0,
    lastActivity:      lastActivityMap.get(c.id) ?? null,
    enabled_platforms: (c.enabled_platforms as string[] | null) ?? ['ig'],
    enabled_tabs:      (c.enabled_tabs      as string[] | null) ?? ['dashboard','analytics','angles','pipeline','studio','ads','calendar','goals'],
  }))

  const ytConnections = (connectionsRes.data ?? []) as unknown as {
    client_id: string
    channel_name: string | null
    channel_id: string | null
    subscriber_count: number | null
    created_at: string | null
    last_synced_at: string | null
  }[]

  const ytSectionConnections = ytConnections.map(c => ({
    clientId:        c.client_id,
    channelName:     c.channel_name,
    channelId:       c.channel_id,
    subscriberCount: c.subscriber_count,
    createdAt:       c.created_at,
    lastSyncedAt:    c.last_synced_at,
  }))

  return (
    <div className="min-h-screen" style={{ background: '#060606', padding: '48px 40px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 48, paddingBottom: 32, borderBottom: '1px solid #111' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span className="font-jakarta font-light tracking-[.36em] uppercase text-[10px]" style={{ color: '#f2ede4' }}>Drop</span>
              <div style={{ width: 1, height: 14, background: 'rgba(201,169,110,.3)' }} />
              <span className="font-jakarta font-light tracking-[.36em] uppercase text-[10px] text-gold-gradient">Clix</span>
            </div>
            <h1 className="font-jakarta font-light" style={{ fontSize: 32, color: '#f2ede4', lineHeight: 1.08, marginBottom: 6 }}>
              Admin
            </h1>
            <p style={{ fontSize: 11, color: '#333', fontWeight: 300 }}>{profile.email}</p>
          </div>
          <SignOutButton />
        </div>

        {/* Clients */}
        <AdminClientsSection clients={clients} />

        {/* YouTube */}
        {clients.length > 0 && (
          <div style={{ marginTop: 56 }}>
            <AdminYouTubeSection
              clients={clients.map(c => ({ id: c.id, name: c.name }))}
              connections={ytSectionConnections}
            />
          </div>
        )}

      </div>
    </div>
  )
}
