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

  const { state, nonce } = createOAuthState('instagram', auth.context.clientId)

  const params = new URLSearchParams({
    client_id:     process.env.INSTAGRAM_APP_ID ?? '',
    redirect_uri:  process.env.INSTAGRAM_REDIRECT_URI ?? '',
    scope: 'instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management',
    response_type: 'code',
    state,
  })

  const response = NextResponse.redirect(
    `https://www.facebook.com/dialog/oauth?${params.toString()}`,
  )
  setOAuthNonceCookie(response, 'instagram', nonce)
  return response
}
