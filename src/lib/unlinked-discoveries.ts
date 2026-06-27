import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>
export type DiscoveryPlatform = 'ig' | 'tt' | 'yt'

export type UnlinkedVideoCandidate = {
  clientId: string
  platform: DiscoveryPlatform
  platformVideoId: string
  permalink?: string | null
  title?: string | null
  thumbnailUrl?: string | null
  publishedAt?: string | number | null
  views?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
  saves?: number | null
}

const VIDEO_ID_COLUMN: Record<DiscoveryPlatform, 'ig_video_id' | 'tt_video_id' | 'yt_video_id'> = {
  ig: 'ig_video_id',
  tt: 'tt_video_id',
  yt: 'yt_video_id',
}

function normalizeTimestamp(value: string | number | null | undefined): string | null {
  if (value == null) return null
  const date = typeof value === 'number'
    ? new Date(value * 1000)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function recordUnlinkedVideoDiscovery(
  admin: AdminClient,
  candidate: UnlinkedVideoCandidate,
): Promise<boolean> {
  const platformVideoId = candidate.platformVideoId.trim()
  if (!platformVideoId) return false

  const videoColumn = VIDEO_ID_COLUMN[candidate.platform]
  const now = new Date().toISOString()

  const { data: linked } = await admin
    .from('pipeline_items')
    .select('id')
    .eq('client_id', candidate.clientId)
    .eq(videoColumn, platformVideoId)
    .maybeSingle()

  const { data: existing } = await admin
    .from('unlinked_video_discoveries')
    .select('id, status')
    .eq('client_id', candidate.clientId)
    .eq('platform', candidate.platform)
    .eq('platform_video_id', platformVideoId)
    .maybeSingle()

  const baseUpdate = {
    permalink: candidate.permalink ?? null,
    title: candidate.title ?? null,
    thumbnail_url: candidate.thumbnailUrl ?? null,
    published_at: normalizeTimestamp(candidate.publishedAt),
    views: candidate.views ?? null,
    likes: candidate.likes ?? null,
    comments: candidate.comments ?? null,
    shares: candidate.shares ?? null,
    saves: candidate.saves ?? null,
    last_seen_at: now,
  }

  if (linked) {
    if (existing) {
      await admin
        .from('unlinked_video_discoveries')
        .update({
          ...baseUpdate,
          status: 'linked',
          pipeline_item_id: (linked as any).id,
          linked_at: now,
        })
        .eq('id', (existing as any).id)
    }
    return false
  }

  if (existing) {
    await admin
      .from('unlinked_video_discoveries')
      .update(baseUpdate)
      .eq('id', (existing as any).id)
    return (existing as any).status === 'unlinked'
  }

  const { error } = await admin.from('unlinked_video_discoveries').insert({
    client_id: candidate.clientId,
    platform: candidate.platform,
    platform_video_id: platformVideoId,
    ...baseUpdate,
    status: 'unlinked',
    first_seen_at: now,
  })

  if (error) {
    console.error('[unlinked-discovery] insert failed:', candidate.platform, platformVideoId, error.message)
    return false
  }

  console.log('[unlinked-discovery] found unlinked video:', {
    clientId: candidate.clientId,
    platform: candidate.platform,
    platformVideoId,
  })
  return true
}
