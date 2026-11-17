// Server-side: recompute and persist posts.decision for one posts row (S78).
// Never throws. A failure is logged and returns null so callers (syncs,
// snapshot job, manual edit) are never failed by Decision bookkeeping.

import { createAdminClient } from '@/lib/supabase/admin'
import { decisionFromWindows, platformFromPostId, type DecisionWindow } from '@/lib/decision'

type AdminClient = ReturnType<typeof createAdminClient>

export type StoredDecisionResult = {
  decision: string | null
  previous: string | null
  changed: boolean
}

export async function recomputeStoredDecision(
  admin: AdminClient,
  postUUID: string,
): Promise<StoredDecisionResult | null> {
  try {
    const { data: post, error: postErr } = await admin
      .from('posts')
      .select('id, post_id, decision')
      .eq('id', postUUID)
      .maybeSingle()
    if (postErr || !post) {
      if (postErr) console.error('[decision] posts lookup failed:', postErr.message)
      return null
    }

    const { post_id: postId, decision: previous } = post as { id: string; post_id: string | null; decision: string | null }
    const platform = platformFromPostId(postId)
    if (!platform) {
      // Unknown prefix: leave the stored value alone rather than guess.
      return { decision: previous ?? null, previous: previous ?? null, changed: false }
    }

    const { data: rows, error: rowsErr } = await admin
      .from('post_analytics')
      .select('metric_window, views, likes, comments, shares, saves, followers')
      .eq('post_id', postUUID)
      .eq('platform', platform)
    if (rowsErr) {
      console.error('[decision] analytics lookup failed:', rowsErr.message)
      return null
    }

    const windows: Record<string, DecisionWindow> = {}
    for (const row of (rows ?? []) as (DecisionWindow & { metric_window: string })[]) {
      windows[row.metric_window] = row
    }
    const decision = decisionFromWindows(platform, windows)
    if (decision === (previous ?? null)) {
      return { decision, previous: previous ?? null, changed: false }
    }

    const { error: updErr } = await admin.from('posts').update({ decision }).eq('id', postUUID)
    if (updErr) {
      console.error('[decision] posts.decision update failed:', updErr.message)
      return null
    }
    return { decision, previous: previous ?? null, changed: true }
  } catch (err) {
    console.error('[decision] recompute failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}
