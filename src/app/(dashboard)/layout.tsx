import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { SidebarShell } from '@/components/portal/SidebarShell'
import { WelcomeOverlay } from '@/components/portal/WelcomeOverlay'
import { ClientConfigProvider } from '@/lib/client-config-context'
import { AICommandBar } from '@/components/portal/AICommandBar'
import { ToastProvider } from '@/components/portal/Toast'

const IMPERSONATE_COOKIE = 'dropclix_impersonate_client_id'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Force first-login password change for clients — admins are exempt
  const metaRole = (user.app_metadata as Record<string, unknown> | null)?.role
  if (user.user_metadata?.must_change_password === true && metaRole !== 'admin') {
    redirect('/auth/set-password')
  }

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

  // Fetch client info + enabled config
  const { data: client } = clientId
    ? await supabase
        .from('clients')
        .select('name, slug, enabled_platforms, enabled_tabs')
        .eq('id', clientId)
        .single()
    : { data: null }

  const enabledPlatforms: string[] = (client?.enabled_platforms as string[] | null)
    ?? ['ig','tt','yt','lf']

  const enabledTabs: string[] = (client?.enabled_tabs as string[] | null)
    ?? ['dashboard','analytics','angles','pipeline','studio','ads','calendar','goals']

  const clientName = client?.name ?? profile?.email?.split('@')[0] ?? 'Portal'
  const userEmail  = profile?.email ?? user.email ?? null

  return (
    <ClientConfigProvider config={{ enabledPlatforms, enabledTabs, isAdmin: profile?.role === 'admin' }}>
      <ToastProvider>
        <WelcomeOverlay clientName={clientName} />
        <SidebarShell
          clientName={clientName}
          userEmail={userEmail}
          isImpersonating={isImpersonating}
          enabledTabs={enabledTabs}
          isAdmin={profile?.role === 'admin'}
        >
          {children}
        </SidebarShell>
        <AICommandBar />
      </ToastProvider>
    </ClientConfigProvider>
  )
}
