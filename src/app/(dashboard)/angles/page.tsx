import { getPortalContext } from '@/lib/supabase/portal'
import { FilterBar } from '@/components/portal/FilterBar'
import { AnglesClient } from '@/components/portal/AnglesClient'
import type { RawAnglesPost } from '@/components/portal/AnglesClient'

export default async function AnglesPage() {
  const { supabase, clientId } = await getPortalContext()
  const cid = clientId ?? '00000000-0000-0000-0000-000000000000'

  const { data, error } = await supabase
    .from('posts')
    .select(`
      post_id, title, platform, pillar, hook, format, date, decision,
      post_analytics(metric_window, views, likes, comments, shares, saves, watch_pct)
    `)
    .eq('client_id', cid)
    .order('date', { ascending: false })

  if (error) console.error('Angles fetch:', error.message)
  const rawPosts = (data ?? []) as unknown as RawAnglesPost[]

  return (
    <div className="p-10 max-w-[1100px]">
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
        <p
          className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
          style={{ color: '#c9a96e' }}
        >
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Content Intelligence
        </p>
        <h1
          className="font-jakarta font-light"
          style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}
        >
          Angles
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#444' }}>
          {rawPosts.length} posts · ER breakdown by pillar, hook, format
        </p>
      </div>

      <FilterBar />
      <AnglesClient rawPosts={rawPosts} />
    </div>
  )
}
