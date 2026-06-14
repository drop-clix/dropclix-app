import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPostableItemsInAgeRange,
  pollPipelineItem,
  runDueSnapshots,
} from '@/lib/video-polling'

// Polls POSTED pipeline items with yt_video_id set, posted 7+ days ago OR with no posted_at.
// Includes historical imports that pre-date the posted_at column (S16).
// Only polls items where admin has explicitly linked a YouTube video ID.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/archive] starting poll — tier: 7d+ (includes null posted_at)')
  const admin = createAdminClient()
  const items = await getPostableItemsInAgeRange(admin, 7, null)
  console.log(`[cron/archive] ${items.length} items to poll`)

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
  console.log(`[cron/archive] done — checked=${items.length} polled=${polled} snapshots=${snapshots}`)

  return NextResponse.json({
    tier:        'archive (7d+ or no date)',
    checked:     items.length,
    polled,
    skipped:     skipReasons.length,
    skip_reasons: skipReasons,
    snapshots,
  })
}
