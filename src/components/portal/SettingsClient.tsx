'use client'

import { useEffect, useMemo, useState } from 'react'

export type SafePlatformConnection = {
  platform: 'instagram' | 'tiktok' | 'youtube'
  channel_name: string | null
  channel_id: string | null
  subscriber_count: number | null
  created_at: string | null
  last_synced_at: string | null
  token_expires_at: string | null
}

type PlatformKey = SafePlatformConnection['platform']

const PLATFORM_CONFIG: Record<PlatformKey, {
  label: string
  accent: string
  connectPath: string
  profileLabel: string
  countLabel: string
  connectedParam: string
  errorParam: string
}> = {
  instagram: {
    label: 'Instagram',
    accent: '#c9a96e',
    connectPath: '/api/auth/instagram',
    profileLabel: 'Profile',
    countLabel: 'Followers',
    connectedParam: 'ig_connected',
    errorParam: 'ig_error',
  },
  tiktok: {
    label: 'TikTok',
    accent: '#2dd4bf',
    connectPath: '/api/auth/tiktok',
    profileLabel: 'Profile',
    countLabel: 'Followers',
    connectedParam: 'tt_connected',
    errorParam: 'tt_error',
  },
  youtube: {
    label: 'YouTube',
    accent: '#4cc9ff',
    connectPath: '/api/auth/youtube',
    profileLabel: 'Channel',
    countLabel: 'Subscribers',
    connectedParam: 'yt_connected',
    errorParam: 'yt_error',
  },
}

const PLATFORM_ORDER: PlatformKey[] = ['instagram', 'tiktok', 'youtube']

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function tokenExpiryState(tokenExpiresAt: string | null): { label: string; color: string; expired: boolean } {
  if (!tokenExpiresAt) return { label: 'Connected', color: '#39ff88', expired: false }

  const expiresAt = new Date(tokenExpiresAt).getTime()
  if (!Number.isFinite(expiresAt)) return { label: 'Connected', color: '#39ff88', expired: false }

  const ms = expiresAt - Date.now()
  if (ms <= 0) return { label: 'Token expired — reconnect needed', color: '#ff3b5f', expired: true }

  const days = Math.ceil(ms / 86_400_000)
  if (days <= 7) {
    return {
      label: `Expires in ${days} day${days === 1 ? '' : 's'}`,
      color: '#fbbf24',
      expired: false,
    }
  }

  return { label: 'Connected', color: '#39ff88', expired: false }
}

function prettyError(error: string) {
  return error.replaceAll('_', ' ')
}

function PlatformMark({ label, color }: { label: string; color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 34,
        height: 34,
        borderRadius: 6,
        border: `1px solid ${color}55`,
        background: `${color}14`,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '.08em',
        flexShrink: 0,
      }}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  )
}

export function SettingsClient({
  connections,
  clientName,
}: {
  connections: SafePlatformConnection[]
  clientName: string
}) {
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const connByPlatform = useMemo(() => {
    return new Map(connections.map(conn => [conn.platform, conn]))
  }, [connections])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    for (const platform of PLATFORM_ORDER) {
      const config = PLATFORM_CONFIG[platform]
      if (params.get(config.connectedParam) === '1') {
        setNotice({ kind: 'success', text: `${config.label} connected successfully.` })
        return
      }

      const error = params.get(config.errorParam)
      if (error) {
        setNotice({
          kind: 'error',
          text: `${config.label} connection failed: ${prettyError(error)}`,
        })
        return
      }
    }
  }, [])

  return (
    <div className="flex flex-col gap-px" style={{ background: '#141414' }}>
      {notice && (
        <div
          style={{
            background: notice.kind === 'error' ? 'rgba(255,59,95,.07)' : 'rgba(57,255,136,.07)',
            border: `1px solid ${notice.kind === 'error' ? 'rgba(255,59,95,.22)' : 'rgba(57,255,136,.22)'}`,
            color: notice.kind === 'error' ? '#ff3b5f' : '#39ff88',
            padding: '13px 16px',
            fontSize: 11,
            fontWeight: 300,
          }}
        >
          {notice.text}
        </div>
      )}

      {PLATFORM_ORDER.map(platform => {
        const config = PLATFORM_CONFIG[platform]
        const conn = connByPlatform.get(platform)
        const expiry = tokenExpiryState(conn?.token_expires_at ?? null)
        const displayName = conn?.channel_name ?? conn?.channel_id ?? '—'

        return (
          <section key={platform} style={{ background: '#0a0a0a', padding: '22px 24px' }}>
            <div className="flex items-start justify-between gap-5 flex-wrap">
              <div className="flex items-start gap-4" style={{ minWidth: 240 }}>
                <PlatformMark label={config.label} color={config.accent} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2
                      className="font-jakarta font-light"
                      style={{ color: '#f2ede4', fontSize: 18, lineHeight: 1.1 }}
                    >
                      {config.label}
                    </h2>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: conn ? expiry.color : '#666',
                        fontSize: 9,
                        fontWeight: 300,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: conn ? expiry.color : '#555',
                        }}
                      />
                      {conn ? expiry.label : 'Not connected'}
                    </span>
                  </div>
                  <p className="text-[11px] font-light mt-1" style={{ color: '#666' }}>
                    {conn
                      ? `${config.label} is connected for ${clientName}.`
                      : `Connect ${config.label} so Drop CLIX can keep your reporting linked to the right account.`}
                  </p>
                </div>
              </div>

              <a
                href={config.connectPath}
                className="text-[9px] tracking-[.14em] uppercase px-3 py-2 font-medium"
                style={{
                  background: `${config.accent}14`,
                  color: config.accent,
                  border: `1px solid ${config.accent}4d`,
                  textDecoration: 'none',
                  borderRadius: 3,
                }}
              >
                {conn ? `Reconnect ${config.label}` : `Connect ${config.label}`}
              </a>
            </div>

            {conn && (
              <div
                className="grid gap-4 mt-5"
                style={{
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  borderTop: '1px solid #141414',
                  paddingTop: 18,
                }}
              >
                <div>
                  <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                    {config.profileLabel}
                  </p>
                  <p className="text-[11px] font-light mt-1" style={{ color: '#f2ede4' }}>
                    {displayName}
                  </p>
                </div>
                {conn.subscriber_count != null && (
                  <div>
                    <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                      {config.countLabel}
                    </p>
                    <p className="text-[11px] font-light mt-1" style={{ color: '#f2ede4' }}>
                      {fmt(conn.subscriber_count)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                    Connected
                  </p>
                  <p className="text-[11px] font-light mt-1" style={{ color: '#f2ede4' }}>
                    {fmtDate(conn.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                    Last Sync
                  </p>
                  <p className="text-[11px] font-light mt-1" style={{ color: '#f2ede4' }}>
                    {fmtDate(conn.last_synced_at)}
                  </p>
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
