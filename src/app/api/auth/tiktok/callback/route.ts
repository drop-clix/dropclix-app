import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clearOAuthNonceCookie, validateOAuthCallbackState } from '@/lib/oauth-state'

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get('code')
  const state    = req.nextUrl.searchParams.get('state')
  const error    = req.nextUrl.searchParams.get('error')

  const adminBase = new URL('/admin', req.url).toString()
  const redirect = (url: string) => {
    const response = NextResponse.redirect(url)
    clearOAuthNonceCookie(response, 'tiktok')
    return response
  }

  const stateCheck = await validateOAuthCallbackState('tiktok', state)
  if (!stateCheck.ok) {
    console.warn('[TikTok callback] rejected callback state:', stateCheck.error)
    return redirect(`${adminBase}?tt_error=unauthorized`)
  }
  const clientId = stateCheck.context.clientId

  if (error || !code) {
    return redirect(`${adminBase}?tt_error=access_denied`)
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

  const rawText = await tokenRes.text()
  console.log('[TikTok callback] token response status:', tokenRes.status)
  console.log('[TikTok callback] token response raw:', rawText)

  if (!tokenRes.ok) {
    console.error('[TikTok callback] token exchange HTTP error:', tokenRes.status)
    return redirect(`${adminBase}?tt_error=token_failed`)
  }

  let tokenData: Record<string, unknown>
  try {
    tokenData = JSON.parse(rawText)
  } catch {
    console.error('[TikTok callback] failed to parse token JSON')
    return redirect(`${adminBase}?tt_error=token_failed`)
  }

  // TikTok returns either { access_token, open_id, ... } or { data: { access_token, open_id, ... } }
  const nested = tokenData.data as Record<string, unknown> | undefined
  const access_token: string | undefined =
    (nested?.access_token as string) ?? (tokenData.access_token as string)
  const refresh_token: string | undefined =
    (nested?.refresh_token as string) ?? (tokenData.refresh_token as string)
  const expires_in: number =
    Number((nested?.expires_in) ?? tokenData.expires_in ?? 86400)
  const open_id: string | undefined =
    (nested?.open_id as string) ?? (tokenData.open_id as string)

  const apiError = tokenData.error as Record<string, unknown> | undefined

  if (apiError?.code || !access_token || !open_id) {
    console.error('[TikTok callback] token error:', apiError ?? 'missing access_token or open_id')
    return redirect(`${adminBase}?tt_error=token_failed`)
  }

  const expiry = new Date(Date.now() + expires_in * 1000).toISOString()

  // Fetch user profile
  let displayName: string | null = null
  let followerCount: number | null = null
  try {
    const userRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count',
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
  const now = new Date().toISOString()
  const upsertPayload: Record<string, unknown> = {
    client_id:        clientId || null,
    platform:         'tiktok',
    access_token,
    token_expires_at: expiry,
    channel_id:       open_id,
    channel_name:     displayName,
    subscriber_count: followerCount,
    created_at:       now,
    updated_at:       now,
  }
  if (refresh_token) upsertPayload.refresh_token = refresh_token

  const { error: dbErr } = await admin
    .from('platform_connections')
    .upsert(upsertPayload, { onConflict: 'client_id,platform' })

  if (dbErr) {
    console.error('[TikTok callback] failed to save connection:', dbErr.message)
    return redirect(`${adminBase}?tt_error=db_failed`)
  }

  return redirect(`${adminBase}?tt_connected=1`)
}
