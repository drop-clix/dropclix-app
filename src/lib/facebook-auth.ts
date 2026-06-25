import { createAdminClient } from '@/lib/supabase/admin'

export type FacebookPlatform = 'instagram' | 'meta_ads'

export const FACEBOOK_RECONNECT_REQUIRED = 'Token expired, please reconnect'

const REFRESH_WINDOW_MS = 5 * 60 * 1000
const DEFAULT_EXPIRES_IN = 5_184_000

type FacebookConnection = {
  access_token: string | null
  token_expires_at: string | null
}

function shouldRefreshFacebookToken(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return true
  const expiresAt = new Date(tokenExpiresAt).getTime()
  if (!Number.isFinite(expiresAt)) return true
  return expiresAt <= Date.now() + REFRESH_WINDOW_MS
}

function graphErrorMessage(body: unknown): string {
  if (typeof body === 'object' && body && 'error' in body) {
    const error = (body as { error?: { message?: string } }).error
    if (error?.message) return error.message
  }
  return typeof body === 'string' ? body : 'Facebook token refresh failed'
}

export async function refreshFacebookToken(
  clientId: string,
  platform: FacebookPlatform,
): Promise<string | null> {
  const admin = createAdminClient()

  const { data: connection, error: connectionError } = await admin
    .from('platform_connections')
    .select('access_token, token_expires_at')
    .eq('client_id', clientId)
    .eq('platform', platform)
    .maybeSingle()

  if (connectionError || !connection) {
    console.error('[facebook-auth] connection lookup failed:', {
      platform,
      clientId,
      error: connectionError?.message ?? 'No connection found',
    })
    return null
  }

  const { access_token: currentToken, token_expires_at: tokenExpiresAt } =
    connection as FacebookConnection

  if (!currentToken) {
    console.error('[facebook-auth] missing access token:', { platform, clientId })
    return null
  }

  if (!shouldRefreshFacebookToken(tokenExpiresAt)) {
    return currentToken
  }

  console.log('[facebook-auth] refreshing token:', { platform, clientId })

  try {
    const url = new URL('https://graph.facebook.com/v19.0/oauth/access_token')
    url.searchParams.set('grant_type', 'fb_exchange_token')
    url.searchParams.set('client_id', process.env.INSTAGRAM_APP_ID ?? '')
    url.searchParams.set('client_secret', process.env.INSTAGRAM_APP_SECRET ?? '')
    url.searchParams.set('fb_exchange_token', currentToken)

    const res = await fetch(url.toString(), { method: 'POST' })
    const rawText = await res.text()
    let body: unknown = rawText
    try { body = rawText ? JSON.parse(rawText) : null } catch { /* keep raw text */ }

    if (!res.ok) {
      console.error('[facebook-auth] refresh failed:', {
        platform,
        clientId,
        status: res.status,
        message: graphErrorMessage(body),
      })
      return null
    }

    const tokenData = body as { access_token?: string; expires_in?: number }
    const newToken = tokenData.access_token
    if (!newToken) {
      console.error('[facebook-auth] refresh response missing access token:', {
        platform,
        clientId,
      })
      return null
    }

    const expiresIn = tokenData.expires_in ?? DEFAULT_EXPIRES_IN
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    const now = new Date().toISOString()

    const { error: updateError } = await admin
      .from('platform_connections')
      .update({
        access_token: newToken,
        token_expires_at: expiresAt,
        updated_at: now,
      })
      .eq('client_id', clientId)
      .eq('platform', platform)

    if (updateError) {
      console.error('[facebook-auth] failed to persist refreshed token:', {
        platform,
        clientId,
        error: updateError.message,
      })
      return null
    }

    console.log('[facebook-auth] token refreshed:', {
      platform,
      clientId,
      tokenExpiresAt: expiresAt,
    })
    return newToken
  } catch (err) {
    console.error('[facebook-auth] refresh error:', {
      platform,
      clientId,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return null
  }
}
