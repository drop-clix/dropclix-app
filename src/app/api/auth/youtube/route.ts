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

  const { state, nonce } = createOAuthState('youtube', auth.context.clientId, auth.context.role)

  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    redirect_uri: process.env.YOUTUBE_REDIRECT_URI!,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  )
  setOAuthNonceCookie(response, 'youtube', nonce)
  return response
}
