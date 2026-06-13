import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    hasKey: !!process.env.TIKTOK_CLIENT_KEY,
    hasSecret: !!process.env.TIKTOK_CLIENT_SECRET,
    keyLength: process.env.TIKTOK_CLIENT_KEY?.length ?? 0,
    secretLength: process.env.TIKTOK_CLIENT_SECRET?.length ?? 0,
  })
}
