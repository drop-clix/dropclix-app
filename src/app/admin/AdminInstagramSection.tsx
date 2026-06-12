'use client'

import { useState } from 'react'

type InstagramConn = {
  clientId: string
  username: string | null
  igUserId: string | null
  createdAt: string | null
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AdminInstagramSection({
  clients,
  connections,
}: {
  clients: { id: string; name: string }[]
  connections: InstagramConn[]
}) {
  const [notice, setNotice] = useState('')
  const connMap = new Map(connections.map(c => [c.clientId, c]))

  function handleConnect(clientId: string) {
    if (!process.env.NEXT_PUBLIC_IG_APP_CONFIGURED) {
      setNotice('Add INSTAGRAM_APP_ID and INSTAGRAM_REDIRECT_URI to .env.local to enable Instagram OAuth.')
      return
    }
    window.location.href = `/api/auth/instagram?client_id=${clientId}`
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
                      <span className="text-[9px] font-light" style={{ color: '#444' }}>Not connected</span>
                    </div>
                  )}
                </div>

                {/* Profile details (if connected) */}
                {conn && (
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[7px] tracking-[.14em] uppercase" style={{ color: '#555' }}>Username</p>
                      <p className="text-[11px] font-light mt-0.5" style={{ color: '#f2ede4' }}>
                        {conn.username ? `@${conn.username}` : conn.igUserId ?? '—'}
                      </p>
                    </div>
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
                        background: 'rgba(201,169,110,.06)',
                        color: '#c9a96e',
                        border: '1px solid rgba(201,169,110,.2)',
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
                        background: 'rgba(201,169,110,.1)',
                        color: '#c9a96e',
                        border: '1px solid rgba(201,169,110,.3)',
                      }}
                    >
                      Connect Instagram
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[9px] font-light mt-3" style={{ color: '#1e1e1e' }}>
        Requires INSTAGRAM_APP_ID · INSTAGRAM_APP_SECRET · INSTAGRAM_REDIRECT_URI in environment.
        OAuth scopes: user_profile · user_media
      </p>
    </div>
  )
}
