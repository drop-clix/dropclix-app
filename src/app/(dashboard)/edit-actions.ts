'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { erToDecision } from '@/lib/decision'
import { fetchYouTubePublicVideo } from '@/lib/youtube-public'
import { syncSingleIGVideo } from '@/lib/instagram-sync'
import { syncSingleTTVideo } from '@/lib/tiktok-sync'
import { syncSingleYTVideo } from '@/lib/video-polling'
import { fillPublishDatesIfMissing, normalizePublishDate } from '@/lib/publish-date'

const IMPERSONATE = 'dropclix_impersonate_client_id'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('users').select('role, client_id').eq('id', user.id).single()
  if (!p) return null
  const admin = createAdminClient()
  const cid = p.role === 'admin'
    ? ((await cookies()).get(IMPERSONATE)?.value ?? null)
    : (p.client_id as string | null)
  return { admin, role: p.role as string, cid }
}

// ── Bidirectional sync helpers ────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>

// Pipeline change → update matching calendar_event (matched via notes.post_id)
async function syncToCalendar(
  postId: string,
  cid: string,
  admin: AdminClient,
  fields: Record<string, unknown>,
) {
  const update: Record<string, unknown> = {}
  if (fields.title !== undefined) update.title = fields.title
  if (fields.platform !== undefined)
    update.platform = Array.isArray(fields.platform)
      ? (fields.platform as string[])[0] ?? 'ig'
      : fields.platform
  // posted_at takes priority; fall back to scheduled_date
  if (fields.posted_at !== undefined && fields.posted_at !== null)
    update.event_date = (fields.posted_at as string).slice(0, 10)
  else if (fields.scheduled_date !== undefined && fields.scheduled_date !== null)
    update.event_date = fields.scheduled_date as string

  if (Object.keys(update).length === 0) return
  await admin
    .from('calendar_events')
    .update(update)
    .eq('client_id', cid)
    .ilike('notes', `%"post_id":"${postId}"%`)
}

// Calendar change → update matching pipeline_item (matched via post_id column)
async function syncToPipeline(
  postId: string,
  cid: string,
  admin: AdminClient,
  fields: Record<string, unknown>,
) {
  if (!postId) return
  const update: Record<string, unknown> = {}
  if (fields.title !== undefined) update.title = fields.title
  if (fields.event_date !== undefined) update.scheduled_date = fields.event_date
  if (fields.platform !== undefined) update.platform = [fields.platform]

  if (Object.keys(update).length === 0) return
  await admin
    .from('pipeline_items')
    .update(update)
    .eq('client_id', cid)
    .eq('post_id', postId)
}

// ── Pipeline ─────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set([
  'SCRIPTED','PLANNED','FILMING','EDITING','REVIEWING','SCHEDULED','POSTED','CANCELLED',
  'PENDING_APPROVAL','APPROVED','CHANGES_REQUESTED',
])
const VALID_PIPE = new Set([
  'status','priority','platform','pillar','week','script_content','title','notes',
  'posted_at','scheduled_date','video_url','drive_file_id','approval_comment',
  'ig_video_id','tt_video_id','yt_video_id','thumbnail_url',
])
// Fields that need to be mirrored in the matching calendar event
const PIPE_SYNC_FIELDS = new Set(['title', 'platform', 'posted_at', 'scheduled_date'])

export async function updatePipelineItem(
  itemId: string,
  fields: Record<string, unknown>,
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }

  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!VALID_PIPE.has(k)) return { error: `Invalid field: ${k}` }
    if (k === 'status' && !VALID_STATUSES.has(v as string)) return { error: 'Invalid status' }
    update[k] = v
  }

  const filter: Record<string, unknown> = { id: itemId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid

  const { error } = await c.admin.from('pipeline_items').update(update).match(filter)
  if (error) return { error: error.message }

  // Sync sync-relevant fields to matching calendar event
  const hasSyncField = Object.keys(fields).some(k => PIPE_SYNC_FIELDS.has(k))
  if (hasSyncField && c.cid) {
    const { data: item } = await c.admin
      .from('pipeline_items').select('post_id').eq('id', itemId).single()
    if (item?.post_id) {
      await syncToCalendar(item.post_id, c.cid, c.admin, fields)
    }
  }

  revalidatePath('/pipeline')
  revalidatePath('/calendar')
  return {}
}

export async function deletePipelineItem(itemId: string): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  const filter: Record<string, unknown> = { id: itemId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid
  const { error } = await c.admin.from('pipeline_items').delete().match(filter)
  if (error) return { error: error.message }
  revalidatePath('/pipeline')
  return {}
}

// ── Goals ────────────────────────────────────────────────────────────────

export async function updateGoalTarget(goalId: string, target: number): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  if (isNaN(target) || target < 0) return { error: 'Invalid target' }
  const filter: Record<string, unknown> = { id: goalId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid
  const { error } = await c.admin.from('goals').update({ target }).match(filter)
  if (error) return { error: error.message }
  revalidatePath('/goals')
  return {}
}

