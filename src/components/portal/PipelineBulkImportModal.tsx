'use client'

import { useState, useRef } from 'react'
import { bulkCreatePipelineItems } from '@/app/(dashboard)/edit-actions'
import { useToast } from '@/components/portal/Toast'

type NextIds = { ig: string; tt: string; yt: string; lf: string }

type PreviewRow = {
  title: string
  platform: string[]
  pillar: string
  week: string
  generatedId: string
}

const VALID_PLATFORMS = new Set(['ig', 'tt', 'yt', 'lf'])
const WEEK_RE = /^[A-Z][a-z]{2}Wk\d+$/

const PLAT_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ig: { label: 'IG', color: '#c9a96e', bg: 'rgba(201,169,110,.1)' },
  tt: { label: 'TT', color: '#a78bfa', bg: 'rgba(167,139,250,.1)' },
  yt: { label: 'YT', color: '#4cc9ff', bg: 'rgba(76,201,255,.1)'  },
  lf: { label: 'LF', color: '#4cc9ff', bg: 'rgba(76,201,255,.08)' },
}

function extractNum(id: string, prefix: string): number {
  const m = new RegExp(`#${prefix}(\\d+)`, 'i').exec(id)
  return m ? parseInt(m[1], 10) : 0
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let inQuotes = false
  let field = ''

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field.trim()); field = ''
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        row.push(field.trim()); field = ''
        if (row.some(c => c !== '')) { rows.push(row) }
        row = []
      } else {
        field += ch
      }
    }
  }
  if (field || row.length > 0) { row.push(field.trim()); if (row.some(c => c !== '')) rows.push(row) }
  return rows
}

