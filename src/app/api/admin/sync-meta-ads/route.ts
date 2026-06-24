import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { syncMetaAdsForClient } from '@/lib/meta-ads-sync'

export async function POST(req: NextRequest) {
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
  const clientId: string | undefined = body.client_id ?? body.clientId
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: conn, error: connErr } = await admin
    .from('platform_connections')
    .select('access_token, channel_id')
    .eq('client_id', clientId)
    .eq('platform', 'meta_ads')
    .maybeSingle()

  if (connErr || !conn) {
    return NextResponse.json({ error: 'Not connected' }, { status: 404 })
  }

  const accessToken = (conn as any).access_token as string | null
  const adAccountId = (conn as any).channel_id as string | null
  if (!accessToken || !adAccountId) {
    return NextResponse.json({ error: 'Meta Ads connection is missing token or ad account ID' }, { status: 400 })
  }

  try {
    const result = await syncMetaAdsForClient(clientId, accessToken, adAccountId)
    const now = new Date().toISOString()

    const { data: updatedConn } = await admin
      .from('platform_connections')
      .update({ last_synced_at: now, updated_at: now })
      .eq('client_id', clientId)
      .eq('platform', 'meta_ads')
      .select('last_synced_at, token_expires_at')
      .maybeSingle()

    return NextResponse.json({
      success: true,
      synced: result.synced,
      skipped: result.skipped,
      errors: result.errors,
      lastSyncedAt: (updatedConn as any)?.last_synced_at ?? now,
      tokenExpiresAt: (updatedConn as any)?.token_expires_at ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Meta Ads sync failed'
    console.error('[meta-ads-sync-route] failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
