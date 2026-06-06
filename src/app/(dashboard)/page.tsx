import { getPortalContext } from '@/lib/supabase/portal'
import { DashboardClient } from '@/components/portal/DashboardClient'
import type { RawDashCalendar, RawDashGoal, RawDashPipeline, RawDashPost } from '@/components/portal/DashboardClient'

export default async function DashboardPage() {
  const { supabase, clientId, userEmail } = await getPortalContext()
  const cid = clientId ?? '00000000-0000-0000-0000-000000000000'

  const [postsRes, pipelineRes, calRes, goalsRes] = await Promise.all([
    supabase
      .from('posts')
      .select('id, post_id, title, platform, date, format, pillar, hook, decision, post_analytics(metric_window,platform,views,likes,comments,shares,saves,followers,watch_pct)')
      .eq('client_id', cid)
      .order('date', { ascending: true }),
    supabase
      .from('pipeline_items')
      .select('id, post_id, title, platform, status, week, scheduled_date, posted_at, priority')
      .eq('client_id', cid)
      .order('priority', { ascending: true }),
    supabase
      .from('calendar_events')
      .select('id, title, platform, event_date, notes')
      .eq('client_id', cid)
      .order('event_date', { ascending: true }),
    supabase
      .from('goals')
      .select('metric, target, period')
      .eq('client_id', cid),
  ])

  const rawPosts    = (postsRes.data    ?? []) as unknown as RawDashPost[]
  const rawPipeline = (pipelineRes.data ?? []) as unknown as RawDashPipeline[]
  const rawCalendar = (calRes.data      ?? []) as unknown as RawDashCalendar[]
  const rawGoals    = (goalsRes.data    ?? []) as unknown as RawDashGoal[]

  const clientName = userEmail?.split('@')[0] ?? 'there'

  return (
    <DashboardClient
      rawPosts={rawPosts}
      rawPipeline={rawPipeline}
      rawCalendar={rawCalendar}
      rawGoals={rawGoals}
      clientName={clientName}
    />
  )
}
