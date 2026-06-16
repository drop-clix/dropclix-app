import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type PageAccount = {
  id?: string
  name?: string
  access_token?: string
}

type InstagramAccount = {
  id?: string
  username?: string
  followers_count?: number
}

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForLog)
  if (!value || typeof value !== 'object') return value

  const redacted = new Set([
    'access_token',
    'refresh_token',
    'token',
    'client_secret',
    'fb_exchange_token',
  ])

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      redacted.has(key.toLowerCase()) ? '[REDACTED]' : sanitizeForLog(val),
    ]),
  )
}

async function graphGet<T extends object>(
  label: string,
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<T | null> {
  const url = new URL(`https://graph.facebook.com/v19.0/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString())
  const text = await res.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  console.log(`[ig-oauth] ${label} response:`, {
    status: res.status,
    ok: res.ok,
    body: sanitizeForLog(body),
  })

  if (!res.ok) return null
  return body as T
}

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

  // Get the Instagram account ID via Facebook Graph.
  // Preferred path: FB user token → pages → page access token → page instagram_business_account.
  // Fallback path: FB user token → direct /me instagram_business_account.
  let igAccountId: string | null   = null
  let username: string | null      = null
  let followersCount: number | null = null
  try {
    const meData = await graphGet<{ id?: string; name?: string }>(
      'user /me',
      'me',
      { fields: 'id,name' },
      accessToken,
    )

    const accountsData = await graphGet<{ data?: PageAccount[] }>(
      'user /me/accounts',
      'me/accounts',
      { fields: 'id,name,access_token' },
      accessToken,
    )

    const pages = accountsData?.data ?? []

    for (const page of pages) {
      if (!page.id || !page.access_token) {
        console.warn('[ig-oauth] skipping page without id/access token:', sanitizeForLog(page))
        continue
      }

      const pageData = await graphGet<{
        id?: string
        name?: string
        instagram_business_account?: InstagramAccount
      }>(
        `page ${page.id} instagram_business_account`,
        page.id,
        { fields: 'instagram_business_account{id,username,followers_count},name' },
        page.access_token,
      )

      const account = pageData?.instagram_business_account
      if (account?.id) {
        igAccountId    = account.id
        username       = account.username ?? pageData?.name ?? meData?.name ?? null
        followersCount = account.followers_count ?? null
        console.log(`[ig-oauth] found IG account via page ${page.id}:`, sanitizeForLog({
          igAccountId,
          username,
          followersCount,
        }))
        break
      }
    }

    if (!igAccountId) {
      console.warn('[ig-oauth] No Instagram Business Account found via Facebook Pages; trying direct /me fallback')
      const directData = await graphGet<{
        id?: string
        name?: string
        instagram_business_account?: InstagramAccount
      }>(
        'direct /me instagram_business_account fallback',
        'me',
        { fields: 'id,name,instagram_business_account' },
        accessToken,
      )

      const directAccount = directData?.instagram_business_account
      if (directAccount?.id) {
        igAccountId = directAccount.id
        username = directAccount.username ?? directData?.name ?? meData?.name ?? null

        const details = await graphGet<InstagramAccount>(
          `direct IG account ${igAccountId} details`,
          igAccountId,
          { fields: 'username,followers_count' },
          accessToken,
        )
        username = details?.username ?? username
        followersCount = details?.followers_count ?? directAccount.followers_count ?? null

        console.log('[ig-oauth] found IG account via direct fallback:', sanitizeForLog({
          igAccountId,
          username,
          followersCount,
        }))
      }
    }

    if (!igAccountId) {
      console.warn('[ig-oauth] No Instagram Business Account found after page-token lookup and direct fallback')
    }
  } catch (e) {
    console.warn('[ig-oauth] profile fetch error:', e)
  }

  if (!igAccountId) {
    return NextResponse.redirect(`${adminBase}?ig_error=no_instagram_account`)
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
