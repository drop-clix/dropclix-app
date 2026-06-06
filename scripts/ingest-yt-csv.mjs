/**
 * YouTube video ingest from the Drop CLIX tracker CSV.
 *
 * Column mapping (YT format — different from standard IG import):
 *   Portal ID       → post_id  (#yt0001 for Shorts, #LF0001 for Long-form)
 *   Type/format     → format + pipeline_items.yt_type
 *   YouTube Video ID→ post_analytics.yt_id
 *   Title           → title
 *   Publish Date    → date
 *   Views           → views (eom window)
 *   Likes           → likes (eom window)
 *   Comments        → comments (eom window)
 *   Shares          → shares (eom window)
 *   Avg % Viewed    → watch_pct (eom window)
 *   Subscribers Gained → followers (eom window)
 *   Impressions     → impressions (eom window)
 *   CTR %           → ctr (eom window)
 *   Pillar          → pillar
 *   hook type       → hook
 *
 * ER% formula (YouTube):
 *   (likes + comments + shares + subscribers_gained) / views × 100
 *   Note: saves not available on YouTube; subscribers_gained used instead.
 *
 * Decision thresholds: ≥12% = Double Down, 4–11.9% = Iterate, <4% = Kill
 *
 * Usage:
 *   node scripts/ingest-yt-csv.mjs <path-to-csv>        # dry-run (first 5 rows previewed)
 *   node scripts/ingest-yt-csv.mjs <path-to-csv> --run  # apply
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync }  from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { randomUUID }    from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN   = !process.argv.includes('--run')
const csvArg    = process.argv.find(a => a.endsWith('.csv'))

if (!csvArg) {
  console.error('Usage: node scripts/ingest-yt-csv.mjs <path-to-csv> [--run]')
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
const rawLines = readFileSync(CSV_PATH, 'utf-8').trim().split('\n')
const headers  = rawLines[0].split(',').map(h => h.trim())
const idx      = h => headers.indexOf(h)

function parseRow(line) {
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
    post_id:       str(idx('Portal ID')),
    format:        str(idx('Type/format')),
    yt_video_id:   str(idx('YouTube Video ID')),
    title:         str(idx('Title')),
    date:          str(idx('Publish Date')),
    views:         num(idx('Views')),
    likes:         num(idx('Likes')),
    comments:      num(idx('Comments')),
    shares:        num(idx('Shares')),
    watch_pct:     num(idx('Avg % Viewed')),
    subscribers:   num(idx('Subscribers Gained')),
    impressions:   num(idx('Impressions')),
    ctr:           num(idx('CTR %')),
    pillar:        str(idx('Pillar')),
    hook:          str(idx('hook type')),
  }
}

const csvRows = rawLines.slice(1)
  .map(parseRow)
  .filter(r => r.post_id !== '')
  .filter(r => r.views !== null && r.views > 0)

console.log(`\nCSV: ${CSV_PATH}`)
console.log(`Total rows with view data: ${csvRows.length}\n`)

// ── Decision logic (YouTube formula) ─────────────────────────────────────
// ER% = (likes + comments + shares + subscribers_gained) / views × 100
// Subscribers Gained replaces saves (not available on YouTube).
function ytDecision(views, likes, comments, shares, subscribers) {
  if (!views) return null
  const er = ((likes || 0) + (comments || 0) + (shares || 0) + (subscribers || 0)) / views * 100
  if (er >= 12) return 'Double Down'
  if (er >= 4)  return 'Iterate'
  return 'Kill'
}

function ytER(views, likes, comments, shares, subscribers) {
  if (!views) return 0
  return ((likes || 0) + (comments || 0) + (shares || 0) + (subscribers || 0)) / views * 100
}

// ── Derive week label ─────────────────────────────────────────────────────
function deriveWeek(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00Z')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getUTCMonth()]} WK${Math.ceil(d.getUTCDate() / 7)}`
}

// ── Resolve existing posts ────────────────────────────────────────────────
const allPostIds = csvRows.map(r => r.post_id)

const { data: existingPosts, error: fetchErr } = await sb
  .from('posts').select('id, post_id, title, date, pillar, platform')
  .eq('client_id', CLIENT_ID)
  .in('post_id', allPostIds)
if (fetchErr) { console.error(fetchErr.message); process.exit(1) }

const postMap = Object.fromEntries((existingPosts || []).map(p => [p.post_id, p]))

const newPosts     = csvRows.filter(r => !postMap[r.post_id])
const existingRows = csvRows.filter(r =>  postMap[r.post_id])

if (newPosts.length) {
  console.log(`New posts to insert (${newPosts.length}):`)
  newPosts.forEach(r => console.log(`  ${r.post_id.padEnd(8)} [${r.format}]  "${r.title}"`))
  console.log()
}
if (existingRows.length) {
  console.log(`Existing posts to update analytics (${existingRows.length}):`)
  existingRows.forEach(r => console.log(`  ${r.post_id.padEnd(8)} "${r.title}"`))
  console.log()
}

// ── Build payloads ────────────────────────────────────────────────────────
const stubsToInsert     = []
const analyticsToWipe   = []
const analyticsToInsert = []
const decisionUpdates   = []

for (const row of csvRows) {
  let postUuid = postMap[row.post_id]?.id

  if (!postUuid) {
    postUuid = randomUUID()
    stubsToInsert.push({
      id:        postUuid,
      client_id: CLIENT_ID,
      post_id:   row.post_id,
      title:     row.title,
      date:      row.date || null,
      platform:  ['yt'],
      pillar:    row.pillar || null,
      hook:      row.hook || null,
      format:    row.format || null,
      cta:       null,
      decision:  null,
      notes:     null,
    })
  }

  const decision = ytDecision(row.views, row.likes, row.comments, row.shares, row.subscribers)
  if (decision) decisionUpdates.push({ uuid: postUuid, post_id: row.post_id, decision })

  analyticsToWipe.push({ uuid: postUuid, windows: ['eom'] })

  analyticsToInsert.push({
    id:            randomUUID(),
    client_id:     CLIENT_ID,
    post_id:       postUuid,
    metric_window: 'eom',
    platform:      'yt',
    views:         row.views         ?? null,
    likes:         row.likes         ?? null,
    comments:      row.comments      ?? null,
    shares:        row.shares        ?? null,
    saves:         null,
    followers:     row.subscribers   ?? null,
    watch_pct:     row.watch_pct     ?? null,
    skip_rate:     null,
    hook_rate:     null,
    impressions:   row.impressions   ?? null,
    ctr:           row.ctr           ?? null,
    yt_id:         row.yt_video_id || null,
  })
}

// ── Pipeline + Calendar sync ──────────────────────────────────────────────
const { data: existingPipe, error: pipeErr } = await sb
  .from('pipeline_items').select('id, post_id, status')
  .eq('client_id', CLIENT_ID)
  .in('post_id', allPostIds)
if (pipeErr) { console.error('Pipeline fetch:', pipeErr.message); process.exit(1) }

const pipeByPostId = Object.fromEntries((existingPipe || []).map(p => [p.post_id, p]))

const { data: allCal, error: calErr } = await sb
  .from('calendar_events').select('id, notes')
  .eq('client_id', CLIENT_ID)
if (calErr) { console.error('Calendar fetch:', calErr.message); process.exit(1) }

const calCoveredPostIds = new Set()
for (const ev of (allCal || [])) {
  try {
    const n = JSON.parse(ev.notes || '{}')
    if (n.post_id) calCoveredPostIds.add(n.post_id)
  } catch {}
}

const pipeToInsert = []
const pipeToUpdate = []
const calToInsert  = []
const calSkipped   = []

for (const row of csvRows) {
  const existingP = pipeByPostId[row.post_id]
  if (!existingP) {
    pipeToInsert.push({
      client_id:      CLIENT_ID,
      post_id:        row.post_id,
      title:          row.title,
      platform:       ['yt'],
      yt_type:        row.format,
      pillar:         row.pillar || null,
      status:         'POSTED',
      week:           deriveWeek(row.date),
      scheduled_date: row.date || null,
    })
  } else if (existingP.status !== 'POSTED') {
    pipeToUpdate.push({ id: existingP.id, post_id: row.post_id, oldStatus: existingP.status })
  }

  if (!calCoveredPostIds.has(row.post_id)) {
    if (!row.date) {
      calSkipped.push(row.post_id)
    } else {
      calToInsert.push({
        client_id:  CLIENT_ID,
        title:      row.title,
        platform:   'yt',
        event_date: row.date,
        notes:      JSON.stringify({ post_id: row.post_id }),
      })
    }
  }
}

// ── Preview ───────────────────────────────────────────────────────────────
console.log('── First 5 rows preview ─────────────────────────────────────')
for (const row of csvRows.slice(0, 5)) {
  const er  = ytER(row.views, row.likes, row.comments, row.shares, row.subscribers)
  const dec = ytDecision(row.views, row.likes, row.comments, row.shares, row.subscribers)
  const action = postMap[row.post_id] ? 'UPDATE eom' : 'INSERT post + eom'
  console.log(
    `  ${row.post_id.padEnd(8)} [${row.format.padEnd(9)}] [${action}]` +
    `\n    Title: "${row.title.slice(0, 60)}${row.title.length > 60 ? '…' : ''}"` +
    `\n    Date: ${row.date}  Pillar: ${row.pillar}  Hook: ${row.hook}` +
    `\n    Views: ${row.views}  Likes: ${row.likes}  Comments: ${row.comments}` +
    `  Shares: ${row.shares}  Subs: ${row.subscribers}` +
    `\n    Watch%: ${row.watch_pct}%  Impressions: ${row.impressions}  CTR: ${row.ctr}%` +
    `\n    ER%: ${er.toFixed(2)}%  → Decision: ${dec}  YT ID: ${row.yt_video_id}` +
    `\n`
  )
}

console.log('── Full analytics plan ──────────────────────────────────────')
for (const row of csvRows) {
  const er  = ytER(row.views, row.likes, row.comments, row.shares, row.subscribers)
  const dec = ytDecision(row.views, row.likes, row.comments, row.shares, row.subscribers) ?? '—'
  const action = postMap[row.post_id] ? 'UPDATE' : 'INSERT'
  console.log(
    `  ${row.post_id.padEnd(8)} [${row.format.padEnd(9)}] [${action}]` +
    `  views=${row.views}` +
    `  ER=${er.toFixed(1)}%` +
    `  → ${dec}`
  )
}

console.log('\n── Pipeline + Calendar plan ──────────────────────────────────')
if (pipeToInsert.length) {
  console.log(`  Pipeline CREATE (${pipeToInsert.length}):`)
  pipeToInsert.forEach(p =>
    console.log(`    ${p.post_id.padEnd(8)} [${(p.yt_type || '').padEnd(9)}] status=POSTED  week=${p.week || '—'}`)
  )
} else {
  console.log(`  Pipeline — no new entries needed`)
}
if (pipeToUpdate.length) {
  console.log(`  Pipeline UPDATE → POSTED (${pipeToUpdate.length}):`)
  pipeToUpdate.forEach(p => console.log(`    ${p.post_id}  (was ${p.oldStatus})`))
}
if (calToInsert.length) {
  console.log(`  Calendar CREATE (${calToInsert.length}):`)
  calToInsert.slice(0, 5).forEach(c =>
    console.log(`    ${JSON.parse(c.notes).post_id.padEnd(8)} date=${c.event_date}  "${c.title.slice(0, 50)}"`)
  )
  if (calToInsert.length > 5)
    console.log(`    ... and ${calToInsert.length - 5} more`)
} else {
  console.log(`  Calendar — no new entries needed`)
}
if (calSkipped.length) console.log(`  Calendar SKIPPED (no date): ${calSkipped.join(', ')}`)

console.log(`\nSummary:`)
console.log(`  Posts to insert:     ${stubsToInsert.length}`)
console.log(`  Posts to update:     ${existingRows.length}`)
console.log(`  Analytics rows:      ${analyticsToInsert.length}  (all eom, platform=yt)`)
console.log(`  Decisions computed:  ${decisionUpdates.length}`)
console.log(`  Pipeline to create:  ${pipeToInsert.length}`)
console.log(`  Pipeline to update:  ${pipeToUpdate.length}`)
console.log(`  Calendar to create:  ${calToInsert.length}`)

if (DRY_RUN) {
  console.log('\nDRY RUN — pass --run to apply.\n')
  process.exit(0)
}

// ── Apply ─────────────────────────────────────────────────────────────────
console.log('\n── Applying ──────────────────────────────────────────────────')

// 1. Insert post stubs
if (stubsToInsert.length) {
  const { error } = await sb.from('posts').insert(stubsToInsert)
  if (error) { console.error('Post insert failed:', error.message); process.exit(1) }
  console.log(`✓ Inserted ${stubsToInsert.length} post(s)`)
}

// 2. Wipe stale eom analytics (idempotent)
for (const { uuid, windows } of analyticsToWipe) {
  const { error } = await sb
    .from('post_analytics').delete()
    .eq('post_id', uuid).in('metric_window', windows)
    .eq('platform', 'yt')
  if (error) { console.error('Delete failed:', error.message); process.exit(1) }
}
console.log(`✓ Wiped stale eom analytics for ${analyticsToWipe.length} post(s)`)

// 3. Insert fresh analytics
const { error: insErr } = await sb.from('post_analytics').insert(analyticsToInsert)
if (insErr) { console.error('Analytics insert failed:', insErr.message); process.exit(1) }
console.log(`✓ Inserted ${analyticsToInsert.length} analytics rows`)

// 4. Update Decision
let decisionUpdated = 0
for (const { uuid, post_id, decision } of decisionUpdates) {
  const { error } = await sb.from('posts').update({ decision }).eq('id', uuid)
  if (error) console.error(`Decision update failed for ${post_id}:`, error.message)
  else decisionUpdated++
}
if (decisionUpdated > 0)
  console.log(`✓ Updated Decision for ${decisionUpdated} post(s)`)

// 5. Pipeline insert
if (pipeToInsert.length) {
  const { error } = await sb.from('pipeline_items').insert(pipeToInsert)
  if (error) { console.error('Pipeline insert failed:', error.message); process.exit(1) }
  console.log(`✓ Created ${pipeToInsert.length} pipeline item(s) with status=POSTED`)
}

// 6. Pipeline update
let pipeUpdated = 0
for (const { id, post_id } of pipeToUpdate) {
  const { error } = await sb.from('pipeline_items').update({ status: 'POSTED' }).eq('id', id)
  if (error) console.error(`Pipeline update failed for ${post_id}:`, error.message)
  else pipeUpdated++
}
if (pipeUpdated > 0) console.log(`✓ Updated ${pipeUpdated} pipeline item(s) → POSTED`)

// 7. Calendar insert
if (calToInsert.length) {
  const { error } = await sb.from('calendar_events').insert(calToInsert)
  if (error) { console.error('Calendar insert failed:', error.message); process.exit(1) }
  console.log(`✓ Created ${calToInsert.length} calendar event(s)`)
}

// ── Final report ──────────────────────────────────────────────────────────
console.log('\n── Done ──────────────────────────────────────────────────────')
console.log(`Posts inserted:      ${stubsToInsert.length}`)
console.log(`Analytics rows:      ${analyticsToInsert.length}`)
console.log(`Decisions updated:   ${decisionUpdated}`)
console.log(`Pipeline created:    ${pipeToInsert.length}`)
console.log(`Pipeline updated:    ${pipeUpdated}`)
console.log(`Calendar created:    ${calToInsert.length}`)
console.log()
