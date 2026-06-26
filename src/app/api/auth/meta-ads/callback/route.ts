import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clearOAuthNonceCookie, validateOAuthCallbackState } from '@/lib/oauth-state'

type AdAccount = {
  id?: string
  name?: string
  account_status?: number
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

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')
  const adminBase = new URL('/admin', req.url).toString()
  const redirect = (url: string) => {
    const response = NextResponse.redirect(url)
    clearOAuthNonceCookie(response, 'meta_ads')
    return response
  }

  const stateCheck = await validateOAuthCallbackState('meta_ads', state)
  if (!stateCheck.ok) {
    console.warn('[meta-ads-oauth] rejected callback state:', stateCheck.error)
    return redirect(`${adminBase}?meta_ads_error=unauthorized`)
  }
  const clientId = stateCheck.context.clientId
  const callbackBase = new URL(
    stateCheck.context.origin === 'client' ? '/settings' : '/admin',
    req.url,
  ).toString()

  if (error || !code) {
    return redirect(`${callbackBase}?meta_ads_error=access_denied`)
  }

  const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.INSTAGRAM_APP_ID ?? '',
      client_secret: process.env.INSTAGRAM_APP_SECRET ?? '',
      grant_type:    'authorization_code',
      redirect_uri:  process.env.META_ADS_REDIRECT_URI ?? '',
      code,
    }),
  })

  const tokenText = await tokenRes.text()
  let tokenBody: unknown = tokenText
  try { tokenBody = tokenText ? JSON.parse(tokenText) : null } catch { /* keep raw text */ }
  console.log('[meta-ads-oauth] token exchange response:', {
    status: tokenRes.status,
    ok: tokenRes.ok,
    body: sanitizeForLog(tokenBody),
  })

  if (!tokenRes.ok) {
    return redirect(`${callbackBase}?meta_ads_error=token_failed`)
  }

  const tokenData = tokenBody as { access_token?: string; expires_in?: number }
  const shortToken = tokenData.access_token
  if (!shortToken) {
    return redirect(`${callbackBase}?meta_ads_error=token_failed`)
  }

  let accessToken = shortToken
  let expiresIn = 5_184_000

  try {
    const longUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token')
    longUrl.searchParams.set('grant_type', 'fb_exchange_token')
    longUrl.searchParams.set('client_id', process.env.INSTAGRAM_APP_ID ?? '')
    longUrl.searchParams.set('client_secret', process.env.INSTAGRAM_APP_SECRET ?? '')
    longUrl.searchParams.set('fb_exchange_token', shortToken)

    const longRes = await fetch(longUrl.toString())
    const longText = await longRes.text()
    let longBody: unknown = longText
    try { longBody = longText ? JSON.parse(longText) : null } catch { /* keep raw text */ }
    console.log('[meta-ads-oauth] long-lived token response:', {
      status: longRes.status,
      ok: longRes.ok,
      body: sanitizeForLog(longBody),
    })

    if (longRes.ok) {
      const longData = longBody as { access_token?: string; expires_in?: number }
      accessToken = longData.access_token ?? shortToken
      expiresIn = longData.expires_in ?? expiresIn
    }
  } catch (err) {
    console.warn('[meta-ads-oauth] long-lived token exchange error:', err)
  }

  const accountsUrl = new URL('https://graph.facebook.com/v19.0/me/adaccounts')
  accountsUrl.searchParams.set('fields', 'id,name,account_status')
  accountsUrl.searchParams.set('access_token', accessToken)

  const accountsRes = await fetch(accountsUrl.toString())
  const accountsText = await accountsRes.text()
  let accountsBody: unknown = accountsText
  try { accountsBody = accountsText ? JSON.parse(accountsText) : null } catch { /* keep raw text */ }
  console.log('[meta-ads-oauth] adaccounts response:', {
    status: accountsRes.status,
    ok: accountsRes.ok,
    body: sanitizeForLog(accountsBody),
  })

  if (!accountsRes.ok) {
    return redirect(`${callbackBase}?meta_ads_error=no_ad_account`)
  }

  const accounts = (accountsBody as { data?: AdAccount[] })?.data ?? []
  const activeAccount = accounts.find(account => account.account_status === 1 && account.id)
  if (!activeAccount?.id) {
    return redirect(`${callbackBase}?meta_ads_error=no_ad_account`)
  }

  const now = new Date().toISOString()
  const expiry = new Date(Date.now() + expiresIn * 1000).toISOString()
  const admin = createAdminClient()
  const { error: dbErr } = await admin
    .from('platform_connections')
    .upsert({
      client_id:        clientId || null,
      platform:         'meta_ads',
      access_token:     accessToken,
      refresh_token:    null,
      token_expires_at: expiry,
      channel_id:       activeAccount.id,
      channel_name:     activeAccount.name ?? activeAccount.id,
      subscriber_count: null,
      last_synced_at:   null,
      created_at:       now,
      updated_at:       now,
    }, { onConflict: 'client_id,platform' })

  if (dbErr) {
    console.error('[meta-ads-oauth] failed to save connection:', dbErr.message)
    return redirect(`${callbackBase}?meta_ads_error=db_failed`)
  }

  return redirect(`${callbackBase}?meta_ads_connected=1`)
}
