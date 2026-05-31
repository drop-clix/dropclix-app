'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

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

// ── Pipeline ─────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set([
  'SCRIPTED','PLANNED','FILMING','EDITING','REVIEWING','SCHEDULED','POSTED','CANCELLED',
])
const VALID_PIPE = new Set(['status','priority','platform','pillar','week','script_content','title','notes'])

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
  revalidatePath('/pipeline')
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
): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated' }
  if (!VALID_ANALYTICS.has(field)) return { error: 'Invalid field' }
  if (isNaN(value) || value < 0) return { error: 'Invalid value' }

  const filter: Record<string, unknown> = { post_id: postUUID, platform, metric_window: metricWindow }
  if (c.role !== 'admin' && c.cid) filter.client_id = c.cid

  const { error } = await c.admin.from('post_analytics').update({ [field]: value }).match(filter)
  if (error) return { error: error.message }
  revalidatePath('/analytics')
  return {}
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
  if (hasNoteFields) {
    const { data: row } = await c.admin.from('calendar_events').select('notes').match(filter).single()
    let notes: Record<string, string> = {}
    try { notes = JSON.parse(row?.notes ?? '{}') } catch { /* */ }
    if (noteFields.post_id !== undefined)       notes.post_id       = noteFields.post_id
    if (noteFields.post_time !== undefined)      notes.post_time     = noteFields.post_time
    if (noteFields.caption_status !== undefined) notes.caption_status = noteFields.caption_status
    if (noteFields.cta !== undefined)            notes.cta           = noteFields.cta
    if (noteFields.content_type !== undefined)   notes.content_type  = noteFields.content_type
    direct.notes = JSON.stringify(notes)
  }

  if (Object.keys(direct).length === 0) return {}
  const { error } = await c.admin.from('calendar_events').update(direct).match(filter)
  if (error) return { error: error.message }
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