// ── Analytics ────────────────────────────────────────────────────────────

const VALID_ANALYTICS = new Set(['views','likes','comments','shares','saves','watch_pct','followers'])

export async function updateAnalyticsMetric(
  postUUID: string,
  platform: string,
  metricWindow: string,
  field: string,
  value: number,
): Promise<{ error?: string; decision?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  if (!VALID_ANALYTICS.has(field)) return { error: 'Invalid field' }
  if (isNaN(value) || value < 0) return { error: 'Invalid value' }

  const filter: Record<string, unknown> = { post_id: postUUID, platform, metric_window: metricWindow }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid

  const { error } = await c.admin.from('post_analytics').update({ [field]: value }).match(filter)
  if (error) return { error: error.message }

  // Re-compute Decision from best available window (eom > w7 > w3 > w24) and persist it.
  // postUUID is post_analytics.post_id = posts.id (UUID FK).
  let decision: string | undefined
  const { data: analyticsRows } = await c.admin
    .from('post_analytics')
    .select('metric_window, views, likes, comments, shares, saves')
    .eq('post_id', postUUID)
    .eq('platform', platform)
    .in('metric_window', ['eom', 'w7', 'w3', 'w24'])

  if (analyticsRows?.length) {
    const byWindow: Record<string, typeof analyticsRows[0]> = {}
    for (const row of analyticsRows) byWindow[row.metric_window] = row
    for (const wk of ['eom', 'w7', 'w3', 'w24']) {
      const row = byWindow[wk]
      if (row?.views > 0) {
        const er = ((row.likes + row.comments + row.shares + row.saves) / row.views) * 100
        decision = erToDecision(er)
        await c.admin.from('posts').update({ decision }).eq('id', postUUID)
        break
      }
    }
  }

  revalidatePath('/analytics')
  return { decision }
}

// ── Ad Campaigns ─────────────────────────────────────────────────────────

const VALID_CAMPAIGN = new Set(['name','objective','status','spend','leads','hires','date','impressions','reach','clicks','roas'])

export async function updateAdCampaign(
  campaignId: string,
  fields: Record<string, unknown>,
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!VALID_CAMPAIGN.has(k)) return { error: `Invalid field: ${k}` }
    update[k] = v
  }
  const filter: Record<string, unknown> = { id: campaignId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid
  const { error } = await c.admin.from('ad_campaigns').update(update).match(filter)
  if (error) return { error: error.message }
  revalidatePath('/ads')
  return {}
}

export async function deleteAdCampaign(campaignId: string): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  const filter: Record<string, unknown> = { id: campaignId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid
  const { error } = await c.admin.from('ad_campaigns').delete().match(filter)
  if (error) return { error: error.message }
  revalidatePath('/ads')
  return {}
}

// ── Ad Creatives ─────────────────────────────────────────────────────────

const VALID_CREATIVE = new Set(['type','status','impressions','ctr','name'])

export async function updateAdCreative(
  creativeId: string,
  fields: Record<string, unknown>,
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!VALID_CREATIVE.has(k)) return { error: `Invalid field: ${k}` }
    update[k] = v
  }
  const filter: Record<string, unknown> = { id: creativeId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid
  const { error } = await c.admin.from('ad_creatives').update(update).match(filter)
  if (error) return { error: error.message }
  revalidatePath('/ads')
  return {}
}

export async function deleteAdCreative(creativeId: string): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  const filter: Record<string, unknown> = { id: creativeId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid
  const { error } = await c.admin.from('ad_creatives').delete().match(filter)
  if (error) return { error: error.message }
  revalidatePath('/ads')
  return {}
}

// ── Calendar Events ──────────────────────────────────────────────────────

