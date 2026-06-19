'use client'

import { useEffect, useState } from 'react'
import { disconnectMetaAds } from './actions'

type MetaAdsConn = {
  clientId: string
  adAccountName: string | null
  adAccountId: string | null
  createdAt: string | null
  lastSyncedAt: string | null
  tokenExpiresAt: string | null
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

export function AdminMetaAdsSection({
  clients,
  connections,
}: {
  clients: { id: string; name: string }[]
  connections: MetaAdsConn[]
}) {
  const [notice, setNotice] = useState('')
  const [syncStates, setSyncStates] = useState<Record<string, 'idle' | 'syncing' | 'done' | 'error'>>({})
  const [syncResults, setSyncResults] = useState<Record<string, string>>({})
  const connMap = new Map(connections.map(c => [c.clientId, c]))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('meta_ads_connected') === '1') {
      setNotice('Meta Ads connected successfully.')
    }
    const error = params.get('meta_ads_error')
    if (error) {
      setNotice(`Meta Ads connection failed: ${error.replaceAll('_', ' ')}`)
    }
  }, [])

  async function handleSync(clientId: string) {
    setSyncStates(s => ({ ...s, [clientId]: 'syncing' }))
    setSyncResults(r => ({ ...r, [clientId]: '' }))
    try {
      const res = await fetch('/api/admin/sync-meta-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setSyncResults(r => ({ ...r, [clientId]: `${data.synced} campaigns synced` }))
      setSyncStates(s => ({ ...s, [clientId]: 'done' }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSyncResults(r => ({ ...r, [clientId]: msg }))
      setSyncStates(s => ({ ...s, [clientId]: 'error' }))
    }
  }

  async function handleDisconnect(clientId: string) {
    const result = await disconnectMetaAds(clientId)
    if (result.error) {
      setSyncResults(r => ({ ...r, [clientId]: result.error! }))
      setSyncStates(s => ({ ...s, [clientId]: 'error' }))
    }
  }

  return (
    <div style={{ marginTop: 40 }}>
      <p
        className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3"
        style={{ color: '#1778f2' }}
      >
        <span style={{ display: 'block', width: 20, height: 1, background: '#1778f2' }} />
        Meta Ads Connections
      </p>

      {notice && (
        <p className="text-[10px] mb-4 p-3" style={{ color: notice.includes('failed') ? '#ff3b5f' : '#39ff88', background: 'rgba(23,120,242,.07)', border: '1px solid rgba(23,120,242,.2)', borderRadius: 5 }}>
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

                {conn && (
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>Ad Account</p>
                      <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>{conn.adAccountName ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>Account ID</p>
                      <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>{conn.adAccountId ?? '—'}</p>
                    </div>
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

                <div className="flex items-center gap-3">
                  {conn ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSync(client.id)}
                        disabled={syncState === 'syncing'}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium cursor-pointer"
                        style={{
                          background: syncState === 'done' ? 'rgba(57,255,136,.1)' : 'rgba(23,120,242,.1)',
                          color: syncState === 'done' ? '#39ff88' : syncState === 'error' ? '#ff3b5f' : '#1778f2',
                          border: `1px solid ${syncState === 'done' ? 'rgba(57,255,136,.3)' : syncState === 'error' ? 'rgba(255,59,95,.3)' : 'rgba(23,120,242,.3)'}`,
                          opacity: syncState === 'syncing' ? 0.6 : 1,
                        }}
                      >
                        {syncState === 'syncing' ? 'Syncing...' : syncState === 'done' ? 'Synced' : 'Sync Now'}
                      </button>
                      <a
                        href={`/api/auth/meta-ads?client_id=${client.id}`}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium"
                        style={{ background: 'rgba(23,120,242,.06)', color: '#1778f2', border: '1px solid rgba(23,120,242,.2)' }}
                      >
                        Reconnect
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(client.id)}
                        className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium cursor-pointer"
                        style={{ background: 'rgba(255,59,95,.06)', color: '#ff3b5f', border: '1px solid rgba(255,59,95,.2)' }}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <a
                      href={`/api/auth/meta-ads?client_id=${client.id}`}
                      className="text-[9px] tracking-[.14em] uppercase px-3 py-1.5 font-medium"
                      style={{ background: 'rgba(23,120,242,.1)', color: '#1778f2', border: '1px solid rgba(23,120,242,.3)' }}
                    >
                      Connect Meta Ads
                    </a>
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

      <p className="text-[9px] font-light mt-3" style={{ color: '#555' }}>
        Required permission: ads_read · Redirect URI: https://portal.drop-clix.com/api/auth/meta-ads/callback
      </p>
    </div>
  )
}
