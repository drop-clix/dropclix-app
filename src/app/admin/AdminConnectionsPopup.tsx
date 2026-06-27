'use client'

import { useState } from 'react'
import { PlatformMark, type PlatformLogoKey } from '@/components/portal/PlatformLogos'
import { disconnectInstagram, disconnectMetaAds, disconnectTikTok } from './actions'
import type { ClientRow } from './AdminClientsSection'

export type AdminYouTubeConnection = {
  clientId: string
  channelName: string | null
  channelId: string | null
  subscriberCount: number | null
  createdAt: string | null
  lastSyncedAt: string | null
  tokenExpiresAt: string | null
}

export type AdminInstagramConnection = {
  clientId: string
  username: string | null
  igUserId: string | null
  followerCount: number | null
  createdAt: string | null
  lastSyncedAt: string | null
  tokenExpiresAt: string | null
}

export type AdminTikTokConnection = {
  clientId: string
  displayName: string | null
  openId: string | null
  followerCount: number | null
  createdAt: string | null
  lastSyncedAt: string | null
  tokenExpiresAt: string | null
}

export type AdminMetaAdsConnection = {
  clientId: string
  adAccountName: string | null
  adAccountId: string | null
  createdAt: string | null
  lastSyncedAt: string | null
  tokenExpiresAt: string | null
}

export type AdminConnectionsBundle = {
  youtube: AdminYouTubeConnection | null
  instagram: AdminInstagramConnection | null
  tiktok: AdminTikTokConnection | null
  metaAds: AdminMetaAdsConnection | null
}

type PlatformKey = 'youtube' | 'instagram' | 'tiktok' | 'meta_ads'
type SyncState = 'idle' | 'syncing' | 'done' | 'error'

type NormalizedConnection = {
  accountName: string | null
  accountId: string | null
  count: number | null
  createdAt: string | null
  lastSyncedAt: string | null
  tokenExpiresAt: string | null
}