export async function updateCalendarEvent(
  eventId: string,
  fields: {
    title?: string
    platform?: string
    event_date?: string
    post_id?: string
    post_time?: string
    caption_status?: string
    cta?: string
    content_type?: string
    user_notes?: string
  },
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  const filter: Record<string, unknown> = { id: eventId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid

  const { title, platform, event_date, ...noteFields } = fields
  const direct: Record<string, unknown> = {}
  if (title !== undefined) direct.title = title
  if (platform !== undefined) direct.platform = platform
  if (event_date !== undefined) direct.event_date = event_date

  const hasNoteFields = Object.values(noteFields).some(v => v !== undefined)
  const hasSyncFields = title !== undefined || platform !== undefined || event_date !== undefined

  // Read current notes when we need to update them OR capture post_id for sync
  let currentPostId: string | null = null
  if (hasNoteFields || hasSyncFields) {
    const { data: row } = await c.admin.from('calendar_events').select('notes').match(filter).single()
    let notes: Record<string, string> = {}
    try { notes = JSON.parse(row?.notes ?? '{}') } catch { /* */ }
    currentPostId = notes.post_id ?? null
    if (hasNoteFields) {
      if (noteFields.post_id !== undefined)       notes.post_id        = noteFields.post_id
      if (noteFields.post_time !== undefined)      notes.post_time      = noteFields.post_time
      if (noteFields.caption_status !== undefined) notes.caption_status = noteFields.caption_status
      if (noteFields.cta !== undefined)            notes.cta            = noteFields.cta
      if (noteFields.content_type !== undefined)   notes.content_type   = noteFields.content_type
      if (noteFields.user_notes !== undefined)     notes.user_notes     = noteFields.user_notes
      direct.notes = JSON.stringify(notes)
    }
  }

  if (Object.keys(direct).length === 0) return {}
  const { error } = await c.admin.from('calendar_events').update(direct).match(filter)
  if (error) return { error: error.message }

  // Mirror sync-relevant changes to the matching pipeline item
  if (currentPostId && c.cid && hasSyncFields) {
    const syncFields: Record<string, unknown> = {}
    if (title !== undefined) syncFields.title = title
    if (event_date !== undefined) syncFields.event_date = event_date
    if (platform !== undefined) syncFields.platform = platform
    await syncToPipeline(currentPostId, c.cid, c.admin, syncFields)
  }

  revalidatePath('/calendar')
  revalidatePath('/pipeline')
  return {}
}

// Update a pipeline item by its text post_id (for use from calendar slide-over)
export async function updatePipelineByPostId(
  postTextId: string,
  fields: { status?: string; pillar?: string; video_url?: string },
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c || !c.cid) return { error: 'Not authenticated' }
  if (!postTextId) return {}

  const update: Record<string, unknown> = {}
  if (fields.status !== undefined) {
    if (!VALID_STATUSES.has(fields.status)) return { error: 'Invalid status' }
    update.status = fields.status
    update.priority = {
      REVIEWING: 1, FILMING: 2, SCRIPTED: 3, PLANNED: 4,
      EDITING: 5, SCHEDULED: 5, POSTED: 6, CANCELLED: 6,
      PENDING_APPROVAL: 1, APPROVED: 2, CHANGES_REQUESTED: 1,
    }[fields.status] ?? 4
  }
  if (fields.pillar !== undefined)    update.pillar    = fields.pillar
  if (fields.video_url !== undefined) update.video_url = fields.video_url
  if (Object.keys(update).length === 0) return {}

  const { error } = await c.admin
    .from('pipeline_items')
    .update(update)
    .eq('post_id', postTextId)
    .eq('client_id', c.cid)

  if (error) return { error: error.message }
  revalidatePath('/pipeline')
  revalidatePath('/calendar')
  return {}
}

export async function deleteCalendarEvent(eventId: string): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  const filter: Record<string, unknown> = { id: eventId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid
  const { error } = await c.admin.from('calendar_events').delete().match(filter)
  if (error) return { error: error.message }
  revalidatePath('/calendar')
  return {}
}

// ── Create Pipeline Item ──────────────────────────────────────────────────────