export function PipelineBulkImportModal({
  nextIds,
  onClose,
  onImported,
}: {
  nextIds: NextIds
  onClose: () => void
  onImported: () => void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'preview'>('upload')
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  function processCSV(text: string) {
    const rows = parseCSV(text.trim())
    if (!rows.length) { setErrors(['CSV is empty.']); return }

    // Skip header row if present
    const first = rows[0]
    const isHeader = first.some(cell =>
      ['title', 'platform', 'pillar', 'week'].includes(cell.toLowerCase()),
    )
    const dataRows = isHeader ? rows.slice(1) : rows

    if (dataRows.length === 0) { setErrors(['No data rows found after header.']); return }
    if (dataRows.length > 200) {
      setErrors([`Maximum 200 rows allowed — this file has ${dataRows.length} rows.`])
      return
    }

    const errs: string[] = []
    const parsed: PreviewRow[] = []

    // ID counters — start at the next available number (post-increment in loop)
    const counters = {
      ig: extractNum(nextIds.ig, 'ig'),
      tt: extractNum(nextIds.tt, 'tt'),
      yt: extractNum(nextIds.yt, 'yt'),
      lf: extractNum(nextIds.lf, 'LF'),
    }

    dataRows.forEach((cols, idx) => {
      const lineNum = isHeader ? idx + 2 : idx + 1
      const [titleRaw = '', platformRaw = '', pillarRaw = '', weekRaw = ''] = cols

      const title = titleRaw.trim()
      if (!title) { errs.push(`Row ${lineNum}: title is required`); return }

      const platforms = platformRaw.trim()
        ? platformRaw.trim().toLowerCase().split('|').map(p => p.trim()).filter(Boolean)
        : []
      if (!platforms.length) { errs.push(`Row ${lineNum}: platform is required`); return }
      const bad = platforms.filter(p => !VALID_PLATFORMS.has(p))
      if (bad.length) {
        errs.push(`Row ${lineNum}: invalid platform "${bad.join(', ')}" — use ig, tt, yt, lf`)
        return
      }

      const week = weekRaw.trim()
      if (week && !WEEK_RE.test(week)) {
        errs.push(`Row ${lineNum}: week "${week}" must be MonWk# format (e.g. JunWk3)`)
        return
      }

      // Generate pipe-separated ID — post-increment each platform counter
      const parts: string[] = []
      if (platforms.includes('ig')) { parts.push(`#ig${String(counters.ig).padStart(4, '0')}`); counters.ig++ }
      if (platforms.includes('tt')) { parts.push(`#tt${String(counters.tt).padStart(4, '0')}`); counters.tt++ }
      if (platforms.includes('yt')) { parts.push(`#yt${String(counters.yt).padStart(4, '0')}`); counters.yt++ }
      if (platforms.includes('lf')) { parts.push(`#LF${String(counters.lf).padStart(4, '0')}`); counters.lf++ }

      parsed.push({ title, platform: platforms, pillar: pillarRaw.trim(), week, generatedId: parts.join(' | ') })
    })

    if (errs.length) { setErrors(errs); return }
    setErrors([])
    setPreview(parsed)
    setStep('preview')
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setErrors(['Please upload a .csv file.'])
      return
    }
    const reader = new FileReader()
    reader.onload = e => processCSV((e.target?.result as string) ?? '')
    reader.readAsText(file)
  }

  async function handleConfirm() {
    setImporting(true)
    const result = await bulkCreatePipelineItems(
      preview.map(row => ({
        postId:   row.generatedId,
        title:    row.title,
        platform: row.platform,
        pillar:   row.pillar || null,
        week:     row.week || null,
      })),
    )
    setImporting(false)
    if (result.error) { toast(result.error, 'error'); return }
    const n = result.count ?? 0
    toast(`${n} idea${n !== 1 ? 's' : ''} added to pipeline`, 'success')
    onImported()
    onClose()
  }

  const inp = {
    background: '#080808', border: '1px solid #1e1e1e',
    color: '#f2ede4', padding: '7px 10px', fontSize: 12,
    fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '100%',
  } as const

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,.82)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#070707', border: '1px solid #1e1e1e',
        borderTop: '2px solid #c9a96e',
        width: step === 'preview' ? 820 : 540,
        maxWidth: '96vw', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ padding: '28px 32px 20px', flexShrink: 0, borderBottom: '1px solid #141414' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.22em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: 4 }}>
                Bulk Import · Step {step === 'upload' ? '1' : '2'} of 2
                {step === 'preview' && <span style={{ color: '#555' }}> — {preview.length} rows</span>}
              </p>
              <p style={{ fontSize: 18, color: '#f2ede4', fontWeight: 300 }}>
                {step === 'upload' ? 'Import Video Ideas' : 'Preview & Confirm'}
              </p>
            </div>
            <button onClick={onClose} style={{ fontSize: 20, color: '#666', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>

          {step === 'upload' && (
            <>
              {/* Format reference */}
              <div style={{
                background: '#050505', border: '1px solid #141414',
                borderLeft: '3px solid rgba(201,169,110,.35)',
                padding: '14px 16px', marginBottom: 20,
              }}>
                <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: '#666', marginBottom: 8 }}>
                  CSV Format · 4 columns
                </p>
                <p style={{ fontSize: 11, color: '#555', fontFamily: 'monospace', marginBottom: 10 }}>
                  title, platform, pillar, week
                </p>
                <div style={{ borderTop: '1px solid #141414', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {[
                    ['platform', 'ig · tt · yt · lf — pipe-separate for multi: ig|tt'],
                    ['week',     'MonWk# format — e.g. JunWk3 (optional)'],
                    ['pillar',   'any text (optional)'],
                    ['IDs',      'auto-generated · status defaults to PLANNED · priority 3'],
                  ].map(([k, v]) => (
                    <p key={k} style={{ fontSize: 9, color: '#555' }}>
                      <span style={{ color: '#555', fontFamily: 'monospace', marginRight: 4 }}>{k}:</span>{v}
                    </p>
                  ))}
                  <p style={{ fontSize: 9, color: '#c9a96e', marginTop: 4 }}>Max 200 rows per import.</p>
                </div>
              </div>

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOver(false)
                  const file = e.dataTransfer.files[0]
                  if (file) handleFile(file)
                }}
                style={{
                  border: `2px dashed ${dragOver ? '#c9a96e' : '#1e1e1e'}`,
                  padding: '40px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragOver ? 'rgba(201,169,110,.03)' : 'transparent',
                  transition: 'border-color .15s, background .15s',
                  marginBottom: 20,
                  outline: 'none',
                }}
              >
                <p style={{ fontSize: 32, marginBottom: 10, opacity: 0.3, lineHeight: 1 }}>↑</p>
                <p style={{ fontSize: 13, color: '#666', fontWeight: 300, marginBottom: 5 }}>
                  Drop your CSV here, or click to browse
                </p>
                <p style={{ fontSize: 9, color: '#555', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                  .csv files only
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ''
                  }}
                />
              </div>

              {/* Example snippet */}
              <div>
                <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: '#555', marginBottom: 6 }}>
                  Example
                </p>
                <div style={{
                  background: '#050505', border: '1px solid #141414',
                  padding: '10px 14px', fontFamily: 'monospace', fontSize: 10,
                  color: '#555', lineHeight: 2.2,
                }}>
                  <span style={{ color: '#1e1e1e' }}>title,platform,pillar,week</span><br />
                  &quot;How to close a deal&quot;,ig|tt,Sales Tips,JunWk3<br />
                  &quot;The 3-touch follow-up&quot;,ig,Outreach,JunWk4<br />
                  &quot;Behind the scenes&quot;,yt,,
                </div>
              </div>

              {errors.length > 0 && (
                <div style={{
                  marginTop: 16, padding: '12px 14px',
                  background: 'rgba(255,59,95,.04)', border: '1px solid rgba(255,59,95,.2)',
                }}>
                  {errors.map((err, i) => (
                    <p key={i} style={{ fontSize: 10, color: '#ff3b5f', lineHeight: 1.9 }}>{err}</p>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'preview' && (
            <>
              <div style={{ border: '1px solid #141414', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #141414', background: '#060606' }}>
                      {['#', 'Generated ID', 'Title', 'Platform', 'Pillar', 'Week'].map(h => (
                        <th
                          key={h}
                          className="text-left px-3 py-3 text-[8px] font-medium tracking-[.14em] uppercase"
                          style={{ color: '#555', background: '#060606', whiteSpace: 'nowrap' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #0e0e0e', background: i % 2 === 0 ? '#070707' : '#080808' }}>
                        <td className="px-3 py-2" style={{ color: '#555', fontSize: 9, width: 28, textAlign: 'right' }}>
                          {i + 1}
                        </td>
                        <td className="px-3 py-2" style={{ fontFamily: 'monospace', fontSize: 9, color: '#c9a96e', whiteSpace: 'nowrap' }}>
                          {row.generatedId}
                        </td>
                        <td className="px-3 py-2" style={{ maxWidth: 200 }}>
                          <span
                            style={{ display: 'block', fontSize: 11, color: '#f2ede4', fontWeight: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={row.title}
                          >
                            {row.title}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap' }}>
                            {row.platform.map(p => {
                              const cfg = PLAT_CFG[p] ?? { label: p.toUpperCase(), color: '#555', bg: '#0d0d0d' }
                              return (
                                <span
                                  key={p}
                                  style={{
                                    fontSize: 7, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
                                    padding: '2px 5px', color: cfg.color, background: cfg.bg,
                                    border: `1px solid ${cfg.color}30`, whiteSpace: 'nowrap',
                                  }}
                                >
                                  {cfg.label}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2" style={{ fontSize: 9, color: '#555', whiteSpace: 'nowrap' }}>
                          {row.pillar || <span style={{ color: '#1e1e1e' }}>—</span>}
                        </td>
                        <td className="px-3 py-2" style={{ fontSize: 9, color: '#555', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                          {row.week || <span style={{ color: '#1e1e1e' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p style={{ fontSize: 9, color: '#555', marginTop: 10, lineHeight: 1.7 }}>
                All {preview.length} items will be created as{' '}
                <span style={{ color: '#4cc9ff' }}>PLANNED</span> with priority 3.
                You can edit them individually after import.
              </p>
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div style={{
          padding: '16px 32px 24px',
          borderTop: '1px solid #141414',
          display: 'flex',
          justifyContent: step === 'preview' ? 'space-between' : 'flex-end',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          {step === 'preview' && (
            <button
              onClick={() => { setStep('upload'); setErrors([]) }}
              style={{
                fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                padding: '8px 16px', background: 'transparent',
                border: '1px solid #1e1e1e', color: '#555', cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                padding: '8px 16px', background: 'transparent',
                border: '1px solid #1e1e1e', color: '#666', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            {step === 'preview' && (
              <button
                onClick={handleConfirm}
                disabled={importing}
                style={{
                  fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase',
                  padding: '9px 24px', fontWeight: 600,
                  background: importing ? 'rgba(201,169,110,.06)' : 'rgba(201,169,110,.12)',
                  border: '1px solid rgba(201,169,110,.5)',
                  color: '#c9a96e', cursor: importing ? 'wait' : 'pointer',
                  opacity: importing ? 0.7 : 1,
                }}
              >
                {importing ? 'Importing…' : `Import ${preview.length} Idea${preview.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
