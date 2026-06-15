import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get('code')
  const clientId = req.nextUrl.searchParams.get('state')
  const error    = req.nextUrl.searchParams.get('error')

  const adminBase = new URL('/admin', req.url).toString()

  if (error || !code) {
    return NextResponse.redirect(`${adminBase}?ig_error=access_denied`)
  }

  // Exchange code for short-lived access token
  const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.INSTAGRAM_APP_ID ?? '',
      client_secret: process.env.INSTAGRAM_APP_SECRET ?? '',
      grant_type:    'authorization_code',
      redirect_uri:  process.env.INSTAGRAM_REDIRECT_URI ?? '',
      code,
    }),
  })

  if (!tokenRes.ok) {
    console.error('Instagram token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${adminBase}?ig_error=token_failed`)
  }

  const { access_token: shortToken, user_id: igUserId } = await tokenRes.json() as {
    access_token: string
    user_id: number
  }

  // Exchange short-lived token for long-lived token (60-day TTL)
  let accessToken = shortToken
  let expiresIn   = 3600
  try {
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${shortToken}`,
    )
    if (longRes.ok) {
      const longData = await longRes.json() as { access_token: string; expires_in: number }
      accessToken = longData.access_token ?? shortToken
      expiresIn   = longData.expires_in   ?? expiresIn
    }
  } catch { /* fall back to short-lived token */ }

  const expiry = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Fetch profile info (id, username, followers_count)
  let username: string | null = null
  let followersCount: number | null = null
  try {
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username,followers_count,media_count&access_token=${accessToken}`,
    )
    if (profileRes.ok) {
      const profile = await profileRes.json() as { id: string; username?: string; followers_count?: number }
      username       = profile.username        ?? null
      followersCount = profile.followers_count ?? null
    }
  } catch { /* non-fatal */ }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error: dbErr } = await admin
    .from('platform_connections')
    .upsert(
      {
        client_id:        clientId || null,
        platform:         'instagram',
        access_token:     accessToken,
        token_expires_at: expiry,
        channel_id:       String(igUserId),
        channel_name:     username,
        subscriber_count: followersCount,
        last_synced_at:   null,
        created_at:       now,
        updated_at:       now,
      },
      { onConflict: 'client_id,platform' },
    )

  if (dbErr) {
    console.error('Failed to save Instagram connection:', dbErr.message)
    return NextResponse.redirect(`${adminBase}?ig_error=db_failed`)
  }

  return NextResponse.redirect(`${adminBase}?ig_connected=1`)
}