export async function createPipelineItem(data: {
  postId: string
  title: string
  platform: string[]
  status: string
  priority: number
  pillar?: string | null
  week?: string | null
  scriptContent?: string | null
}): Promise<{ id?: string; error?: string }> {
  const c = await getCtx()
  if (!c || !c.cid) return { error: 'Not authenticated' }
  if (!data.title?.trim()) return { error: 'Title is required' }
  if (!data.platform?.length) return { error: 'Select at least one platform' }
  if (!VALID_STATUSES.has(data.status)) return { error: 'Invalid status' }

  const { data: row, error } = await c.admin
    .from('pipeline_items')
    .insert({
      client_id:      c.cid,
      post_id:        data.postId,
      title:          data.title.trim(),
      platform:       data.platform,
      status:         data.status,
      priority:       data.priority,
      pillar:         data.pillar?.trim() || null,
      week:           data.week?.trim() || null,
      script_content: data.scriptContent?.trim() || null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/pipeline')
  revalidatePath('/calendar')
  return { id: (row as unknown as { id: string }).id }
}

// ── Bulk Create Pipeline Items ────────────────────────────────────────────────

export async function bulkCreatePipelineItems(items: {
  postId: string
  title: string
  platform: string[]
  pillar: string | null
  week: string | null
}[]): Promise<{ count?: number; error?: string }> {
  const c = await getCtx()
  if (!c || !c.cid) return { error: 'Not authenticated' }
  if (!items.length) return { count: 0 }
  if (items.length > 200) return { error: 'Maximum 200 items per import' }

  const rows = items.map(item => ({
    client_id: c.cid as string,
    post_id:   item.postId,
    title:     item.title.trim(),
    platform:  item.platform,
    status:    'PLANNED',
    priority:  3,
    pillar:    item.pillar?.trim() || null,
    week:      item.week?.trim() || null,
  }))

  const { data, error } = await c.admin
    .from('pipeline_items')
    .insert(rows)
    .select('id')

  if (error) return { error: error.message }
  revalidatePath('/pipeline')
  revalidatePath('/calendar')
  return { count: (data ?? []).length }
}

// ── Bulk Update Pipeline Status ───────────────────────────────────────────────

export async function bulkUpdatePipelineStatus(
  fromStatus: string,
  toStatus: string,
): Promise<{ count?: number; error?: string }> {
  const c = await getCtx()
  if (!c || !c.cid) return { error: 'Not authenticated' }
  if (!VALID_STATUSES.has(fromStatus) || !VALID_STATUSES.has(toStatus)) return { error: 'Invalid status' }

  const { data, error } = await c.admin
    .from('pipeline_items')
    .update({ status: toStatus })
    .eq('client_id', c.cid)
    .eq('status', fromStatus)
    .select('id')

  if (error) return { error: error.message }
  revalidatePath('/pipeline')
  return { count: (data ?? []).length }
}

// ── Update Analytics by Text Post ID ─────────────────────────────────────────

export async function updateAnalyticsByTextId(
  postTextId: string,
  platform: string,
  metricWindow: string,
  field: string,
  value: number,
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c || !c.cid) return { error: 'Not authenticated' }
  if (!VALID_ANALYTICS.has(field)) return { error: 'Invalid field' }

  const { data: postRow } = await c.admin
    .from('posts')
    .select('id')
    .eq('post_id', postTextId)
    .eq('client_id', c.cid)
    .single()

  if (!postRow) return { error: `Post ${postTextId} not found` }
  return updateAnalyticsMetric(
    (postRow as unknown as { id: string }).id,
    platform,
    metricWindow,
    field,
    value,
  )
}

// ── Bulk Delete Pipeline Items ────────────────────────────────────────────────

export async function bulkDeletePipelineItems(
  itemIds: string[],
): Promise<{ count?: number; error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  if (!itemIds.length) return { count: 0 }

  const admin = c.admin
  if (c.role !== 'admin' && c.cid) {
    const { error } = await admin
      .from('pipeline_items')
      .delete()
      .in('id', itemIds)
      .eq('client_id', c.cid)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from('pipeline_items')
      .delete()
      .in('id', itemIds)
    if (error) return { error: error.message }
  }

  revalidatePath('/pipeline')
  revalidatePath('/calendar')
  return { count: itemIds.length }
}

// ── Post Analytics Snapshot (for Calendar slide-over) ─────────────────────────

type AnalyticsWindow = {
  window: string
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  watchPct: number
  er: number
}

export async function getPostAnalyticsSnapshot(
  postTextId: string,
): Promise<{ windows?: AnalyticsWindow[]; platform?: string; error?: string }> {
  const c = await getCtx()
  if (!c || !c.cid) return { error: 'Not authenticated' }
  if (!postTextId) return { windows: [] }

  const { data: postRow } = await c.admin
    .from('posts')
    .select('id, platform')
    .eq('post_id', postTextId)
    .eq('client_id', c.cid)
    .single()

  if (!postRow) return { windows: [] }
  const { id: postUuid, platform } = postRow as unknown as { id: string; platform: string }

  const { data: rows } = await c.admin
    .from('post_analytics')
    .select('metric_window, views, likes, comments, shares, saves, watch_pct, followers')
    .eq('post_id', postUuid)
    .in('metric_window', ['w24', 'w3', 'w7', 'eom'])

  type RawRow = { metric_window: string; views: number; likes: number; comments: number; shares: number; saves: number | null; watch_pct: number | null; followers: number | null }
  const ORDER: Record<string, number> = { w24: 0, w3: 1, w7: 2, eom: 3 }

  const windows: AnalyticsWindow[] = ((rows ?? []) as unknown as RawRow[])
    .filter(r => r.views > 0)
    .sort((a, b) => (ORDER[a.metric_window] ?? 99) - (ORDER[b.metric_window] ?? 99))
    .map(r => {
      const saves = r.saves ?? 0
      const followers = r.followers ?? 0
      const isYt = platform === 'yt'
      const er = ((r.likes + r.comments + r.shares + saves + (isYt ? followers : 0)) / r.views) * 100
      return {
        window: r.metric_window,
        views: r.views,
        likes: r.likes,
        comments: r.comments,
        shares: r.shares,
        saves,
        watchPct: r.watch_pct ?? 0,
        er: parseFloat(er.toFixed(1)),
      }
    })

  return { windows, platform }
}

// ── YouTube video linking ─────────────────────────────────────────────────────

// Extracts a YouTube video ID from a URL or returns the string as-is if it's already an ID
function extractYouTubeId(input: string): string {
  const clean = input.trim()
  // Full URL patterns: youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/shorts/<id>
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = clean.match(re)
    if (m) return m[1]
  }
  // Assume raw 11-char video ID
  if (/^[A-Za-z0-9_-]{11}$/.test(clean)) return clean
  return clean
}

