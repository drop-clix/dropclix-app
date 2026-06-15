import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/portal/SignOutButton'
import { AdminYouTubeSection } from './AdminYouTubeSection'
import { AdminInstagramSection } from './AdminInstagramSection'
import { AdminTikTokSection } from './AdminTikTokSection'
import { AdminClientsSection, type ClientRow } from './AdminClientsSection'

export default async function AdminPage() {
  // Auth check — regular client is fine here (only reading the session).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, email')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  // All data queries go directly to the REST API using the service-role key.
  // This bypasses the Supabase JS client entirely and is guaranteed to bypass RLS.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key  = process.env.SUPABASE_SECRET_KEY!
  const headers = {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
  }

  const [clientsJson, connectionsJson, igConnectionsJson, ttConnectionsJson, postsJson] = await Promise.all([
    fetch(`${base}/rest/v1/clients?select=id,name,email,slug,created_at,monthly_retainer,enabled_platforms,enabled_tabs&order=created_at.desc`, { headers, cache: 'no-store' }).then(r => r.json()),
    fetch(`${base}/rest/v1/platform_connections?select=client_id,channel_name,channel_id,subscriber_count,created_at,last_synced_at&platform=eq.youtube`, { headers, cache: 'no-store' }).then(r => r.json()),
    fetch(`${base}/rest/v1/platform_connections?select=client_id,channel_name,channel_id,subscriber_count,created_at,last_synced_at,token_expires_at&platform=eq.instagram`, { headers, cache: 'no-store' }).then(r => r.json()),
    fetch(`${base}/rest/v1/platform_connections?select=client_id,channel_name,channel_id,subscriber_count,created_at&platform=eq.tiktok`, { headers, cache: 'no-store' }).then(r => r.json()),
    fetch(`${base}/rest/v1/posts?select=client_id,date&order=date.desc`,  { headers, cache: 'no-store' }).then(r => r.json()),
  ])

  type RawClient = {
    id: string; name: string; email: string; slug: string
    created_at: string; monthly_retainer: number | null
    enabled_platforms: string[] | null; enabled_tabs: string[] | null
  }
  type RawPost       = { client_id: string; date: string | null }
  type RawYTConn = {
    client_id: string; channel_name: string | null; channel_id: string | null
    subscriber_count: number | null; created_at: string | null; last_synced_at: string | null
  }
  type RawIGConn = {
    client_id: string; channel_name: string | null; channel_id: string | null
    subscriber_count: number | null; created_at: string | null
    last_synced_at: string | null; token_expires_at: string | null
  }
  type RawTTConn = {
    client_id: string; channel_name: string | null; channel_id: string | null
    subscriber_count: number | null; created_at: string | null
  }

  const rawClients:       RawClient[]  = Array.isArray(clientsJson)      ? clientsJson      : []
  const allPosts:         RawPost[]    = Array.isArray(postsJson)        ? postsJson        : []
  const ytConnections:    RawYTConn[]  = Array.isArray(connectionsJson)  ? connectionsJson  : []
  const igConnectionsRaw: RawIGConn[]  = Array.isArray(igConnectionsJson) ? igConnectionsJson : []
  const ttConnectionsRaw: RawTTConn[]  = Array.isArray(ttConnectionsJson) ? ttConnectionsJson : []

  const postCountMap    = new Map<string, number>()
  const lastActivityMap = new Map<string, string | null>()
  for (const post of allPosts) {
    postCountMap.set(post.client_id, (postCountMap.get(post.client_id) ?? 0) + 1)
    if (!lastActivityMap.has(post.client_id)) lastActivityMap.set(post.client_id, post.date ?? null)
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
    enabled_platforms: c.enabled_platforms ?? ['ig'],
    enabled_tabs:      c.enabled_tabs      ?? ['dashboard','analytics','angles','pipeline','studio','ads','calendar','goals'],
  }))

  const ytSectionConnections = ytConnections.map(c => ({
    clientId:        c.client_id,
    channelName:     c.channel_name,
    channelId:       c.channel_id,
    subscriberCount: c.subscriber_count,
    createdAt:       c.created_at,
    lastSyncedAt:    c.last_synced_at,
  }))

  const igSectionConnections = igConnectionsRaw.map(c => ({
    clientId:       c.client_id,
    username:       c.channel_name,
    igUserId:       c.channel_id,
    followerCount:  c.subscriber_count,
    createdAt:      c.created_at,
    lastSyncedAt:   c.last_synced_at,
    tokenExpiresAt: c.token_expires_at,
  }))

  const ttSectionConnections = ttConnectionsRaw.map(c => ({
    clientId:      c.client_id,
    displayName:   c.channel_name,
    openId:        c.channel_id,
    followerCount: c.subscriber_count,
    createdAt:     c.created_at,
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
            <h1 className="font-jakarta font-light" style={{ fontSize: 32, color: '#f2ede4', lineHeight: 1.08, marginBottom: 6 }}>Admin</h1>
            <p style={{ fontSize: 11, color: '#555', fontWeight: 300 }}>{profile.email}</p>
          </div>
          <SignOutButton />
        </div>

        <AdminClientsSection clients={clients} />

        {clients.length > 0 && (
          <>
            <div style={{ marginTop: 56 }}>
              <AdminYouTubeSection
                clients={clients.map(c => ({ id: c.id, name: c.name }))}
                connections={ytSectionConnections}
              />
            </div>
            <div style={{ marginTop: 40 }}>
              <AdminInstagramSection
                clients={clients.map(c => ({ id: c.id, name: c.name }))}
                connections={igSectionConnections}
              />
            </div>
            <div style={{ marginTop: 40 }}>
              <AdminTikTokSection
                clients={clients.map(c => ({ id: c.id, name: c.name }))}
                connections={ttSectionConnections}
                tiktokConfigured={!!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)}
              />
            </div>
          </>
        )}

      </div>
    </div>
  )
}
