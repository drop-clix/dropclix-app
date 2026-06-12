import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id') ?? ''

  const params = new URLSearchParams({
    client_id:     process.env.INSTAGRAM_APP_ID ?? '',
    redirect_uri:  process.env.INSTAGRAM_REDIRECT_URI ?? '',
    scope:         'user_profile,user_media',
    response_type: 'code',
    state:         clientId,
  })

  return NextResponse.redirect(
    `https://api.instagram.com/oauth/authorize?${params.toString()}`,
  )
}