// Link a pipeline post to a YouTube video.
// Always saves yt_video_id to pipeline_items (persists on reload).
// Also saves yt_id to post_analytics rows when a posts row exists.
// postTextId: text like '#yt0001'. ytInput: full URL or raw 11-char video ID.
// pipelineItemId: pipeline_items.id UUID — ensures the ID persists even without a posts row.
export async function linkYouTubeVideo(
  postTextId: string,
  ytInput: string,
  pipelineItemId?: string,
): Promise<{ ytId?: string; note?: string; error?: string }> {
  const c = await getCtx()
  if (!c || !c.cid) return { error: 'Not authenticated' }

  const ytId = extractYouTubeId(ytInput)
  if (!ytId) return { error: 'Invalid YouTube URL or video ID' }

  const video = await fetchYouTubePublicVideo(ytId)

  // pipeline_items.title is the source of truth — never overwrite it from the API
  const pipelineUpdate: Record<string, string> = {}
  if (video?.thumbnailUrl) pipelineUpdate.thumbnail_url = video.thumbnailUrl

  // posts.title stores API metadata only; safe to write YT caption here
  const postMetadataUpdate: Record<string, string> = {}
  if (video?.title) postMetadataUpdate.title = video.title
  if (video?.thumbnailUrl) postMetadataUpdate.thumbnail_url = video.thumbnailUrl

  // Always save yt_video_id to pipeline_items when we have the item ID
  // This is the durable save path — survives reload regardless of analytics rows
  if (pipelineItemId) {
    await c.admin
      .from('pipeline_items')
      .update({ yt_video_id: ytId, ...pipelineUpdate })
      .eq('id', pipelineItemId)
      .eq('client_id', c.cid)
  }

  // Try to also update post_analytics.yt_id (best-effort — may be 0 rows)
  const { data: postRow } = await c.admin
    .from('posts')
    .select('id')
    .eq('post_id', postTextId)
    .eq('client_id', c.cid)
    .single()

  let postUuid: string | null = null
  if (postRow) {
    postUuid = (postRow as unknown as { id: string }).id
    if (Object.keys(postMetadataUpdate).length > 0) {
      await c.admin
        .from('posts')
        .update(postMetadataUpdate)
        .eq('id', postUuid)
        .eq('client_id', c.cid)
    }
    await c.admin
      .from('post_analytics')
      .update({ yt_id: ytId, yt_video_id: ytId })
      .eq('post_id', postUuid)
  }

  await fillPublishDatesIfMissing(c.admin, {
    clientId: c.cid,
    pipelineItemId,
    postUUID: postUuid,
    publishedAt: video?.publishedAt,
  })

  revalidatePath('/pipeline')
  revalidatePath('/analytics')

  const note = !postRow
    ? 'Video ID saved. Analytics will appear after the next sync.'
    : undefined

  return { ytId, note }
}

// ── Ensure posts row exists for a YT-linked pipeline item ────────────────────
//
// Called from MarkAsPostedModal when yt_video_id is set.
// Uses 3-strategy lookup (exact, pipe-split, yt_id). If no posts row found,
// creates a stub row so the cron can write to post_analytics immediately.
// Returns: { postId: text id, created: true } or {} if row already exists.

