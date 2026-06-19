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
  ytId: string | null
  videoUrl: string | null
  igVideoId: string | null
  ttVideoId: string | null
  ytVideoId: string | null
  scriptContent: string | null
  notes: string | null
  driveFileId: string | null
  approvalComment: string | null
}

export default async function PipelinePage() {
  const { supabase, clientId } = await getPortalContext()
  const fallback = '00000000-0000-0000-0000-000000000000'

  type RawRow = {
    id: string; post_id: string; title: string; platform: string[];
    pillar: string | null; status: string; priority: number | null;
    week: string | null; scheduled_date: string | null; posted_at: string | null;
    yt_type: string | null; video_url: string | null;
    ig_video_id: string | null; tt_video_id: string | null; yt_video_id: string | null;
    script_content: string | null; notes: string | null;
    drive_file_id: string | null; approval_comment: string | null;
  }

  const { data, error } = await supabase
    .from('pipeline_items')
    .select(
      'id, post_id, title, platform, pillar, status, priority, week, ' +
      'scheduled_date, posted_at, yt_type, video_url, ' +
      'ig_video_id, tt_video_id, yt_video_id, ' +
      'script_content, notes, drive_file_id, approval_comment',
    )
    .eq('client_id', clientId ?? fallback)
    .order('priority', { ascending: true })

  if (error) console.error('Pipeline fetch:', error.message)
  const rows = (data ?? []) as unknown as RawRow[]

  // Fetch yt_id for each post: pipeline post_id (text) → posts.id (UUID) → post_analytics.yt_id
  const postTextIds = [...new Set(rows.map(r => r.post_id).filter(Boolean))]
  const ytIdByTextPostId: Record<string, string> = {}

  if (postTextIds.length > 0) {
    const { data: postRows } = await supabase
      .from('posts')
      .select('id, post_id')
      .in('post_id', postTextIds)
      .eq('client_id', clientId ?? fallback)

    if (postRows && postRows.length > 0) {
      const uuids = (postRows as unknown as { id: string; post_id: string }[])
      const uuidList = uuids.map(p => p.id)

      const { data: analyticsRows } = await supabase
        .from('post_analytics')
        .select('post_id, yt_id')
        .in('post_id', uuidList)
        .not('yt_id', 'is', null)

      // Build map: text post_id → yt_id
      const uuidToTextId: Record<string, string> = {}
      for (const p of uuids) uuidToTextId[p.id] = p.post_id

      for (const a of (analyticsRows ?? []) as unknown as { post_id: string; yt_id: string }[]) {
        const textId = uuidToTextId[a.post_id]
        if (textId && a.yt_id) ytIdByTextPostId[textId] = a.yt_id
      }
    }
  }

  // Compute next available ID per platform
  const { data: postIdRows } = await supabase
    .from('posts')
    .select('post_id')
    .eq('client_id', clientId ?? fallback)

  const allIds: string[] = [
    ...rows.map(r => r.post_id ?? ''),
    ...((postIdRows ?? []) as unknown as { post_id: string }[]).map(r => r.post_id ?? ''),
  ]

  function nextIdFor(prefix: string, padLen: number): string {
    const re = new RegExp(`#${prefix}(\\d+)`, 'i')
    const nums = allIds
      .flatMap(id => id.split('|').map(s => s.trim()))
      .map(id => re.exec(id)?.[1])
      .filter((n): n is string => n != null)
      .map(Number)
    const max = nums.length ? Math.max(...nums) : 0
    return `#${prefix}${String(max + 1).padStart(padLen, '0')}`
  }

  const nextIds = {
    ig: nextIdFor('ig', 4),
    tt: nextIdFor('tt', 4),
    yt: nextIdFor('yt', 4),
    lf: nextIdFor('LF', 4),
  }

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
    ytId:          ytIdByTextPostId[r.post_id] ?? null,
    videoUrl:        r.video_url        ?? null,
    igVideoId:       r.ig_video_id      ?? null,
    ttVideoId:       r.tt_video_id      ?? null,
    ytVideoId:       r.yt_video_id      ?? null,
    scriptContent:   r.script_content   ?? null,
    notes:           r.notes            ?? null,
    driveFileId:     r.drive_file_id    ?? null,
    approvalComment: r.approval_comment ?? null,
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
          style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06, textShadow: '0 0 32px rgba(255,255,255,0.22), 0 0 8px rgba(255,255,255,0.08)' }}
        >
          Pipeline
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#666' }}>
          {items.length} items · status updates save instantly
        </p>
      </div>

      <PipelineClient initialItems={items} nextIds={nextIds} />
    </div>
  )
}
