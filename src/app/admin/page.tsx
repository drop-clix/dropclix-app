import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/portal/SignOutButton'
import { AdminYouTubeSection } from './AdminYouTubeSection'
import { AdminClientsSection, type ClientRow } from './AdminClientsSection'

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

  const adm = createAdminClient()

  const [connectionsRes, postsRes] = await Promise.all([
    adm
      .from('platform_connections')
      .select('client_id, channel_name, channel_id, subscriber_count, created_at, last_synced_at')
      .eq('platform', 'youtube'),
    // Fetch post counts + last activity date per client
    adm
      .from('posts')
      .select('client_id, date')
      .order('date', { ascending: false }),
  ])

  // Try with Session 25 columns; fall back gracefully if migration not yet applied
  const clientsRes = await adm
    .from('clients')
    .select('id, name, email, slug, created_at, monthly_retainer, enabled_platforms, enabled_tabs')
    .order('created_at', { ascending: false })

  const clientsData = clientsRes.error
    ? (await adm.from('clients').select('id, name, email, slug, created_at, monthly_retainer').order('created_at', { ascending: false })).data ?? []
    : clientsRes.data ?? []

  const rawClients = clientsData as unknown as {
    id: string
    name: string
    email: string
    slug: string
    created_at: string
    monthly_retainer: number | null
    enabled_platforms?: string[] | null
    enabled_tabs?: string[] | null
  }[]

  const allPosts = (postsRes.data ?? []) as unknown as { client_id: string; date: string | null }[]

  // Build post count + last activity maps
  const postCountMap = new Map<string, number>()
  const lastActivityMap = new Map<string, string | null>()
  for (const post of allPosts) {
    const cid = post.client_id
    postCountMap.set(cid, (postCountMap.get(cid) ?? 0) + 1)
    if (!lastActivityMap.has(cid)) {
      lastActivityMap.set(cid, post.date ?? null)
    }
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
    <div className="min-h-screen p-10" style={{ background: '#060606' }}>
      <div className="max-w-3xl">

        {/* Header */}
        <div
          className="flex items-start justify-between mb-10"
          style={{ borderBottom: '1px solid #141414', paddingBottom: 28 }}
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className="font-jakarta font-light tracking-[.36em] uppercase text-[11px]"
                style={{ color: '#f2ede4' }}
              >
                Drop
              </span>
              <div style={{ width: 1, height: 16, background: 'rgba(201,169,110,.35)' }} />
              <span className="font-jakarta font-light tracking-[.36em] uppercase text-[11px] text-gold-gradient">
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

        {/* Clients section */}
        <AdminClientsSection clients={clients} />

        {/* YouTube connections */}
        {clients.length > 0 && (
          <div style={{ marginTop: 48 }}>
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
