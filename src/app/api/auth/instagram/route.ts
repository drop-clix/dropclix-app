import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id') ?? ''

  const params = new URLSearchParams({
    client_id:     process.env.INSTAGRAM_APP_ID ?? '',
    redirect_uri:  process.env.INSTAGRAM_REDIRECT_URI ?? '',
    scope:         'instagram_business_basic,instagram_manage_insights,instagram_manage_comments,instagram_business_manage_messages,pages_show_list,pages_read_engagement,business_management',
    response_type: 'code',
    state:         clientId,
  })

  return NextResponse.redirect(
    `https://www.facebook.com/dialog/oauth?${params.toString()}`,
  )
}
