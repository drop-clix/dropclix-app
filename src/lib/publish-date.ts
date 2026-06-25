import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type NormalizedPublishDate = {
  iso: string
  date: string
}

export function normalizePublishDate(value: string | number | null | undefined): NormalizedPublishDate | null {
  if (value == null || value === '') return null

  const date = typeof value === 'number'
    ? new Date(value * 1000)
    : new Date(value)

  if (!Number.isFinite(date.getTime())) return null

  const iso = date.toISOString()
  return { iso, date: iso.slice(0, 10) }
}

export async function fillPublishDatesIfMissing(
  admin: AdminClient,
  params: {
    clientId: string
    publishedAt: string | number | null | undefined
    postUUID?: string | null
    pipelineItemId?: string | null
  },
): Promise<NormalizedPublishDate | null> {
  const normalized = normalizePublishDate(params.publishedAt)
  if (!normalized) return null

  if (params.pipelineItemId) {
    const { error } = await admin
      .from('pipeline_items')
      .update({ posted_at: normalized.iso })
      .eq('id', params.pipelineItemId)
      .eq('client_id', params.clientId)
      .is('posted_at', null)

    if (error) console.error('[publish-date] pipeline posted_at fill failed:', error.message)
  }

  if (params.postUUID) {
    const { error } = await admin
      .from('posts')
      .update({ date: normalized.date })
      .eq('id', params.postUUID)
      .eq('client_id', params.clientId)
      .is('date', null)

    if (error) console.error('[publish-date] posts date fill failed:', error.message)
  }

  return normalized
}
