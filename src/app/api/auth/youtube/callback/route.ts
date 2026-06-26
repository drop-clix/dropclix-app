import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchChannelInfo } from '@/lib/youtube-auth'
import { clearOAuthNonceCookie, validateOAuthCallbackState } from '@/lib/oauth-state'

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get('code')
  const state    = req.nextUrl.searchParams.get('state')
  const error    = req.nextUrl.searchParams.get('error')

  const adminBase = new URL('/admin', req.url).toString()
  const redirect = (url: string) => {
    const response = NextResponse.redirect(url)
    clearOAuthNonceCookie(response, 'youtube')
    return response
  }

  const stateCheck = await validateOAuthCallbackState('youtube', state)
  if (!stateCheck.ok) {
    console.warn('[youtube-oauth] rejected callback state:', stateCheck.error)
    return redirect(`${adminBase}?yt_error=unauthorized`)
  }
  const clientId = stateCheck.context.clientId
  const callbackBase = new URL(
    stateCheck.context.origin === 'client' ? '/settings' : '/admin',
    req.url,
  ).toString()

  if (error || !code) {
    return redirect(`${callbackBase}?yt_error=access_denied`)
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
    return redirect(`${callbackBase}?yt_error=token_failed`)
  }

  const tokens = await tokenRes.json()
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString()

  // Fetch channel metadata
  const channel = await fetchChannelInfo(tokens.access_token)

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Build upsert payload — only include refresh_token if Google returned one
  // (avoids wiping the stored token on reconnects that don't issue a new one)
  const upsertPayload: Record<string, unknown> = {
    client_id:        clientId || null,
    platform:         'youtube',
    access_token:     tokens.access_token,
    token_expires_at: expiresAt,
    channel_id:       channel?.channelId ?? null,
    channel_name:     channel?.channelName ?? null,
    subscriber_count: channel?.subscriberCount ?? null,
    updated_at:       now,
  }
  if (tokens.refresh_token) {
    upsertPayload.refresh_token = tokens.refresh_token
    upsertPayload.created_at    = now
  }

  const { error: dbErr } = await admin
    .from('platform_connections')
    .upsert(upsertPayload, { onConflict: 'client_id,platform' })

  if (dbErr) {
    console.error('Failed to save YouTube connection:', dbErr.message)
    return redirect(`${callbackBase}?yt_error=db_failed`)
  }

  return redirect(`${callbackBase}?yt_connected=1`)
}
