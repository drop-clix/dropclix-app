// Server-side: recompute and persist posts.decision for one posts row (S78).
// Never throws. A failure is logged and returns null so callers (syncs,
// snapshot job, manual edit) are never failed by Decision bookkeeping.

import { createAdminClient } from '@/lib/supabase/admin'
import { decisionFromWindows, platformFromPostId, type DecisionWindow } from '@/lib/decision'

type AdminClient = ReturnType<typeof createAdminClient>

// TEMPORARY review hold (S78, 2026-11-17): stored Decisions the owner asked to
// review before any rewrite. While a posts.id is listed here, no path (sync,
// cron polling, snapshot, manual edit) changes its stored Decision. Remove an
// entry, or the whole list, once the review is done.
const DECISION_REVIEW_HOLD = new Set<string>([
  '46b2b81a-4fe5-4fa6-b340-894022ccfcec', // #LF0005 Double Down → Iterate
  '1663a1c2-a3d7-453a-95cd-b2309200e53c', // #LF0006 Iterate → Kill
  'd381af9f-b046-4231-bab5-1cf5ef07169b', // #LF0007 Double Down → Iterate
  '27dca2c8-086c-4968-819b-efcfaf561fc4', // #LF0013 Double Down → Iterate
  'ebf3b12d-f409-42da-89a4-be1ea44f753c', // #LF0014 Double Down → Iterate
])

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
    if (DECISION_REVIEW_HOLD.has(postUUID) && decision !== (previous ?? null)) {
      return { decision: previous ?? null, previous: previous ?? null, changed: false }
    }
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
