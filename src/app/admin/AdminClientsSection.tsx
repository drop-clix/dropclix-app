'use client'

import { useState, useTransition, useActionState, useEffect, useRef } from 'react'
import { impersonateClient, createNewClient, resendClientInvite, updateClientInfo, adminImportPosts, adminCheckExistingPostIds, deleteClient } from './actions'
import type { NewPostData } from '@/app/(dashboard)/studio/actions'
import { erToDecision } from '@/lib/decision'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClientRow = {
  id: string
  name: string
  email: string
  slug: string
  created_at: string
  monthly_retainer: number | null
  postCount: number
  lastActivity: string | null
  enabled_platforms: string[]
  enabled_tabs: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_PLATFORMS: { key: string; label: string; color: string }[] = [
  { key: 'ig', label: 'IG', color: '#c9a96e' },
  { key: 'tt', label: 'TT', color: '#a78bfa' },
  { key: 'yt', label: 'YT', color: '#4cc9ff' },
  { key: 'lf', label: 'LF', color: '#4cc9ff' },
]

const ALL_TABS: { key: string; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'angles',    label: 'Angles'    },
  { key: 'pipeline',  label: 'Pipeline'  },
  { key: 'studio',    label: 'Studio'    },
  { key: 'ads',       label: 'Ads'       },
  { key: 'calendar',  label: 'Calendar'  },
  { key: 'goals',     label: 'Goals'     },
]

const CSV_COLUMNS = [
  'post_id','title','platform','date','pillar','hook_type','format','decision',
  'views_24h','likes_24h','comments_24h','shares_24h','saves_24h','watch_pct_24h','skip_rate_24h','followers_24h',
  'views_3d','likes_3d','comments_3d','shares_3d','saves_3d','watch_pct_3d',
  'views_7d','likes_7d','comments_7d','shares_7d','saves_7d','watch_pct_7d',
  'eom_views','eom_likes','eom_comments','eom_shares','eom_saves','eom_watch_pct','eom_skip_rate','eom_followers',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function n(val: string | null | undefined): number { return parseFloat(val ?? '0') || 0 }

function buildPostFromRow(row: Record<string, string>): NewPostData {
  const platforms = (row['platform'] ?? 'ig').split('|').filter(Boolean)
  const windows: NewPostData['windows'] = {}

  const w24v = n(row['views_24h'])
  if (w24v) windows.w24 = { views: w24v, likes: n(row['likes_24h']), comments: n(row['comments_24h']), shares: n(row['shares_24h']), saves: n(row['saves_24h']), watch_pct: n(row['watch_pct_24h']), followers: n(row['followers_24h']), skip_rate: n(row['skip_rate_24h']) || undefined }
  const w3v = n(row['views_3d'])
  if (w3v) windows.w3 = { views: w3v, likes: n(row['likes_3d']), comments: n(row['comments_3d']), shares: n(row['shares_3d']), saves: n(row['saves_3d']), watch_pct: n(row['watch_pct_3d']), followers: 0 }
  const w7v = n(row['views_7d'])
  if (w7v) windows.w7 = { views: w7v, likes: n(row['likes_7d']), comments: n(row['comments_7d']), shares: n(row['shares_7d']), saves: n(row['saves_7d']), watch_pct: n(row['watch_pct_7d']), followers: 0 }
  const eomV = n(row['eom_views'])
  if (eomV) windows.eom = { views: eomV, likes: n(row['eom_likes']), comments: n(row['eom_comments']), shares: n(row['eom_shares']), saves: n(row['eom_saves']), watch_pct: n(row['eom_watch_pct']), followers: n(row['eom_followers']), skip_rate: n(row['eom_skip_rate']) || undefined }

  return {
    postId:   row['post_id']   ?? '',
    title:    row['title']     ?? '',
    platform: platforms,
    date:     row['date']      ?? '',
    pillar:   row['pillar']    ?? '',
    hook:     row['hook_type'] ?? '',
    format:   row['format']    ?? '',
    cta:      '',
    decision: '',
    windows,
  }
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map(line => {
    const vals = line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]))
  })
}

