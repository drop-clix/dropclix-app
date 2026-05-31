import { createClient } from './server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const IMPERSONATE_COOKIE = 'dropclix_impersonate_client_id'

export type PortalContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  clientId: string | null
  userEmail: string | null
  isImpersonating: boolean
}

export async function getPortalContext(): Promise<PortalContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, client_id, email')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  if (profile.role === 'admin') {
    const cookieStore = await cookies()
    const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value
    if (!impersonateId) redirect('/admin')
    return {
      supabase,
      clientId: impersonateId,
      userEmail: profile.email as string | null,
      isImpersonating: true,
    }
  }

  return {
    supabase,
    clientId: profile.client_id as string | null,
    userEmail: profile.email as string | null,
    isImpersonating: false,
  }
}
