'use client'

import { useState, useRef } from 'react'
import { createPost, importPostsBatch } from '@/app/(dashboard)/studio/actions'
import type { NewPostData, WindowMetrics } from '@/app/(dashboard)/studio/actions'

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

type WindowState = Record<keyof WindowMetrics, string>

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

function autoMap(headers: string[]): Record<string, string> {
  const lower = headers.map(h => h.toLowerCase().replace(/[\s_-]/g, ''))
  const find = (...terms: string[]) => {
    for (const term of terms) {
      const i = lower.findIndex(h => h.includes(term))
      if (i >= 0) return headers[i]
    }
    return ''
  }
  return {
    post_id:  find('postid', 'post_id', '#id', 'id'),
    title:    find('title', 'name'),
    date:     find('date', 'posted'),
    platform: find('platform', 'plat'),
    pillar:   find('pillar', 'content'),
    hook:     find('hook', 'hooktype'),
    format:   find('format'),
    decision: find('decision', 'verdict'),
    cta:      find('cta', 'calltoaction'),
    views:    find('views', 'reach', 'eoмviews', 'eomviews'),
    likes:    find('likes', 'eomlikes'),
    comments: find('comments', 'eomcomments'),
    shares:   find('shares', 'eomshares'),
    saves:    find('saves', 'eomsaves'),
    watch_pct:find('watch', 'watchpct', 'watchrate'),
    followers:find('followers', 'followergain'),
  }
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
  const [decision,  setDecision ] = useState('Iterate')
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
                value={windows[activeWin][key]}
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

const APP_FIELDS = [
  { key: 'post_id',   label: 'Post ID',    required: false },
  { key: 'title',     label: 'Title',       required: true  },
  { key: 'date',      label: 'Date',        required: true  },
  { key: 'platform',  label: 'Platform',    required: true  },
  { key: 'pillar',    label: 'Pillar',      required: false },
  { key: 'hook',      label: 'Hook Type',   required: false },
  { key: 'format',    label: 'Format',      required: false },
  { key: 'decision',  label: 'Decision',    required: false },
  { key: 'cta',       label: 'CTA',         required: false },
  { key: 'views',     label: 'Views (EOM)', required: false },
  { key: 'likes',     label: 'Likes',       required: false },
  { key: 'comments',  label: 'Comments',    required: false },
  { key: 'shares',    label: 'Shares',      required: false },
  { key: 'saves',     label: 'Saves',       required: false },
  { key: 'watch_pct', label: 'Watch%',      required: false },
  { key: 'followers', label: 'Followers',   required: false },
]

function CSVImporter({ nextPostId }: { nextPostId: string }) {
  const [headers,   setHeaders  ] = useState<string[]>([])
  const [rows,      setRows     ] = useState<Record<string, string>[]>([])
  const [mapping,   setMapping  ] = useState<Record<string, string>>({})
  const [stage,     setStage    ] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [importing, setImporting] = useState(false)
  const [result,    setResult   ] = useState<{ imported: number; failed: number; errors: string[] } | null>(null)
  const [error,     setError    ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)
      if (h.length === 0) { setError('Could not parse CSV — check the file format'); return }
      setHeaders(h)
      setRows(r)
      setMapping(autoMap(h))
      setStage('map')
      setError('')
    }
    reader.readAsText(file)
  }

  function buildPostsFromRows(): NewPostData[] {
    const m = mapping
    const nextNum = parseInt(nextPostId.match(/(\d+)/)?.[1] ?? '0')
    return rows.map((row, idx) => {
      const rawPlatform = row[m.platform] ?? 'ig'
      const platforms = rawPlatform.split(/[,/]/).map(p => p.trim().toLowerCase()).filter(Boolean)
      const postId = row[m.post_id]?.trim() || `#ig${String(nextNum + idx).padStart(4, '0')}`
      return {
        postId,
        title:    row[m.title]    ?? '',
        date:     row[m.date]     ?? '',
        platform: platforms.length > 0 ? platforms : ['ig'],
        pillar:   row[m.pillar]   ?? '',
        hook:     row[m.hook]     ?? '',
        format:   row[m.format]   ?? '',
        decision: row[m.decision] ?? 'Iterate',
        cta:      row[m.cta]      ?? '',
        windows: {
          eom: {
            views:     parseNum(row[m.views]     ?? ''),
            likes:     parseNum(row[m.likes]     ?? ''),
            comments:  parseNum(row[m.comments]  ?? ''),
            shares:    parseNum(row[m.shares]    ?? ''),
            saves:     parseNum(row[m.saves]     ?? ''),
            watch_pct: parseNum(row[m.watch_pct] ?? ''),
            followers: parseNum(row[m.followers] ?? ''),
          },
        },
      }
    })
  }

  async function handleImport() {
    setImporting(true)
    const posts = buildPostsFromRows()
    const r = await importPostsBatch(posts)
    setResult(r)
    setStage('done')
    setImporting(false)
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: 'pointer', appearance: 'none', fontSize: 11,
  }

  if (stage === 'upload') {
    return (
      <div>
        <div
          style={{
            border: '2px dashed #1e1e1e', padding: '48px 32px',
            textAlign: 'center', cursor: 'pointer',
            transition: 'border-color .2s',
          }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#c9a96e' }}
          onDragLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e' }}
          onDrop={e => {
            e.preventDefault()
            e.currentTarget.style.borderColor = '#1e1e1e'
            const file = e.dataTransfer.files?.[0]
            if (file) {
              const reader = new FileReader()
              reader.onload = ev => {
                const text = ev.target?.result as string
                const { headers: h, rows: r } = parseCSV(text)
                if (h.length === 0) { setError('Could not parse CSV'); return }
                setHeaders(h); setRows(r); setMapping(autoMap(h)); setStage('map')
              }
              reader.readAsText(file)
            }
          }}
        >
          <p style={{ fontSize: 13, color: '#333', marginBottom: 8 }}>Drop a CSV file here</p>
          <p style={{ fontSize: 10, color: '#252525' }}>or click to browse</p>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
        </div>
        {error && <p style={{ fontSize: 11, color: '#ff3b5f', marginTop: 8 }}>{error}</p>}
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#060606', border: '1px solid #141414' }}>
          <p style={{ fontSize: 9, color: '#333', marginBottom: 4, letterSpacing: '.12em', textTransform: 'uppercase' }}>Expected columns (example)</p>
          <p style={{ fontSize: 10, color: '#252525', fontFamily: 'monospace', lineHeight: 1.8 }}>
            title, date, platform, pillar, hook, format, decision, views, likes, comments, shares, saves, watch_pct, followers
          </p>
        </div>
      </div>
    )
  }

  if (stage === 'map') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: '#c9a96e' }}>{rows.length} rows · Map columns below</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setStage('upload'); setHeaders([]); setRows([]) }}
              style={{ padding: '6px 12px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: 'transparent', border: '1px solid #1e1e1e', color: '#333', cursor: 'pointer' }}>
              Back
            </button>
            <button onClick={() => setStage('preview')}
              style={{ padding: '6px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: 'rgba(201,169,110,.08)', border: '1px solid rgba(201,169,110,.3)', color: '#c9a96e', cursor: 'pointer' }}>
              Preview →
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid #141414', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
                {['App Field', 'CSV Column'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: '#2a2a2a' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {APP_FIELDS.map((field, i) => (
                <tr key={field.key} style={{ borderBottom: '1px solid #0e0e0e', background: i % 2 === 0 ? '#060606' : '#070707' }}>
                  <td style={{ padding: '8px 16px' }}>
                    <span style={{ fontSize: 11, color: field.required ? '#f2ede4' : '#555' }}>
                      {field.label}
                      {field.required && <span style={{ color: '#ff3b5f', marginLeft: 3 }}>*</span>}
                    </span>
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <select
                      style={{ ...selectStyle, maxWidth: 220 }}
                      value={mapping[field.key] ?? ''}
                      onChange={e => setMapping(m => ({ ...m, [field.key]: e.target.value }))}
                    >
                      <option value="" style={{ background: '#0a0a0a' }}>{field.required ? '— required —' : '(skip)'}</option>
                      {headers.map(h => (
                        <option key={h} value={h} style={{ background: '#0a0a0a' }}>{h}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (stage === 'preview') {
    const preview = buildPostsFromRows().slice(0, 5)
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: '#c9a96e' }}>Preview — {rows.length} posts will be imported</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStage('map')}
              style={{ padding: '6px 12px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: 'transparent', border: '1px solid #1e1e1e', color: '#333', cursor: 'pointer' }}>
              Back
            </button>
            <button onClick={handleImport} disabled={importing}
              style={{ padding: '6px 18px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: importing ? '#1a1a1a' : 'rgba(201,169,110,.12)', border: `1px solid ${importing ? '#1e1e1e' : 'rgba(201,169,110,.4)'}`, color: importing ? '#333' : '#c9a96e', cursor: importing ? 'not-allowed' : 'pointer' }}>
              {importing ? 'Importing...' : `Import All ${rows.length} Posts`}
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid #141414', overflowX: 'auto', marginBottom: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
                {['Post ID', 'Title', 'Date', 'Platform', 'Pillar', 'EOM Views'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: '#2a2a2a', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #0e0e0e', background: i % 2 === 0 ? '#060606' : '#070707' }}>
                  <td style={{ padding: '8px 14px', fontSize: 10, color: '#c9a96e', fontFamily: 'monospace' }}>{p.postId}</td>
                  <td style={{ padding: '8px 14px', fontSize: 11, color: '#f2ede4', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</td>
                  <td style={{ padding: '8px 14px', fontSize: 10, color: '#555' }}>{p.date}</td>
                  <td style={{ padding: '8px 14px' }}><div style={{ display: 'flex', gap: 3 }}>{p.platform.map(pl => <PlatBadge key={pl} platform={pl} />)}</div></td>
                  <td style={{ padding: '8px 14px', fontSize: 10, color: '#444' }}>{p.pillar || '—'}</td>
                  <td style={{ padding: '8px 14px', fontSize: 11, color: '#555' }}>{p.windows.eom?.views || '—'}</td>
                </tr>
              ))}
              {rows.length > 5 && (
                <tr style={{ background: '#060606' }}>
                  <td colSpan={6} style={{ padding: '8px 14px', fontSize: 10, color: '#2a2a2a', textAlign: 'center' }}>
                    +{rows.length - 5} more rows not shown
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // done
  return (
    <div style={{ padding: '32px', background: '#0a0a0a', border: `1px solid ${result?.failed ? 'rgba(255,59,95,.2)' : 'rgba(57,255,136,.2)'}`, borderLeft: `3px solid ${result?.failed ? '#ff3b5f' : '#39ff88'}` }}>
      <p style={{ fontSize: 14, color: result?.failed ? '#ff3b5f' : '#39ff88', marginBottom: 8 }}>
        Import complete — {result?.imported ?? 0} posts created, {result?.failed ?? 0} failed
      </p>
      {result?.errors.slice(0, 3).map((e, i) => (
        <p key={i} style={{ fontSize: 10, color: '#ff3b5f', marginBottom: 2 }}>{e}</p>
      ))}
      <button
        onClick={() => { setStage('upload'); setHeaders([]); setRows([]); setResult(null) }}
        style={{ marginTop: 16, padding: '7px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: 'transparent', border: '1px solid #1e1e1e', color: '#333', cursor: 'pointer' }}
      >
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
