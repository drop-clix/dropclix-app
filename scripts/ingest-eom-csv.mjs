/**
 * Generic EOM analytics ingest from a filled CSV.
 *
 * For each row in the CSV:
 *   - Looks up the post by post_id; inserts post stub if missing.
 *   - Skips rows where eom_views is blank.
 *   - Upserts eom window row in post_analytics (delete + insert).
 *   - Also upserts w7 row if views_7d is provided.
 *
 * Usage:
 *   node scripts/ingest-eom-csv.mjs <path-to-csv>          # dry-run
 *   node scripts/ingest-eom-csv.mjs <path-to-csv> --run    # apply
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN   = !process.argv.includes('--run')
const csvArg    = process.argv.find(a => a.endsWith('.csv'))

if (!csvArg) {
  console.error('Usage: node scripts/ingest-eom-csv.mjs <path-to-csv> [--run]')
  process.exit(1)
}

const CSV_PATH  = resolve(csvArg)
const CLIENT_ID = '913f1794-1506-4449-b56c-b683809cefc3'

// ── Env ───────────────────────────────────────────────────────────────────
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)

// ── Parse CSV ─────────────────────────────────────────────────────────────
const lines   = readFileSync(CSV_PATH, 'utf-8').trim().split('\n')
const headers = lines[0].split(',').map(h => h.trim())
const idx     = h => headers.indexOf(h)

function parseRow(line) {
  // Handle quoted fields (titles with commas)
  const cols = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  cols.push(cur.trim())

  const str = i => cols[i]?.trim() ?? ''
  const num = i => { const v = str(i); return v === '' ? null : Number(v) }

  return {
    post_id:       str(idx('post_id')),
    title:         str(idx('title')),
    views_7d:      num(idx('views_7d')),
    eom_views:     num(idx('eom_views')),
    eom_likes:     num(idx('eom_likes')),
    eom_comments:  num(idx('eom_comments')),
    eom_shares:    num(idx('eom_shares')),
    eom_saves:     num(idx('eom_saves')),
    eom_watch_pct: num(idx('eom_watch_pct')),
    eom_skip_rate: num(idx('eom_skip_rate')),
    eom_followers: num(idx('eom_followers')),
  }
}

const csvRows = lines.slice(1)
  .map(parseRow)
  .filter(r => r.post_id !== '')
  .filter(r => r.eom_views !== null)   // skip rows with no EOM data

console.log(`\nCSV: ${CSV_PATH}`)
console.log(`Rows with EOM data: ${csvRows.length} (skipping blank rows)\n`)

// ── Resolve / create posts ────────────────────────────────────────────────
const allPostIds = csvRows.map(r => r.post_id)

const { data: existingPosts, error: fetchErr } = await sb
  .from('posts').select('id, post_id, title, date').in('post_id', allPostIds)
if (fetchErr) { console.error(fetchErr.message); process.exit(1) }

const postMap = Object.fromEntries(existingPosts.map(p => [p.post_id, p]))

// Any missing posts need to be inserted
const missingPosts = csvRows.filter(r => !postMap[r.post_id])

if (missingPosts.length) {
  console.log(`Posts not yet in DB — will insert stubs:`)
  missingPosts.forEach(r => console.log(`  ${r.post_id}  "${r.title}"`))
} else {
  console.log(`All ${csvRows.length} posts already exist in DB ✓`)
}

// ── Build analytics payload ───────────────────────────────────────────────
function analyticsRow(postUuid, window, m) {
  return {
    id:            randomUUID(),
    client_id:     CLIENT_ID,
    post_id:       postUuid,
    metric_window: window,
    platform:      'ig',
    views:         m.views     ?? null,
    likes:         m.likes     ?? null,
    comments:      m.comments  ?? null,
    shares:        m.shares    ?? null,
    saves:         m.saves     ?? null,
    watch_pct:     m.watch_pct ?? null,
    skip_rate:     m.skip_rate ?? null,
    followers:     m.followers ?? null,
    hook_rate:     null,
    impressions:   null,
    ctr:           null,
    yt_id:         null,
  }
}

// Track what will happen
const report = { newPosts: [], updatedEom: [], insertedEom: [], insertedW7: [] }

const stubsToInsert    = []
const analyticsToWipe  = []   // UUIDs whose eom (and w7 if applicable) rows get deleted
const analyticsToInsert = []

for (const row of csvRows) {
  let postUuid = postMap[row.post_id]?.id

  if (!postUuid) {
    // New post stub
    postUuid = randomUUID()
    stubsToInsert.push({
      id:        postUuid,
      client_id: CLIENT_ID,
      post_id:   row.post_id,
      title:     row.title,
      date:      null,
      platform:  ['ig'],
      pillar:    null, hook: null, format: null, cta: null, decision: null, notes: null,
    })
    report.newPosts.push(row.post_id)
  }

  // Determine which windows to wipe + re-insert
  const windowsToWipe = ['eom']
  if (row.views_7d !== null) windowsToWipe.push('w7')
  analyticsToWipe.push({ uuid: postUuid, windows: windowsToWipe })

  // EOM row
  analyticsToInsert.push(analyticsRow(postUuid, 'eom', {
    views:     row.eom_views,
    likes:     row.eom_likes,
    comments:  row.eom_comments,
    shares:    row.eom_shares,
    saves:     row.eom_saves,
    watch_pct: row.eom_watch_pct,
    skip_rate: row.eom_skip_rate,
    followers: row.eom_followers,
  }))

  // W7 row (views only — full metrics go in eom)
  if (row.views_7d !== null) {
    analyticsToInsert.push(analyticsRow(postUuid, 'w7', { views: row.views_7d }))
    report.insertedW7.push(row.post_id)
  }

  const existed = !!postMap[row.post_id]
  if (existed) report.updatedEom.push(row.post_id)
  else         report.insertedEom.push(row.post_id)
}

// ── Preview ───────────────────────────────────────────────────────────────
console.log('\n── What will happen ──────────────────────────────────────────')
for (const row of csvRows) {
  const existed = !!postMap[row.post_id]
  const hasW7   = row.views_7d !== null
  const action  = existed ? 'UPDATE eom' : 'INSERT post + eom'
  const w7note  = hasW7 ? ' + w7' : ''
  const sr      = row.eom_skip_rate !== null ? ` skip=${row.eom_skip_rate}%` : ''
  console.log(
    `  ${row.post_id.padEnd(8)} [${action}${w7note}]` +
    `  views=${row.eom_views} likes=${row.eom_likes} comments=${row.eom_comments}` +
    `  shares=${row.eom_shares} saves=${row.eom_saves}` +
    `  watch=${row.eom_watch_pct}%${sr} followers=${row.eom_followers}`
  )
}

if (DRY_RUN) {
  console.log('\nDRY RUN — pass --run to apply.\n')
  process.exit(0)
}

// ── Apply ─────────────────────────────────────────────────────────────────
console.log('\n── Applying ──────────────────────────────────────────────────')

// 1. Insert missing post stubs
if (stubsToInsert.length) {
  const { error } = await sb.from('posts').insert(stubsToInsert)
  if (error) { console.error('Post insert failed:', error.message); process.exit(1) }
  console.log(`✓ Inserted ${stubsToInsert.length} post stub(s)`)
}

// 2. Delete stale analytics rows (per post UUID + window)
for (const { uuid, windows } of analyticsToWipe) {
  const { error } = await sb
    .from('post_analytics')
    .delete()
    .eq('post_id', uuid)
    .in('metric_window', windows)
  if (error) { console.error('Delete failed:', error.message); process.exit(1) }
}
console.log(`✓ Wiped stale analytics for ${analyticsToWipe.length} post(s)`)

// 3. Insert fresh analytics rows
const { error: insErr } = await sb.from('post_analytics').insert(analyticsToInsert)
if (insErr) { console.error('Analytics insert failed:', insErr.message); process.exit(1) }
console.log(`✓ Inserted ${analyticsToInsert.length} analytics rows`)

// ── Final report ──────────────────────────────────────────────────────────
console.log('\n── Result ────────────────────────────────────────────────────')
if (report.newPosts.length)
  console.log(`New posts inserted:    ${report.newPosts.join(', ')}`)
console.log(`EOM rows upserted:     ${report.updatedEom.join(', ')}`)
if (report.insertedW7.length)
  console.log(`W7 rows upserted:      ${report.insertedW7.join(', ')}`)
console.log(`\nTotal analytics rows written: ${analyticsToInsert.length}`)
