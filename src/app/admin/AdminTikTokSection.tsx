'use client'

import { useState, useTransition } from 'react'
import { disconnectTikTok } from '@/app/admin/actions'

type TikTokConn = {
  clientId: string
  displayName: string | null
  openId: string | null
  followerCount: number | null
  createdAt: string | null
  lastSyncedAt: string | null
  tokenExpiresAt: string | null
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function tokenExpiryState(tokenExpiresAt: string | null): { label: string; color: string } | null {
  if (!tokenExpiresAt) return null
  const expiresAt = new Date(tokenExpiresAt).getTime()
  if (!Number.isFinite(expiresAt)) return null
  const ms = expiresAt - Date.now()
  if (ms <= 0) return { label: 'Token expired — reconnect needed', color: '#ff3b5f' }
  const days = Math.ceil(ms / 86_400_000)
  return { label: `Expires in ${days} day${days === 1 ? '' : 's'}`, color: '#555' }
}

export function AdminTikTokSection({
  clients,
  connections,
  tiktokConfigured,
}: {
  clients: { id: string; name: string }[]
  connections: TikTokConn[]
  tiktokConfigured: boolean
}) {
  const [notice, setNotice] = useState('')
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [syncStates,  setSyncStates]  = useState<Record<string, 'idle' | 'syncing' | 'done' | 'error'>>({})
  const [syncResults, setSyncResults] = useState<Record<string, string>>({})
  const [, startTransition] = useTransition()
  const connMap = new Map(connections.map(c => [c.clientId, c]))

  function handleConnect(clientId: string) {
    if (!tiktokConfigured) {
      setNotice('Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to environment variables to enable TikTok OAuth.')
      return
    }
    window.location.href = `/api/auth/tiktok?client_id=${clientId}`
  }

  async function handleSync(clientId: string) {
    setSyncStates(s  => ({ ...s, [clientId]: 'syncing' }))
    setSyncResults(r => ({ ...r, [clientId]: '' }))
    try {
      const res = await fetch('/api/admin/sync-tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setSyncResults(r => ({ ...r, [clientId]: `${data.synced} posts synced · ${data.skipped} skipped` }))
      setSyncStates(s  => ({ ...s, [clientId]: 'done' }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSyncResults(r => ({ ...r, [clientId]: msg }))
      setSyncStates(s  => ({ ...s, [clientId]: 'error' }))
    }
  }

  return (
    <div style={{ marginTop: 40 }}>
      <p
        className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
        style={{ color: '#2dd4bf' }}
      >
        <span style={{ display: 'block', width: 20, height: 1, background: '#2dd4bf' }} />
        TikTok Connections
      </p>

      {notice && (
        <p className="text-[10px] mb-4 p-3" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.07)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 5 }}>
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-px" style={{ background: '#141414' }}>
        {clients.map(client => {
          const conn = connMap.get(client.id)
          const syncState = syncStates[client.id] ?? 'idle'
          const syncResult = syncResults[client.id] ?? ''
          const tokenExpiry = conn ? tokenExpiryState(conn.tokenExpiresAt) : null
          return (
            <div key={client.id} style={{ background: '#0a0a0a', padding: '18px 24px' }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                {/* Client info */}
                <div style={{ minWidth: 140 }}>
                  <p className="text-[13px] font-light" style={{ color: '#f2ede4' }}>{client.name}</p>
                  {conn ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#39ff88', flexShrink: 0 }} />
                      <span className="text-[9px] font-light" style={{ color: '#39ff88' }}>Connected</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#555', flexShrink: 0 }} />
                      <span className="text-[9px] font-light" style={{ color: '#666' }}>Not connected</span>
                    </div>
                  )}
                </div>

                {/* Profile details (if connected) */}
                {conn && (
                  <div className="flex gap-8">
                    {conn.displayName && (
                      <div>
                        <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>Display Name</p>
                        <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>{conn.displayName}</p>
                      </div>
                    )}
                    {conn.followerCount != null && (
                      <div>
                        <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>Followers</p>
                        <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>{fmt(conn.followerCount)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>Connected</p>
                      <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>{fmtDate(conn.createdAt)}</p>
                    </div>
                    {conn.lastSyncedAt && (
                      <div>
                        <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>Last Sync</p>
                        <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>{fmtDate(conn.lastSyncedAt)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center gap-3">
                  {conn ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSync(client.id)}
                        disabled={syncState === 'syncing'}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium cursor-pointer"
                        style={{
                          background: syncState === 'done' ? 'rgba(57,255,136,.1)' : 'rgba(45,212,191,.1)',
                          color: syncState === 'done' ? '#39ff88' : syncState === 'error' ? '#ff3b5f' : '#2dd4bf',
                          border: `1px solid ${syncState === 'done' ? 'rgba(57,255,136,.3)' : syncState === 'error' ? 'rgba(255,59,95,.3)' : 'rgba(45,212,191,.3)'}`,
                          opacity: syncState === 'syncing' ? 0.6 : 1,
                        }}
                      >
                        {syncState === 'syncing' ? 'Syncing...' : syncState === 'done' ? 'Synced' : 'Sync Now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConnect(client.id)}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium cursor-pointer"
                        style={{
                          background: 'rgba(45,212,191,.06)',
                          color: '#2dd4bf',
                          border: '1px solid rgba(45,212,191,.2)',
                        }}
                      >
                        Reconnect
                      </button>
                      <button
                        type="button"
                        disabled={disconnecting === client.id}
                        onClick={() => {
                          if (!confirm(`Disconnect TikTok for ${client.name}?`)) return
                          setDisconnecting(client.id)
                          startTransition(async () => {
                            const result = await disconnectTikTok(client.id)
                            setDisconnecting(null)
                            if (result.error) setNotice(`Disconnect failed: ${result.error}`)
                          })
                        }}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium cursor-pointer"
                        style={{
                          background: 'rgba(255,59,95,.06)',
                          color: disconnecting === client.id ? '#555' : '#ff3b5f',
                          border: '1px solid rgba(255,59,95,.2)',
                          opacity: disconnecting === client.id ? 0.5 : 1,
                        }}
                      >
                        {disconnecting === client.id ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConnect(client.id)}
                      className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium cursor-pointer"
                      style={{
                        background: 'rgba(45,212,191,.1)',
                        color: '#2dd4bf',
                        border: '1px solid rgba(45,212,191,.3)',
                      }}
                    >
                      Connect TikTok
                    </button>
                  )}
                </div>
              </div>

              {tokenExpiry && (
                <p className="text-[9px] font-light mt-2" style={{ color: tokenExpiry.color }}>
                  {tokenExpiry.label}
                </p>
              )}

              {syncResult && (
                <p className="text-[9px] font-light mt-2" style={{ color: syncState === 'error' ? '#ff3b5f' : '#555' }}>
                  {syncResult}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[9px] font-light mt-3" style={{ color: '#1e1e1e' }}>
        Requires TIKTOK_CLIENT_KEY · TIKTOK_CLIENT_SECRET · TIKTOK_REDIRECT_URI in environment.
        Redirect URI: https://portal.drop-clix.com/api/auth/tiktok/callback
        Scopes: user.info.basic · user.info.profile · user.info.stats · video.list
      </p>
    </div>
  )
}
