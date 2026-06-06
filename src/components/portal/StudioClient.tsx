'use client'

import { useState, useRef } from 'react'
import { createPost, importPostsBatch, checkExistingPostIds } from '@/app/(dashboard)/studio/actions'
import type { NewPostData, WindowMetrics } from '@/app/(dashboard)/studio/actions'
import { erToDecision } from '@/lib/decision'

// ── Shared types ──────────────────────────────────────────────────────────────

export type StudioItem = {
  id: string
  postId: string
  title: string
  platform: string[]
  pillar: string | null
  status: string
  priority: number | null
  week: string | null
  scriptContent: string | null
  notes: string | null
}

type StudioTab = 'scripts' | 'production' | 'planned' | 'import'
type ImportMode = 'new' | 'csv'
type WindowKey = 'w24' | 'w3' | 'w7' | 'eom'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  SCRIPTED:  '#c9a96e',
  FILMING:   '#f59e0b',
  REVIEWING: '#ef4444',
  PLANNED:   '#3a5a8a',
  POSTED:    '#4ade80',
  CANCELLED: '#2a2a2a',
}

const PLAT_COLOR: Record<string, string> = {
  ig: '#e1306c', tt: '#a855f7', yt: '#60a5fa',
}

const WINDOW_LABELS: Record<WindowKey, string> = {
  w24: '24 Hr', w3: '3-Day', w7: '7-Day', eom: 'EOM',
}

const PILLARS = [
  '', 'Sales Tips', 'Self Development', 'Service/Love',
  'Volume/50-150', 'Time Management', 'Other',
]

const HOOKS = [
  '', 'Hard Statement', 'Question', 'Story', 'Authority',
  'Problem→Solution', 'Shock', 'Volume',
]

const FORMATS = [
  '', 'Talking Head', 'Reel', 'YouTube Long', 'Story',
  'Tutorial', 'Tips List', 'Challenge',
]

const DECISIONS = ['', 'Double Down', 'Iterate', 'Kill']

