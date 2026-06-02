/**
 * Backfill pipeline_items and calendar_events for posts that are missing them.
 *
 * For every post in the DB for CLIENT_ID:
 *   - If no pipeline_item exists for that post_id → create one (status=POSTED)
 *   - If pipeline_item exists but status ≠ POSTED → update to POSTED
 *   - If no calendar_event's notes JSON contains the post_id → create one
 *
 * Usage:
 *   node scripts/sync-pipeline-calendar.mjs                   # dry-run (all posts)
 *   node scripts/sync-pipeline-calendar.mjs --run             # apply (all posts)
 *   node scripts/sync-pipeline-calendar.mjs #ig0045 #ig0046   # dry-run specific IDs
 *   node scripts/sync-pipeline-calendar.mjs #ig0045 --run     # apply specific IDs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN   = !process.argv.includes('--run')
const CLIENT_ID = '913f1794-1506-4449-b56c-b683809cefc3'

// Any args that look like post IDs are treated as a filter
const filterIds = process.argv.slice(2).filter(a => a.startsWith('#'))

// ── Env ───────────────────────────────────────────────────────────────────
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)

// ── Derive week label ─────────────────────────────────────────────────────
function deriveWeek(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00Z')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getUTCMonth()]} WK${Math.ceil(d.getUTCDate() / 7)}`
}

// ── Fetch posts ───────────────────────────────────────────────────────────
let postsQuery = sb
  .from('posts')
  .select('id, post_id, title, date, pillar, platform')
  .eq('client_id', CLIENT_ID)
  .order('date', { ascending: true })

if (filterIds.length) {
  postsQuery = postsQuery.in('post_id', filterIds)
  console.log(`\nFiltering to: ${filterIds.join(', ')}`)
}

const { data: posts, error: postsErr } = await postsQuery
if (postsErr) { console.error('Posts fetch failed:', postsErr.message); process.exit(1) }

if (!posts?.length) { console.log('No posts found.'); process.exit(0) }
console.log(`\nPosts to check: ${posts.length}`)

const allPostIds = posts.map(p => p.post_id)

// ── Fetch existing pipeline items ─────────────────────────────────────────
const { data: existingPipe, error: pipeErr } = await sb
  .from('pipeline_items')
  .select('id, post_id, status')
  .eq('client_id', CLIENT_ID)
  .in('post_id', allPostIds)
if (pipeErr) { console.error('Pipeline fetch failed:', pipeErr.message); process.exit(1) }

const pipeByPostId = Object.fromEntries((existingPipe || []).map(p => [p.post_id, p]))

// ── Fetch calendar events (check notes JSON) ──────────────────────────────
const { data: allCal, error: calErr } = await sb
  .from('calendar_events')
  .select('id, notes')
  .eq('client_id', CLIENT_ID)
if (calErr) { console.error('Calendar fetch failed:', calErr.message); process.exit(1) }

const calCoveredPostIds = new Set()
for (const ev of (allCal || [])) {
  try {
    const n = JSON.parse(ev.notes || '{}')
    if (n.post_id) calCoveredPostIds.add(n.post_id)
  } catch {}
}

// ── Build sync plan ───────────────────────────────────────────────────────
const pipeToInsert = []
const pipeToUpdate = []
const calToInsert  = []
const calSkipped   = []

for (const post of posts) {
  // Pipeline
  const existingP = pipeByPostId[post.post_id]
  if (!existingP) {
    pipeToInsert.push({
      client_id:      CLIENT_ID,
      post_id:        post.post_id,
      title:          post.title,
      platform:       ['ig'],
      pillar:         post.pillar || null,
      status:         'POSTED',
      week:           deriveWeek(post.date),
      scheduled_date: post.date || null,
    })
  } else if (existingP.status !== 'POSTED') {
    pipeToUpdate.push({ id: existingP.id, post_id: post.post_id, oldStatus: existingP.status })
  }

  // Calendar
  if (!calCoveredPostIds.has(post.post_id)) {
    if (!post.date) {
      calSkipped.push(post.post_id)
    } else {
      calToInsert.push({
        client_id:  CLIENT_ID,
        title:      post.title,
        platform:   'ig',
        event_date: post.date,
        notes:      JSON.stringify({ post_id: post.post_id }),
      })
    }
  }
}

// ── Report plan ───────────────────────────────────────────────────────────
const alreadyOk = posts.filter(p =>
  pipeByPostId[p.post_id]?.status === 'POSTED' && calCoveredPostIds.has(p.post_id)
)
if (alreadyOk.length) console.log(`Already synced (no action needed): ${alreadyOk.length} post(s)`)

if (pipeToInsert.length) {
  console.log(`\nPipeline — CREATE (${pipeToInsert.length}):`)
  pipeToInsert.forEach(p =>
    console.log(`  ${p.post_id.padEnd(8)} status=POSTED  week=${p.week || '—'}  pillar=${p.pillar || '—'}  "${p.title}"`)
  )
}

if (pipeToUpdate.length) {
  console.log(`\nPipeline — UPDATE → POSTED (${pipeToUpdate.length}):`)
  pipeToUpdate.forEach(p => console.log(`  ${p.post_id}  (was: ${p.oldStatus})`))
}

if (calToInsert.length) {
  console.log(`\nCalendar — CREATE (${calToInsert.length}):`)
  calToInsert.forEach(c =>
    console.log(`  ${JSON.parse(c.notes).post_id.padEnd(8)} date=${c.event_date}  "${c.title}"`)
  )
}

if (calSkipped.length)
  console.log(`\nCalendar — SKIPPED (no date): ${calSkipped.join(', ')}`)

if (!pipeToInsert.length && !pipeToUpdate.length && !calToInsert.length) {
  console.log('\nNothing to sync — all pipeline + calendar entries already exist.')
}

if (DRY_RUN) {
  console.log('\nDRY RUN — pass --run to apply.\n')
  process.exit(0)
}

// ── Apply ─────────────────────────────────────────────────────────────────
console.log('\nApplying...')

let pipeInserted = 0, pipeUpdated = 0, calInserted = 0

if (pipeToInsert.length) {
  const { error } = await sb.from('pipeline_items').insert(pipeToInsert)
  if (error) { console.error('Pipeline insert failed:', error.message); process.exit(1) }
  pipeInserted = pipeToInsert.length
  console.log(`✓ Created ${pipeInserted} pipeline item(s)`)
}

for (const { id, post_id } of pipeToUpdate) {
  const { error } = await sb.from('pipeline_items').update({ status: 'POSTED' }).eq('id', id)
  if (error) { console.error(`Pipeline update failed for ${post_id}:`, error.message) }
  else pipeUpdated++
}
if (pipeUpdated > 0) console.log(`✓ Updated ${pipeUpdated} pipeline item(s) → POSTED`)

if (calToInsert.length) {
  const { error } = await sb.from('calendar_events').insert(calToInsert)
  if (error) { console.error('Calendar insert failed:', error.message); process.exit(1) }
  calInserted = calToInsert.length
  console.log(`✓ Created ${calInserted} calendar event(s)`)
}

console.log(`\nDone. Pipeline: +${pipeInserted} created, ${pipeUpdated} updated. Calendar: +${calInserted} created.`)
