import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { syncTikTokForClient } from '@/lib/tiktok-sync'

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

  try {
    const result = await syncTikTokForClient(clientId)
    const now = new Date().toISOString()

    const admin = createAdminClient()
    await admin
      .from('platform_connections')
      .update({
        last_synced_at: now,
        updated_at: now,
        ...(result.subscriberCount !== null ? { subscriber_count: result.subscriberCount } : {}),
      })
      .eq('client_id', clientId)
      .eq('platform', 'tiktok')

    return NextResponse.json({
      success: true,
      synced: result.synced,
      skipped: result.skipped,
      errors: result.errors,
      lastSyncedAt: now,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'TikTok sync failed'
    console.error('[tt-sync-route] failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
