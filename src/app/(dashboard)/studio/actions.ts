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
  return { admin, cid }
}

export type WindowMetrics = {
  views:     number
  likes:     number
  comments:  number
  shares:    number
  saves:     number
  watch_pct: number
  followers: number
}

export type NewPostData = {
  postId:    string
  title:     string
  platform:  string[]
  date:      string
  pillar:    string
  hook:      string
  format:    string
  cta:       string
  decision:  string
  windows:   Partial<Record<'w24' | 'w3' | 'w7' | 'eom', WindowMetrics>>
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

export async function createPost(data: NewPostData): Promise<{ error?: string }> {
  const c = await getCtx()
  if (!c?.cid) return { error: 'Not authenticated or no client' }

  // 1. Insert post
  const { data: post, error: postErr } = await c.admin
    .from('posts')
    .insert({
      client_id: c.cid,
      post_id:   data.postId,
      title:     data.title,
      platform:  data.platform,
      date:      data.date     || null,
      pillar:    data.pillar   || null,
      hook:      data.hook     || null,
      format:    data.format   || null,
      cta:       data.cta      || null,
      decision:  data.decision || null,
    })
    .select('id')
    .single()

  if (postErr) return { error: postErr.message }

  // 2. Insert analytics for each non-empty window
  const mainPlatform = data.platform[0] ?? 'ig'
  for (const winKey of ['w24', 'w3', 'w7', 'eom'] as const) {
    const m = data.windows[winKey]
    if (!m || isEmptyWindow(m)) continue
    const { error: aErr } = await c.admin.from('post_analytics').insert({
      client_id:     c.cid,
      post_id:       post.id,
      platform:      mainPlatform,
      metric_window: winKey,
      views:         m.views,
      likes:         m.likes,
      comments:      m.comments,
      shares:        m.shares,
      saves:         m.saves,
      watch_pct:     m.watch_pct,
      followers:     m.followers,
    })
    if (aErr) console.error(`Analytics insert (${winKey}):`, aErr.message)
  }

  // 3. Create pipeline_item if none exists for this post_id
  const { data: existingPipe } = await c.admin
    .from('pipeline_items')
    .select('id')
    .eq('client_id', c.cid)
    .eq('post_id', data.postId)
    .maybeSingle()

  if (!existingPipe) {
    await c.admin.from('pipeline_items').insert({
      client_id:      c.cid,
      post_id:        data.postId,
      title:          data.title,
      platform:       data.platform,
      pillar:         data.pillar   || null,
      status:         'POSTED',
      week:           data.date ? deriveWeek(data.date) : null,
      scheduled_date: data.date     || null,
    })
  }

  // 4. Create calendar_event if none exists (one per platform)
  if (data.date) {
    const { data: existingCal } = await c.admin
      .from('calendar_events')
      .select('id')
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
      }
    }
  }

  revalidatePath('/studio')
  revalidatePath('/pipeline')
  revalidatePath('/calendar')
  revalidatePath('/')
  revalidatePath('/analytics')
  revalidatePath('/goals')
  revalidatePath('/report-card')
  revalidatePath('/angles')

  return {}
}

export async function importPostsBatch(
  posts: NewPostData[],
): Promise<{ error?: string; imported: number; failed: number; errors: string[] }> {
  let imported = 0
  let failed = 0
  const errors: string[] = []

  for (const post of posts) {
    const result = await createPost(post)
    if (result.error) {
      errors.push(`${post.postId}: ${result.error}`)
      failed++
    } else {
      imported++
    }
  }

  return { imported, failed, errors }
}