// ── Shared input styles ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0d0d0d', border: '1px solid #1e1e1e',
  color: '#f2ede4', fontSize: 13, fontWeight: 300, padding: '10px 14px',
  outline: 'none', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 9, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#666', marginBottom: 6,
}

const btnGhost: React.CSSProperties = {
  background: 'transparent', border: '1px solid #1e1e1e', color: '#555',
  fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
  fontWeight: 500, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
  transition: 'border-color 150ms, color 150ms', whiteSpace: 'nowrap',
}

const btnGold: React.CSSProperties = {
  background: 'rgba(201,169,110,.12)', border: '1px solid rgba(201,169,110,.35)',
  color: '#c9a96e', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
  fontWeight: 500, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
  transition: 'background 150ms', whiteSpace: 'nowrap',
}

const btnRed: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,59,95,.25)',
  color: '#ff3b5f', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
  fontWeight: 500, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
  transition: 'border-color 150ms, color 150ms', whiteSpace: 'nowrap',
}

// ── CheckboxGroup ─────────────────────────────────────────────────────────────

function CheckboxGroup({
  legend, name, options, selected, onChange,
}: {
  legend: string
  name: string
  options: { key: string; label: string }[]
  selected: string[]
  onChange: (keys: string[]) => void
}) {
  return (
    <div>
      <label style={labelStyle}>{legend}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => {
          const active = selected.includes(opt.key)
          return (
            <label
              key={opt.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                fontSize: 10, fontWeight: 400, color: active ? '#f2ede4' : '#555',
                background: active ? 'rgba(201,169,110,.08)' : '#0d0d0d',
                border: `1px solid ${active ? 'rgba(201,169,110,.3)' : '#1e1e1e'}`,
                padding: '5px 10px', userSelect: 'none', transition: 'all .15s',
              }}
            >
              <input
                type="checkbox"
                name={name}
                value={opt.key}
                checked={active}
                onChange={() => onChange(selected.includes(opt.key) ? selected.filter(k => k !== opt.key) : [...selected, opt.key])}
                style={{ display: 'none' }}
              />
              {opt.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

// ── Create Client Modal ───────────────────────────────────────────────────────

function CreateClientModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (name: string) => void }) {
  const [state, formAction, isPending] = useActionState(createNewClient, null)
  const [name,        setName       ] = useState('')
  const [slug,        setSlug       ] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [platforms,   setPlatforms  ] = useState<string[]>(['ig'])
  const [tabs,        setTabs       ] = useState<string[]>(ALL_TABS.map(t => t.key))
  const [copied,      setCopied     ] = useState(false)

  // Narrow state to credentials shape only when success + tempPassword present
  const creds = state && 'success' in state && state.success && 'tempPassword' in state
    ? (state as { success: true; name: string; email: string; tempPassword: string })
    : null

  function handleCopyCredentials() {
    if (!creds) return
    const text = `Portal: https://portal.drop-clix.com\nEmail: ${creds.email}\nTemporary password: ${creds.tempPassword}\n\nAsk them to log in and change their password.`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // Credentials panel — shown after successful creation
  if (creds) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#080808', border: '1px solid #1a1a1a', padding: '40px 44px', width: '100%', maxWidth: 520 }}>
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase' as const, color: '#39ff88', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'block', width: 16, height: 1, background: '#39ff88' }} />
              Client Created
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 300, color: '#f2ede4', lineHeight: 1.1, marginBottom: 6 }}>
              &ldquo;{creds.name}&rdquo; is ready.
            </h2>
            <p style={{ fontSize: 11, color: '#555', fontWeight: 300 }}>Share these credentials with your client.</p>
          </div>

          <div style={{ background: '#060606', border: '1px solid #1e1e1e', padding: '20px 24px', marginBottom: 24 }}>
            {([
              ['Portal',              'portal.drop-clix.com'],
              ['Email',               creds.email],
              ['Temporary password',  creds.tempPassword],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: '#555' }}>{label}</span>
                <span style={{ fontSize: 12, color: '#f2ede4', fontFamily: label === 'Temporary password' ? 'monospace' : 'inherit', letterSpacing: label === 'Temporary password' ? '.06em' : undefined }}>
                  {value}
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #1a1a1a', marginTop: 4, paddingTop: 12 }}>
              <p style={{ fontSize: 10, color: '#555', fontWeight: 300 }}>Ask them to log in and change their password.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleCopyCredentials} style={{ ...btnGold, flex: 1, padding: '12px 20px' }}>
              {copied ? '✓ Copied' : 'Copy Credentials'}
            </button>
            <button onClick={() => onSuccess(creds.name)} style={{ ...btnGhost, padding: '12px 20px' }}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#080808', border: '1px solid #1a1a1a', padding: '40px 44px', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
            New Client
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 300, color: '#f2ede4', lineHeight: 1.1, marginBottom: 6 }}>Create Client</h2>
          <p style={{ fontSize: 11, color: '#555', fontWeight: 300 }}>A temporary password will be generated.</p>
        </div>

        <form action={formAction}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>Client / Company Name</label>
              <input name="name" type="text" required placeholder="e.g. Sparta Solar" value={name}
                onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Login Email</label>
              <input name="email" type="email" required placeholder="client@company.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Slug <span style={{ color: '#555', textTransform: 'none', letterSpacing: 0 }}>(auto-generated)</span></label>
              <input name="slug" type="text" required placeholder="sparta-solar" value={slug}
                onChange={e => { setSlug(e.target.value); setSlugTouched(true) }}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Monthly Retainer <span style={{ color: '#555', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: 13 }}>$</span>
                <input name="retainer" type="number" min="0" step="100" placeholder="4500" style={{ ...inputStyle, paddingLeft: 26 }} />
              </div>
            </div>
            <CheckboxGroup legend="Enabled Platforms" name="platforms" options={ALL_PLATFORMS} selected={platforms} onChange={setPlatforms} />
            <CheckboxGroup legend="Enabled Tabs" name="tabs" options={ALL_TABS} selected={tabs} onChange={setTabs} />

            {state && 'error' in state && state.error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,59,95,.08)', border: '1px solid rgba(255,59,95,.2)', color: '#ff3b5f', fontSize: 11, fontWeight: 300 }}>
                {state.error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
              <button type="submit" disabled={isPending} style={{ ...btnGold, flex: 1, padding: '12px 20px', opacity: isPending ? 0.7 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}>
                {isPending ? 'Creating…' : 'Create Client →'}
              </button>
              <button type="button" onClick={onClose} style={{ ...btnGhost, padding: '12px 20px' }}>Cancel</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit Client Modal ─────────────────────────────────────────────────────────

function EditClientModal({ client, onClose }: { client: ClientRow; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(updateClientInfo, null)
  const [platforms, setPlatforms] = useState<string[]>(client.enabled_platforms)
  const [tabs,      setTabs     ] = useState<string[]>(client.enabled_tabs)

  useEffect(() => { if (state?.success) onClose() }, [state, onClose])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#080808', border: '1px solid #1a1a1a', padding: '40px 44px', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
            Edit Client
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 300, color: '#f2ede4', lineHeight: 1.1, marginBottom: 4 }}>{client.name}</h2>
          <p style={{ fontSize: 11, color: '#555', fontWeight: 300 }}>{client.email}</p>
        </div>

        <form action={formAction}>
          <input type="hidden" name="id" value={client.id} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>Client / Company Name</label>
              <input name="name" type="text" required defaultValue={client.name} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Slug</label>
              <input name="slug" type="text" required defaultValue={client.slug} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Monthly Retainer</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: 13 }}>$</span>
                <input name="retainer" type="number" min="0" step="100" defaultValue={client.monthly_retainer ?? ''} style={{ ...inputStyle, paddingLeft: 26 }} />
              </div>
            </div>
            <CheckboxGroup legend="Enabled Platforms" name="platforms" options={ALL_PLATFORMS} selected={platforms} onChange={setPlatforms} />
            <CheckboxGroup legend="Enabled Tabs" name="tabs" options={ALL_TABS} selected={tabs} onChange={setTabs} />

            {state?.error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,59,95,.08)', border: '1px solid rgba(255,59,95,.2)', color: '#ff3b5f', fontSize: 11, fontWeight: 300 }}>
                {state.error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
              <button type="submit" disabled={isPending} style={{ ...btnGold, flex: 1, padding: '12px 20px', opacity: isPending ? 0.7 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}>
                {isPending ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" onClick={onClose} style={{ ...btnGhost, padding: '12px 20px' }}>Cancel</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Admin Import Modal ────────────────────────────────────────────────────────

type ImportStage = 'upload' | 'preview' | 'importing' | 'done'

function AdminImportModal({ client, onClose }: { client: ClientRow; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage,     setStage    ] = useState<ImportStage>('upload')
  const [posts,     setPosts    ] = useState<NewPostData[]>([])
  const [existing,  setExisting ] = useState<Set<string>>(new Set())
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set())
  const [result,    setResult   ] = useState<{ imported: number; updated: number; failed: number; errors: string[] } | null>(null)
  const [error,     setError    ] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length === 0) { setError('No data rows found in CSV.'); return }
    const built = parsed.map(buildPostFromRow).filter(p => p.postId && p.title)
    if (built.length === 0) { setError('No valid posts found. Check CSV format.'); return }
    setPosts(built)
    const ids = built.map(p => p.postId)
    const ex = await adminCheckExistingPostIds(client.id, ids)
    setExisting(new Set(ex))
    setStage('preview')
  }

  async function handleImport() {
    setStage('importing')
    const skipIds: string[]      = []
    const overwriteIds: string[] = []
    for (const p of posts) {
      if (existing.has(p.postId)) {
        overwrite.has(p.postId) ? overwriteIds.push(p.postId) : skipIds.push(p.postId)
      }
    }
    const res = await adminImportPosts(client.id, posts, { skipIds, overwriteIds })
    if ('error' in res && res.error) { setError(res.error); setStage('preview'); return }
    setResult({ imported: res.imported, updated: res.updated, failed: res.failed, errors: res.errors })
    setStage('done')
  }

  const newCount      = posts.filter(p => !existing.has(p.postId)).length
  const existingCount = posts.filter(p =>  existing.has(p.postId)).length

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 24px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#080808', border: '1px solid #1a1a1a', padding: '36px 40px', width: '100%', maxWidth: 880 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'block', width: 16, height: 1, background: '#c9a96e' }} />
              Import Data
            </p>
            <h2 style={{ fontSize: 20, fontWeight: 300, color: '#f2ede4' }}>Import for {client.name}</h2>
          </div>
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(255,59,95,.08)', border: '1px solid rgba(255,59,95,.2)', color: '#ff3b5f', fontSize: 11 }}>
            {error}
          </div>
        )}

        {stage === 'upload' && (
          <div>
            <p style={{ fontSize: 11, color: '#666', fontWeight: 300, marginBottom: 20 }}>
              Upload a CSV using the standard Drop CLIX format (36 columns). Post IDs are checked against existing data.
            </p>
            <div
              style={{ border: '2px dashed #1e1e1e', padding: '48px 32px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201,169,110,.4)' }}
              onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1e1e1e' }}
              onDrop={async e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) await handleFile(f) }}
            >
              <p style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>Drop CSV here or click to browse</p>
              <p style={{ fontSize: 9, color: '#555', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                {CSV_COLUMNS.slice(0, 8).join(', ')}…
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFile(f) }} />
          </div>
        )}

        {stage === 'preview' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <span style={{ fontSize: 11, color: '#39ff88' }}>{newCount} new</span>
              {existingCount > 0 && <span style={{ fontSize: 11, color: '#c9a96e' }}>{existingCount} already exist</span>}
              <span style={{ fontSize: 11, color: '#555' }}>{posts.length} total rows</span>
            </div>
            {existingCount > 0 && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(201,169,110,.04)', border: '1px solid rgba(201,169,110,.15)', fontSize: 10, color: '#888' }}>
                Existing posts: check to overwrite, leave unchecked to skip.
              </div>
            )}
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#555', fontWeight: 500, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase' }}>OW</th>
                    {['ID','Title','Platform','Date','Pillar','Hook','EOM Views','Decision'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#555', fontWeight: 500, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p, i) => {
                    const isExisting  = existing.has(p.postId)
                    const isOverwrite = overwrite.has(p.postId)
                    const eomViews    = p.windows?.eom?.views ?? 0
                    const decision    = erToDecision(eomViews > 0 ? ((p.windows?.eom?.likes ?? 0) + (p.windows?.eom?.comments ?? 0) + (p.windows?.eom?.shares ?? 0) + (p.windows?.eom?.saves ?? 0)) / eomViews * 100 : 0)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #0d0d0d', opacity: isExisting && !isOverwrite ? 0.4 : 1 }}>
                        <td style={{ padding: '5px 8px' }}>
                          {isExisting ? (
                            <input type="checkbox" checked={isOverwrite} onChange={() => setOverwrite(prev => { const next = new Set(prev); next.has(p.postId) ? next.delete(p.postId) : next.add(p.postId); return next })} style={{ accentColor: '#c9a96e' }} />
                          ) : (
                            <span style={{ color: '#39ff88', fontSize: 8 }}>NEW</span>
                          )}
                        </td>
                        <td style={{ padding: '5px 8px', color: '#888', fontFamily: 'monospace' }}>{p.postId}</td>
                        <td style={{ padding: '5px 8px', color: '#f2ede4', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</td>
                        <td style={{ padding: '5px 8px', color: '#555' }}>{p.platform.join(', ')}</td>
                        <td style={{ padding: '5px 8px', color: '#555' }}>{p.date}</td>
                        <td style={{ padding: '5px 8px', color: '#555' }}>{p.pillar || '—'}</td>
                        <td style={{ padding: '5px 8px', color: '#555' }}>{p.hook || '—'}</td>
                        <td style={{ padding: '5px 8px', color: '#c9a96e' }}>{eomViews > 0 ? eomViews.toLocaleString() : '—'}</td>
                        <td style={{ padding: '5px 8px', color: decision === 'Double Down' ? '#39ff88' : decision === 'Kill' ? '#ff3b5f' : '#888', fontSize: 9 }}>{decision || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleImport} style={{ ...btnGold, flex: 1, padding: '12px 20px' }}>
                Import {newCount + overwrite.size} Posts →
              </button>
              <button onClick={() => { setStage('upload'); setPosts([]) }} style={{ ...btnGhost, padding: '12px 20px' }}>← Back</button>
            </div>
          </div>
        )}

        {stage === 'importing' && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ fontSize: 13, color: '#c9a96e', fontWeight: 300 }}>Importing…</p>
            <p style={{ fontSize: 10, color: '#555', marginTop: 8 }}>This may take a moment.</p>
          </div>
        )}

        {stage === 'done' && result && (
          <div>
            <div style={{ padding: '20px 24px', background: 'rgba(57,255,136,.04)', border: '1px solid rgba(57,255,136,.15)', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#39ff88', fontWeight: 300, marginBottom: 12 }}>Import complete</p>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                {[{ label: 'Imported', val: result.imported, color: '#39ff88' }, { label: 'Updated', val: result.updated, color: '#c9a96e' }, { label: 'Failed', val: result.failed, color: '#ff3b5f' }].map(({ label, val, color }) => (
                  <div key={label}>
                    <p style={{ fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555', marginBottom: 2 }}>{label}</p>
                    <p style={{ fontSize: 20, fontWeight: 300, color }}>{val}</p>
                  </div>
                ))}
              </div>
            </div>
            {result.errors.length > 0 && (
              <div style={{ padding: '12px 16px', background: 'rgba(255,59,95,.06)', border: '1px solid rgba(255,59,95,.15)', marginBottom: 20 }}>
                <p style={{ fontSize: 9, color: '#ff3b5f', marginBottom: 6, letterSpacing: '.1em', textTransform: 'uppercase' }}>Errors</p>
                {result.errors.map((e, i) => <p key={i} style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>{e}</p>)}
              </div>
            )}
            <button onClick={onClose} style={{ ...btnGold, padding: '12px 20px' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Reset Password Button ─────────────────────────────────────────────────────

function ResendButton({ email }: { email: string }) {
  const [state, formAction, isPending] = useActionState(resendClientInvite, null)
  const [copied,    setCopied   ] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const tempPassword = state && 'tempPassword' in state ? (state as { tempPassword: string }).tempPassword : null

  function handleCopyCredentials() {
    if (!tempPassword) return
    const text = `Portal: https://portal.drop-clix.com\nEmail: ${email}\nTemporary password: ${tempPassword}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // Credentials modal — shown after successful reset
  if (tempPassword && !dismissed) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#080808', border: '1px solid #1a1a1a', padding: '40px 44px', width: '100%', maxWidth: 520 }}>
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase' as const, color: '#39ff88', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'block', width: 16, height: 1, background: '#39ff88' }} />
              Password Reset
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 300, color: '#f2ede4', lineHeight: 1.1, marginBottom: 6 }}>
              Credentials ready to share.
            </h2>
            <p style={{ fontSize: 11, color: '#555', fontWeight: 300 }}>Share these credentials with your client.</p>
          </div>

          <div style={{ background: '#060606', border: '1px solid #1e1e1e', padding: '20px 24px', marginBottom: 24 }}>
            {([
              ['Portal',             'portal.drop-clix.com'],
              ['Email',              email],
              ['Temporary password', tempPassword],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: '#555' }}>{label}</span>
                <span style={{ fontSize: 12, color: '#f2ede4', fontFamily: label === 'Temporary password' ? 'monospace' : 'inherit', letterSpacing: label === 'Temporary password' ? '.06em' : undefined }}>
                  {value}
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #1a1a1a', marginTop: 4, paddingTop: 12 }}>
              <p style={{ fontSize: 10, color: '#555', fontWeight: 300 }}>Ask them to log in and change their password.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleCopyCredentials} style={{ ...btnGold, flex: 1, padding: '12px 20px' }}>
              {copied ? '✓ Copied' : 'Copy Credentials'}
            </button>
            <button onClick={() => setDismissed(true)} style={{ ...btnGhost, padding: '12px 20px' }}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} style={{ display: 'inline' }}>
      <input type="hidden" name="email" value={email} />
      <button
        type="submit" disabled={isPending} title="Reset client password"
        style={{
          ...btnGhost,
          color: state && 'error' in state ? '#ff3b5f' : '#555',
          borderColor: state && 'error' in state ? 'rgba(255,59,95,.25)' : '#1e1e1e',
          opacity: isPending ? 0.6 : 1,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending ? 'Resetting…' : state && 'error' in state ? 'Error' : 'Reset PW'}
      </button>
    </form>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({ client, onClose, onDeleted }: { client: ClientRow; onClose: () => void; onDeleted: () => void }) {
  const [isPending, setIsPending] = useState(false)
  const [error,     setError    ] = useState<string | null>(null)

  async function handleDelete() {
    setIsPending(true)
    setError(null)
    const res = await deleteClient(client.id, client.name)
    setIsPending(false)
    if (res.error) { setError(res.error); return }
    onDeleted()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#080808', border: '1px solid rgba(255,59,95,.2)', padding: '40px 44px', width: '100%', maxWidth: 480 }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase' as const, color: '#ff3b5f', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'block', width: 16, height: 1, background: '#ff3b5f' }} />
            Permanent Action
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 300, color: '#f2ede4', lineHeight: 1.1, marginBottom: 6 }}>
            Delete {client.name}?
          </h2>
          <p style={{ fontSize: 11, color: '#555', fontWeight: 300, lineHeight: 1.7 }}>
            This will permanently delete all their data including pipeline, analytics, posts, and their login account. This cannot be undone.
          </p>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 20, background: 'rgba(255,59,95,.08)', border: '1px solid rgba(255,59,95,.2)', color: '#ff3b5f', fontSize: 11 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleDelete}
            disabled={isPending}
            style={{ ...btnRed, flex: 1, padding: '12px 20px', opacity: isPending ? 0.6 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}
          >
            {isPending ? 'Deleting…' : 'Delete permanently'}
          </button>
          <button onClick={onClose} style={{ ...btnGhost, padding: '12px 20px' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Client Card ───────────────────────────────────────────────────────────────

function ClientCard({
  client,
  onEdit,
  onImport,
  onDelete,
}: {
  client: ClientRow
  onEdit: () => void
  onImport: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const isActive = client.postCount > 0
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesShared, setNotesShared] = useState(false)
  const [notesLoaded, setNotesLoaded] = useState(false)

  useEffect(() => {
    if (notesOpen && !notesLoaded) {
      import('@/app/(dashboard)/edit-actions').then(mod => {
        mod.getClientNotes(client.id).then(res => {
          if (!res.error) {
            setNotes(res.content ?? '')
            setNotesShared(res.shared ?? false)
            setNotesLoaded(true)
          }
        })
      })
    }
  }, [notesOpen, notesLoaded, client.id])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#0c0c0c',
        border: `1px solid ${hovered ? 'rgba(201,169,110,0.18)' : 'rgba(255,255,255,0.05)'}`,
        padding: '28px 32px',
        transition: 'border-color 200ms ease',
      }}
    >
      {/* Top row: name + platform badges + status */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 300, color: '#f2ede4', lineHeight: 1 }}>{client.name}</span>
          {/* Platform badges */}
          <div style={{ display: 'flex', gap: 4 }}>
            {client.enabled_platforms.map(p => {
              const cfg = ALL_PLATFORMS.find(x => x.key === p)
              if (!cfg) return null
              return (
                <span key={p} style={{ fontSize: 7, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.color}28`, padding: '3px 7px' }}>
                  {cfg.label}
                </span>
              )
            })}
          </div>
        </div>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: isActive ? '#39ff88' : '#c9a96e' }} />
          <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: isActive ? '#39ff88' : '#c9a96e' }}>
            {isActive ? 'Active' : 'Invited'}
          </span>
        </div>
      </div>

      {/* Email */}
      <p style={{ fontSize: 11, color: '#666', fontWeight: 300, marginBottom: 20 }}>{client.email}</p>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', marginBottom: 20 }} />

      {/* Stats + actions row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 7, letterSpacing: '.12em', textTransform: 'uppercase', color: '#555', marginBottom: 3 }}>Posts</p>
            <p style={{ fontSize: 12, color: client.postCount > 0 ? '#f2ede4' : '#555', fontWeight: 300 }}>{client.postCount}</p>
          </div>
          {client.lastActivity && (
            <div>
              <p style={{ fontSize: 7, letterSpacing: '.12em', textTransform: 'uppercase', color: '#555', marginBottom: 3 }}>Last Post</p>
              <p style={{ fontSize: 12, color: '#555', fontWeight: 300 }}>{fmtDate(client.lastActivity)}</p>
            </div>
          )}
          <div>
            <p style={{ fontSize: 7, letterSpacing: '.12em', textTransform: 'uppercase', color: '#555', marginBottom: 3 }}>Member Since</p>
            <p style={{ fontSize: 12, color: '#555', fontWeight: 300 }}>{fmtDate(client.created_at)}</p>
          </div>
          {client.monthly_retainer && (
            <div>
              <p style={{ fontSize: 7, letterSpacing: '.12em', textTransform: 'uppercase', color: '#555', marginBottom: 3 }}>Retainer</p>
              <p style={{ fontSize: 12, color: '#c9a96e', fontWeight: 300 }}>${client.monthly_retainer.toLocaleString()}/mo</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={onImport} style={btnGhost}>Import</button>
          <ResendButton email={client.email} />
          <button onClick={onEdit} style={btnGhost}>Edit</button>
          <button onClick={onDelete} style={btnRed}>Delete</button>
          <button onClick={() => setNotesOpen(o => !o)} style={{
            ...btnGhost,
            color: notesOpen ? '#c9a96e' : btnGhost.color,
            borderColor: notesOpen ? 'rgba(201,169,110,.3)' : btnGhost.borderColor,
          }}>Notes</button>
          <form action={impersonateClient}>
            <input type="hidden" name="clientId" value={client.id} />
            <button type="submit" style={btnGold}>View Portal →</button>
          </form>
        </div>
      </div>

      {notesOpen && notesLoaded && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: '#555' }}>Client Notes</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: '#666', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notesShared}
                onChange={e => {
                  const shared = e.target.checked
                  setNotesShared(shared)
                  import('@/app/(dashboard)/edit-actions').then(mod => {
                    mod.saveClientNotes(notes, shared, client.id)
                  })
                }}
                style={{ accentColor: '#c9a96e' }}
              />
              Share with client
            </label>
          </div>
          <textarea
            value={notes}
            onChange={e => {
              setNotes(e.target.value)
            }}
            onBlur={() => {
              import('@/app/(dashboard)/edit-actions').then(mod => {
                mod.saveClientNotes(notes, notesShared, client.id)
              })
            }}
            placeholder="Internal notes about this client..."
            style={{
              width: '100%', minHeight: 80, resize: 'vertical',
              background: '#111', border: '1px solid #1e1e1e', borderRadius: 4,
              padding: '10px 12px', fontSize: 11, lineHeight: 1.6,
              color: '#f2ede4', fontFamily: 'DM Sans, sans-serif',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Main: AdminClientsSection ─────────────────────────────────────────────────

export function AdminClientsSection({ clients }: { clients: ClientRow[] }) {
  const [showCreate,   setShowCreate  ] = useState(false)
  const [editClient,   setEditClient  ] = useState<ClientRow | null>(null)
  const [importClient, setImportClient] = useState<ClientRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null)
  const [deletedIds,   setDeletedIds  ] = useState<Set<string>>(new Set())
  const [successMsg,   setSuccessMsg  ] = useState<string | null>(null)
  const [,             startTransition] = useTransition()

  const visibleClients = clients.filter(c => !deletedIds.has(c.id))

  function handleCreateSuccess(name: string) {
    setShowCreate(false)
    setSuccessMsg(`Client "${name}" created.`)
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  function handleDeleted(clientId: string, clientName: string) {
    setDeletedIds(prev => new Set([...prev, clientId]))
    setDeleteTarget(null)
    setSuccessMsg(`Client "${clientName}" deleted.`)
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          <p style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#c9a96e' }}>
            Clients
            {visibleClients.length > 0 && <span style={{ color: '#555', marginLeft: 8 }}>{visibleClients.length}</span>}
          </p>
        </div>
        <button
          onClick={() => { startTransition(() => {}); setShowCreate(true) }}
          style={btnGold}
        >
          + New Client
        </button>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(57,255,136,.06)', border: '1px solid rgba(57,255,136,.2)', color: '#39ff88', fontSize: 11, fontWeight: 300 }}>
          {successMsg}
        </div>
      )}

      {/* Client cards */}
      {visibleClients.length === 0 ? (
        <div style={{ padding: '56px 32px', textAlign: 'center', background: '#0c0c0c', border: '1px solid rgba(255,255,255,0.04)' }}>
          <p style={{ fontSize: 13, color: '#1e1e1e', fontWeight: 300, marginBottom: 8 }}>No clients yet</p>
          <p style={{ fontSize: 11, color: '#555', fontWeight: 300 }}>Click "+ New Client" to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleClients.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onEdit={() => setEditClient(client)}
              onImport={() => setImportClient(client)}
              onDelete={() => setDeleteTarget(client)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate   && <CreateClientModal onClose={() => setShowCreate(false)} onSuccess={handleCreateSuccess} />}
      {editClient   && <EditClientModal client={editClient}    onClose={() => setEditClient(null)}   />}
      {importClient && <AdminImportModal client={importClient} onClose={() => setImportClient(null)} />}
      {deleteTarget && (
        <DeleteConfirmModal
          client={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => handleDeleted(deleteTarget.id, deleteTarget.name)}
        />
      )}
    </div>
  )
}
