import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPostableItemsInAgeRange,
  resolvePostUUIDs,
  pollPipelineItem,
  autoDiscoverYTUploads,
  runDueSnapshots,
} from '@/lib/video-polling'

// Runs every 2 minutes via vercel.json cron — polls videos posted < 24 hours ago
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const items = await getPostableItemsInAgeRange(admin, 0, 1) // 0–1 day old

  const uuidMap = await resolvePostUUIDs(admin, items)

  let polled = 0; let errors = 0
  for (const item of items) {
    const postUUID = uuidMap.get(`${item.client_id}::${item.post_id}`) ?? null
    const result = await pollPipelineItem(admin, item, postUUID, item.id)
    if (result.polled) polled++
    else if (result.error) errors++
  }

  // Auto-discover new YT uploads for each client with fresh items
  const uniqueClients = [...new Set(items.map(i => i.client_id))]
  let discovered = 0
  for (const clientId of uniqueClients) {
    discovered += await autoDiscoverYTUploads(admin, clientId)
  }

  // Run any due snapshots
  const snapshots = await runDueSnapshots(admin)

  return NextResponse.json({
    tier: 'fresh (<24h)',
    checked: items.length,
    polled,
    errors,
    discovered,
    snapshots,
  })
}