export async function ensureYTPostsRow(
  pipelineItemId: string,
): Promise<{ error?: string; postId?: string; created?: boolean }> {
  console.log(`[ensureYTPostsRow] called for pipeline item ${pipelineItemId}`)
  const c = await getCtx()
  if (!c || !c.cid) {
    console.error('[ensureYTPostsRow] not authenticated or no cid')
    return { error: 'Not authenticated' }
  }

  const { data: raw, error: rawErr } = await c.admin
    .from('pipeline_items')
    .select('id, post_id, title, platform, posted_at, yt_video_id')
    .eq('id', pipelineItemId)
    .single()
  if (!raw) {
    console.error('[ensureYTPostsRow] pipeline item not found:', pipelineItemId, rawErr?.message)
    return { error: 'Pipeline item not found' }
  }

  const item = raw as any
  if (!item.yt_video_id) {
    console.log(`[ensureYTPostsRow] pipeline item ${pipelineItemId} has no yt_video_id — skipping`)
    return {}
  }

  console.log(`[ensureYTPostsRow] post_id=${item.post_id} yt_video_id=${item.yt_video_id}`)

  const video = await fetchYouTubePublicVideo(item.yt_video_id)
  const publishedAt = normalizePublishDate(video?.publishedAt)

  // pipeline_items.title is the source of truth — never overwrite it from the API
  const pipelineUpdate: Record<string, string> = {}
  if (video?.thumbnailUrl) pipelineUpdate.thumbnail_url = video.thumbnailUrl

  if (Object.keys(pipelineUpdate).length > 0) {
    await c.admin
      .from('pipeline_items')
      .update(pipelineUpdate)
      .eq('id', pipelineItemId)
      .eq('client_id', c.cid)
  }

  // posts.title stores API metadata only; safe to write YT caption here
  const postMetadataUpdate: Record<string, string> = {}
  if (video?.title) postMetadataUpdate.title = video.title
  if (video?.thumbnailUrl) postMetadataUpdate.thumbnail_url = video.thumbnailUrl

  // Strategy 1: exact post_id match
  const { data: exact } = await c.admin.from('posts').select('id, post_id')
    .eq('post_id', item.post_id).eq('client_id', c.cid).maybeSingle()
  if (exact) {
    console.log(`[ensureYTPostsRow] found existing posts row via exact match: ${(exact as any).post_id}`)
    if (Object.keys(postMetadataUpdate).length > 0) {
      await c.admin.from('posts').update(postMetadataUpdate).eq('id', (exact as any).id)
    }
    await fillPublishDatesIfMissing(c.admin, {
      clientId: c.cid,
      pipelineItemId,
      postUUID: (exact as any).id,
      publishedAt: video?.publishedAt,
    })
    return { postId: (exact as any).post_id, created: false }
  }

  // Strategy 2: pipe-split
  if (typeof item.post_id === 'string' && item.post_id.includes('|')) {
    for (const part of item.post_id.split('|').map((s: string) => s.trim()).filter(Boolean)) {
      const { data } = await c.admin.from('posts').select('id, post_id')
        .eq('post_id', part).eq('client_id', c.cid).maybeSingle()
      if (data) {
        console.log(`[ensureYTPostsRow] found via pipe-split: ${(data as any).post_id}`)
        if (Object.keys(postMetadataUpdate).length > 0) {
          await c.admin.from('posts').update(postMetadataUpdate).eq('id', (data as any).id)
        }
        await fillPublishDatesIfMissing(c.admin, {
          clientId: c.cid,
          pipelineItemId,
          postUUID: (data as any).id,
          publishedAt: video?.publishedAt,
        })
        return { postId: (data as any).post_id, created: false }
      }
    }
  }

  // Strategy 3: yt_id match
  const { data: byYt } = await c.admin.from('posts').select('id, post_id')
    .eq('yt_id', item.yt_video_id).eq('client_id', c.cid).maybeSingle()
  if (byYt) {
    console.log(`[ensureYTPostsRow] found via yt_id: ${(byYt as any).post_id}`)
    if (Object.keys(postMetadataUpdate).length > 0) {
      await c.admin.from('posts').update(postMetadataUpdate).eq('id', (byYt as any).id)
    }
    await fillPublishDatesIfMissing(c.admin, {
      clientId: c.cid,
      pipelineItemId,
      postUUID: (byYt as any).id,
      publishedAt: video?.publishedAt,
    })
    return { postId: (byYt as any).post_id, created: false }
  }

  // No posts row — create stub using pipeline_items.post_id as source of truth.
  // If pipe-separated, extract the #yt* or #LF* part. Only generate #ytNNNN as last resort.
  console.log(`[ensureYTPostsRow] no existing posts row found — creating stub for yt_video_id=${item.yt_video_id}`)

  let newPostId: string
  const rawPid = item.post_id as string
  if (!rawPid.includes('|')) {
    // Single ID: use directly (e.g. "#yt0087", "#LF0003")
    newPostId = rawPid
    console.log(`[ensureYTPostsRow] using pipeline post_id directly: ${newPostId}`)
  } else {
    // Pipe-separated: extract the #yt* or #LF* part
    const parts = rawPid.split('|').map((s: string) => s.trim())
    const ytPart = parts.find((p: string) => p.startsWith('#yt') || p.startsWith('#LF'))
    if (ytPart) {
      newPostId = ytPart
      console.log(`[ensureYTPostsRow] extracted YT part from pipe-separated post_id: ${newPostId}`)
    } else {
      // Absolute last resort: generate sequential #ytNNNN
      const { data: lastYt } = await c.admin.from('posts').select('post_id')
        .eq('client_id', c.cid).like('post_id', '#yt%').order('post_id', { ascending: false }).limit(1)
      let nextNum = 1
      if (lastYt && (lastYt as any[]).length > 0) {
        const n = parseInt(((lastYt as any[])[0].post_id as string).replace('#yt', ''), 10)
        if (!isNaN(n)) nextNum = n + 1
      }
      newPostId = `#yt${String(nextNum).padStart(4, '0')}`
      console.log(`[ensureYTPostsRow] no YT part found in pipe-separated ID — generated fallback: ${newPostId}`)
    }
  }

  const platform: string[] = Array.isArray(item.platform) && item.platform.length > 0
    ? (item.platform as string[])
    : ['yt']

  if (publishedAt) {
    await fillPublishDatesIfMissing(c.admin, {
      clientId: c.cid,
      pipelineItemId,
      publishedAt: publishedAt.iso,
    })
  }

  const { error: insErr } = await c.admin.from('posts').insert({
    client_id: c.cid,
    post_id:   newPostId,
    title:     item.title ?? '(YouTube video)',
    platform,
    date:      publishedAt?.date ?? (item.posted_at ? (item.posted_at as string).slice(0, 10) : null),
    yt_id:     item.yt_video_id,
    thumbnail_url: video?.thumbnailUrl ?? null,
  })
  if (insErr) {
    console.error(`[ensureYTPostsRow] INSERT failed for ${newPostId} yt=${item.yt_video_id}:`, insErr.message, insErr.code)
    return { error: insErr.message }
  }

  console.log(`[ensureYTPostsRow] created stub posts row ${newPostId} for pipeline item ${pipelineItemId} yt=${item.yt_video_id}`)
  return { postId: newPostId, created: true }
}

