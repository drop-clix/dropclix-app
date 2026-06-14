import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPostableItemsInAgeRange,
  pollPipelineItem,
  runDueSnapshots,
} from '@/lib/video-polling'

// Polls POSTED pipeline items with yt_video_id set, posted < 24 hours ago.
// Only polls items where admin has explicitly linked a YouTube video ID.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron-fresh] env check:', {
    hasYTKey: !!process.env.YOUTUBE_API_KEY,
    keyStart: process.env.YOUTUBE_API_KEY?.slice(0, 6) ?? 'MISSING',
    nodeEnv: process.env.NODE_ENV,
  })
  console.log('[cron/fresh] starting poll — tier: <24h')
  const admin = createAdminClient()
  const items = await getPostableItemsInAgeRange(admin, 0, 1)
  console.log(`[cron/fresh] ${items.length} items to poll`)

  let polled = 0
  const skipReasons: string[] = []

  for (const item of items) {
    const result = await pollPipelineItem(admin, item)
    if (result.polled) {
      polled++
    } else {
      skipReasons.push(`${item.post_id}:${result.reason}`)
    }
  }

  const snapshots = await runDueSnapshots(admin)
  console.log(`[cron/fresh] done — checked=${items.length} polled=${polled} snapshots=${snapshots}`)

  return NextResponse.json({
    tier:        'fresh (<24h)',
    checked:     items.length,
    polled,
    skipped:     skipReasons.length,
    skip_reasons: skipReasons,
    snapshots,
  })
}
