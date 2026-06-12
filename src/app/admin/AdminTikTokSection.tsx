'use client'

import { useState } from 'react'

type TikTokConn = {
  clientId: string
  displayName: string | null
  openId: string | null
  followerCount: number | null
  createdAt: string | null
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

export function AdminTikTokSection({
  clients,
  connections,
}: {
  clients: { id: string; name: string }[]
  connections: TikTokConn[]
}) {
  const [notice, setNotice] = useState('')
  const connMap = new Map(connections.map(c => [c.clientId, c]))

  function handleConnect(clientId: string) {
    if (!process.env.NEXT_PUBLIC_TT_APP_CONFIGURED) {
      setNotice('Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to .env.local to enable TikTok OAuth.')
      return
    }
    window.location.href = `/api/auth/tiktok?client_id=${clientId}`
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
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center gap-3">
                  {conn ? (
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
