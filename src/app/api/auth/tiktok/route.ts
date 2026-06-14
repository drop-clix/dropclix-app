import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id') ?? ''

  const params = new URLSearchParams({
    client_key:    process.env.TIKTOK_CLIENT_KEY ?? '',
    redirect_uri:  process.env.TIKTOK_REDIRECT_URI ?? 'https://portal.drop-clix.com/api/auth/tiktok/callback',
    scope:         'user.info.basic,user.info.profile,user.info.stats,video.list',
    response_type: 'code',
    state:         clientId,
    force_reauth:  '1',
    prompt:        'consent',
  })

  return NextResponse.redirect(
    `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
  )
}
