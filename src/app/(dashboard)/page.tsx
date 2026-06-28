import { getPortalContext } from '@/lib/supabase/portal'
import { DashboardClient } from '@/components/portal/DashboardClient'
import type { RawDashPost, RawDashPipeline, RawDashCalendar, RawDashGoal, RawDashCampaign, RawUnlinkedDiscovery } from '@/components/portal/DashboardClient'

export default async function DashboardPage() {
  const { supabase, clientId, userEmail, clientName: portalClientName, isAdmin } = await getPortalContext()
  const cid = clientId ?? '00000000-0000-0000-0000-000000000000'

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyAgoISO = thirtyDaysAgo.toISOString().split('T')[0]

  const [postsRes, pipelineRes, calRes, goalsRes, adsRes, discoveriesRes] = await Promise.all([
    supabase
      .from('posts')
      .select('id, post_id, title, platform, date, format, pillar, hook, decision, post_analytics(metric_window,platform,views,likes,comments,shares,saves,followers,watch_pct)')
      .eq('client_id', cid)
      .order('date', { ascending: true }),
    supabase
      .from('pipeline_items')
      .select('id, post_id, title, platform, status, week, scheduled_date, posted_at, priority, drive_file_id, approval_comment, pillar, thumbnail_url, ig_video_id, tt_video_id, yt_video_id')
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
    supabase
      .from('ad_campaigns')
      .select('id,name,date,spend,roas,ctr,cpm,impressions')
      .eq('client_id', cid)
      .gte('date', thirtyAgoISO)
      .order('date', { ascending: true }),
    isAdmin
      ? supabase
        .from('unlinked_video_discoveries')
        .select('id, client_id, platform, platform_video_id, permalink, title, thumbnail_url, published_at, views, likes, comments, shares, saves, status, last_seen_at')
        .eq('client_id', cid)
        .eq('status', 'unlinked')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('last_seen_at', { ascending: false })
        .limit(100)
      : Promise.resolve({ data: [] }),
  ])

  const rawPosts     = (postsRes.data    ?? []) as unknown as RawDashPost[]
  const rawPipeline  = (pipelineRes.data ?? []) as unknown as RawDashPipeline[]
  const rawCalendar  = (calRes.data      ?? []) as unknown as RawDashCalendar[]
  const rawGoals     = (goalsRes.data    ?? []) as unknown as RawDashGoal[]
  const rawCampaigns = (adsRes.data      ?? []) as unknown as RawDashCampaign[]
  const rawUnlinked  = (discoveriesRes.data ?? []) as unknown as RawUnlinkedDiscovery[]

  const clientName = portalClientName ?? userEmail?.split('@')[0] ?? 'there'

  return (
    <DashboardClient
      rawPosts={rawPosts}
      rawPipeline={rawPipeline}
      rawCalendar={rawCalendar}
      rawGoals={rawGoals}
      rawCampaigns={rawCampaigns}
      rawUnlinkedDiscoveries={rawUnlinked}
      isAdmin={isAdmin}
      clientName={clientName}
    />
  )
}
