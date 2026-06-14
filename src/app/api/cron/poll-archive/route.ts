import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPostableItemsInAgeRange,
  resolvePostUUIDs,
  pollPipelineItem,
  runDueSnapshots,
} from '@/lib/video-polling'

// Runs every 6 hours via vercel.json cron — polls videos posted 7+ days ago
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const items = await getPostableItemsInAgeRange(admin, 7, null) // 7+ days old

  const uuidMap = await resolvePostUUIDs(admin, items)

  let polled = 0; let errors = 0
  for (const item of items) {
    const postUUID = uuidMap.get(`${item.client_id}::${item.post_id}`) ?? null
    const result = await pollPipelineItem(admin, item, postUUID, item.id)
    if (result.polled) polled++
    else if (result.error) errors++
  }

  const snapshots = await runDueSnapshots(admin)

  return NextResponse.json({
    tier: 'archive (7d+)',
    checked: items.length,
    polled,
    errors,
    snapshots,
  })
}