// ── Ensure posts row exists for an IG/TT-linked pipeline item ───────────────
//
// IG/TT video IDs live on pipeline_items. The posts table has no ig_id/tt_id
// columns, so the posts row is keyed by the platform-specific post_id segment.

type ShortPlatform = 'ig' | 'tt'

function extractPlatformPostId(rawPostId: string, platform: ShortPlatform): string | null {
  const prefix = `#${platform}`
  const parts = rawPostId.split('|').map(part => part.trim()).filter(Boolean)
  const match = parts.find(part => part.toLowerCase().startsWith(prefix))
  return match ?? null
}

async function ensureSocialPostsRow(
  pipelineItemId: string,
  platform: ShortPlatform,
): Promise<{ error?: string; postId?: string; created?: boolean }> {
  console.log(`[ensure${platform.toUpperCase()}PostsRow] called for pipeline item ${pipelineItemId}`)
  const c = await getCtx()
  if (!c || !c.cid) {
    console.error(`[ensure${platform.toUpperCase()}PostsRow] not authenticated or no cid`)
    return { error: 'Not authenticated' }
  }

  const videoIdColumn = platform === 'ig' ? 'ig_video_id' : 'tt_video_id'
  const { data: raw, error: rawErr } = await c.admin
    .from('pipeline_items')
    .select('id, post_id, title, platform, posted_at, pillar, ig_video_id, tt_video_id')
    .eq('id', pipelineItemId)
    .eq('client_id', c.cid)
    .single()

  if (!raw) {
    console.error(`[ensure${platform.toUpperCase()}PostsRow] pipeline item not found:`, pipelineItemId, rawErr?.message)
    return { error: 'Pipeline item not found' }
  }

  const item = raw as any
  if (!item[videoIdColumn]) {
    console.log(`[ensure${platform.toUpperCase()}PostsRow] pipeline item ${pipelineItemId} has no ${videoIdColumn} — skipping`)
    return {}
  }

  const rawPostId = item.post_id as string
  const platformPostId = extractPlatformPostId(rawPostId, platform)
  if (!platformPostId) {
    console.error(`[ensure${platform.toUpperCase()}PostsRow] no #${platform} segment in post_id=${rawPostId}`)
    return { error: `No #${platform} segment found in pipeline post_id` }
  }

  const { data: exactFull } = await c.admin.from('posts').select('id, post_id')
    .eq('post_id', rawPostId).eq('client_id', c.cid).maybeSingle()
  if (exactFull) {
    console.log(`[ensure${platform.toUpperCase()}PostsRow] found existing posts row via exact pipeline ID: ${(exactFull as any).post_id}`)
    return { postId: (exactFull as any).post_id, created: false }
  }

  const { data: exactSegment } = await c.admin.from('posts').select('id, post_id')
    .eq('post_id', platformPostId).eq('client_id', c.cid).maybeSingle()
  if (exactSegment) {
    console.log(`[ensure${platform.toUpperCase()}PostsRow] found existing posts row via segment: ${(exactSegment as any).post_id}`)
    return { postId: (exactSegment as any).post_id, created: false }
  }

  const { error: insErr } = await c.admin.from('posts').insert({
    client_id: c.cid,
    post_id:   platformPostId,
    title:     item.title ?? (platform === 'ig' ? '(Instagram post)' : '(TikTok post)'),
    platform:  [platform],
    pillar:    item.pillar ?? null,
    date:      item.posted_at ? (item.posted_at as string).slice(0, 10) : null,
  })

  if (insErr) {
    console.error(`[ensure${platform.toUpperCase()}PostsRow] INSERT failed for ${platformPostId}:`, insErr.message, insErr.code)
    return { error: insErr.message }
  }

  console.log(`[ensure${platform.toUpperCase()}PostsRow] created stub posts row ${platformPostId} for pipeline item ${pipelineItemId}`)
  return { postId: platformPostId, created: true }
}

export async function ensureIGPostsRow(
  pipelineItemId: string,
): Promise<{ error?: string; postId?: string; created?: boolean }> {
  return ensureSocialPostsRow(pipelineItemId, 'ig')
}

export async function ensureTTPostsRow(
  pipelineItemId: string,
): Promise<{ error?: string; postId?: string; created?: boolean }> {
  return ensureSocialPostsRow(pipelineItemId, 'tt')
}

