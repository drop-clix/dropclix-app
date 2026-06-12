import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get('code')
  const clientId = req.nextUrl.searchParams.get('state')
  const error    = req.nextUrl.searchParams.get('error')

  const adminBase = new URL('/admin', req.url).toString()

  if (error || !code) {
    return NextResponse.redirect(`${adminBase}?tt_error=access_denied`)
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    process.env.TIKTOK_CLIENT_KEY ?? '',
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
      code,
      grant_type:    'authorization_code',
      redirect_uri:  process.env.TIKTOK_REDIRECT_URI ?? 'https://portal.drop-clix.com/api/auth/tiktok/callback',
    }),
  })

  if (!tokenRes.ok) {
    console.error('TikTok token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${adminBase}?tt_error=token_failed`)
  }

  const tokenData = await tokenRes.json() as {
    data?: {
      access_token:  string
      refresh_token?: string
      expires_in:    number
      open_id:       string
    }
    error?: { code: string; message: string }
  }

  if (tokenData.error?.code || !tokenData.data?.access_token) {
    console.error('TikTok token error:', tokenData.error)
    return NextResponse.redirect(`${adminBase}?tt_error=token_failed`)
  }

  const { access_token, refresh_token, expires_in, open_id } = tokenData.data
  const expiry = new Date(Date.now() + expires_in * 1000).toISOString()

  // Fetch user profile
  let displayName: string | null = null
  let followerCount: number | null = null
  try {
    const userRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,avatar_url',
      { headers: { Authorization: `Bearer ${access_token}` } },
    )
    if (userRes.ok) {
      const userJson = await userRes.json() as {
        data?: { user?: { display_name?: string; follower_count?: number } }
      }
      displayName   = userJson.data?.user?.display_name   ?? null
      followerCount = userJson.data?.user?.follower_count ?? null
    }
  } catch { /* non-fatal */ }

  const admin = createAdminClient()
  const upsertPayload: Record<string, unknown> = {
    client_id:        clientId || null,
    platform:         'tiktok',
    access_token,
    token_expires_at: expiry,
    channel_id:       open_id,
    channel_name:     displayName,
    subscriber_count: followerCount,
    created_at:       new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  }
  if (refresh_token) upsertPayload.refresh_token = refresh_token

  const { error: dbErr } = await admin
    .from('platform_connections')
    .upsert(upsertPayload, { onConflict: 'client_id,platform' })

  if (dbErr) {
    console.error('Failed to save TikTok connection:', dbErr.message)
    return NextResponse.redirect(`${adminBase}?tt_error=db_failed`)
  }

  return NextResponse.redirect(`${adminBase}?tt_connected=1`)
}
