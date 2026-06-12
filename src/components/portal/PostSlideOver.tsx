'use client'

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

export type SlideOverWindow = {
  views: number; likes: number; comments: number
  shares: number; saves: number; followers: number; watch_pct: number
}

export type SlideOverPost = {
  postId: string
  title: string
  platform: string[]
  date: string
  pillar?: string | null
  hook?: string | null
  decision?: string | null
  w24: SlideOverWindow
  w3:  SlideOverWindow
  w7:  SlideOverWindow
  eom: SlideOverWindow
}

const EMPTY_WIN: SlideOverWindow = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, followers: 0, watch_pct: 0 }

function makeEmpty(): SlideOverPost {
  return { postId: '', title: '', platform: [], date: '', w24: EMPTY_WIN, w3: EMPTY_WIN, w7: EMPTY_WIN, eom: EMPTY_WIN }
}
makeEmpty // keep reference

function calcER(w: SlideOverWindow, platform: string[]): number {
  if (!w.views) return 0
  const fourth = platform.includes('yt') ? w.followers : w.saves
  return ((w.likes + w.comments + w.shares + fourth) / w.views) * 100
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

const PLAT_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ig: { label: 'IG', color: '#c9a96e', bg: 'rgba(201,169,110,.1)' },
  tt: { label: 'TT', color: '#2dd4bf', bg: 'rgba(45,212,191,.1)'  },
  yt: { label: 'YT', color: '#4cc9ff', bg: 'rgba(76,201,255,.1)'  },
  lf: { label: 'LF', color: '#4cc9ff', bg: 'rgba(76,201,255,.1)'  },
}

const DEC_CFG: Record<string, { color: string; bg: string; border: string }> = {
  'Double Down': { color: '#c9a96e', bg: 'rgba(201,169,110,.12)', border: 'rgba(201,169,110,.4)' },
  'Iterate':     { color: '#fbbf24', bg: 'rgba(251,191,36,.10)',  border: 'rgba(251,191,36,.35)'  },
  'Kill':        { color: '#ff3b5f', bg: 'rgba(255,59,95,.10)',   border: 'rgba(255,59,95,.35)'   },
}

const WINS = [
  { key: 'w24' as const, label: 'W24' },
  { key: 'w3'  as const, label: 'W3'  },
  { key: 'w7'  as const, label: 'W7'  },
  { key: 'eom' as const, label: 'EOM' },
]

