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
  '3996bb23-3bee-4128-b5e3-e0d15918c92a', // #ig0001 Kill → Iterate
  '8a0d893e-58e2-4957-bf28-65717257f9ac', // #ig0002 Kill → Iterate
  'f7e95dcd-5028-4ca6-8073-0b302a255d1b', // #ig0007 Kill → Iterate
  '829cf7bb-f4d3-4c51-b758-1fa8b50dc4ff', // #ig0009 Kill → Iterate
  '695dcca0-5ea0-45c9-aa5c-1b982fb6a26d', // #ig0010 Kill → Iterate
  '822e24eb-c1fc-4d5a-add7-977cd0d52c57', // #ig0012 Kill → Iterate
  '60d26efb-76ef-4718-aa81-5326a235fa0f', // #ig0015 Kill → Iterate
  '935490f0-60fd-44d9-9bc3-817e993f11e5', // #ig0017 Kill → Iterate
  'a11f334d-081e-441d-ae17-d767d6915afd', // #ig0018 Kill → Iterate
  '37b829cd-6ffb-4e4b-974b-05bc716ce8f1', // #ig0020 Kill → Iterate
  'f3940639-ddbd-421b-b648-b2c5ac0b2792', // #ig0022 Kill → Iterate
  'f0dfc030-8e1f-44f9-960f-0480adaeb071', // #ig0023 Kill → Iterate
  '640551af-f1e8-4656-852b-7e40590122d2', // #ig0024 Kill → Iterate
  '1ac50f23-4b95-4ccf-888d-488b5b60f8e7', // #ig0025 Kill → Iterate
  'd96c2058-7234-433b-baa6-a5632459ced0', // #ig0033 Kill → Iterate
  'ce6c46be-cce4-4940-9247-92f8c602125c', // #ig0034 Kill → Iterate
  '209cf14f-43a0-4e04-ad63-a5cae06788c0', // #ig0038 Kill → Iterate
  '57d99373-7816-4d07-9ea6-85adc1ce4433', // #ig0039 Kill → Iterate
  'f798a8c9-6324-4bac-a632-a0dc595f3aa0', // #ig0042 Kill → Iterate
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
