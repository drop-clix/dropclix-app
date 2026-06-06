import { getPortalContext } from '@/lib/supabase/portal'
import { GoalsDashboard } from '@/components/portal/GoalsClient'

// ── Types passed to client ─────────────────────────────────────────────────

export type RawGoalPost = {
  post_id: string
  title: string
  date: string | null
  platform: string[]
  format: string | null
  pillar: string | null
  hook: string | null
  decision: string | null
  post_analytics: {
    metric_window: string
    views: number
    likes: number
    comments: number
    shares: number
    saves: number | null
    followers: number
  }[]
}

export type RawGoal = {
  id: string
  metric: string
  target: number
  period: string
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function GoalsPage() {
  const { supabase, clientId } = await getPortalContext()
  const cid = clientId ?? '00000000-0000-0000-0000-000000000000'

  const [goalsRes, postsRes] = await Promise.all([
    supabase.from('goals').select('id, metric, target, period').eq('client_id', cid),
    supabase.from('posts')
      .select(
        'post_id, title, date, platform, format, pillar, hook, decision, ' +
        'post_analytics(metric_window, views, likes, comments, shares, saves, followers)',
      )
      .eq('client_id', cid)
      .order('date', { ascending: true }),
  ])

  const goals    = (goalsRes.data ?? []) as unknown as RawGoal[]
  const rawPosts = (postsRes.data ?? []) as unknown as RawGoalPost[]

  return (
    <div className="p-10">
      <GoalsDashboard
        rawPosts={rawPosts}
        goals={goals}
      />
    </div>
  )
}
