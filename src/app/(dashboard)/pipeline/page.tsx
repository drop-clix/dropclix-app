import { getPortalContext } from '@/lib/supabase/portal'
import { PipelineClient } from '@/components/portal/PipelineClient'

export type PipelineItem = {
  id: string
  postId: string
  title: string
  platform: string[]
  pillar: string
  status: string
  priority: number
  week: string
  scheduledDate: string | null
  postedAt: string | null
  ytType: string | null
  scriptContent: string | null
  notes: string | null
}

export default async function PipelinePage() {
  const { supabase, clientId } = await getPortalContext()
  const fallback = '00000000-0000-0000-0000-000000000000'

  type RawRow = {
    id: string; post_id: string; title: string; platform: string[];
    pillar: string | null; status: string; priority: number | null;
    week: string | null; scheduled_date: string | null; posted_at: string | null;
    yt_type: string | null; script_content: string | null; notes: string | null;
  }

  const { data, error } = await supabase
    .from('pipeline_items')
    .select(
      'id, post_id, title, platform, pillar, status, priority, week, ' +
      'scheduled_date, posted_at, yt_type, script_content, notes',
    )
    .eq('client_id', clientId ?? fallback)
    .order('priority', { ascending: true })

  if (error) console.error('Pipeline fetch:', error.message)
  const rows = (data ?? []) as unknown as RawRow[]

  const items: PipelineItem[] = rows.map(r => ({
    id:            r.id,
    postId:        r.post_id,
    title:         r.title,
    platform:      r.platform ?? [],
    pillar:        r.pillar   ?? '—',
    status:        r.status   ?? 'PLANNED',
    priority:      r.priority ?? 4,
    week:          r.week     ?? '—',
    scheduledDate: r.scheduled_date ?? null,
    postedAt:      r.posted_at      ?? null,
    ytType:        r.yt_type        ?? null,
    scriptContent: r.script_content ?? null,
    notes:         r.notes         ?? null,
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
          Pipeline
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#444' }}>
          {items.length} items · status updates save instantly
        </p>
      </div>

      <PipelineClient initialItems={items} />
    </div>
  )
}
