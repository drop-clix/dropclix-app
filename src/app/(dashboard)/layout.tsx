import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { SidebarShell } from '@/components/portal/SidebarShell'

const IMPERSONATE_COOKIE = 'dropclix_impersonate_client_id'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, email, client_id')
    .eq('id', user.id)
    .single()

  let clientId = profile?.client_id as string | null
  let isImpersonating = false

  if (profile?.role === 'admin') {
    const cookieStore = await cookies()
    const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value
    if (!impersonateId) redirect('/admin')
    clientId = impersonateId
    isImpersonating = true
  }

  const { data: client } = clientId
    ? await supabase
        .from('clients')
        .select('name, slug')
        .eq('id', clientId)
        .single()
    : { data: null }

  const clientName = client?.name ?? profile?.email?.split('@')[0] ?? 'Portal'
  const userEmail  = profile?.email ?? user.email ?? null

  return (
    <SidebarShell
      clientName={clientName}
      userEmail={userEmail}
      isImpersonating={isImpersonating}
    >
      {children}
    </SidebarShell>
  )
}
