'use client'

import { useEffect, useMemo, useState } from 'react'
import { MetaLogo } from '@/components/portal/MetaLogo'

export type SafePlatformConnection = {
  platform: 'instagram' | 'tiktok' | 'youtube' | 'meta_ads'
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
  countLabel: string | null
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
  meta_ads: {
    label: 'Meta Ads',
    accent: '#1778f2',
    connectPath: '/api/auth/meta-ads',
    profileLabel: 'Ad Account',
    countLabel: null,
    connectedParam: 'meta_ads_connected',
    errorParam: 'meta_ads_error',
  },
}

const PLATFORM_ORDER: PlatformKey[] = ['instagram', 'tiktok', 'youtube', 'meta_ads']

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

function InstagramLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="settings-ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffd600" />
          <stop offset="50%" stopColor="#ff0069" />
          <stop offset="100%" stopColor="#7638fa" />
        </linearGradient>
      </defs>
      <path fill="url(#settings-ig-gradient)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

function TikTokLogo({ color = '#2dd4bf' }: { color?: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill={color} d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  )
}

function YouTubeLogo({ color = '#4cc9ff' }: { color?: string }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M23.5 6.2s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.6 2 12 2 12 2s-4.6 0-7.3.1c-.6.1-1.9.1-3 1.3C.8 4.2.5 6.2.5 6.2S.2 8.5.2 10.8v2.1c0 2.3.3 4.6.3 4.6s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.2 21.7 12 21.8 12 21.8s4.6 0 7.3-.2c.6-.1 1.9-.1 3-1.2.9-.8 1.2-2.8 1.2-2.8s.3-2.3.3-4.6v-2.1C23.8 8.5 23.5 6.2 23.5 6.2zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z" />
    </svg>
  )
}

function PlatformLogo({ platform, color }: { platform: PlatformKey; color: string }) {
  if (platform === 'instagram') return <InstagramLogo />
  if (platform === 'tiktok') return <TikTokLogo color={color} />
  if (platform === 'meta_ads') return <MetaLogo color={color} />
  return <YouTubeLogo color={color} />
}

function PlatformMark({ platform, color }: { platform: PlatformKey; color: string }) {
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
        flexShrink: 0,
      }}
    >
      <PlatformLogo platform={platform} color={color} />
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
                <PlatformMark platform={platform} color={config.accent} />
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
                    {config.countLabel && conn.subscriber_count != null && (
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
