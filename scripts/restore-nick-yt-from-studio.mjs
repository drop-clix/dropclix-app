/**
 * Restore Nick Nascimento's YouTube pipeline_items, posts, and post_analytics
 * from a YouTube Studio CSV export (Table data.csv).
 *
 * Recovery from the June 15, 2026 client data contamination incident.
 * See: fires/2026-06-15-client-data-contamination.md
 *
 * Column mapping (YouTube Studio export format):
 *   Content                            → yt_video_id
 *   Video title                        → title
 *   Video publish time                 → date  (format: "Sep 10, 2025")
 *   Average percentage viewed (%)      → watch_pct
 *   Stayed to watch (%)                → hook_rate
 *   Subscribers gained                 → followers
 *   Likes                              → likes
 *   Shares                             → shares
 *   Comments added                     → comments
 *   Views                              → views
 *   Impressions                        → impressions
 *   Impressions click-through rate (%) → ctr
 *
 * Steps:
 *   1. pipeline_items — insert if yt_video_id not already in Nick's rows
 *   2. posts          — insert if yt_id not already in Nick's rows
 *   3. post_analytics — upsert (metric_window='live', ON CONFLICT DO UPDATE)
 *   4. Verify counts
 *
 * Safety:
 *   - NEVER writes to Day 1 client_id
 *   - ALWAYS scopes every query + write to Nick's client_id
 *   - Skips existing pipeline rows (yt_video_id already set)
 *   - Processes rows chronologically so post_ids are date-ordered
 *
 * Usage:
 *   node scripts/restore-nick-yt-from-studio.mjs        # dry-run
 *   node scripts/restore-nick-yt-from-studio.mjs --run  # apply
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync }  from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { randomUUID }    from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN   = !process.argv.includes('--run')

// ── Client IDs ────────────────────────────────────────────────────────────
const NICK_CLIENT_ID = '913f1794-1506-4449-b56c-b683809cefc3'
const DAY1_CLIENT_ID = 'f51bb5e1-9222-44d2-9f0e-795dbe3b6acd'  // NEVER write here

// ── CSV path ──────────────────────────────────────────────────────────────
const CSV_PATH = join(
  __dirname,
  'data',
  'Content 2025-06-15_2026-06-15 Nick Nascimento (1)',
  'nick_yt_import.csv',
)

// ── Env ───────────────────────────────────────────────────────────────────
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env    = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) {
    let val = m[2].trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    env[m[1].trim()] = val
  }
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)

// ── Safety assertion ─────────────────────────────────────────────────────
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error('ABORT: Supabase env vars not loaded — check .env.local')
  process.exit(1)
}
console.log(`NICK_CLIENT_ID: ${NICK_CLIENT_ID}`)
console.log(`DAY1_CLIENT_ID: ${DAY1_CLIENT_ID}  ← NEVER written`)
console.log()

// ── CSV parsing ───────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const cols = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  cols.push(cur.trim())
  return cols
}

const rawLines = readFileSync(CSV_PATH, 'utf-8').trim().split('\n')
const headerCols = parseCsvLine(rawLines[0])

function hIdx(name) {
  const i = headerCols.indexOf(name)
  if (i < 0) { console.error(`ABORT: column "${name}" not found in CSV header`); process.exit(1) }
  return i
}

const COL = {
  content:     hIdx('Content'),
  title:       hIdx('Video title'),
  publishTime: hIdx('Video publish time'),
  watchPct:    hIdx('Average percentage viewed (%)'),
  hookRate:    hIdx('Stayed to watch (%)'),
  followers:   hIdx('Subscribers gained'),
  likes:       hIdx('Likes'),
  shares:      hIdx('Shares'),
  comments:    hIdx('Comments added'),
  views:       hIdx('Views'),
  impressions: hIdx('Impressions'),
  ctr:         hIdx('Impressions click-through rate (%)'),
}

// ── Date helpers ─────────────────────────────────────────────────────────
const MONTHS = {
  Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
  Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
}
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parsePublishTime(raw) {
  // "Sep 10, 2025"  or  "Jun 6, 2026"
  const m = raw.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/)
  if (!m) return null
  const mo = MONTHS[m[1]]
  if (mo === undefined) return null
  const day  = parseInt(m[2], 10)
  const year = parseInt(m[3], 10)
  return `${year}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function deriveWeek(dateStr) {
  if (!dateStr) return null
  const d   = new Date(dateStr + 'T00:00:00Z')
  const wk  = Math.ceil(d.getUTCDate() / 7)
  return `${MONTH_ABBR[d.getUTCMonth()]}Wk${wk}`
}

// ── Parse data rows ────────────────────────────────────────────────────────
// Skip row 0 (header) and row 1 (totals — Content is empty)
const allRows = rawLines.slice(1)
  .map(line => {
    const cols = parseCsvLine(line)
    const str  = i => cols[i]?.trim() ?? ''
    const num  = i => { const v = str(i); return v === '' ? null : Number(v) }
    return {
      ytVideoId:   str(COL.content),
      title:       str(COL.title),
      publishTime: str(COL.publishTime),
      views:       num(COL.views),
      likes:       num(COL.likes),
      comments:    num(COL.comments),
      shares:      num(COL.shares),
      followers:   num(COL.followers),
      watchPct:    num(COL.watchPct),
      hookRate:    num(COL.hookRate),
      impressions: num(COL.impressions),
      ctr:         num(COL.ctr),
    }
  })
  .filter(r => /^[A-Za-z0-9_-]{11}$/.test(r.ytVideoId))  // skip totals/summary rows; YT IDs are exactly 11 chars

console.log(`CSV: ${CSV_PATH}`)
console.log(`Rows with Content ID: ${allRows.length}`)

// Sort chronologically oldest→newest so post_ids are assigned in date order
allRows.sort((a, b) => {
  const da = parsePublishTime(a.publishTime) ?? '0000-00-00'
  const db = parsePublishTime(b.publishTime) ?? '0000-00-00'
  return da.localeCompare(db)
})

const allYtIds = allRows.map(r => r.ytVideoId)

// ── Query existing Nick data ───────────────────────────────────────────────
console.log('\nQuerying existing Nick data...')

// Existing pipeline_items with yt_video_id for Nick
const { data: existingPipe, error: pipeErr } = await sb
  .from('pipeline_items')
  .select('id, post_id, yt_video_id')
  .eq('client_id', NICK_CLIENT_ID)
  .not('yt_video_id', 'is', null)
if (pipeErr) { console.error('Pipeline query failed:', pipeErr.message); process.exit(1) }

const pipeByYtId = Object.fromEntries((existingPipe ?? []).map(p => [p.yt_video_id, p]))
console.log(`  pipeline_items with yt_video_id (Nick): ${(existingPipe ?? []).length}`)

// Existing posts with yt_id for Nick
const { data: existingPostsData, error: postsQueryErr } = await sb
  .from('posts')
  .select('id, post_id, yt_id')
  .eq('client_id', NICK_CLIENT_ID)
  .not('yt_id', 'is', null)
if (postsQueryErr) { console.error('Posts query failed:', postsQueryErr.message); process.exit(1) }

const postsByYtId = Object.fromEntries((existingPostsData ?? []).map(p => [p.yt_id, p]))
console.log(`  posts with yt_id (Nick): ${(existingPostsData ?? []).length}`)

// Find max existing #yt#### number for Nick to set starting counter
const { data: allPipePostIds } = await sb
  .from('pipeline_items')
  .select('post_id')
  .eq('client_id', NICK_CLIENT_ID)
  .like('post_id', '#yt%')

const { data: allPostsPostIds } = await sb
  .from('posts')
  .select('post_id')
  .eq('client_id', NICK_CLIENT_ID)
  .like('post_id', '#yt%')

let maxYtNum = 70  // floor: task says start from #yt0071
for (const row of [...(allPipePostIds ?? []), ...(allPostsPostIds ?? [])]) {
  const m = (row.post_id ?? '').match(/^#yt(\d+)/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n > maxYtNum) maxYtNum = n
  }
}
let nextIdNum = maxYtNum + 1
console.log(`  Max existing #yt#### for Nick: #yt${String(maxYtNum).padStart(4,'0')}`)
console.log(`  New IDs start at: #yt${String(nextIdNum).padStart(4,'0')}`)

// ── Build plan ─────────────────────────────────────────────────────────────
const pipeToInsert   = []
const postsToInsert  = []
const analyticsToUpsert = []

let pipeSkipped  = 0
let postsSkipped = 0

// Track assignments: ytVideoId → { postId, postUUID }
const assignment = {}

for (const row of allRows) {
  const ytId = row.ytVideoId
  const date = parsePublishTime(row.publishTime)
  const week = deriveWeek(date)

  const existPipe = pipeByYtId[ytId]
  const existPost = postsByYtId[ytId]

  let assignedPostId
  let postUUID

  // ── STEP 1: pipeline_items ──────────────────────────────────────────────
  if (existPipe) {
    assignedPostId = existPipe.post_id
    pipeSkipped++
  } else {
    assignedPostId = `#yt${String(nextIdNum).padStart(4, '0')}`
    nextIdNum++

    pipeToInsert.push({
      client_id:      NICK_CLIENT_ID,
      post_id:        assignedPostId,
      title:          row.title,
      platform:       ['yt'],
      status:         'POSTED',
      priority:       6,
      pillar:         null,
      week:           week,
      scheduled_date: date,
      posted_at:      date ? `${date}T00:00:00Z` : null,
      yt_video_id:    ytId,
    })
  }

  // ── STEP 2: posts ────────────────────────────────────────────────────────
  if (existPost) {
    postUUID = existPost.id
    postsSkipped++
  } else {
    postUUID = randomUUID()
    postsToInsert.push({
      id:        postUUID,
      client_id: NICK_CLIENT_ID,
      post_id:   assignedPostId,
      title:     row.title,
      platform:  ['yt'],
      date:      date,
      yt_id:     ytId,
    })
  }

  assignment[ytId] = { postId: assignedPostId, postUUID }

  // ── STEP 3: post_analytics (always upsert) ──────────────────────────────
  analyticsToUpsert.push({
    post_id:       postUUID,
    client_id:     NICK_CLIENT_ID,
    platform:      'yt',
    metric_window: 'live',
    views:         row.views       ?? 0,
    likes:         row.likes       ?? 0,
    comments:      row.comments    ?? 0,
    shares:        row.shares      ?? 0,
    saves:         null,
    followers:     row.followers   ?? 0,
    watch_pct:     row.watchPct    ?? 0,
    hook_rate:     row.hookRate    ?? null,
    impressions:   row.impressions ?? null,
    ctr:           row.ctr         ?? null,
    yt_video_id:   ytId,
    recorded_at:   new Date().toISOString(),
  })
}

// ── Preview ───────────────────────────────────────────────────────────────
console.log('\n── First 5 new pipeline_items ────────────────────────────────────')
for (const p of pipeToInsert.slice(0, 5)) {
  console.log(
    `  ${p.post_id}  ${p.scheduled_date}  ${p.week}  ` +
    `"${p.title.slice(0, 55)}${p.title.length > 55 ? '…' : ''}"`
  )
  console.log(`    yt_video_id=${p.yt_video_id}`)
}

console.log('\n── Plan summary ──────────────────────────────────────────────────')
console.log(`  CSV rows processed:             ${allRows.length}`)
console.log(`  pipeline_items to INSERT:       ${pipeToInsert.length}  (${pipeSkipped} already exist → skipped)`)
console.log(`  posts to INSERT:                ${postsToInsert.length}  (${postsSkipped} already exist → skipped)`)
console.log(`  post_analytics to UPSERT:       ${analyticsToUpsert.length}`)
if (pipeToInsert.length > 0) {
  const first = pipeToInsert[0].post_id
  const last  = pipeToInsert[pipeToInsert.length - 1].post_id
  console.log(`  New post_id range:              ${first} – ${last}`)
}

if (DRY_RUN) {
  console.log('\n⚠  DRY RUN — pass --run to apply.\n')
  process.exit(0)
}

// ── Apply ─────────────────────────────────────────────────────────────────
console.log('\n── Applying ──────────────────────────────────────────────────────')

const BATCH = 50

// STEP 1: Insert pipeline_items
{
  let inserted = 0
  let failed   = 0
  for (let i = 0; i < pipeToInsert.length; i += BATCH) {
    const batch = pipeToInsert.slice(i, i + BATCH)
    const { error } = await sb.from('pipeline_items').insert(batch)
    if (error) {
      console.error(`  pipeline_items batch ${i}–${i + batch.length} FAILED: ${error.message}`)
      failed += batch.length
    } else {
      inserted += batch.length
    }
  }
  console.log(`✓ STEP 1 pipeline_items: inserted=${inserted}  skipped=${pipeSkipped}  failed=${failed}`)
}

// STEP 2: Insert posts
{
  let inserted = 0
  let failed   = 0
  for (let i = 0; i < postsToInsert.length; i += BATCH) {
    const batch = postsToInsert.slice(i, i + BATCH)
    const { error } = await sb.from('posts').insert(batch)
    if (error) {
      console.error(`  posts batch ${i}–${i + batch.length} FAILED: ${error.message}`)
      failed += batch.length
    } else {
      inserted += batch.length
    }
  }
  console.log(`✓ STEP 2 posts:          inserted=${inserted}  skipped=${postsSkipped}  failed=${failed}`)
}

// STEP 3: Upsert post_analytics
{
  let upserted = 0
  let failed   = 0
  for (let i = 0; i < analyticsToUpsert.length; i += BATCH) {
    const batch = analyticsToUpsert.slice(i, i + BATCH)
    const { error } = await sb
      .from('post_analytics')
      .upsert(batch, { onConflict: 'post_id,platform,metric_window' })
    if (error) {
      console.error(`  post_analytics batch ${i}–${i + batch.length} FAILED: ${error.message}`)
      failed += batch.length
    } else {
      upserted += batch.length
    }
  }
  console.log(`✓ STEP 3 post_analytics: upserted=${upserted}  failed=${failed}`)
}

// STEP 4: Verify
console.log('\n── STEP 4: Verification ──────────────────────────────────────────')

const { count: pipeCount, error: pipeCountErr } = await sb
  .from('pipeline_items')
  .select('*', { count: 'exact', head: true })
  .eq('client_id', NICK_CLIENT_ID)
  .contains('platform', ['yt'])
console.log(`  pipeline_items (Nick, platform @> ['yt']): ${pipeCount ?? `ERROR: ${pipeCountErr?.message}`}`)

const { count: postsCount, error: postsCountErr } = await sb
  .from('posts')
  .select('*', { count: 'exact', head: true })
  .eq('client_id', NICK_CLIENT_ID)
  .contains('platform', ['yt'])
console.log(`  posts          (Nick, platform @> ['yt']): ${postsCount ?? `ERROR: ${postsCountErr?.message}`}`)

const { count: analyticsCount, error: analyticsCountErr } = await sb
  .from('post_analytics')
  .select('*', { count: 'exact', head: true })
  .eq('client_id', NICK_CLIENT_ID)
  .eq('platform', 'yt')
  .eq('metric_window', 'live')
console.log(`  post_analytics (Nick, yt, live):           ${analyticsCount ?? `ERROR: ${analyticsCountErr?.message}`}`)

// Cross-client contamination check — confirm nothing leaked into Day 1
const { count: crossCount } = await sb
  .from('posts')
  .select('*', { count: 'exact', head: true })
  .eq('client_id', DAY1_CLIENT_ID)
  .in('yt_id', allYtIds.slice(0, 100))   // sample check
console.log(`  Cross-contamination check (Day1 posts with Nick ytIds, sample): ${crossCount} (must be 0)`)

console.log('\n── Done ──────────────────────────────────────────────────────────')
