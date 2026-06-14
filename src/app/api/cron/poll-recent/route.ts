import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPostableItemsInAgeRange,
  pollPipelineItem,
  runDueSnapshots,
} from '@/lib/video-polling'

// Polls POSTED pipeline items with yt_video_id set, posted 1–7 days ago.
// Only polls items where admin has explicitly linked a YouTube video ID.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/recent] starting poll — tier: 1–7d')
  const admin = createAdminClient()
  const items = await getPostableItemsInAgeRange(admin, 1, 7)
  console.log(`[cron/recent] ${items.length} items to poll`)

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
  console.log(`[cron/recent] done — checked=${items.length} polled=${polled} snapshots=${snapshots}`)

  return NextResponse.json({
    tier:        'recent (1–7d)',
    checked:     items.length,
    polled,
    skipped:     skipReasons.length,
    skip_reasons: skipReasons,
    snapshots,
  })
}
