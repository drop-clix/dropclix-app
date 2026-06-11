'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { erToDecision } from '@/lib/decision'

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
])
const VALID_PIPE = new Set([
  'status','priority','platform','pillar','week','script_content','title','notes',
  'posted_at','scheduled_date','video_url',
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

// Link a pipeline post to a YouTube video. Sets yt_id on ALL post_analytics rows for that post.
// postTextId: text like '#yt0001'. ytInput: full URL or raw 11-char video ID.
export async function linkYouTubeVideo(
  postTextId: string,
  ytInput: string,
): Promise<{ ytId?: string; error?: string }> {
  const c = await getCtx()
  if (!c || !c.cid) return { error: 'Not authenticated' }

  const ytId = extractYouTubeId(ytInput)
  if (!ytId) return { error: 'Invalid YouTube URL or video ID' }

  // Resolve text post_id → UUID via posts table
  const { data: postRow, error: postErr } = await c.admin
    .from('posts')
    .select('id')
    .eq('post_id', postTextId)
    .eq('client_id', c.cid)
    .single()

  if (postErr || !postRow) return { error: 'Post not found' }
  const postUuid = (postRow as unknown as { id: string }).id

  // Update all post_analytics rows for this post
  const { error: updErr } = await c.admin
    .from('post_analytics')
    .update({ yt_id: ytId })
    .eq('post_id', postUuid)

  if (updErr) return { error: updErr.message }

  revalidatePath('/pipeline')
  revalidatePath('/analytics')
  return { ytId }
}
