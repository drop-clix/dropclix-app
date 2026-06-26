import { NextRequest, NextResponse } from 'next/server'
import {
  createOAuthState,
  resolveOAuthClientForInitiation,
  setOAuthNonceCookie,
} from '@/lib/oauth-state'

export async function GET(req: NextRequest) {
  const auth = await resolveOAuthClientForInitiation(req.nextUrl.searchParams.get('client_id'))
  if (!auth.ok) {
    return NextResponse.redirect(new URL(`/login?error=${auth.error}`, req.url))
  }

  const { state, nonce } = createOAuthState('meta_ads', auth.context.clientId, auth.context.origin)

  const params = new URLSearchParams({
    client_id:     process.env.INSTAGRAM_APP_ID ?? '',
    redirect_uri:  process.env.META_ADS_REDIRECT_URI ?? '',
    scope:         'ads_read',
    response_type: 'code',
    state,
  })

  const response = NextResponse.redirect(
    `https://www.facebook.com/dialog/oauth?${params.toString()}`,
  )
  setOAuthNonceCookie(response, 'meta_ads', nonce)
  return response
}
