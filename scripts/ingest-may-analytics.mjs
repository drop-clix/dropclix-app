/**
 * Ingest May 2026 EOM analytics from the filled CSV + manual Saudi Cup data.
 * - Updates #ig0035 date → 2026-05-04
 * - Updates #ig0042 date → 2026-05-06
 * - Wipes stale analytics for all 11 May posts, inserts fresh rows.
 *
 * Usage:
 *   node scripts/ingest-may-analytics.mjs          # dry-run
 *   node scripts/ingest-may-analytics.mjs --run    # apply
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const DRY_RUN    = !process.argv.includes('--run')
const CLIENT_ID  = '913f1794-1506-4449-b56c-b683809cefc3'

// ── Env ───────────────────────────────────────────────────────────────────
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)

// ── Parse CSV ─────────────────────────────────────────────────────────────
const csvPath = join(__dirname, '../../../../Downloads/may-eom-filled.csv')
const csvLines = readFileSync(csvPath, 'utf-8').trim().split('\n')
const headers  = csvLines[0].split(',')
const n = h => headers.indexOf(h)

const csvRows = csvLines.slice(1).map(line => {
  const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(',')
  const clean = v => v?.replace(/^"|"$/g,'').trim()
  const num   = v => clean(v) === '' || clean(v) === undefined ? null : Number(clean(v))
  return {
    post_id:       clean(cols[n('post_id')]),
    views_24h:     num(cols[n('views_24h')]),
    views_3d:      num(cols[n('views_3d')]),
    views_7d:      num(cols[n('views_7d')]),
    eom_views:     num(cols[n('eom_views')]),
    eom_likes:     num(cols[n('eom_likes')]),
    eom_comments:  num(cols[n('eom_comments')]),
    eom_shares:    num(cols[n('eom_shares')]),
    eom_saves:     num(cols[n('eom_saves')]),
    eom_watch_pct:  num(cols[n('eom_watch_pct')]),
    eom_followers:  num(cols[n('eom_followers')]),
    eom_skip_rate:  num(cols[n('eom_skip_rate')]),
  }
}).filter(r => r.post_id)

// Inject Saudi Cup — provided verbally, not in CSV
const saudiCup = {
  post_id: '#ig0042',
  views_24h: null, views_3d: null, views_7d: null,
  eom_views: 2210, eom_likes: 58, eom_comments: 1,
  eom_shares: 29, eom_saves: 14, eom_watch_pct: 21.5, eom_followers: 1,
  eom_skip_rate: 58.2,
}
// Replace any partial #ig0042 row from CSV (it had no data) with verbally provided data
const allRows = [...csvRows.filter(r => r.post_id !== '#ig0042'), saudiCup]

// ── Build analytics rows ──────────────────────────────────────────────────
function makeRow(postUuid, window, metrics) {
  return {
    id:            randomUUID(),
    client_id:     CLIENT_ID,
    post_id:       postUuid,
    metric_window: window,
    platform:      'ig',
    views:         metrics.views      ?? null,
    likes:         metrics.likes      ?? null,
    comments:      metrics.comments   ?? null,
    shares:        metrics.shares     ?? null,
    saves:         metrics.saves      ?? null,
    watch_pct:     metrics.watch_pct  ?? null,
    followers:     metrics.followers  ?? null,
    skip_rate:     metrics.skip_rate  ?? null,
    hook_rate:     null,
    impressions:   null,
    ctr:           null,
    yt_id:         null,
  }
}

// ── Fetch post UUIDs ─────────────────────────────────────────────────────
const MAY_POST_IDS = allRows.map(r => r.post_id)
const { data: posts, error: postsErr } = await supabase
  .from('posts').select('id, post_id').in('post_id', MAY_POST_IDS)
if (postsErr) { console.error(postsErr.message); process.exit(1) }
const uuidMap = Object.fromEntries(posts.map(p => [p.post_id, p.id]))

// ── Compose analytics rows to insert ─────────────────────────────────────
const toInsert = []

for (const row of allRows) {
  const uuid = uuidMap[row.post_id]
  if (!uuid) { console.warn(`⚠  No post UUID for ${row.post_id} — skipping`); continue }

  // 24h window
  if (row.views_24h !== null)
    toInsert.push(makeRow(uuid, 'w24', { views: row.views_24h }))

  // 3-day window
  if (row.views_3d !== null)
    toInsert.push(makeRow(uuid, 'w3', { views: row.views_3d }))

  // 7-day window
  if (row.views_7d !== null)
    toInsert.push(makeRow(uuid, 'w7', { views: row.views_7d }))

  // EOM window — only if at least views provided
  if (row.eom_views !== null)
    toInsert.push(makeRow(uuid, 'eom', {
      views:     row.eom_views,
      likes:     row.eom_likes,
      comments:  row.eom_comments,
      shares:    row.eom_shares,
      saves:     row.eom_saves,
      watch_pct: row.eom_watch_pct,
      followers: row.eom_followers,
      skip_rate: row.eom_skip_rate,
    }))
}

// ── Date corrections ──────────────────────────────────────────────────────
const dateUpdates = [
  { post_id: '#ig0035', date: '2026-05-04' },   // Nick Hype Post — actually May 4
  { post_id: '#ig0042', date: '2026-05-06' },   // Saudi Cup — actually May 6
]

// ── Preview ───────────────────────────────────────────────────────────────
console.log('\nDate corrections:')
dateUpdates.forEach(u => console.log(`  ${u.post_id} → ${u.date}`))

console.log('\nAnalytics rows to insert:')
toInsert.forEach(r => {
  const label = Object.entries(uuidMap).find(([,v])=>v===r.post_id)?.[0] ?? r.post_id.slice(0,8)
  const extras = r.metric_window === 'eom'
    ? ` | views=${r.views} likes=${r.likes} comments=${r.comments} shares=${r.shares} saves=${r.saves} watch=${r.watch_pct}% followers=${r.followers}`
    : ` | views=${r.views}`
  console.log(`  ${label}  [${r.metric_window}]${extras}`)
})

const uuidsToWipe = [...new Set(toInsert.map(r => r.post_id))]
console.log(`\nWill delete existing analytics for ${uuidsToWipe.length} posts, then insert ${toInsert.length} rows.`)

if (DRY_RUN) {
  console.log('\nDRY RUN — run with --run to apply.')
  process.exit(0)
}

// ── Apply ─────────────────────────────────────────────────────────────────

// 1. Update dates
for (const u of dateUpdates) {
  const { error } = await supabase.from('posts').update({ date: u.date }).eq('post_id', u.post_id)
  if (error) console.warn(`  Date update ${u.post_id} failed:`, error.message)
  else console.log(`✓ Date updated ${u.post_id} → ${u.date}`)
}

// 2. Wipe stale analytics for all May posts we're inserting
const { error: delErr } = await supabase
  .from('post_analytics')
  .delete()
  .in('post_id', uuidsToWipe)
if (delErr) { console.error('Delete failed:', delErr.message); process.exit(1) }
console.log(`✓ Deleted stale analytics rows for ${uuidsToWipe.length} posts`)

// 3. Insert fresh rows
const { error: insErr } = await supabase.from('post_analytics').insert(toInsert)
if (insErr) { console.error('Insert failed:', insErr.message); process.exit(1) }
console.log(`✓ Inserted ${toInsert.length} analytics rows`)

console.log('\nAll done.')
