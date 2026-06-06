import { getPortalContext } from '@/lib/supabase/portal'
import { DashboardClient } from '@/components/portal/DashboardClient'
import type { RawDashPost, RawDashPipeline } from '@/components/portal/DashboardClient'

export default async function DashboardPage() {
  const { supabase, clientId, userEmail } = await getPortalContext()
  const cid = clientId ?? '00000000-0000-0000-0000-000000000000'

  const [postsRes, pipelineRes] = await Promise.all([
    supabase
      .from('posts')
      .select('post_id, title, platform, date, format, pillar, post_analytics(metric_window,views,likes,comments,shares,saves,followers)')
      .eq('client_id', cid)
      .order('date', { ascending: true }),
    supabase
      .from('pipeline_items')
      .select('status, platform')
      .eq('client_id', cid),
  ])

  const rawPosts    = (postsRes.data    ?? []) as unknown as RawDashPost[]
  const rawPipeline = (pipelineRes.data ?? []) as unknown as RawDashPipeline[]

  const clientName = userEmail?.split('@')[0] ?? 'there'

  return (
    <DashboardClient
      rawPosts={rawPosts}
      rawPipeline={rawPipeline}
      clientName={clientName}
    />
  )
}