const METRIC_FIELDS: { key: keyof WindowMetrics; label: string; isPercent?: boolean }[] = [
  { key: 'views',     label: 'Views'    },
  { key: 'likes',     label: 'Likes'    },
  { key: 'comments',  label: 'Comments' },
  { key: 'shares',    label: 'Shares'   },
  { key: 'saves',     label: 'Saves'    },
  { key: 'watch_pct', label: 'Watch%', isPercent: true },
  { key: 'followers', label: 'Followers' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

type WindowState = {
  views: string; likes: string; comments: string; shares: string
  saves: string; watch_pct: string; followers: string
}

function emptyWin(): WindowState {
  return { views: '', likes: '', comments: '', shares: '', saves: '', watch_pct: '', followers: '' }
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function winStateToMetrics(w: WindowState): WindowMetrics {
  return {
    views:     parseNum(w.views),
    likes:     parseNum(w.likes),
    comments:  parseNum(w.comments),
    shares:    parseNum(w.shares),
    saves:     parseNum(w.saves),
    watch_pct: parseNum(w.watch_pct),
    followers: parseNum(w.followers),
  }
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === ',' && !inQ) {
        result.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const vals = parseLine(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
  return { headers, rows }
}


// ── Shared sub-components ─────────────────────────────────────────────────────

function PlatBadge({ platform }: { platform: string }) {
  const color = PLAT_COLOR[platform] ?? '#555'
  const label = platform === 'ig' ? 'IG' : platform === 'tt' ? 'TT' : 'YT'
  return (
    <span style={{
      fontSize: 8, fontWeight: 600, letterSpacing: '.1em',
      padding: '2px 5px', borderRadius: 3,
      background: `${color}18`, border: `1px solid ${color}35`, color,
    }}>
      {label}
    </span>
  )
}

// ── Pipeline queue sub-components ─────────────────────────────────────────────

function ScriptCard({ item }: { item: StudioItem }) {
  const [open, setOpen] = useState(false)
  const statusColor = STATUS_COLOR[item.status] ?? '#555'
  const hasScript   = !!item.scriptContent

  return (
    <div style={{
      background: '#0a0a0a',
      border: `1px solid ${open ? 'rgba(201,169,110,.2)' : '#141414'}`,
      borderLeft: `3px solid ${statusColor}`,
      borderRadius: 6, marginBottom: 10, overflow: 'hidden',
      transition: 'border-color .2s',
    }}>
      <div style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 9, color: '#c9a96e', fontFamily: 'monospace' }}>{item.postId}</span>
              <span style={{ fontSize: 9, color: statusColor, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                {item.status}
              </span>
              {item.platform.map(p => <PlatBadge key={p} platform={p} />)}
              {item.week && (
                <span style={{ fontSize: 9, color: '#333', letterSpacing: '.08em' }}>Week {item.week}</span>
              )}
            </div>
            <p style={{ fontSize: 13, color: '#f2ede4', margin: 0, fontWeight: 400, lineHeight: 1.3 }}>
              {item.title}
            </p>
            {item.pillar && (
              <p style={{ fontSize: 9, color: '#444', margin: '4px 0 0', letterSpacing: '.08em' }}>{item.pillar}</p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {item.priority === 1 && (
              <span style={{ fontSize: 8, color: '#ef4444', letterSpacing: '.1em', textTransform: 'uppercase' }}>URGENT</span>
            )}
            {hasScript ? (
              <button
                onClick={() => setOpen(v => !v)}
                style={{
                  fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                  padding: '5px 10px', borderRadius: 3,
                  background: open ? 'rgba(201,169,110,.12)' : 'rgba(201,169,110,.06)',
                  border: '1px solid rgba(201,169,110,.2)',
                  color: '#c9a96e', cursor: 'pointer', transition: 'background .15s',
                }}
              >
                {open ? 'Hide' : 'Read Script'}
              </button>
            ) : (
              <span style={{ fontSize: 9, color: '#2a2a2a', letterSpacing: '.08em' }}>No script</span>
            )}
          </div>
        </div>
      </div>
      {open && hasScript && (
        <div style={{ padding: '0 22px 20px', borderTop: '1px solid #141414' }}>
          <div style={{
            padding: '14px 16px', marginTop: 12,
            background: '#060606', border: '1px solid #141414', borderRadius: 4,
            fontSize: 12, color: '#ccc', lineHeight: 1.75,
            whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif",
            maxHeight: 360, overflowY: 'auto',
          }}>
            {item.scriptContent}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductionRow({ item }: { item: StudioItem }) {
  const statusColor = STATUS_COLOR[item.status] ?? '#555'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px 20px', background: '#0a0a0a',
      border: '1px solid #141414', borderLeft: `3px solid ${statusColor}`,
      borderRadius: 5, marginBottom: 6, fontSize: 10,
    }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {item.platform.map(p => <PlatBadge key={p} platform={p} />)}
      </div>
      <span style={{ color: '#c9a96e', fontFamily: 'monospace', minWidth: 44, fontSize: 9 }}>{item.postId}</span>
      <span style={{ flex: 1, color: '#f2ede4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
      {item.week && (
        <span style={{ color: '#333', fontSize: 9, whiteSpace: 'nowrap' }}>Wk {item.week}</span>
      )}
      <span style={{
        fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase',
        padding: '3px 7px', borderRadius: 3,
        background: `${statusColor}15`, border: `1px solid ${statusColor}30`, color: statusColor,
      }}>
        {item.status}
      </span>
    </div>
  )
}

// ── New Post Form ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: '#080808', border: '1px solid #1e1e1e',
  color: '#f2ede4', padding: '7px 10px', fontSize: 12,
  fontFamily: "'DM Sans', sans-serif", outline: 'none', width: '100%',
  borderRadius: 3,
}

const labelStyle: React.CSSProperties = {
  fontSize: 7, fontWeight: 600, letterSpacing: '.16em',
  textTransform: 'uppercase', color: '#2a2a2a',
  display: 'block', marginBottom: 4,
}

function NewPostForm({ nextPostId, onSuccess }: { nextPostId: string; onSuccess: () => void }) {
  const [postId,    setPostId   ] = useState(nextPostId)
  const [title,     setTitle    ] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['ig'])
  const [date,      setDate     ] = useState('')
  const [pillar,    setPillar   ] = useState('')
  const [hook,      setHook     ] = useState('')
  const [format,    setFormat   ] = useState('')
  const [cta,       setCta      ] = useState('')
  const [decision,  setDecision ] = useState('')
  const [activeWin, setActiveWin] = useState<WindowKey>('eom')
  const [windows,   setWindows  ] = useState<Record<WindowKey, WindowState>>({
    w24: emptyWin(), w3: emptyWin(), w7: emptyWin(), eom: emptyWin(),
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function togglePlatform(p: string) {
    setPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  function updateWindow(win: WindowKey, field: keyof WindowMetrics, val: string) {
    setWindows(prev => ({ ...prev, [win]: { ...prev[win], [field]: val } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!date) { setError('Date is required'); return }
    if (platforms.length === 0) { setError('Select at least one platform'); return }
    setError('')
    setSubmitting(true)

    const postData: NewPostData = {
      postId: postId.trim(),
      title:  title.trim(),
      platform: platforms,
      date,
      pillar, hook, format, cta, decision,
      windows: {
        w24: winStateToMetrics(windows.w24),
        w3:  winStateToMetrics(windows.w3),
        w7:  winStateToMetrics(windows.w7),
        eom: winStateToMetrics(windows.eom),
      },
    }

    const result = await createPost(postData)
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setTimeout(() => { setSuccess(false); onSuccess() }, 2000)
    }
  }

  if (success) {
    return (
      <div style={{
        padding: '40px 32px', textAlign: 'center',
        background: '#0a0a0a', border: '1px solid rgba(57,255,136,.2)',
        borderLeft: '3px solid #39ff88',
      }}>
        <p style={{ fontSize: 14, color: '#39ff88', marginBottom: 6 }}>Post created</p>
        <p style={{ fontSize: 11, color: '#444' }}>{postId} synced to pipeline and calendar.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 780 }}>
      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Post ID</label>
          <input
            style={{ ...inputStyle, color: '#c9a96e', fontFamily: 'monospace' }}
            value={postId}
            onChange={e => setPostId(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Title *</label>
          <input
            style={inputStyle}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Post title"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Platform *</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {(['ig', 'tt', 'yt'] as const).map(p => {
              const on = platforms.includes(p)
              const color = PLAT_COLOR[p]
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => togglePlatform(p)}
                  style={{
                    padding: '5px 10px', cursor: 'pointer', fontSize: 9,
                    color:      on ? color : '#333',
                    background: on ? `${color}18` : 'transparent',
                    border:     `1px solid ${on ? color + '50' : '#1e1e1e'}`,
                    fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
                    borderRadius: 3,
                  }}
                >
                  {p === 'ig' ? 'IG' : p === 'tt' ? 'TT' : 'YT'}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Date *</label>
          <input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Pillar</label>
          <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={pillar} onChange={e => setPillar(e.target.value)}>
            {PILLARS.map(p => <option key={p} value={p} style={{ background: '#0a0a0a' }}>{p || '— select —'}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Hook Type</label>
          <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={hook} onChange={e => setHook(e.target.value)}>
            {HOOKS.map(h => <option key={h} value={h} style={{ background: '#0a0a0a' }}>{h || '— select —'}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Format</label>
          <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={format} onChange={e => setFormat(e.target.value)}>
            {FORMATS.map(f => <option key={f} value={f} style={{ background: '#0a0a0a' }}>{f || '— select —'}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Decision</label>
          <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={decision} onChange={e => setDecision(e.target.value)}>
            {DECISIONS.map(d => <option key={d} value={d} style={{ background: '#0a0a0a' }}>{d || '— select —'}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>CTA</label>
          <input style={inputStyle} value={cta} onChange={e => setCta(e.target.value)} placeholder="Call to action" />
        </div>
      </div>

      {/* Metric windows */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', color: '#2a2a2a', marginBottom: 8 }}>
          Metrics
        </p>
        {/* Window tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['w24', 'w3', 'w7', 'eom'] as WindowKey[]).map(wk => {
            const hasData = Object.values(windows[wk]).some(v => v !== '')
            return (
              <button
                type="button"
                key={wk}
                onClick={() => setActiveWin(wk)}
                style={{
                  padding: '6px 14px', fontSize: 9,
                  fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase',
                  background: activeWin === wk ? 'rgba(201,169,110,.08)' : 'transparent',
                  color: activeWin === wk ? '#c9a96e' : hasData ? '#555' : '#2a2a2a',
                  border: `1px solid ${activeWin === wk ? 'rgba(201,169,110,.3)' : '#1e1e1e'}`,
                  borderRadius: 3, cursor: 'pointer',
                }}
              >
                {WINDOW_LABELS[wk]}
                {hasData && activeWin !== wk && (
                  <span style={{ marginLeft: 4, color: '#39ff88', fontSize: 7 }}>●</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Metric inputs for active window */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8,
          padding: '16px', background: '#060606', border: '1px solid #141414',
        }}>
          {METRIC_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input
                type="number"
                min={0}
                step={key === 'watch_pct' ? '0.1' : '1'}
                style={{ ...inputStyle, textAlign: 'right' }}
                value={(windows[activeWin] as Record<string, string>)[key] ?? ''}
                onChange={e => updateWindow(activeWin, key, e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 11, color: '#ff3b5f', marginBottom: 10 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: '10px 24px', fontSize: 9,
          fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase',
          background: submitting ? '#1a1a1a' : 'rgba(201,169,110,.12)',
          color: submitting ? '#333' : '#c9a96e',
          border: `1px solid ${submitting ? '#1e1e1e' : 'rgba(201,169,110,.4)'}`,
          borderRadius: 3, cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Creating...' : 'Create Post + Sync Pipeline & Calendar'}
      </button>
    </form>
  )
}

// ── CSV Importer ──────────────────────────────────────────────────────────────

const STANDARD_CSV_HEADERS = [
  'post_id','title','platform','date','pillar','hook_type','format','decision',
  'views_24h','likes_24h','comments_24h','shares_24h','saves_24h','watch_pct_24h','skip_rate_24h','followers_24h',
  'views_3d','likes_3d','comments_3d','shares_3d','saves_3d','watch_pct_3d',
  'views_7d','likes_7d','comments_7d','shares_7d','saves_7d','watch_pct_7d',
  'eom_views','eom_likes','eom_comments','eom_shares','eom_saves','eom_watch_pct','eom_skip_rate','eom_followers',
]

const TEMPLATE_CSV =
  STANDARD_CSV_HEADERS.join(',') + '\n' +
  '#ig0001,Example Post Title,ig|tt|yt,2026-01-01,Sales Tips,Hard Statement,Talking Head,,1000,50,3,2,10,62.5,48.2,5,,,,,,,,,,,,5000,120,8,5,30,58.0,45.5,12\n'

type FilledWindow = {
  key:      'w24' | 'w3' | 'w7' | 'eom'
  label:    string
  metrics:  WindowMetrics
  er:       number
  decision: string
}

type PreviewRow = {
  postId:        string
  title:         string
  platforms:     string[]
  date:          string
  pillar:        string
  hookType:      string
  format:        string
  filledWindows: FilledWindow[]
  bestDecision:  string
}

type ImportResult = {
  imported:        number
  updated:         number
  pipelineCreated: number
  calendarCreated: number
  failed:          number
  errors:          string[]
}

function buildPreviewRows(rows: Record<string, string>[], nextPostId: string): PreviewRow[] {
  const nextNum = parseInt(nextPostId.match(/(\d+)/)?.[1] ?? '0')
  return rows.map((row, idx) => {
    const rawPlatform = (row.platform ?? '').trim()
    const platforms = rawPlatform
      ? rawPlatform.split('|').map(p => p.trim().toLowerCase()).filter(Boolean)
      : ['ig']

    const filledWindows: FilledWindow[] = []

    const v24 = parseNum(row.views_24h)
    if (v24 > 0) {
      const m: WindowMetrics = {
        views:     v24,
        likes:     parseNum(row.likes_24h),
        comments:  parseNum(row.comments_24h),
        shares:    parseNum(row.shares_24h),
        saves:     parseNum(row.saves_24h),
        watch_pct: parseNum(row.watch_pct_24h),
        followers: parseNum(row.followers_24h),
        skip_rate: parseNum(row.skip_rate_24h) || undefined,
      }
      const er = ((m.likes + m.comments + m.shares + m.saves) / m.views) * 100
      filledWindows.push({ key: 'w24', label: '24h', metrics: m, er, decision: erToDecision(er) })
    }

    const v3 = parseNum(row.views_3d)
    if (v3 > 0) {
      const m: WindowMetrics = {
        views:     v3,
        likes:     parseNum(row.likes_3d),
        comments:  parseNum(row.comments_3d),
        shares:    parseNum(row.shares_3d),
        saves:     parseNum(row.saves_3d),
        watch_pct: parseNum(row.watch_pct_3d),
        followers: 0,
      }
      const er = ((m.likes + m.comments + m.shares + m.saves) / m.views) * 100
      filledWindows.push({ key: 'w3', label: '3-Day', metrics: m, er, decision: erToDecision(er) })
    }

    const v7 = parseNum(row.views_7d)
    if (v7 > 0) {
      const m: WindowMetrics = {
        views:     v7,
        likes:     parseNum(row.likes_7d),
        comments:  parseNum(row.comments_7d),
        shares:    parseNum(row.shares_7d),
        saves:     parseNum(row.saves_7d),
        watch_pct: parseNum(row.watch_pct_7d),
        followers: 0,
      }
      const er = ((m.likes + m.comments + m.shares + m.saves) / m.views) * 100
      filledWindows.push({ key: 'w7', label: '7-Day', metrics: m, er, decision: erToDecision(er) })
    }

    const veom = parseNum(row.eom_views)
    if (veom > 0) {
      const m: WindowMetrics = {
        views:     veom,
        likes:     parseNum(row.eom_likes),
        comments:  parseNum(row.eom_comments),
        shares:    parseNum(row.eom_shares),
        saves:     parseNum(row.eom_saves),
        watch_pct: parseNum(row.eom_watch_pct),
        followers: parseNum(row.eom_followers),
        skip_rate: parseNum(row.eom_skip_rate) || undefined,
      }
      const er = ((m.likes + m.comments + m.shares + m.saves) / m.views) * 100
      filledWindows.push({ key: 'eom', label: 'EOM', metrics: m, er, decision: erToDecision(er) })
    }

    const best = filledWindows.find(w => w.key === 'eom')
      ?? filledWindows.find(w => w.key === 'w7')
      ?? filledWindows.find(w => w.key === 'w3')
      ?? filledWindows.find(w => w.key === 'w24')
      ?? null

    return {
      postId:        row.post_id?.trim() || `#ig${String(nextNum + idx).padStart(4, '0')}`,
      title:         row.title?.trim()   || '',
      platforms,
      date:          row.date?.trim()    || '',
      pillar:        row.pillar?.trim()  || '',
      hookType:      row.hook_type?.trim() || '',
      format:        row.format?.trim()  || '',
      filledWindows,
      bestDecision:  best?.decision ?? '',
    }
  })
}

function buildPostsFromPreview(previewRows: PreviewRow[]): NewPostData[] {
  return previewRows.map(pr => {
    const windows: Partial<Record<'w24' | 'w3' | 'w7' | 'eom', WindowMetrics>> = {}
    for (const fw of pr.filledWindows) windows[fw.key] = fw.metrics
    return {
      postId:   pr.postId,
      title:    pr.title,
      platform: pr.platforms,
      date:     pr.date,
      pillar:   pr.pillar,
      hook:     pr.hookType,
      format:   pr.format,
      cta:      '',
      decision: pr.bestDecision,
      windows,
    }
  })
}

const DECISION_COLOR: Record<string, string> = {
  'Double Down': '#39ff88',
  'Iterate':     '#fbbf24',
  'Kill':        '#ff3b5f',
}

const WIN_COLOR: Record<string, string> = {
  w24: '#c9a96e', w3: '#4cc9ff', w7: '#a78bfa', eom: '#39ff88',
}

function CSVImporter({ nextPostId }: { nextPostId: string }) {
  const [stage,       setStage      ] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload')
  const [rawRows,     setRawRows    ] = useState<Record<string, string>[]>([])
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set())
  const [skipSet,     setSkipSet    ] = useState<Set<string>>(new Set())
  const [result,      setResult     ] = useState<ImportResult | null>(null)
  const [error,       setError      ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleDownloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'dropclix-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function processText(text: string) {
    setError('')
    const { rows } = parseCSV(text)
    if (!rows.length) { setError('No data rows found in CSV'); return }
    const preview = buildPreviewRows(rows, nextPostId)
    setRawRows(rows)
    setPreviewRows(preview)
    setSkipSet(new Set())
    setStage('checking')
    const postIds  = preview.map(r => r.postId)
    const existing = await checkExistingPostIds(postIds)
    setExistingIds(new Set(existing))
    setStage('preview')
  }

  function handleFileEvent(file: File) {
    const reader = new FileReader()
    reader.onload = ev => processText(ev.target?.result as string)
    reader.readAsText(file)
  }

  function toggleSkip(postId: string) {
    setSkipSet(prev => {
      const next = new Set(prev)
      next.has(postId) ? next.delete(postId) : next.add(postId)
      return next
    })
  }

  async function handleConfirmImport() {
    setStage('importing')
    const posts        = buildPostsFromPreview(previewRows)
    const overwriteIds = previewRows
      .filter(r => existingIds.has(r.postId) && !skipSet.has(r.postId))
      .map(r => r.postId)
    const r = await importPostsBatch(posts, { skipIds: [...skipSet], overwriteIds })
    setResult(r)
    setStage('done')
  }

  function reset() {
    setStage('upload'); setRawRows([]); setPreviewRows([])
    setExistingIds(new Set()); setSkipSet(new Set()); setResult(null); setError('')
  }

  // ── Upload stage ──────────────────────────────────────────────────────────────
  if (stage === 'upload') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: '#2a2a2a' }}>
            CSV Import — Standard Format
          </p>
          <button
            onClick={handleDownloadTemplate}
            style={{
              padding: '6px 14px', fontSize: 9,
              letterSpacing: '.12em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid #1e1e1e',
              color: '#444', cursor: 'pointer', borderRadius: 3,
            }}
          >
            Download Template
          </button>
        </div>

        <div
          style={{
            border: '2px dashed #1e1e1e', padding: '48px 32px',
            textAlign: 'center', cursor: 'pointer', borderRadius: 4,
            transition: 'border-color .2s',
          }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#c9a96e' }}
          onDragLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e' }}
          onDrop={e => {
            e.preventDefault()
            e.currentTarget.style.borderColor = '#1e1e1e'
            const file = e.dataTransfer.files?.[0]
            if (file) handleFileEvent(file)
          }}
        >
          <p style={{ fontSize: 13, color: '#333', marginBottom: 8 }}>Drop CSV file here</p>
          <p style={{ fontSize: 10, color: '#252525' }}>or click to browse</p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileEvent(f) }} />
        </div>

        {error && <p style={{ fontSize: 11, color: '#ff3b5f', marginTop: 8 }}>{error}</p>}

        <div style={{ marginTop: 14, padding: '12px 16px', background: '#060606', border: '1px solid #141414', borderRadius: 3 }}>
          <p style={{ fontSize: 8, color: '#2a2a2a', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>
            Standard column format (pipe-separated platform)
          </p>
          <p style={{ fontSize: 9, color: '#252525', fontFamily: 'monospace', lineHeight: 1.9, wordBreak: 'break-all' }}>
            post_id, title, platform (ig|tt|yt), date, pillar, hook_type, format, decision*, views_24h, likes_24h, comments_24h, shares_24h, saves_24h, watch_pct_24h, skip_rate_24h, followers_24h, views_3d … watch_pct_3d, views_7d … watch_pct_7d, eom_views … eom_followers
          </p>
          <p style={{ fontSize: 8, color: '#252525', marginTop: 6 }}>* decision column is always ignored — auto-calculated from ER%</p>
        </div>
      </div>
    )
  }

  // ── Checking stage ────────────────────────────────────────────────────────────
  if (stage === 'checking') {
    return (
      <div style={{ padding: '48px 32px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#444' }}>Checking for duplicates…</p>
      </div>
    )
  }

  // ── Preview stage ─────────────────────────────────────────────────────────────
  if (stage === 'preview') {
    const toImport  = previewRows.filter(r => !skipSet.has(r.postId)).length
    const dupCount  = previewRows.filter(r => existingIds.has(r.postId)).length
    const skipCount = [...skipSet].length

    return (
      <div>
        {/* Header bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <p style={{ fontSize: 12, color: '#c9a96e', marginBottom: 3 }}>
              {previewRows.length} post{previewRows.length !== 1 ? 's' : ''} ready to review
            </p>
            <p style={{ fontSize: 9, color: '#333' }}>
              {dupCount > 0 && <span style={{ color: '#f59e0b' }}>{dupCount} duplicate{dupCount !== 1 ? 's' : ''} detected · </span>}
              {skipCount > 0 && <span style={{ color: '#555' }}>{skipCount} skipped · </span>}
              {toImport} will be imported
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reset}
              style={{ padding: '7px 14px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: 'transparent', border: '1px solid #1e1e1e', color: '#333', cursor: 'pointer', borderRadius: 3 }}>
              Cancel
            </button>
            <button onClick={handleConfirmImport} disabled={toImport === 0}
              style={{
                padding: '7px 18px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                background: toImport === 0 ? '#1a1a1a' : 'rgba(201,169,110,.12)',
                border: `1px solid ${toImport === 0 ? '#1e1e1e' : 'rgba(201,169,110,.4)'}`,
                color: toImport === 0 ? '#333' : '#c9a96e',
                cursor: toImport === 0 ? 'not-allowed' : 'pointer', borderRadius: 3,
              }}>
              Confirm Import ({toImport})
            </button>
          </div>
        </div>

        {/* Per-post preview blocks */}
        <div>
          {previewRows.map((pr, idx) => {
            const isDup  = existingIds.has(pr.postId)
            const skip   = skipSet.has(pr.postId)
            const border = isDup ? '1px solid rgba(245,158,11,.3)' : '1px solid #141414'
            const borderL = isDup ? '3px solid #f59e0b' : '3px solid #1e1e1e'
            const bg     = isDup && !skip ? 'rgba(245,158,11,.03)' : '#060606'

            return (
              <div key={pr.postId + idx} style={{
                marginBottom: 10, border, borderLeft: borderL,
                background: bg, borderRadius: 4,
                opacity: skip ? 0.35 : 1,
              }}>
                {/* Post header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #0e0e0e', flexWrap: 'wrap' }}>
                  {isDup && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={skip}
                        onChange={() => toggleSkip(pr.postId)}
                        style={{ accentColor: '#f59e0b' }}
                      />
                      <span style={{ fontSize: 8, color: '#f59e0b', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                        Skip
                      </span>
                    </label>
                  )}
                  <span style={{ fontSize: 10, color: '#c9a96e', fontFamily: 'monospace', flexShrink: 0 }}>{pr.postId}</span>
                  <span style={{ fontSize: 12, color: '#f2ede4', flex: 1, minWidth: 120 }}>{pr.title}</span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {pr.platforms.map(p => <PlatBadge key={p} platform={p} />)}
                  </div>
                  <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>{pr.date}</span>
                  {pr.pillar && <span style={{ fontSize: 9, color: '#444', flexShrink: 0 }}>{pr.pillar}</span>}
                  {pr.format && <span style={{ fontSize: 9, color: '#333', flexShrink: 0 }}>{pr.format}</span>}

                  {/* Window presence badges */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {(['w24', 'w3', 'w7', 'eom'] as const).map(wk => {
                      const has = pr.filledWindows.some(fw => fw.key === wk)
                      const col = WIN_COLOR[wk]
                      return (
                        <span key={wk} style={{
                          fontSize: 7, padding: '2px 5px', borderRadius: 2, fontWeight: 600, letterSpacing: '.08em',
                          background: has ? `${col}18` : 'transparent',
                          border: `1px solid ${has ? col + '40' : '#1a1a1a'}`,
                          color: has ? col : '#2a2a2a',
                        }}>
                          {wk === 'w24' ? '24h' : wk === 'w3' ? '3d' : wk === 'w7' ? '7d' : 'EOM'}
                        </span>
                      )
                    })}
                  </div>

                  {isDup && !skip && (
                    <span style={{ fontSize: 8, color: '#f59e0b', letterSpacing: '.08em', flexShrink: 0 }}>
                      exists — will update
                    </span>
                  )}
                </div>

                {/* Window metrics sub-table */}
                {pr.filledWindows.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                      <thead>
                        <tr style={{ background: '#040404' }}>
                          {['Window','Views','Likes','Cmts','Shares','Saves','Watch%','Skip%','Followers','ER%','Decision'].map(h => (
                            <th key={h} style={{ textAlign: 'right', padding: '5px 10px', fontSize: 7, letterSpacing: '.12em', textTransform: 'uppercase', color: '#222', whiteSpace: 'nowrap', fontWeight: 600 }}>
                              {h === 'Window' ? <span style={{ textAlign: 'left', display: 'block' }}>{h}</span> : h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pr.filledWindows.map(fw => {
                          const col     = WIN_COLOR[fw.key]
                          const dColor  = DECISION_COLOR[fw.decision] ?? '#555'
                          return (
                            <tr key={fw.key} style={{ borderTop: '1px solid #0a0a0a' }}>
                              <td style={{ padding: '7px 10px' }}>
                                <span style={{ fontSize: 9, fontWeight: 600, color: col, letterSpacing: '.08em' }}>{fw.label}</span>
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: '#ccc', fontFamily: 'monospace' }}>{fw.metrics.views.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: '#888', fontFamily: 'monospace' }}>{fw.metrics.likes.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: '#888', fontFamily: 'monospace' }}>{fw.metrics.comments.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: '#888', fontFamily: 'monospace' }}>{fw.metrics.shares.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: '#888', fontFamily: 'monospace' }}>{fw.metrics.saves.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: '#666', fontFamily: 'monospace' }}>{fw.metrics.watch_pct > 0 ? fw.metrics.watch_pct.toFixed(1) + '%' : '—'}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{fw.metrics.skip_rate != null && fw.metrics.skip_rate > 0 ? fw.metrics.skip_rate.toFixed(1) + '%' : '—'}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{fw.metrics.followers > 0 ? fw.metrics.followers.toLocaleString() : '—'}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: '#aaa', fontFamily: 'monospace', fontWeight: 600 }}>{fw.er.toFixed(2)}%</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                                <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '.08em', color: dColor, padding: '2px 6px', borderRadius: 2, background: `${dColor}12`, border: `1px solid ${dColor}30` }}>
                                  {fw.decision}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {pr.filledWindows.length === 0 && (
                  <p style={{ fontSize: 9, color: '#2a2a2a', padding: '10px 16px' }}>No metric windows detected — post will be created without analytics</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer confirm bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid #141414' }}>
          <button onClick={reset}
            style={{ padding: '9px 18px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: 'transparent', border: '1px solid #1e1e1e', color: '#333', cursor: 'pointer', borderRadius: 3 }}>
            Cancel
          </button>
          <button onClick={handleConfirmImport} disabled={toImport === 0}
            style={{
              padding: '9px 22px', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase',
              background: toImport === 0 ? '#1a1a1a' : 'rgba(201,169,110,.12)',
              border: `1px solid ${toImport === 0 ? '#1e1e1e' : 'rgba(201,169,110,.4)'}`,
              color: toImport === 0 ? '#333' : '#c9a96e',
              cursor: toImport === 0 ? 'not-allowed' : 'pointer', borderRadius: 3, fontWeight: 600,
            }}>
            Confirm Import ({toImport} post{toImport !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    )
  }

  // ── Importing stage ───────────────────────────────────────────────────────────
  if (stage === 'importing') {
    return (
      <div style={{ padding: '48px 32px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#444' }}>Importing…</p>
      </div>
    )
  }

  // ── Done stage ────────────────────────────────────────────────────────────────
  const hasErrors = (result?.failed ?? 0) > 0
  return (
    <div style={{
      padding: '32px', background: '#0a0a0a', borderRadius: 4,
      border: `1px solid ${hasErrors ? 'rgba(255,59,95,.2)' : 'rgba(57,255,136,.2)'}`,
      borderLeft: `3px solid ${hasErrors ? '#ff3b5f' : '#39ff88'}`,
    }}>
      <p style={{ fontSize: 15, color: hasErrors ? '#ff3b5f' : '#39ff88', marginBottom: 12, fontWeight: 400 }}>
        Import complete
      </p>
      <div style={{ display: 'flex', gap: 28, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Posts imported',     value: result?.imported        ?? 0, color: '#39ff88' },
          { label: 'Posts updated',      value: result?.updated         ?? 0, color: '#4cc9ff' },
          { label: 'Pipeline items',     value: result?.pipelineCreated ?? 0, color: '#c9a96e' },
          { label: 'Calendar events',    value: result?.calendarCreated ?? 0, color: '#a78bfa' },
          ...(hasErrors ? [{ label: 'Failed', value: result?.failed ?? 0, color: '#ff3b5f' }] : []),
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 22, color, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 300, margin: 0 }}>{value}</p>
            <p style={{ fontSize: 8, color: '#444', letterSpacing: '.14em', textTransform: 'uppercase', margin: '3px 0 0' }}>{label}</p>
          </div>
        ))}
      </div>
      {result?.errors.slice(0, 5).map((e, i) => (
        <p key={i} style={{ fontSize: 10, color: '#ff3b5f', marginBottom: 3 }}>{e}</p>
      ))}
      <button onClick={reset}
        style={{ marginTop: 16, padding: '7px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: 'transparent', border: '1px solid #1e1e1e', color: '#333', cursor: 'pointer', borderRadius: 3 }}>
        Import Another CSV
      </button>
    </div>
  )
}

// ── Main StudioClient ─────────────────────────────────────────────────────────

export function StudioClient({ items, nextPostId }: { items: StudioItem[]; nextPostId: string }) {
  const [tab, setTab] = useState<StudioTab>('scripts')
  const [importMode, setImportMode] = useState<ImportMode>('new')
  const [importKey, setImportKey] = useState(0) // reset form after success

  const scripted   = items.filter(i => i.status === 'SCRIPTED')
  const production = items.filter(i => i.status === 'FILMING' || i.status === 'REVIEWING')
  const planned    = items.filter(i => i.status === 'PLANNED')

  const statusCounts = {
    PLANNED:   items.filter(i => i.status === 'PLANNED').length,
    SCRIPTED:  scripted.length,
    FILMING:   items.filter(i => i.status === 'FILMING').length,
    REVIEWING: items.filter(i => i.status === 'REVIEWING').length,
    POSTED:    items.filter(i => i.status === 'POSTED').length,
  }

  const tabs: { key: StudioTab; label: string; count?: number }[] = [
    { key: 'scripts',    label: 'Scripts',    count: scripted.length   },
    { key: 'production', label: 'Production', count: production.length },
    { key: 'planned',    label: 'Planned',    count: planned.length    },
    { key: 'import',     label: '+ Import'                             },
  ]

  const tabStyle = (active: boolean, accent = false): React.CSSProperties => ({
    padding: '10px 18px', fontSize: 9,
    fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase',
    background: active ? (accent ? 'rgba(201,169,110,.12)' : 'rgba(201,169,110,.08)') : 'transparent',
    color: active ? '#c9a96e' : '#3a3a3a',
    border: `1px solid ${active ? (accent ? 'rgba(201,169,110,.4)' : 'rgba(201,169,110,.3)') : '#1e1e1e'}`,
    borderRadius: 4, cursor: 'pointer', transition: 'all .15s',
  })

  return (
    <div>
      {/* Phase funnel */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 32,
        background: '#0a0a0a', border: '1px solid #141414',
        borderRadius: 6, padding: '20px 24px',
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        {Object.entries(statusCounts).map(([status, count], i, arr) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div style={{ textAlign: 'center', padding: '0 10px' }}>
              <p style={{ fontSize: 16, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, margin: 0, color: STATUS_COLOR[status] ?? '#555' }}>
                {count}
              </p>
              <p style={{ fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#333', margin: '2px 0 0' }}>
                {status}
              </p>
            </div>
            {i < arr.length - 1 && <span style={{ color: '#1e1e1e', fontSize: 14, margin: '0 2px' }}>→</span>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key, t.key === 'import')}>
            {t.label}
            {t.count !== undefined && (
              <span style={{
                marginLeft: 6, fontSize: 8, padding: '1px 5px', borderRadius: 8,
                background: tab === t.key ? 'rgba(201,169,110,.15)' : '#141414',
                color: tab === t.key ? '#c9a96e' : '#444',
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'scripts' && (
        <div>
          {scripted.length === 0 ? (
            <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 11, color: '#333' }}>No scripts awaiting review.</p>
          ) : (
            scripted.sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9)).map(item => <ScriptCard key={item.id} item={item} />)
          )}
        </div>
      )}

      {tab === 'production' && (
        <div>
          {production.length === 0 ? (
            <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 11, color: '#333' }}>Nothing in production right now.</p>
          ) : (
            <>
              {items.filter(i => i.status === 'FILMING').length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 10 }}>Filming</p>
                  {items.filter(i => i.status === 'FILMING').sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9)).map(item => <ProductionRow key={item.id} item={item} />)}
                </div>
              )}
              {items.filter(i => i.status === 'REVIEWING').length > 0 && (
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 10 }}>Reviewing</p>
                  {items.filter(i => i.status === 'REVIEWING').sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9)).map(item => <ProductionRow key={item.id} item={item} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'planned' && (
        <div>
          {planned.length === 0 ? (
            <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 11, color: '#333' }}>No planned items.</p>
          ) : (
            planned.sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9)).map(item => <ProductionRow key={item.id} item={item} />)
          )}
        </div>
      )}

      {tab === 'import' && (
        <div>
          {/* Import mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
            {(['new', 'csv'] as ImportMode[]).map(m => (
              <button
                key={m}
                onClick={() => setImportMode(m)}
                style={{
                  padding: '8px 20px', fontSize: 9,
                  fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase',
                  background: importMode === m ? 'rgba(201,169,110,.1)' : 'transparent',
                  color: importMode === m ? '#c9a96e' : '#3a3a3a',
                  border: `1px solid ${importMode === m ? 'rgba(201,169,110,.35)' : '#141414'}`,
                  borderRadius: 3, cursor: 'pointer',
                }}
              >
                {m === 'new' ? 'New Post' : 'CSV Import'}
              </button>
            ))}
          </div>

          {importMode === 'new' && (
            <NewPostForm
              key={importKey}
              nextPostId={nextPostId}
              onSuccess={() => setImportKey(k => k + 1)}
            />
          )}
          {importMode === 'csv' && (
            <CSVImporter nextPostId={nextPostId} />
          )}
        </div>
      )}
    </div>
  )
}
