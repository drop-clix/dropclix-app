/**
 * fix-missing-posts-rows.mjs
 * GLOBAL — finds pipeline items with yt_video_id set that have no matching posts row,
 * and creates stub posts rows so the cron can write to post_analytics.
 *
 * Uses 3-strategy lookup (same as pollPipelineItem + ensureYTPostsRow):
 *   1. Exact post_id match
 *   2. Pipe-split match (e.g., "#ig0037 | #tt0007 | #yt0087")
 *   3. yt_id match (posts.yt_id = pipeline_items.yt_video_id)
 *
 * Usage:
 *   node scripts/fix-missing-posts-rows.mjs          # dry-run
 *   node scripts/fix-missing-posts-rows.mjs --run     # create missing stubs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = key => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()

const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY  = get('SUPABASE_SECRET_KEY')
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}

const sb  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const DRY = !process.argv.includes('--run')

console.log(`\n── fix-missing-posts-rows ────────────────────────────────────`)
console.log(`Mode: ${DRY ? 'DRY RUN (pass --run to apply)' : 'LIVE — writing to DB'}`)
console.log()

// ── 1. Fetch all pipeline items with yt_video_id set ─────────────────────

const { data: pipeItems, error: pErr } = await sb
  .from('pipeline_items')
  .select('id, post_id, client_id, title, platform, posted_at, yt_video_id, status')
  .not('yt_video_id', 'is', null)

if (pErr) { console.error('Error fetching pipeline_items:', pErr.message); process.exit(1) }
console.log(`Found ${pipeItems.length} pipeline items with yt_video_id set.\n`)

// ── 2. For each, try to resolve a posts row ───────────────────────────────

const missing = []

for (const item of pipeItems) {
  // Strategy 1: exact match
  const { data: exact } = await sb.from('posts').select('id, post_id')
    .eq('post_id', item.post_id).eq('client_id', item.client_id).maybeSingle()
  if (exact) continue

  // Strategy 2: pipe-split
  let found = false
  if (item.post_id.includes('|')) {
    for (const part of item.post_id.split('|').map(s => s.trim()).filter(Boolean)) {
      const { data } = await sb.from('posts').select('id')
        .eq('post_id', part).eq('client_id', item.client_id).maybeSingle()
      if (data) { found = true; break }
    }
  }
  if (found) continue

  // Strategy 3: yt_id
  const { data: byYt } = await sb.from('posts').select('id')
    .eq('yt_id', item.yt_video_id).eq('client_id', item.client_id).maybeSingle()
  if (byYt) continue

  missing.push(item)
}

if (missing.length === 0) {
  console.log('All pipeline items with yt_video_id have a resolvable posts row. Nothing to fix.')
  process.exit(0)
}

// Group by client for readability
const byClient = {}
for (const item of missing) {
  if (!byClient[item.client_id]) byClient[item.client_id] = []
  byClient[item.client_id].push(item)
}

console.log(`Missing posts rows: ${missing.length} item(s) across ${Object.keys(byClient).length} client(s)\n`)
for (const [cid, items] of Object.entries(byClient)) {
  console.log(`  Client ${cid}:`)
  for (const item of items) {
    console.log(`    post_id="${item.post_id}" yt_video_id=${item.yt_video_id} status=${item.status}`)
  }
}

if (DRY) {
  console.log('\n[DRY RUN] No changes made. Pass --run to create stub posts rows.')
  process.exit(0)
}

// ── 3. Create stub posts rows ─────────────────────────────────────────────

console.log('\nCreating stub posts rows...')
let created = 0, failed = 0

for (const [cid, items] of Object.entries(byClient)) {
  // Get the next available #yt number for this client
  const { data: lastYt } = await sb.from('posts').select('post_id')
    .eq('client_id', cid).like('post_id', '#yt%').order('post_id', { ascending: false }).limit(1)

  let nextNum = 1
  if (lastYt && lastYt.length > 0) {
    const n = parseInt(lastYt[0].post_id.replace('#yt', ''), 10)
    if (!isNaN(n)) nextNum = n + 1
  }

  for (const item of items) {
    const newPostId = `#yt${String(nextNum).padStart(4, '0')}`
    nextNum++

    const platform = Array.isArray(item.platform) && item.platform.length > 0
      ? item.platform
      : ['yt']

    const { error } = await sb.from('posts').insert({
      client_id: cid,
      post_id:   newPostId,
      title:     item.title ?? '(YouTube video)',
      platform,
      date:      item.posted_at ? item.posted_at.slice(0, 10) : null,
      yt_id:     item.yt_video_id,
    })

    if (error) {
      console.error(`  ✗ ${item.post_id} → ${newPostId}: ${error.message}`)
      failed++
    } else {
      console.log(`  ✓ ${item.post_id} → stub ${newPostId} (yt_id=${item.yt_video_id})`)
      created++
    }
  }
}

console.log(`\n── Result ───────────────────────────────────────────────────`)
console.log(`Created: ${created}`)
if (failed) console.log(`Failed:  ${failed}`)
console.log()
