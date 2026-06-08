import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { SidebarShell } from '@/components/portal/SidebarShell'
import { WelcomeOverlay } from '@/components/portal/WelcomeOverlay'
import { ClientConfigProvider } from '@/lib/client-config-context'

const IMPERSONATE_COOKIE = 'dropclix_impersonate_client_id'

// Map URL segment → tab key used in enabled_tabs
const PATH_TO_TAB: Record<string, string> = {
  '/':            'dashboard',
  '/analytics':   'analytics',
  '/angles':      'angles',
  '/pipeline':    'pipeline',
  '/studio':      'studio',
  '/ads':         'ads',
  '/calendar':    'calendar',
  '/goals':       'goals',
  '/report-card': 'goals', // report-card is folded into goals
}

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

  // Fetch client info + enabled config
  // Try with Session 25 columns; fall back gracefully if migration not yet applied
  type ClientInfo = { name?: string | null; slug?: string | null; enabled_platforms?: string[] | null; enabled_tabs?: string[] | null }
  let clientData: ClientInfo | null = null
  if (clientId) {
    const res = await supabase
      .from('clients')
      .select('name, slug, enabled_platforms, enabled_tabs')
      .eq('id', clientId)
      .single()
    if (res.error) {
      // Columns may not exist yet — fall back to name/slug only
      const fallback = await supabase
        .from('clients')
        .select('name, slug')
        .eq('id', clientId)
        .single()
      clientData = (fallback.data as unknown as ClientInfo) ?? null
    } else {
      clientData = res.data as unknown as ClientInfo
    }
  }

  const enabledPlatforms: string[] = (clientData?.enabled_platforms as string[] | null)
    ?? (profile?.role === 'admin' ? ['ig','tt','yt','lf'] : ['ig'])

  const enabledTabs: string[] = (clientData?.enabled_tabs as string[] | null)
    ?? ['dashboard','analytics','angles','pipeline','studio','ads','calendar','goals']

  const clientName = clientData?.name ?? profile?.email?.split('@')[0] ?? 'Portal'
  const userEmail = profile?.email ?? user.email ?? null

  return (
    <ClientConfigProvider config={{ enabledPlatforms, enabledTabs, isAdmin: profile?.role === 'admin' }}>
      <WelcomeOverlay clientName={clientName} />
      <SidebarShell
        clientName={clientName}
        userEmail={userEmail}
        isImpersonating={isImpersonating}
        enabledTabs={enabledTabs}
      >
        {children}
      </SidebarShell>
    </ClientConfigProvider>
  )
}
