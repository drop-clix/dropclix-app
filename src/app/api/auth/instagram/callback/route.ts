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

  // Exchange code for short-lived Facebook User Access Token
  // Facebook Business Login uses graph.facebook.com, not api.instagram.com
  const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
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
    const body = await tokenRes.text()
    console.error('Instagram (FB) token exchange failed:', tokenRes.status, body)
    return NextResponse.redirect(`${adminBase}?ig_error=token_failed`)
  }

  // Facebook response: { access_token, token_type, expires_in }
  // Unlike the old Instagram Basic Display API, FB does NOT return user_id here
  const tokenData = await tokenRes.json() as { access_token: string; token_type?: string; expires_in?: number }
  const shortToken = tokenData.access_token

  // Exchange short-lived token for long-lived token (60-day TTL)
  // Facebook Business Login uses grant_type=fb_exchange_token (not ig_exchange_token)
  let accessToken = shortToken
  let expiresIn   = 5_184_000 // 60 days default
  try {
    const longRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.INSTAGRAM_APP_ID}&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${shortToken}`,
    )
    if (longRes.ok) {
      const longData = await longRes.json() as { access_token: string; expires_in: number }
      accessToken = longData.access_token ?? shortToken
      expiresIn   = longData.expires_in   ?? expiresIn
    } else {
      console.warn('Long-lived token exchange failed:', longRes.status, await longRes.text())
    }
  } catch (e) {
    console.warn('Long-lived token exchange error:', e)
  }

  const expiry = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Get the Instagram Business Account ID via Facebook Pages
  // With Facebook Business Login the token's /me is a Facebook user, not IG account.
  // We must traverse: FB User → Pages → instagram_business_account
  let igAccountId: string | null   = null
  let username: string | null      = null
  let followersCount: number | null = null
  try {
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,accounts{instagram_business_account{id,username,followers_count}}&access_token=${accessToken}`,
    )
    if (meRes.ok) {
      const meData = await meRes.json() as {
        id: string
        accounts?: { data: Array<{ id: string; instagram_business_account?: { id: string; username?: string; followers_count?: number } }> }
      }
      const pages = meData.accounts?.data ?? []
      for (const page of pages) {
        if (page.instagram_business_account) {
          igAccountId    = page.instagram_business_account.id        ?? null
          username       = page.instagram_business_account.username   ?? null
          followersCount = page.instagram_business_account.followers_count ?? null
          break
        }
      }
      if (!igAccountId) {
        console.warn('[ig-oauth] No Instagram Business Account found on any Facebook Page for this user')
      } else {
        console.log(`[ig-oauth] found IG account: @${username} (${igAccountId}), followers=${followersCount}`)
      }
    } else {
      console.warn('[ig-oauth] /me pages fetch failed:', meRes.status, await meRes.text())
    }
  } catch (e) {
    console.warn('[ig-oauth] profile fetch error:', e)
  }

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
        channel_id:       igAccountId,
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
