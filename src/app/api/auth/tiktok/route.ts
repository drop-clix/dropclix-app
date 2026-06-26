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

  const { state, nonce } = createOAuthState('tiktok', auth.context.clientId, auth.context.origin)

  const params = new URLSearchParams({
    client_key:    process.env.TIKTOK_CLIENT_KEY ?? '',
    redirect_uri:  process.env.TIKTOK_REDIRECT_URI ?? 'https://portal.drop-clix.com/api/auth/tiktok/callback',
    scope:         'user.info.basic,user.info.profile,user.info.stats,video.list',
    response_type: 'code',
    state,
  })

  const response = NextResponse.redirect(
    `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
  )
  setOAuthNonceCookie(response, 'tiktok', nonce)
  return response
}
