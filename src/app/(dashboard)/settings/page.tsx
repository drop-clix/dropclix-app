import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/supabase/portal'
import { createAdminClient } from '@/lib/supabase/admin'
import { SettingsClient, type SafePlatformConnection } from '@/components/portal/SettingsClient'

export default async function SettingsPage() {
  const { clientId, clientName, userEmail } = await getPortalContext()
  if (!clientId) redirect('/login')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('platform_connections')
    .select('platform,channel_name,channel_id,subscriber_count,created_at,last_synced_at,token_expires_at')
    .eq('client_id', clientId)
    .in('platform', ['instagram', 'tiktok', 'youtube', 'meta_ads'])

  if (error) {
    console.error('[settings] failed to load platform connections:', error.message)
  }

  const connections = ((data ?? []) as SafePlatformConnection[])
    .filter(conn =>
      conn.platform === 'instagram' ||
      conn.platform === 'tiktok' ||
      conn.platform === 'youtube' ||
      conn.platform === 'meta_ads'
    )

  return (
    <div className="p-10">
      <div style={{ maxWidth: 980 }}>
        <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
          <p
            className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
            style={{ color: '#c9a96e' }}
          >
            <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
            Account Settings
          </p>
          <h1
            className="font-jakarta font-light"
            style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}
          >
            Settings
          </h1>
          <p className="text-[12px] font-light mt-2" style={{ color: '#666', maxWidth: 620 }}>
            Manage the accounts connected to your Drop CLIX portal. More profile and password settings will live here as they are added.
          </p>
        </div>

        <section>
          <div className="mb-4">
            <h2
              className="font-jakarta font-light"
              style={{ color: '#f2ede4', fontSize: 22, lineHeight: 1.1 }}
            >
              Platform Connections
            </h2>
            <p className="text-[11px] font-light mt-1" style={{ color: '#666' }}>
              Connect or reconnect the social accounts that power your reporting.
            </p>
          </div>
          <SettingsClient
            connections={connections}
            clientName={clientName ?? userEmail?.split('@')[0] ?? 'your account'}
          />
        </section>
      </div>
    </div>
  )
}
