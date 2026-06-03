import { getPortalContext } from '@/lib/supabase/portal'
import { createAdminClient } from '@/lib/supabase/admin'
import { StudioClient } from '@/components/portal/StudioClient'
import type { StudioItem } from '@/components/portal/StudioClient'

async function fetchNextPostId(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('posts')
    .select('post_id')
    .eq('client_id', clientId)
    .ilike('post_id', '#ig%')

  let maxNum = 0
  for (const row of (data ?? []) as unknown as { post_id: string }[]) {
    const m = row.post_id?.match(/^#ig(\d+)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > maxNum) maxNum = n
    }
  }
  return `#ig${String(maxNum + 1).padStart(4, '0')}`
}

export default async function StudioPage() {
  const { supabase, clientId } = await getPortalContext()
  const cid = clientId ?? '00000000-0000-0000-0000-000000000000'

  type RawRow = {
    id: string; post_id: string; title: string; platform: string[]
    pillar: string | null; status: string; priority: number | null
    week: string | null; script_content: string | null; notes: string | null
  }

  const [pipelineRes, nextPostId] = await Promise.all([
    supabase
      .from('pipeline_items')
      .select('id, post_id, title, platform, pillar, status, priority, week, script_content, notes')
      .eq('client_id', cid)
      .not('status', 'in', '("POSTED","CANCELLED")')
      .order('priority', { ascending: true }),
    clientId ? fetchNextPostId(clientId) : Promise.resolve('#ig0001'),
  ])

  const items: StudioItem[] = ((pipelineRes.data ?? []) as unknown as RawRow[]).map(r => ({
    id:            r.id,
    postId:        r.post_id,
    title:         r.title,
    platform:      r.platform ?? [],
    pillar:        r.pillar,
    status:        r.status ?? 'PLANNED',
    priority:      r.priority,
    week:          r.week,
    scriptContent: r.script_content,
    notes:         r.notes,
  }))

  return (
    <div className="p-10">
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
        <p
          className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
          style={{ color: '#c9a96e' }}
        >
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Content Pipeline
        </p>
        <h1
          className="font-jakarta font-light"
          style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}
        >
          Studio
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#444' }}>
          {items.filter(i => i.status === 'SCRIPTED').length} scripts to review
          · {items.filter(i => i.status === 'FILMING' || i.status === 'REVIEWING').length} in production
          · {items.length} active items total
        </p>
      </div>

      <StudioClient items={items} nextPostId={nextPostId} />
    </div>
  )
}