export function PostSlideOver({
  post,
  onClose,
  onEdit,
}: {
  post: SlideOverPost
  onClose: () => void
  onEdit?: () => void
}) {
  const sparkData = WINS.map(w => ({
    label: w.label,
    er: +calcER(post[w.key], post.platform).toFixed(1),
  }))

  const bestWin = WINS.reduce(
    (best, w) => calcER(post[w.key], post.platform) > calcER(post[best.key], post.platform) ? w : best,
    WINS[3], // prefer eom as starting point
  )
  const bestER   = calcER(post[bestWin.key], post.platform)
  const decision = post.decision || (bestER >= 12 ? 'Double Down' : bestER >= 4 ? 'Iterate' : bestER > 0 ? 'Kill' : null)
  const decCfg   = DEC_CFG[decision ?? ''] ?? DEC_CFG['Iterate']
  const dateStr  = post.date
    ? new Date(post.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  return (
    <>
      {/* Dim backdrop — keeps table visible but slightly darkened */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 8990, background: 'rgba(0,0,0,.40)' }}
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 440, maxWidth: '90vw',
          zIndex: 8991,
          background: '#070707',
          borderLeft: '1px solid #1e1e1e',
          overflowY: 'auto',
          animation: 'slideOverIn .28s cubic-bezier(.16,1,.3,1) forwards',
          boxShadow: '-20px 0 60px rgba(0,0,0,.55)',
        }}
      >
        {/* Sticky header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #141414',
          position: 'sticky', top: 0,
          background: '#070707',
          zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {post.platform.map(p => {
                  const c = PLAT_CFG[p] ?? { label: p.toUpperCase(), color: '#555', bg: '#0d0d0d' }
                  return (
                    <span key={p} style={{
                      fontSize: 7, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
                      padding: '2px 7px', color: c.color, background: c.bg, border: `1px solid ${c.color}30`,
                    }}>
                      {c.label}
                    </span>
                  )
                })}
                <span style={{ fontSize: 9, color: '#c9a96e', fontFamily: 'monospace' }}>{post.postId}</span>
              </div>
              <h2 style={{ fontSize: 15, fontWeight: 300, color: '#f2ede4', lineHeight: 1.3, margin: 0 }}>
                {post.title}
              </h2>
              <p style={{ fontSize: 9, color: '#555', marginTop: 4 }}>{dateStr}</p>
            </div>
            <button
              onClick={onClose}
              style={{ fontSize: 20, color: '#666', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, flexShrink: 0, padding: '0 0 0 8px', transition: 'color .12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#aaa' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#666' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ER% + Decision badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555', marginBottom: 3 }}>
                Best ER%
              </p>
              <p style={{ fontSize: 30, fontWeight: 300, color: '#f2ede4', lineHeight: 1 }}>
                {bestER > 0 ? bestER.toFixed(1) : '—'}
                {bestER > 0 && <span style={{ fontSize: 14, color: '#555' }}>%</span>}
              </p>
            </div>
            <div style={{ flex: 1 }} />
            {decision && (
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase',
                padding: '7px 14px',
                color: decCfg.color, background: decCfg.bg, border: `1px solid ${decCfg.border}`,
              }}>
                {decision}
              </span>
            )}
          </div>

          {/* 4-window 2×2 grid */}
          <div>
            <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555', marginBottom: 8 }}>
              Metric Windows
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {WINS.map(w => {
                const m = post[w.key]
                const er = calcER(m, post.platform)
                const hasData = m.views > 0
                return (
                  <div key={w.key} style={{
                    background: '#0a0a0a', border: '1px solid #141414',
                    padding: '12px 14px', opacity: hasData ? 1 : 0.35,
                  }}>
                    <p style={{
                      fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase',
                      color: hasData ? '#c9a96e' : '#555', marginBottom: 8,
                    }}>
                      {w.label}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {([
                        ['Views', hasData ? fmt(m.views) : '—'],
                        ['ER%',   hasData ? er.toFixed(1) + '%' : '—'],
                        ['Likes', hasData ? fmt(m.likes) : '—'],
                        ['Watch', hasData && m.watch_pct > 0 ? m.watch_pct.toFixed(0) + '%' : '—'],
                      ] as [string, string][]).map(([lbl, val]) => (
                        <div key={lbl}>
                          <p style={{ fontSize: 7, color: '#444', marginBottom: 2 }}>{lbl}</p>
                          <p style={{ fontSize: 11, color: '#d4ccbc' }}>{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sparkline — only shown if at least one window has data */}
          {sparkData.some(d => d.er > 0) && (
            <div>
              <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555', marginBottom: 8 }}>
                ER% Progression
              </p>
              <div style={{ height: 68, background: '#0a0a0a', border: '1px solid #141414', padding: '8px 0' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                    <Tooltip
                      content={(props: any) =>
                        props.active && props.payload?.length ? (
                          <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', padding: '4px 8px', fontSize: 10, fontFamily: 'DM Sans' }}>
                            <p style={{ color: '#c9a96e' }}>
                              {props.payload[0]?.payload.label}: {props.payload[0]?.value}%
                            </p>
                          </div>
                        ) : null
                      }
                    />
                    <Line
                      type="monotone" dataKey="er" stroke="#c9a96e" strokeWidth={1.5}
                      dot={{ r: 3, fill: '#c9a96e', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Pillar / Hook */}
          {((post.pillar && post.pillar !== '—') || (post.hook && post.hook !== '—')) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {post.pillar && post.pillar !== '—' && (
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 7, color: '#666', marginBottom: 4 }}>Pillar</p>
                  <span style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
                    padding: '4px 10px', color: '#555', background: '#0d0d0d', border: '1px solid #1a1a1a',
                  }}>
                    {post.pillar}
                  </span>
                </div>
              )}
              {post.hook && post.hook !== '—' && (
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 7, color: '#666', marginBottom: 4 }}>Hook</p>
                  <span style={{ fontSize: 9, padding: '4px 10px', color: '#555', background: '#0d0d0d', border: '1px solid #1a1a1a' }}>
                    {post.hook}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Edit button */}
          {onEdit && (
            <button
              onClick={onEdit}
              style={{
                padding: '10px 20px', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase',
                background: 'rgba(201,169,110,.08)', border: '1px solid rgba(201,169,110,.3)',
                color: '#c9a96e', cursor: 'pointer', fontWeight: 600, width: '100%',
                transition: 'background .15s, border-color .15s',
              }}
            >
              Edit Post
            </button>
          )}
        </div>
      </div>

    </>
  )
}
