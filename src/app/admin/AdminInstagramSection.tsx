'use client'

import { useState } from 'react'
import { disconnectInstagram } from './actions'

type InstagramConn = {
  clientId: string
  username: string | null
  igUserId: string | null
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

function daysUntilExpiry(tokenExpiresAt: string | null): number | null {
  if (!tokenExpiresAt) return null
  const ms = new Date(tokenExpiresAt).getTime() - Date.now()
  return Math.floor(ms / 86_400_000)
}

export function AdminInstagramSection({
  clients,
  connections,
}: {
  clients: { id: string; name: string }[]
  connections: InstagramConn[]
}) {
  const [syncStates,  setSyncStates]  = useState<Record<string, 'idle' | 'syncing' | 'done' | 'error'>>({})
  const [syncResults, setSyncResults] = useState<Record<string, string>>({})
  const [followerCounts, setFollowerCounts] = useState<Record<string, number | null>>(
    Object.fromEntries(connections.map(c => [c.clientId, c.followerCount ?? null]))
  )

  const connMap = new Map(connections.map(c => [c.clientId, c]))

  async function handleSync(clientId: string) {
    setSyncStates(s  => ({ ...s,  [clientId]: 'syncing' }))
    setSyncResults(r => ({ ...r,  [clientId]: '' }))
    try {
      const res  = await fetch('/api/admin/sync-instagram', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ client_id: clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setSyncResults(r => ({ ...r, [clientId]: `${data.synced} posts synced · ${data.skipped} skipped` }))
      setSyncStates(s  => ({ ...s, [clientId]: 'done' }))
      if (data.followersCount != null) {
        setFollowerCounts(f => ({ ...f, [clientId]: data.followersCount }))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSyncResults(r => ({ ...r, [clientId]: msg }))
      setSyncStates(s  => ({ ...s, [clientId]: 'error' }))
    }
  }

  async function handleDisconnect(clientId: string) {
    const result = await disconnectInstagram(clientId)
    if (result.error) {
      setSyncResults(r => ({ ...r, [clientId]: result.error! }))
      setSyncStates(s  => ({ ...s, [clientId]: 'error' }))
    }
  }

  return (
    <div style={{ marginTop: 40 }}>
      <p
        className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
        style={{ color: '#c9a96e' }}
      >
        <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
        Instagram Connections
      </p>

      <div className="flex flex-col gap-px" style={{ background: '#141414' }}>
        {clients.map(client => {
          const conn       = connMap.get(client.id)
          const syncState  = syncStates[client.id]  ?? 'idle'
          const syncResult = syncResults[client.id] ?? ''
          const daysLeft   = conn ? daysUntilExpiry(conn.tokenExpiresAt) : null
          const tokenWarn  = daysLeft !== null && daysLeft <= 7

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

                {/* Profile details */}
                {conn && (
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>Username</p>
                      <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>
                        {conn.username ? `@${conn.username}` : conn.igUserId ?? '—'}
                      </p>
                    </div>
                    {(followerCounts[conn.clientId] ?? conn.followerCount) != null && (
                      <div>
                        <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>Followers</p>
                        <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>
                          {fmt(followerCounts[conn.clientId] ?? conn.followerCount ?? 0)}
                        </p>
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
                        onClick={() => handleSync(client.id)}
                        disabled={syncState === 'syncing'}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium cursor-pointer"
                        style={{
                          background: syncState === 'done' ? 'rgba(57,255,136,.1)' : 'rgba(201,169,110,.1)',
                          color:      syncState === 'done' ? '#39ff88' : syncState === 'error' ? '#ff3b5f' : '#c9a96e',
                          border:     `1px solid ${syncState === 'done' ? 'rgba(57,255,136,.3)' : syncState === 'error' ? 'rgba(255,59,95,.3)' : 'rgba(201,169,110,.3)'}`,
                          opacity:    syncState === 'syncing' ? 0.6 : 1,
                        }}
                      >
                        {syncState === 'syncing' ? 'Syncing…' : syncState === 'done' ? '✓ Synced' : 'Sync Now'}
                      </button>
                      <a
                        href={`/api/auth/instagram?client_id=${client.id}`}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium"
                        style={{ background: 'rgba(201,169,110,.06)', color: '#c9a96e', border: '1px solid rgba(201,169,110,.2)' }}
                      >
                        Reconnect
                      </a>
                      <button
                        onClick={() => handleDisconnect(client.id)}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium cursor-pointer"
                        style={{ background: 'rgba(255,59,95,.06)', color: '#ff3b5f', border: '1px solid rgba(255,59,95,.2)' }}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <a
                      href={`/api/auth/instagram?client_id=${client.id}`}
                      className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium"
                      style={{ background: 'rgba(201,169,110,.1)', color: '#c9a96e', border: '1px solid rgba(201,169,110,.3)' }}
                    >
                      Connect Instagram
                    </a>
                  )}
                </div>
              </div>

              {/* Token expiry warning */}
              {tokenWarn && (
                <p className="text-[9px] font-light mt-2" style={{ color: '#fbbf24' }}>
                  ⚠ Token expires in {daysLeft} day{daysLeft === 1 ? '' : 's'} — reconnect to refresh.
                </p>
              )}

              {/* Sync result */}
              {syncResult && (
                <p className="text-[9px] font-light mt-2" style={{ color: syncState === 'error' ? '#ff3b5f' : '#555' }}>
                  {syncResult}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[9px] font-light mt-3" style={{ color: '#555' }}>
        Required Instagram permissions · Long-lived token (60-day TTL)
      </p>
    </div>
  )
}
