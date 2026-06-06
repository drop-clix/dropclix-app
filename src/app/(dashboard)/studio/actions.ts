'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { computeDecision } from '@/lib/decision'

const IMPERSONATE = 'dropclix_impersonate_client_id'

type Ctx = { admin: ReturnType<typeof createAdminClient>; cid: string }

async function getCtx(): Promise<Ctx | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('users').select('role, client_id').eq('id', user.id).single()
  if (!p) return null
  const admin = createAdminClient()
  const cid = (p as { role: string; client_id: string | null }).role === 'admin'
    ? ((await cookies()).get(IMPERSONATE)?.value ?? null)
    : ((p as { role: string; client_id: string | null }).client_id as string | null)
  if (!cid) return null
  return { admin, cid }
}

export type WindowMetrics = {
  views:      number
  likes:      number
  comments:   number
  shares:     number
  saves:      number
  watch_pct:  number
  followers:  number
  skip_rate?: number
}

export type NewPostData = {
  postId:   string
  title:    string
  platform: string[]
  date:     string
  pillar:   string
  hook:     string
  format:   string
  cta:      string
  decision: string
  windows:  Partial<Record<'w24' | 'w3' | 'w7' | 'eom', WindowMetrics>>
}

function deriveWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  return `${mon} WK${Math.ceil(d.getDate() / 7)}`
}

function isEmptyWindow(m: WindowMetrics): boolean {
  return m.views === 0 && m.likes === 0 && m.comments === 0 &&
         m.shares === 0 && m.saves === 0 && m.watch_pct === 0 && m.followers === 0
}

function revalidateAll() {
  for (const p of ['/studio', '/pipeline', '/calendar', '/', '/analytics', '/goals', '/report-card', '/angles']) {
    revalidatePath(p)
  }
}

export async function checkExistingPostIds(postIds: string[]): Promise<string[]> {
  const c = await getCtx()
  if (!c || postIds.length === 0) return []
  const { data } = await c.admin
    .from('posts')
    .select('post_id')
    .eq('client_id', c.cid)
    .in('post_id', postIds)
  return ((data ?? []) as unknown as { post_id: string }[]).map(r => r.post_id)
}

async function insertAnalytics(c: Ctx, postUuid: string, platform: string, data: NewPostData) {
  for (const winKey of ['w24', 'w3', 'w7', 'eom'] as const) {
    const m = data.windows[winKey]
    if (!m || isEmptyWindow(m)) continue
    const { error } = await c.admin.from('post_analytics').insert({
      client_id:     c.cid,
      post_id:       postUuid,
      platform,
      metric_window: winKey,
      views:         m.views,
      likes:         m.likes,
      comments:      m.comments,
      shares:        m.shares,
      saves:         m.saves,
      watch_pct:     m.watch_pct,
      followers:     m.followers,
      skip_rate:     m.skip_rate ?? null,
    })
    if (error) console.error(`Analytics insert (${winKey}):`, error.message)
  }
}

async function ensurePipelineAndCalendar(
  c: Ctx, data: NewPostData,
): Promise<{ pipelineCreated: boolean; calendarCreated: number }> {
  let pipelineCreated = false
  let calendarCreated = 0

  const { data: existingPipe } = await c.admin
    .from('pipeline_items').select('id')
    .eq('client_id', c.cid).eq('post_id', data.postId).maybeSingle()

  if (!existingPipe) {
    await c.admin.from('pipeline_items').insert({
      client_id:      c.cid,
      post_id:        data.postId,
      title:          data.title,
      platform:       data.platform,
      pillar:         data.pillar || null,
      status:         'POSTED',
      week:           data.date ? deriveWeek(data.date) : null,
      scheduled_date: data.date || null,
    })
    pipelineCreated = true
  }

  if (data.date) {
    const { data: existingCal } = await c.admin
      .from('calendar_events').select('id')
      .eq('client_id', c.cid)
      .ilike('notes', `%"post_id":"${data.postId}"%`)
      .maybeSingle()

    if (!existingCal) {
      const platforms = data.platform.length > 0 ? data.platform : ['ig']
      for (const p of platforms) {
        await c.admin.from('calendar_events').insert({
          client_id:  c.cid,
          title:      data.title,
          platform:   p,
          event_date: data.date,
          notes:      JSON.stringify({ post_id: data.postId }),
        })
        calendarCreated++
      }
    }
  }

  return { pipelineCreated, calendarCreated }
}

