'use server'

import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { importPostsForClient, checkExistingPostIdsForClient } from '@/app/(dashboard)/studio/actions'
import type { NewPostData } from '@/app/(dashboard)/studio/actions'

function generateTempPassword(): string {
  const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower  = 'abcdefghijklmnopqrstuvwxyz'
  const nums   = '0123456789'
  const all    = upper + lower + nums
  const b      = randomBytes(24)
  let bi       = 0
  const pick   = (s: string) => s[b[bi++] % s.length]
  const chars: string[] = [pick(upper), pick(lower), pick(nums)]
  while (chars.length < 12) chars.push(pick(all))
  for (let j = 11; j > 0; j--) {
    const k = b[bi++] % (j + 1)
    ;[chars[j], chars[k]] = [chars[k], chars[j]]
  }
  return chars.join('')
}

const IMPERSONATE_COOKIE = 'dropclix_impersonate_client_id'

// ── Auth guard (admin only) ───────────────────────────────────────────────────

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

// ── Default goals seeded for every new client ─────────────────────────────────

const DEFAULT_GOALS = [
  { metric: 'Followers Gained', target: 500,    period: 'monthly' },
  { metric: 'Posts',            target: 20,     period: 'monthly' },
  { metric: 'Total Views',      target: 200000, period: 'monthly' },
  { metric: 'Elite Videos',     target: 2,      period: 'monthly' },
  { metric: 'Avg ER%',          target: 8,      period: 'monthly' },
  { metric: 'Posts',            target: 4,      period: 'weekly'  },
  { metric: 'Total Views',      target: 50000,  period: 'weekly'  },
  { metric: 'Avg ER%',          target: 7.5,    period: 'weekly'  },
  { metric: 'Followers Gained', target: 125,    period: 'weekly'  },
]

// ── Seed blank-slate data for a new client ────────────────────────────────────

export async function seedClientData(clientId: string) {
  const admin = createAdminClient()

  const goalsRows = DEFAULT_GOALS.map(g => ({ ...g, client_id: clientId }))
  const { error: goalsErr } = await admin.from('goals').insert(goalsRows)
  if (goalsErr) console.error('Goals seed error:', goalsErr.message)

  await admin.from('pipeline_items').insert({
    client_id:      clientId,
    post_id:        '#new0001',
    title:          'Your first video',
    status:         'PLANNED',
    priority:       1,
    platform:       ['ig'],
    pillar:         null,
    week:           null,
    scheduled_date: null,
  })
}

// ── Create new client ─────────────────────────────────────────────────────────

export async function createNewClient(_prev: unknown, formData: FormData) {
  const admin = assertAdmin()
  if (!await admin) return { error: 'Unauthorized' }

  const name              = (formData.get('name')     as string ?? '').trim()
  const email             = (formData.get('email')    as string ?? '').trim().toLowerCase()
  const slug              = (formData.get('slug')     as string ?? '').trim().toLowerCase()
  const retainer          = formData.get('retainer')  as string | null
  const enabledPlatforms  = (formData.getAll('platforms') as string[]).filter(Boolean)
  const enabledTabs       = (formData.getAll('tabs')      as string[]).filter(Boolean)

  if (!name || !email || !slug) return { error: 'Name, email, and slug are required.' }
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: 'Slug must be lowercase letters, numbers, and hyphens only.' }

  const adm = createAdminClient()

  // 1. Insert client record
  const { data: client, error: clientErr } = await adm
    .from('clients')
    .insert({
      name,
      email,
      slug,
      ...(retainer && !isNaN(parseFloat(retainer))
        ? { monthly_retainer: parseFloat(retainer) }
        : {}),
      ...(enabledPlatforms.length > 0 ? { enabled_platforms: enabledPlatforms } : {}),
      ...(enabledTabs.length > 0      ? { enabled_tabs: enabledTabs }           : {}),
    })
    .select('id')
    .single()

  if (clientErr || !client) {
    return { error: clientErr?.message ?? 'Failed to create client record.' }
  }
  const clientId = (client as unknown as { id: string }).id

  // 2. Create auth user with temp password — no invite email sent
  const tempPassword = generateTempPassword()
  const { data: userData, error: userAuthErr } = await adm.auth.admin.createUser({
    email,
    password:      tempPassword,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  })

  if (userAuthErr || !userData?.user) {
    await adm.from('clients').delete().eq('id', clientId)
    return { error: userAuthErr?.message ?? 'Failed to create user account.' }
  }

  const userId = userData.user.id

  // 3. Insert user record linking auth user → client
  const { error: userErr } = await adm.from('users').insert({
    id:        userId,
    role:      'client',
    client_id: clientId,
    email,
  })

  if (userErr) {
    await adm.from('clients').delete().eq('id', clientId)
    await adm.auth.admin.deleteUser(userId)
    return { error: userErr.message }
  }

  // 4. Seed default goals + welcome pipeline item
  await seedClientData(clientId)

  revalidatePath('/admin')
  return { success: true as const, clientId, name, email, tempPassword }
}

// ── Reset client password ─────────────────────────────────────────────────────

export async function resendClientInvite(_prev: unknown, formData: FormData) {
  if (!await assertAdmin()) return { error: 'Unauthorized' }

  const email = (formData.get('email') as string ?? '').trim().toLowerCase()
  if (!email) return { error: 'Email is required.' }

  const adm = createAdminClient()

  const { data: userRecord, error: lookupErr } = await adm
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  if (lookupErr || !userRecord) return { error: 'Client account not found.' }

  const newTempPassword = generateTempPassword()
  const { error } = await adm.auth.admin.updateUserById(
    (userRecord as unknown as { id: string }).id,
    { password: newTempPassword, user_metadata: { must_change_password: true } },
  )

  if (error) return { error: error.message }
  return { success: true as const, tempPassword: newTempPassword }
}

