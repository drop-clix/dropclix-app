import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { syncInstagramForClient } from '@/lib/instagram-sync'

export async function POST(req: NextRequest) {
  // Auth: admin session required
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const clientId: string = body.client_id
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Load IG connection for this client
  const { data: conn, error: connErr } = await admin
    .from('platform_connections')
    .select('access_token, channel_id, token_expires_at')
    .eq('client_id', clientId)
    .eq('platform', 'instagram')
    .single()

  if (connErr || !conn) {
    return NextResponse.json({ error: 'No Instagram connection found for this client' }, { status: 404 })
  }

  const { access_token: accessToken } = conn as any

  // Run sync
  const result = await syncInstagramForClient(admin, clientId, accessToken)

  const now = new Date().toISOString()

  // Update last_synced_at + subscriber_count
  await admin
    .from('platform_connections')
    .update({
      last_synced_at:   now,
      updated_at:       now,
      ...(result.followersCount !== null ? { subscriber_count: result.followersCount } : {}),
    })
    .eq('client_id', clientId)
    .eq('platform', 'instagram')

  return NextResponse.json({
    synced:          result.synced,
    skipped:         result.skipped,
    errors:          result.errors,
    followersCount:  result.followersCount,
    lastSyncedAt:    now,
  })
}
