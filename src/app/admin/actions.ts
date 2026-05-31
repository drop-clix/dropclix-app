'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const IMPERSONATE_COOKIE = 'dropclix_impersonate_client_id'

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