export async function syncLinkedVideoNow(
  pipelineItemId: string,
  platform: 'ig' | 'tt' | 'yt',
  clientId?: string,
): Promise<{ synced?: number; error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }

  const targetClientId = clientId ?? c.cid
  if (!targetClientId) return { error: 'No active client selected' }
  if (c.role !== 'admin' && c.cid !== targetClientId) return { error: 'Unauthorized' }

  const { data: item, error } = await c.admin
    .from('pipeline_items')
    .select('id, client_id, ig_video_id, tt_video_id, yt_video_id')
    .eq('id', pipelineItemId)
    .eq('client_id', targetClientId)
    .maybeSingle()

  if (error || !item) {
    return { error: error?.message ?? 'Pipeline item not found' }
  }

  const row = item as any
  const videoId = platform === 'ig'
    ? row.ig_video_id
    : platform === 'tt'
      ? row.tt_video_id
      : row.yt_video_id

  if (!videoId) return { error: `No ${platform.toUpperCase()} video ID linked` }

  try {
    const result = platform === 'ig'
      ? await syncSingleIGVideo(targetClientId, videoId)
      : platform === 'tt'
        ? await syncSingleTTVideo(targetClientId, videoId)
        : await syncSingleYTVideo(targetClientId, videoId)

    revalidatePath('/analytics')
    revalidatePath('/pipeline')
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error(`[syncLinkedVideoNow] ${platform} sync failed for pipeline item ${pipelineItemId}:`, message)
    return { error: message }
  }
}

// ── Content Approval Workflow ────────────────────────────────────────────────

export async function submitApproval(
  itemId: string,
  action: 'approve' | 'request_changes',
  comment?: string,
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }

  const newStatus = action === 'approve' ? 'APPROVED' : 'CHANGES_REQUESTED'
  const priority = action === 'approve' ? 2 : 1

  const update: Record<string, unknown> = {
    status: newStatus,
    priority,
  }
  if (comment?.trim()) update.approval_comment = comment.trim()

  const filter: Record<string, unknown> = { id: itemId }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid

  const { error } = await c.admin.from('pipeline_items').update(update).match(filter)
  if (error) return { error: error.message }

  revalidatePath('/pipeline')
  revalidatePath('/')
  return {}
}

export async function deleteDriveFile(
  driveFileId: string,
  clientId: string,
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }

  const { data: conn } = await c.admin
    .from('platform_connections')
    .select('access_token, refresh_token')
    .eq('client_id', clientId)
    .eq('platform', 'google_drive')
    .single()

  if (!conn) return { error: 'No Google Drive connection found' }

  try {
    const token = (conn as unknown as { access_token: string }).access_token
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok && res.status !== 404) {
      return { error: `Drive API error: ${res.status}` }
    }
  } catch {
    return { error: 'Failed to connect to Google Drive API' }
  }

  return {}
}

// ── Client Notes ─────────────────────────────────────────────────────────────

export async function getClientNotes(clientId?: string): Promise<{
  content?: string
  shared?: boolean
  error?: string
}> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  const cid = clientId ?? c.cid
  if (!cid) return { error: 'No client' }

  const { data } = await c.admin
    .from('client_notes')
    .select('content, shared_with_client')
    .eq('client_id', cid)
    .single()

  if (!data) return { content: '', shared: false }
  const row = data as unknown as { content: string; shared_with_client: boolean }
  return { content: row.content, shared: row.shared_with_client }
}

export async function saveClientNotes(
  content: string,
  shared: boolean,
  clientId?: string,
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  const cid = clientId ?? c.cid
  if (!cid) return { error: 'No client' }

  const { error } = await c.admin
    .from('client_notes')
    .upsert({
      client_id: cid,
      content,
      shared_with_client: shared,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' })

  if (error) return { error: error.message }
  return {}
}

// ── Agency Docs ──────────────────────────────────────────────────────────────

export async function getAgencyDocs(): Promise<{
  docs?: { id: string; title: string; content: string; updated_at: string }[]
  error?: string
}> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }

  const { data, error } = await c.admin
    .from('agency_docs')
    .select('id, title, content, updated_at')
    .order('updated_at', { ascending: false })

  if (error) return { error: error.message }
  return { docs: (data ?? []) as unknown as { id: string; title: string; content: string; updated_at: string }[] }
}

export async function saveAgencyDoc(
  doc: { id?: string; title: string; content: string },
): Promise<{ id?: string; error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  if (c.role !== 'admin') return { error: 'Admin only' }

  if (doc.id) {
    const { error } = await c.admin
      .from('agency_docs')
      .update({ title: doc.title, content: doc.content, updated_at: new Date().toISOString() })
      .eq('id', doc.id)
    if (error) return { error: error.message }
    return { id: doc.id }
  }

  const { data, error } = await c.admin
    .from('agency_docs')
    .insert({ title: doc.title, content: doc.content })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: (data as unknown as { id: string }).id }
}

export async function deleteAgencyDoc(docId: string): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  if (c.role !== 'admin') return { error: 'Admin only' }

  const { error } = await c.admin.from('agency_docs').delete().eq('id', docId)
  if (error) return { error: error.message }
  return {}
}