// ── Update client info ────────────────────────────────────────────────────────

export async function updateClientInfo(_prev: unknown, formData: FormData) {
  if (!await assertAdmin()) return { error: 'Unauthorized' }

  const id               = (formData.get('id')   as string ?? '').trim()
  const name             = (formData.get('name') as string ?? '').trim()
  const slug             = (formData.get('slug') as string ?? '').trim().toLowerCase()
  const retainer         = formData.get('retainer') as string | null
  const enabledPlatforms = (formData.getAll('platforms') as string[]).filter(Boolean)
  const enabledTabs      = (formData.getAll('tabs')      as string[]).filter(Boolean)

  if (!id || !name || !slug) return { error: 'Missing required fields.' }
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: 'Slug must be lowercase letters, numbers, and hyphens only.' }

  const adm = createAdminClient()
  const { error } = await adm
    .from('clients')
    .update({
      name,
      slug,
      ...(retainer !== null && retainer !== ''
        ? { monthly_retainer: parseFloat(retainer) }
        : {}),
      ...(enabledPlatforms.length > 0 ? { enabled_platforms: enabledPlatforms } : {}),
      ...(enabledTabs.length > 0      ? { enabled_tabs: enabledTabs }           : {}),
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { success: true }
}

// ── Existing: impersonation ───────────────────────────────────────────────────

export async function impersonateClient(formData: FormData) {
  const clientId = formData.get('clientId') as string
  if (!clientId) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return

  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATE_COOKIE, clientId, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8,
  })

  redirect('/')
}

export async function exitImpersonation() {
  const cookieStore = await cookies()
  cookieStore.delete(IMPERSONATE_COOKIE)
  redirect('/admin')
}

// ── Admin import — bypass impersonation cookie, explicit clientId ─────────────

export async function adminImportPosts(
  clientId: string,
  posts: NewPostData[],
  options: { skipIds?: string[]; overwriteIds?: string[] } = {},
) {
  if (!await assertAdmin()) return { error: 'Unauthorized', imported: 0, updated: 0, pipelineCreated: 0, calendarCreated: 0, failed: 0, errors: [] as string[] }
  return importPostsForClient(clientId, posts, options)
}

export async function adminCheckExistingPostIds(clientId: string, postIds: string[]): Promise<string[]> {
  if (!await assertAdmin()) return []
  return checkExistingPostIdsForClient(clientId, postIds)
}

// ── TikTok disconnect ──────────────────────────────────────────────────────────

export async function disconnectTikTok(clientId: string): Promise<{ error?: string }> {
  if (!await assertAdmin()) return { error: 'Unauthorized' }
  const adm = createAdminClient()
  const { error } = await adm
    .from('platform_connections')
    .delete()
    .eq('client_id', clientId)
    .eq('platform', 'tiktok')
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}

// ── Meta Ads disconnect ───────────────────────────────────────────────────────

export async function disconnectMetaAds(clientId: string): Promise<{ error?: string }> {
  if (!await assertAdmin()) return { error: 'Unauthorized' }
  const adm = createAdminClient()
  const { error } = await adm
    .from('platform_connections')
    .delete()
    .eq('client_id', clientId)
    .eq('platform', 'meta_ads')
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}

// ── Delete client (all data) ──────────────────────────────────────────────────

export async function deleteClient(clientId: string, clientName: string): Promise<{ error?: string }> {
  if (!await assertAdmin()) return { error: 'Unauthorized' }

  if (clientName === 'Nick Nascimento' || clientName === 'Day 1 | D 1' || clientName === 'Jacob Perkins') {
    return { error: 'Cannot delete protected clients.' }
  }

  const adm = createAdminClient()

  // Look up auth user ID before deleting the users row
  const { data: userRecord } = await adm
    .from('users')
    .select('id')
    .eq('client_id', clientId)
    .single()
  const userId = (userRecord as unknown as { id: string } | null)?.id

  // Preview log — row counts before delete
  for (const table of ['post_analytics', 'calendar_events', 'goals', 'pipeline_items', 'posts', 'platform_connections']) {
    const { count } = await adm.from(table).select('*', { count: 'exact', head: true }).eq('client_id', clientId)
    console.log(`[deleteClient] ${table}: ${count ?? 0} rows for ${clientId}`)
  }

  // Delete children first to satisfy FK constraints
  await adm.from('post_analytics').delete().eq('client_id', clientId)
  await adm.from('calendar_events').delete().eq('client_id', clientId)
  await adm.from('goals').delete().eq('client_id', clientId)
  await adm.from('pipeline_items').delete().eq('client_id', clientId)
  await adm.from('posts').delete().eq('client_id', clientId)
  await adm.from('platform_connections').delete().eq('client_id', clientId)
  await adm.from('users').delete().eq('client_id', clientId)

  const { error: clientErr } = await adm.from('clients').delete().eq('id', clientId)
  if (clientErr) {
    console.error('[deleteClient] clients delete error:', clientErr.message)
    return { error: clientErr.message }
  }

  if (userId) {
    const { error: authErr } = await adm.auth.admin.deleteUser(userId)
    if (authErr) console.error('[deleteClient] auth.users delete error:', authErr.message)
  }

  revalidatePath('/admin')
  return {}
}

// ── Instagram disconnect ────────────────────────────────────────────────────────

export async function disconnectInstagram(clientId: string): Promise<{ error?: string }> {
  if (!await assertAdmin()) return { error: 'Unauthorized' }
  const adm = createAdminClient()
  const { error } = await adm
    .from('platform_connections')
    .delete()
    .eq('client_id', clientId)
    .eq('platform', 'instagram')
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}
