/**
 * backfill-yt-video-id.mjs
 * GLOBAL — copies posts.yt_id → pipeline_items.yt_video_id for all clients.
 *
 * Run after sessions where pipeline items were created before yt_video_id
 * was added to the import scripts (pre-S37). Also covers any client whose
 * YT videos were imported via ingest-yt-csv.mjs without the pipeline fix.
 *
 * Usage:
 *   node scripts/backfill-yt-video-id.mjs          # dry-run
 *   node scripts/backfill-yt-video-id.mjs --run     # apply
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

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const DRY = !process.argv.includes('--run')

console.log(`\n── backfill-yt-video-id ──────────────────────────────────────`)
console.log(`Mode: ${DRY ? 'DRY RUN (pass --run to apply)' : 'LIVE — writing to DB'}`)
console.log()

// ── 1. Find pipeline items that need yt_video_id backfilled ──────────────
// Source: posts.yt_id (set by ingest-yt-csv.mjs)
// Target: pipeline_items.yt_video_id (never written by ingest script pre-S39)
// Condition: posts.yt_id IS NOT NULL AND pipeline_items.yt_video_id IS NULL

const { data: posts, error: postsErr } = await sb
  .from('posts')
  .select('id, post_id, client_id, yt_id')
  .not('yt_id', 'is', null)

if (postsErr) {
  console.error('Error fetching posts:', postsErr.message)
  process.exit(1)
}
if (!posts || posts.length === 0) {
  console.log('No posts with yt_id found. Nothing to backfill.')
  process.exit(0)
}
console.log(`Found ${posts.length} posts with yt_id set.`)

// Build map: client_id::text_post_id → { posts_uuid, yt_id }
const postMap = {}
for (const p of posts) {
  postMap[`${p.client_id}::${p.post_id}`] = { uuid: p.id, ytId: p.yt_id }
}

// Fetch pipeline items that match those posts and have yt_video_id = null
const textPostIds = posts.map(p => p.post_id)
const clientIds   = [...new Set(posts.map(p => p.client_id))]

const { data: pipeItems, error: pipeErr } = await sb
  .from('pipeline_items')
  .select('id, post_id, client_id, yt_video_id, status')
  .in('client_id', clientIds)
  .in('post_id', textPostIds)
  .is('yt_video_id', null)

if (pipeErr) {
  console.error('Error fetching pipeline_items:', pipeErr.message)
  process.exit(1)
}

if (!pipeItems || pipeItems.length === 0) {
  console.log('All matching pipeline items already have yt_video_id set. Nothing to backfill.')
  process.exit(0)
}

// ── 2. Plan the updates ───────────────────────────────────────────────────

const toUpdate = []
for (const item of pipeItems) {
  const key  = `${item.client_id}::${item.post_id}`
  const post = postMap[key]
  if (!post?.ytId) continue
  toUpdate.push({
    id:          item.id,
    post_id:     item.post_id,
    client_id:   item.client_id,
    yt_video_id: post.ytId,
    status:      item.status,
  })
}

if (toUpdate.length === 0) {
  console.log('No pipeline items found to update (post_id mismatch or yt_id missing).')
  process.exit(0)
}

// Group by client for reporting
const byClient = {}
for (const u of toUpdate) {
  if (!byClient[u.client_id]) byClient[u.client_id] = []
  byClient[u.client_id].push(u)
}

console.log(`\nTo backfill: ${toUpdate.length} pipeline item(s) across ${Object.keys(byClient).length} client(s)`)
for (const [cid, items] of Object.entries(byClient)) {
  console.log(`\n  Client ${cid} — ${items.length} item(s):`)
  for (const item of items) {
    console.log(`    ${item.post_id.padEnd(10)} [${item.status}] → yt_video_id = ${item.yt_video_id}`)
  }
}

if (DRY) {
  console.log('\n[DRY RUN] No changes made. Pass --run to apply.')
  process.exit(0)
}

// ── 3. Apply updates ──────────────────────────────────────────────────────
console.log('\nApplying updates...')
let updated = 0
let failed  = 0

for (const u of toUpdate) {
  const { error } = await sb
    .from('pipeline_items')
    .update({ yt_video_id: u.yt_video_id })
    .eq('id', u.id)

  if (error) {
    console.error(`  ✗ ${u.post_id} (${u.id}): ${error.message}`)
    failed++
  } else {
    console.log(`  ✓ ${u.post_id} → ${u.yt_video_id}`)
    updated++
  }
}

console.log(`\n── Result ───────────────────────────────────────────────────`)
console.log(`Updated: ${updated}`)
if (failed) console.log(`Failed:  ${failed}`)
console.log()
