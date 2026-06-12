import { getPortalContext } from '@/lib/supabase/portal'
import { CalendarClient } from '@/components/portal/CalendarClient'

// ── Types ──────────────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string
  title: string
  platform: string       // 'ig' | 'tt' | 'yt'
  eventDate: string      // 'YYYY-MM-DD'
  postId: string
  captionStatus: string
  postTime: string
  contentType: string
  cta: string
  userNotes: string      // notes.user_notes — free-text note from slide-over
  pipelineStatus: string | null  // joined from pipeline_items via post_id
  pillar: string | null          // joined from pipeline_items via post_id
  videoUrl: string | null        // pipeline_items.video_url
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function CalendarPage() {
  const { supabase, clientId } = await getPortalContext()
  const cid = clientId ?? '00000000-0000-0000-0000-000000000000'

  type RawEvent = {
    id: string; title: string; platform: string
    event_date: string; notes: string | null
  }
  type RawPipeline = { post_id: string; status: string; pillar: string | null; video_url: string | null }

  // Fetch events + all pipeline items in parallel
  const [evRes, pipeRes] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('id, title, platform, event_date, notes')
      .eq('client_id', cid)
      .order('event_date', { ascending: true }),
    supabase
      .from('pipeline_items')
      .select('post_id, status, pillar, video_url')
      .eq('client_id', cid),
  ])

  const rawEvents   = (evRes.data   ?? []) as unknown as RawEvent[]
  const rawPipeline = (pipeRes.data ?? []) as unknown as RawPipeline[]

  // Build post_id → pipeline status + pillar + video_url lookup
  const pipelineStatus:   Record<string, string>      = {}
  const pipelinePillar:   Record<string, string>      = {}
  const pipelineVideoUrl: Record<string, string|null> = {}
  for (const p of rawPipeline) {
    if (p.post_id) {
      pipelineStatus[p.post_id]   = p.status
      if (p.pillar) pipelinePillar[p.post_id] = p.pillar
      pipelineVideoUrl[p.post_id] = p.video_url ?? null
    }
  }

  // Parse notes JSON + join pipeline status
  const events: CalendarEvent[] = rawEvents.map(ev => {
    let notes: Record<string, string> = {}
    try { notes = JSON.parse(ev.notes ?? '{}') } catch { /* keep empty */ }

    const postId = notes.post_id ?? ''

    return {
      id:             ev.id,
      title:          ev.title,
      platform:       (ev.platform ?? 'ig').toLowerCase(),
      eventDate:      ev.event_date,
      postId,
      captionStatus:  notes.caption_status  ?? '—',
      postTime:       notes.post_time       ?? '—',
      contentType:    notes.content_type    ?? '—',
      cta:            notes.cta             ?? '—',
      userNotes:      notes.user_notes      ?? '',
      pipelineStatus: postId ? (pipelineStatus[postId]   ?? null) : null,
      pillar:         postId ? (pipelinePillar[postId]   ?? null) : null,
      videoUrl:       postId ? (pipelineVideoUrl[postId] ?? null) : null,
    }
  })

  // Date bounds for navigation limits
  const dates     = events.map(e => e.eventDate).filter(Boolean)
  const earliestISO = dates[0]   ?? null
  const latestISO   = dates[dates.length - 1] ?? null

  return (
    <div className="p-10">
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
        <p
          className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
          style={{ color: '#c9a96e' }}
        >
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Publishing Schedule
        </p>
        <h1
          className="font-jakarta font-light"
          style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}
        >
          Calendar
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#444' }}>
          {events.length} events · Feb–May 2026 · IG & YT
        </p>
      </div>

      <CalendarClient
        events={events}
        earliestISO={earliestISO}
        latestISO={latestISO}
      />
    </div>
  )
}