function resolveDecision(data: NewPostData): string | null {
  for (const winKey of ['eom', 'w7', 'w3', 'w24'] as const) {
    const m = data.windows[winKey]
    if (m && m.views > 0) return computeDecision(m.likes, m.comments, m.shares, m.saves, m.views)
  }
  return data.decision || null
}

// Internal: create post without auth lookup or revalidation
async function createPostCore(
  c: Ctx, data: NewPostData,
): Promise<{ error?: string; pipelineCreated: boolean; calendarCreated: number }> {
  const { data: post, error: postErr } = await c.admin
    .from('posts')
    .insert({
      client_id: c.cid,
      post_id:   data.postId,
      title:     data.title,
      platform:  data.platform,
      date:      data.date   || null,
      pillar:    data.pillar || null,
      hook:      data.hook   || null,
      format:    data.format || null,
      cta:       data.cta    || null,
      decision:  resolveDecision(data),
    })
    .select('id').single()

  if (postErr) return { error: postErr.message, pipelineCreated: false, calendarCreated: 0 }

  const mainPlatform = data.platform[0] ?? 'ig'
  await insertAnalytics(c, post.id, mainPlatform, data)
  return ensurePipelineAndCalendar(c, data)
}

// Internal: update existing post + replace analytics
async function overwritePostCore(
  c: Ctx, data: NewPostData,
): Promise<{ error?: string; pipelineCreated: boolean; calendarCreated: number }> {
  const { data: existing } = await c.admin
    .from('posts').select('id')
    .eq('client_id', c.cid).eq('post_id', data.postId).single()

  if (!existing) return createPostCore(c, data)

  await c.admin.from('posts').update({
    title:    data.title,
    platform: data.platform,
    date:     data.date   || null,
    pillar:   data.pillar || null,
    hook:     data.hook   || null,
    format:   data.format || null,
    cta:      data.cta    || null,
    decision: resolveDecision(data),
  }).eq('id', (existing as unknown as { id: string }).id).eq('client_id', c.cid)

  await c.admin.from('post_analytics').delete()
    .eq('post_id', (existing as unknown as { id: string }).id).eq('client_id', c.cid)

  const mainPlatform = data.platform[0] ?? 'ig'
  await insertAnalytics(c, (existing as unknown as { id: string }).id, mainPlatform, data)
  return ensurePipelineAndCalendar(c, data)
}

export async function createPost(data: NewPostData): Promise<{ error?: string; pipelineCreated: boolean; calendarCreated: number }> {
  const c = await getCtx()
  if (!c) return { error: 'Not authenticated or no client', pipelineCreated: false, calendarCreated: 0 }
  const result = await createPostCore(c, data)
  revalidateAll()
  return result
}

export async function importPostsBatch(
  posts: NewPostData[],
  options: { skipIds?: string[]; overwriteIds?: string[] } = {},
): Promise<{ imported: number; updated: number; pipelineCreated: number; calendarCreated: number; failed: number; errors: string[] }> {
  const c = await getCtx()
  if (!c) return { imported: 0, updated: 0, pipelineCreated: 0, calendarCreated: 0, failed: 0, errors: ['Not authenticated'] }

  const skipSet      = new Set(options.skipIds ?? [])
  const overwriteSet = new Set(options.overwriteIds ?? [])
  let imported = 0, updated = 0, pipelineCreated = 0, calendarCreated = 0, failed = 0
  const errors: string[] = []

  for (const post of posts) {
    if (skipSet.has(post.postId)) continue
    const result = overwriteSet.has(post.postId)
      ? await overwritePostCore(c, post)
      : await createPostCore(c, post)

    if (result.error) {
      errors.push(`${post.postId}: ${result.error}`)
      failed++
    } else {
      overwriteSet.has(post.postId) ? updated++ : imported++
      if (result.pipelineCreated) pipelineCreated++
      calendarCreated += result.calendarCreated
    }
  }

  revalidateAll()
  return { imported, updated, pipelineCreated, calendarCreated, failed, errors }
}
