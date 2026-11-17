import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { syncInstagramForClient } from '@/lib/instagram-sync'
import { FACEBOOK_RECONNECT_REQUIRED } from '@/lib/facebook-auth'

// Vercel Hobby + Fluid Compute: 300s is both the project default and the plan maximum.
export const maxDuration = 300

// Stop starting new posts after this long so in-flight posts (including one
// rate-limit retry of up to 30s) and the bookkeeping below finish before 300s.
const IG_SYNC_TIME_BUDGET_MS = 230_000

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
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
  const resumeCursor: string | null = typeof body.resume_cursor === 'string' ? body.resume_cursor : null
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

  const { access_token: accessToken, channel_id: igAccountId } = conn as any

  if (!igAccountId) {
    return NextResponse.json(
      { error: 'Instagram account ID not found. Please reconnect Instagram to refresh the connection.' },
      { status: 400 },
    )
  }

  // Run sync
  const result = await syncInstagramForClient(admin, clientId, accessToken, igAccountId, {
    deadlineMs: startedAt + IG_SYNC_TIME_BUDGET_MS,
    resumeCursor,
  })
  if (result.reconnectNeeded) {
    return NextResponse.json(
      { error: FACEBOOK_RECONNECT_REQUIRED, synced: 0, skipped: 0, errors: result.errors },
      { status: 401 },
    )
  }

  const now = new Date().toISOString()

  // Update last_synced_at + subscriber_count
  const { data: updatedConn } = await admin
    .from('platform_connections')
    .update({
      last_synced_at:   now,
      updated_at:       now,
      ...(result.followersCount !== null ? { subscriber_count: result.followersCount } : {}),
    })
    .eq('client_id', clientId)
    .eq('platform', 'instagram')
    .select('last_synced_at, token_expires_at, subscriber_count')
    .maybeSingle()

  return NextResponse.json({
    synced:          result.synced,
    skipped:         result.skipped,
    failed:          result.failed ?? 0,
    processed:       result.processed ?? 0,
    mediaTotal:      result.mediaTotal ?? 0,
    errors:          result.errors,
    complete:        !result.resumeCursor,
    resumeCursor:    result.resumeCursor ?? null,
    stoppedReason:   result.stoppedReason ?? null,
    followersCount:  (updatedConn as any)?.subscriber_count ?? result.followersCount,
    lastSyncedAt:    (updatedConn as any)?.last_synced_at ?? now,
    tokenExpiresAt:  (updatedConn as any)?.token_expires_at ?? (conn as any).token_expires_at ?? null,
  })
}
