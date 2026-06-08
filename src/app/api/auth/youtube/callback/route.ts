import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchChannelInfo } from '@/lib/youtube-auth'

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get('code')
  const clientId = req.nextUrl.searchParams.get('state') // client UUID passed in OAuth state
  const error    = req.nextUrl.searchParams.get('error')

  const adminBase = new URL('/admin', req.url).toString()

  if (error || !code) {
    return NextResponse.redirect(`${adminBase}?yt_error=access_denied`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri:  process.env.YOUTUBE_REDIRECT_URI!,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    console.error('YouTube token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${adminBase}?yt_error=token_failed`)
  }

  const tokens = await tokenRes.json()
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Fetch channel metadata
  const channel = await fetchChannelInfo(tokens.access_token)

  const admin = createAdminClient()
  const { error: dbErr } = await admin
    .from('platform_connections')
    .upsert(
      {
        client_id:        clientId || null,
        platform:         'youtube',
        access_token:     tokens.access_token,
        refresh_token:    tokens.refresh_token,
        token_expires_at:     expiry,
        channel_id:       channel?.channelId ?? null,
        channel_name:     channel?.channelName ?? null,
        subscriber_count: channel?.subscriberCount ?? null,
        created_at:     new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      },
      { onConflict: 'client_id,platform' },
    )

  if (dbErr) {
    console.error('Failed to save YouTube connection:', dbErr.message)
    return NextResponse.redirect(`${adminBase}?yt_error=db_failed`)
  }

  return NextResponse.redirect(`${adminBase}?yt_connected=1`)
}