const PLATFORM_CONFIG: Record<PlatformKey, {
  label: string
  logo: PlatformLogoKey
  color: string
  connectLabel: string
  reconnectLabel: string
  syncEndpoint: string
  connectHref: (clientId: string) => string
  accountLabel: string
  countLabel: string | null
  idLabel: string | null
  disconnect?: (clientId: string) => Promise<{ error?: string }>
}> = {
  youtube: {
    label: 'YouTube',
    logo: 'youtube',
    color: '#4cc9ff',
    connectLabel: 'Connect YouTube',
    reconnectLabel: 'Reconnect',
    syncEndpoint: '/api/admin/sync-youtube',
    connectHref: clientId => `/api/auth/youtube?client_id=${clientId}`,
    accountLabel: 'Channel',
    countLabel: 'Subscribers',
    idLabel: null,
  },
  instagram: {
    label: 'Instagram',
    logo: 'instagram',
    color: '#c9a96e',
    connectLabel: 'Connect Instagram',
    reconnectLabel: 'Reconnect',
    syncEndpoint: '/api/admin/sync-instagram',
    connectHref: clientId => `/api/auth/instagram?client_id=${clientId}`,
    accountLabel: 'Username',
    countLabel: 'Followers',
    idLabel: null,
    disconnect: disconnectInstagram,
  },
  tiktok: {
    label: 'TikTok',
    logo: 'tiktok',
    color: '#2dd4bf',
    connectLabel: 'Connect TikTok',
    reconnectLabel: 'Reconnect',
    syncEndpoint: '/api/admin/sync-tiktok',
    connectHref: clientId => `/api/auth/tiktok?client_id=${clientId}`,
    accountLabel: 'Display Name',
    countLabel: 'Followers',
    idLabel: null,
    disconnect: disconnectTikTok,
  },
  meta_ads: {
    label: 'Meta Ads',
    logo: 'meta_ads',
    color: '#1778f2',
    connectLabel: 'Connect Meta Ads',
    reconnectLabel: 'Reconnect',
    syncEndpoint: '/api/admin/sync-meta-ads',
    connectHref: clientId => `/api/auth/meta-ads?client_id=${clientId}`,
    accountLabel: 'Ad Account',
    countLabel: null,
    idLabel: 'Account ID',
    disconnect: disconnectMetaAds,
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
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function tokenExpiryState(platform: PlatformKey, tokenExpiresAt: string | null): { label: string; color: string } | null {
  if (!tokenExpiresAt) return null
  const expiresAt = new Date(tokenExpiresAt).getTime()
  if (!Number.isFinite(expiresAt)) return null
  const ms = expiresAt - Date.now()
  if (ms <= 0) return { label: 'Token expired — reconnect needed', color: '#ff3b5f' }
  const days = Math.ceil(ms / 86_400_000)
  return {
    label: `Expires in ${days} day${days === 1 ? '' : 's'}`,
    color: platform === 'tiktok' ? '#555' : days <= 7 ? '#fbbf24' : '#555',
  }
}

function normalizeConnection(platform: PlatformKey, connections: AdminConnectionsBundle): NormalizedConnection | null {
  if (platform === 'youtube') {
    const conn = connections.youtube
    if (!conn) return null
    return {
      accountName: conn.channelName ?? conn.channelId,
      accountId: conn.channelId,
      count: conn.subscriberCount,
      createdAt: conn.createdAt,
      lastSyncedAt: conn.lastSyncedAt,
      tokenExpiresAt: conn.tokenExpiresAt,
    }
  }
  if (platform === 'instagram') {
    const conn = connections.instagram
    if (!conn) return null
    return {
      accountName: conn.username ? `@${conn.username}` : conn.igUserId,
      accountId: conn.igUserId,
      count: conn.followerCount,
      createdAt: conn.createdAt,
      lastSyncedAt: conn.lastSyncedAt,
      tokenExpiresAt: conn.tokenExpiresAt,
    }
  }
  if (platform === 'tiktok') {
    const conn = connections.tiktok
    if (!conn) return null
    return {
      accountName: conn.displayName ?? conn.openId,
      accountId: conn.openId,
      count: conn.followerCount,
      createdAt: conn.createdAt,
      lastSyncedAt: conn.lastSyncedAt,
      tokenExpiresAt: conn.tokenExpiresAt,
    }
  }
  const conn = connections.metaAds
  if (!conn) return null
  return {
    accountName: conn.adAccountName,
    accountId: conn.adAccountId,
    count: null,
    createdAt: conn.createdAt,
    lastSyncedAt: conn.lastSyncedAt,
    tokenExpiresAt: conn.tokenExpiresAt,
  }
}

function hiddenSlotStyle(active: boolean): React.CSSProperties {
  return active
    ? {}
    : { visibility: 'hidden', pointerEvents: 'none' }
}

function actionBase(color: string, active: boolean): React.CSSProperties {
  return {
    width: '100%',
    textAlign: 'center',
    background: `${color}${active ? '1a' : '0f'}`,
    color,
    border: `1px solid ${color}${active ? '4d' : '26'}`,
    padding: '7px 10px',
    fontSize: 9,
    letterSpacing: '.14em',
    textTransform: 'uppercase',
    fontWeight: 500,
    cursor: active ? 'pointer' : 'default',
    opacity: active ? 1 : 0.45,
    textDecoration: 'none',
    fontFamily: 'inherit',
  }
}

function ActionSlot({
  children,
  active,
}: {
  children: React.ReactNode
  active: boolean
}) {
  return (
    <div style={{ width: '100%', ...hiddenSlotStyle(active) }} aria-hidden={!active}>
      {children}
    </div>
  )
}

export function AdminConnectionsPopup({
  client,
  connections,
  tiktokConfigured,
  onClose,
}: {
  client: ClientRow
  connections: AdminConnectionsBundle
  tiktokConfigured: boolean
  onClose: () => void
}) {
  const [localConnections, setLocalConnections] = useState<AdminConnectionsBundle>(connections)
  const [syncStates, setSyncStates] = useState<Record<PlatformKey, SyncState>>({
    youtube: 'idle',
    instagram: 'idle',
    tiktok: 'idle',
    meta_ads: 'idle',
  })
  const [messages, setMessages] = useState<Record<PlatformKey, string>>({
    youtube: '',
    instagram: '',
    tiktok: '',
    meta_ads: '',
  })

  function setMessage(platform: PlatformKey, message: string, state: SyncState = 'idle') {
    setMessages(prev => ({ ...prev, [platform]: message }))
    setSyncStates(prev => ({ ...prev, [platform]: state }))
  }

  function setPlatformConnection(platform: PlatformKey, patch: Partial<NormalizedConnection>) {
    setLocalConnections(prev => {
      if (platform === 'youtube' && prev.youtube) {
        return {
          ...prev,
          youtube: {
            ...prev.youtube,
            subscriberCount: patch.count ?? prev.youtube.subscriberCount,
            lastSyncedAt: patch.lastSyncedAt ?? prev.youtube.lastSyncedAt,
            tokenExpiresAt: patch.tokenExpiresAt ?? prev.youtube.tokenExpiresAt,
          },
        }
      }
      if (platform === 'instagram' && prev.instagram) {
        return {
          ...prev,
          instagram: {
            ...prev.instagram,
            followerCount: patch.count ?? prev.instagram.followerCount,
            lastSyncedAt: patch.lastSyncedAt ?? prev.instagram.lastSyncedAt,
            tokenExpiresAt: patch.tokenExpiresAt ?? prev.instagram.tokenExpiresAt,
          },
        }
      }
      if (platform === 'tiktok' && prev.tiktok) {
        return {
          ...prev,
          tiktok: {
            ...prev.tiktok,
            lastSyncedAt: patch.lastSyncedAt ?? prev.tiktok.lastSyncedAt,
            tokenExpiresAt: patch.tokenExpiresAt ?? prev.tiktok.tokenExpiresAt,
          },
        }
      }
      if (platform === 'meta_ads' && prev.metaAds) {
        return {
          ...prev,
          metaAds: {
            ...prev.metaAds,
            lastSyncedAt: patch.lastSyncedAt ?? prev.metaAds.lastSyncedAt,
            tokenExpiresAt: patch.tokenExpiresAt ?? prev.metaAds.tokenExpiresAt,
          },
        }
      }
      return prev
    })
  }

  function clearPlatformConnection(platform: PlatformKey) {
    setLocalConnections(prev => ({
      ...prev,
      ...(platform === 'youtube' ? { youtube: null } : {}),
      ...(platform === 'instagram' ? { instagram: null } : {}),
      ...(platform === 'tiktok' ? { tiktok: null } : {}),
      ...(platform === 'meta_ads' ? { metaAds: null } : {}),
    }))
  }

  function handleConnect(platform: PlatformKey) {
    const config = PLATFORM_CONFIG[platform]
    if (platform === 'tiktok' && !tiktokConfigured) {
      setMessage(platform, 'Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to environment variables to enable TikTok OAuth.', 'error')
      return
    }
    window.location.href = config.connectHref(client.id)
  }

  async function handleSync(platform: PlatformKey) {
    const config = PLATFORM_CONFIG[platform]
    setMessage(platform, '', 'syncing')
    try {
      const res = await fetch(config.syncEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: client.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')

      const result =
        platform === 'youtube'
          ? `${data.synced} windows synced · ${data.skipped} skipped`
          : platform === 'meta_ads'
            ? `${data.synced} campaigns synced`
            : `${data.synced} posts synced · ${data.skipped} skipped`

      setMessage(platform, result, 'done')
      setPlatformConnection(platform, {
        count: platform === 'youtube'
          ? data.subscriberCount
          : platform === 'instagram'
            ? data.followersCount
            : undefined,
        lastSyncedAt: 'lastSyncedAt' in data ? data.lastSyncedAt ?? null : undefined,
        tokenExpiresAt: 'tokenExpiresAt' in data ? data.tokenExpiresAt ?? null : undefined,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setMessage(platform, msg, 'error')
    }
  }

  async function handleDisconnect(platform: PlatformKey) {
    const config = PLATFORM_CONFIG[platform]
    if (!config.disconnect) return
    if (!confirm(`Disconnect ${config.label} for ${client.name}?`)) return
    setMessage(platform, '', 'syncing')
    const result = await config.disconnect(client.id)
    if (result.error) {
      setMessage(platform, result.error, 'error')
      return
    }
    clearPlatformConnection(platform)
    setMessage(platform, `${config.label} disconnected.`, 'done')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,.82)',
        backdropFilter: 'blur(7px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 1120, maxHeight: '88vh', overflowY: 'auto', background: '#080808', border: '1px solid #1a1a1a', padding: '34px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 26 }}>
          <div>
            <p style={{ fontSize: 9, letterSpacing: '.24em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'block', width: 18, height: 1, background: '#c9a96e' }} />
              Connections
            </p>
            <h2 style={{ fontSize: 24, fontWeight: 300, color: '#f2ede4', lineHeight: 1.1, marginBottom: 6 }}>{client.name}</h2>
            <p style={{ fontSize: 11, color: '#555', fontWeight: 300 }}>{client.email}</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid #1e1e1e', color: '#666', width: 32, height: 32, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: '#141414' }}>
          {PLATFORM_ORDER.map(platform => {
            const config = PLATFORM_CONFIG[platform]
            const conn = normalizeConnection(platform, localConnections)
            const syncState = syncStates[platform]
            const message = messages[platform]
            const tokenExpiry = conn ? tokenExpiryState(platform, conn.tokenExpiresAt) : null
            const connected = !!conn
            const canDisconnect = connected && !!config.disconnect

            return (
              <section key={platform} style={{ background: '#0a0a0a', padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 22, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                    <PlatformMark platform={config.logo} color={config.color} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ color: '#f2ede4', fontSize: 15, fontWeight: 300, lineHeight: 1 }}>{config.label}</h3>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9, color: connected ? '#39ff88' : '#666' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: connected ? '#39ff88' : '#555' }} />
                          {connected ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      {tokenExpiry && (
                        <p style={{ color: tokenExpiry.color, fontSize: 9, fontWeight: 300, marginTop: 5 }}>
                          {tokenExpiry.label}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(82px, 1fr))', gap: 14, flex: '1 1 360px', minWidth: 280 }}>
                    {conn ? (
                      <>
                        <div>
                          <p style={{ fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555' }}>{config.accountLabel}</p>
                          <p style={{ fontSize: 11, color: '#f2ede4', fontWeight: 300, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.accountName ?? '—'}</p>
                        </div>
                        {config.idLabel ? (
                          <div>
                            <p style={{ fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555' }}>{config.idLabel}</p>
                            <p style={{ fontSize: 11, color: '#f2ede4', fontWeight: 300, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.accountId ?? '—'}</p>
                          </div>
                        ) : config.countLabel && conn.count != null ? (
                          <div>
                            <p style={{ fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555' }}>{config.countLabel}</p>
                            <p style={{ fontSize: 11, color: '#f2ede4', fontWeight: 300, marginTop: 3 }}>{fmt(conn.count)}</p>
                          </div>
                        ) : (
                          <div />
                        )}
                        <div>
                          <p style={{ fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555' }}>Connected</p>
                          <p style={{ fontSize: 11, color: '#f2ede4', fontWeight: 300, marginTop: 3 }}>{fmtDate(conn.createdAt)}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555' }}>Last Sync</p>
                          <p style={{ fontSize: 11, color: '#f2ede4', fontWeight: 300, marginTop: 3 }}>{fmtDate(conn.lastSyncedAt)}</p>
                        </div>
                      </>
                    ) : (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <p style={{ color: '#666', fontSize: 11, fontWeight: 300 }}>Connect {config.label} for this client.</p>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8, width: 'min(440px, 100%)', flex: '0 1 440px' }}>
                    <ActionSlot active={!connected}>
                      <button type="button" onClick={() => handleConnect(platform)} style={actionBase(config.color, true)}>
                        Connect
                      </button>
                    </ActionSlot>
                    <ActionSlot active={connected}>
                      <button type="button" onClick={() => handleSync(platform)} disabled={syncState === 'syncing'} style={{ ...actionBase(config.color, true), opacity: syncState === 'syncing' ? 0.6 : 1 }}>
                        {syncState === 'syncing' ? 'Syncing...' : syncState === 'done' ? 'Synced' : 'Sync Now'}
                      </button>
                    </ActionSlot>
                    <ActionSlot active={connected}>
                      <button type="button" onClick={() => handleConnect(platform)} style={actionBase(config.color, true)}>
                        Reconnect
                      </button>
                    </ActionSlot>
                    <ActionSlot active={canDisconnect}>
                      <button type="button" onClick={() => handleDisconnect(platform)} disabled={syncState === 'syncing'} style={{ ...actionBase('#ff3b5f', true), opacity: syncState === 'syncing' ? 0.6 : 1 }}>
                        Disconnect
                      </button>
                    </ActionSlot>
                  </div>
                </div>

                {message && (
                  <p style={{ color: syncState === 'error' ? '#ff3b5f' : '#555', fontSize: 9, fontWeight: 300, marginTop: 10, marginLeft: 47 }}>
                    {message}
                  </p>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
