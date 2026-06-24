'use client'

import { useState } from 'react'

type YouTubeConn = {
  clientId: string
  clientName: string
  channelName: string | null
  channelId: string | null
  subscriberCount: number | null
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
  return {
    label: `Expires in ${days} day${days === 1 ? '' : 's'}`,
    color: days <= 7 ? '#fbbf24' : '#555',
  }
}

function stateValue<T>(record: Record<string, T>, key: string, fallback: T): T {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : fallback
}

export function AdminYouTubeSection({
  clients,
  connections,
}: {
  clients: { id: string; name: string }[]
  connections: Omit<YouTubeConn, 'clientName'>[]
}) {
  const [syncStates, setSyncStates] = useState<Record<string, 'idle' | 'syncing' | 'done' | 'error'>>({})
  const [syncResults, setSyncResults] = useState<Record<string, string>>({})
  // Track subscriber counts in state so Sync Now updates the display without a reload
  const [subCounts, setSubCounts] = useState<Record<string, number | null>>(
    Object.fromEntries(connections.map(c => [c.clientId, c.subscriberCount ?? null]))
  )
  const [lastSyncedAtByClient, setLastSyncedAtByClient] = useState<Record<string, string | null>>(
    Object.fromEntries(connections.map(c => [c.clientId, c.lastSyncedAt ?? null]))
  )
  const [tokenExpiresAtByClient, setTokenExpiresAtByClient] = useState<Record<string, string | null>>(
    Object.fromEntries(connections.map(c => [c.clientId, c.tokenExpiresAt ?? null]))
  )

  const connMap = new Map(connections.map(c => [c.clientId, c]))

  async function handleSync(clientId: string) {
    setSyncStates(s => ({ ...s, [clientId]: 'syncing' }))
    setSyncResults(r => ({ ...r, [clientId]: '' }))
    try {
      const res = await fetch('/api/admin/sync-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setSyncResults(r => ({ ...r, [clientId]: `${data.synced} windows synced · ${data.skipped} skipped` }))
      setSyncStates(s => ({ ...s, [clientId]: 'done' }))
      // Update subscriber count if the route returned a fresh value
      if (data.subscriberCount != null) {
        setSubCounts(s => ({ ...s, [clientId]: data.subscriberCount }))
      }
      if ('lastSyncedAt' in data) {
        setLastSyncedAtByClient(s => ({ ...s, [clientId]: data.lastSyncedAt ?? null }))
      }
      if ('tokenExpiresAt' in data) {
        setTokenExpiresAtByClient(s => ({ ...s, [clientId]: data.tokenExpiresAt ?? null }))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSyncResults(r => ({ ...r, [clientId]: msg }))
      setSyncStates(s => ({ ...s, [clientId]: 'error' }))
    }
  }

  return (
    <div style={{ marginTop: 40 }}>
      <p
        className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
        style={{ color: '#4cc9ff' }}
      >
        <span style={{ display: 'block', width: 20, height: 1, background: '#4cc9ff' }} />
        YouTube Connections
      </p>

      <div className="flex flex-col gap-px" style={{ background: '#141414' }}>
        {clients.map(client => {
          const conn = connMap.get(client.id)
          const syncState = syncStates[client.id] ?? 'idle'
          const syncResult = syncResults[client.id] ?? ''
          const lastSyncedAt = conn ? stateValue(lastSyncedAtByClient, client.id, conn.lastSyncedAt) : null
          const tokenExpiresAt = conn ? stateValue(tokenExpiresAtByClient, client.id, conn.tokenExpiresAt) : null
          const tokenExpiry = conn ? tokenExpiryState(tokenExpiresAt) : null

          return (
            <div
              key={client.id}
              style={{ background: '#0a0a0a', padding: '18px 24px' }}
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                {/* Client info */}
                <div style={{ minWidth: 140 }}>
                  <p className="text-[13px] font-light" style={{ color: '#f2ede4' }}>
                    {client.name}
                  </p>
                  {conn ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        style={{
                          display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                          background: '#39ff88', flexShrink: 0,
                        }}
                      />
                      <span className="text-[9px] font-light" style={{ color: '#39ff88' }}>
                        Connected
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        style={{
                          display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                          background: '#555', flexShrink: 0,
                        }}
                      />
                      <span className="text-[9px] font-light" style={{ color: '#666' }}>
                        Not connected
                      </span>
                    </div>
                  )}
                </div>

                {/* Channel details (if connected) */}
                {conn && (
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                        Channel
                      </p>
                      <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>
                        {conn.channelName ?? conn.channelId ?? '—'}
                      </p>
                    </div>
                    {(subCounts[conn.clientId] ?? conn.subscriberCount) != null && (
                      <div>
                        <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                          Subscribers
                        </p>
                        <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>
                          {fmt(subCounts[conn.clientId] ?? conn.subscriberCount ?? 0)}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                        Connected
                      </p>
                      <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>
                        {fmtDate(conn.createdAt)}
                      </p>
                    </div>
                    {lastSyncedAt && (
                      <div>
                        <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>
                          Last Sync
                        </p>
                        <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>
                          {fmtDate(lastSyncedAt)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center gap-3">
                  {conn ? (
                    <>
                      <button
                        onClick={() => handleSync(client.id)}
                        disabled={syncState === 'syncing'}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium cursor-pointer"
                        style={{
                          background: syncState === 'done' ? 'rgba(57,255,136,.1)' : 'rgba(76,201,255,.1)',
                          color: syncState === 'done' ? '#39ff88' : syncState === 'error' ? '#ff3b5f' : '#4cc9ff',
                          border: `1px solid ${syncState === 'done' ? 'rgba(57,255,136,.3)' : syncState === 'error' ? 'rgba(255,59,95,.3)' : 'rgba(76,201,255,.3)'}`,
                          opacity: syncState === 'syncing' ? 0.6 : 1,
                        }}
                      >
                        {syncState === 'syncing' ? 'Syncing…' : syncState === 'done' ? '✓ Synced' : 'Sync Now'}
                      </button>
                      <a
                        href={`/api/auth/youtube?client_id=${client.id}`}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium"
                        style={{
                          background: 'rgba(201,169,110,.06)',
                          color: '#c9a96e',
                          border: '1px solid rgba(201,169,110,.2)',
                        }}
                      >
                        Reconnect
                      </a>
                    </>
                  ) : (
                    <a
                      href={`/api/auth/youtube?client_id=${client.id}`}
                      className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium"
                      style={{
                        background: 'rgba(76,201,255,.1)',
                        color: '#4cc9ff',
                        border: '1px solid rgba(76,201,255,.3)',
                      }}
                    >
                      Connect YouTube
                    </a>
                  )}
                </div>
              </div>

              {tokenExpiry && (
                <p className="text-[9px] font-light mt-2" style={{ color: tokenExpiry.color }}>
                  {tokenExpiry.label}
                </p>
              )}

              {/* Sync result */}
              {syncResult && (
                <p
                  className="text-[9px] font-light mt-2"
                  style={{ color: syncState === 'error' ? '#ff3b5f' : '#555' }}
                >
                  {syncResult}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[9px] font-light mt-3" style={{ color: '#1e1e1e' }}>
        OAuth scopes: youtube.readonly · yt-analytics.readonly
      </p>
    </div>
  )
}
