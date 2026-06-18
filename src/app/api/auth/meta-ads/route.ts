import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id') ?? ''

  const params = new URLSearchParams({
    client_id:     process.env.INSTAGRAM_APP_ID ?? '',
    redirect_uri:  process.env.META_ADS_REDIRECT_URI ?? '',
    scope:         'ads_read',
    response_type: 'code',
    state:         clientId,
  })

  return NextResponse.redirect(
    `https://www.facebook.com/dialog/oauth?${params.toString()}`,
  )
}
