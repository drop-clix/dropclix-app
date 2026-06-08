import { createClient } from './server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const IMPERSONATE_COOKIE = 'dropclix_impersonate_client_id'

export type PortalContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  clientId: string | null
  userEmail: string | null
  isImpersonating: boolean
  isAdmin: boolean
  enabledPlatforms: string[]
  enabledTabs: string[]
}

const ALL_TABS      = ['dashboard','analytics','angles','pipeline','studio','ads','calendar','goals']
const ALL_PLATFORMS = ['ig','tt','yt','lf']

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

  const isAdmin = profile.role === 'admin'

  // Admins see all platforms/tabs; resolve their impersonated client_id
  if (isAdmin) {
    const cookieStore = await cookies()
    const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value
    if (!impersonateId) redirect('/admin')

    // Fetch the impersonated client's config
    const { data: clientRow } = await supabase
      .from('clients')
      .select('enabled_platforms, enabled_tabs')
      .eq('id', impersonateId)
      .single()

    const enabledPlatforms = (clientRow?.enabled_platforms as string[] | null) ?? ALL_PLATFORMS
    const enabledTabs      = (clientRow?.enabled_tabs      as string[] | null) ?? ALL_TABS

    return {
      supabase,
      clientId: impersonateId,
      userEmail: profile.email as string | null,
      isImpersonating: true,
      isAdmin: true,
      enabledPlatforms,
      enabledTabs,
    }
  }

  // Regular client — fetch their config
  const clientId = profile.client_id as string | null

  let enabledPlatforms = ['ig']
  let enabledTabs      = ALL_TABS

  if (clientId) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('enabled_platforms, enabled_tabs')
      .eq('id', clientId)
      .single()

    enabledPlatforms = (clientRow?.enabled_platforms as string[] | null) ?? ['ig']
    enabledTabs      = (clientRow?.enabled_tabs      as string[] | null) ?? ALL_TABS
  }

  return {
    supabase,
    clientId,
    userEmail: profile.email as string | null,
    isImpersonating: false,
    isAdmin: false,
    enabledPlatforms,
    enabledTabs,
  }
}
