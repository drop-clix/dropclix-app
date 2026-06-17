/**
 * Backfill missing Instagram posts rows for linked + posted pipeline items.
 *
 * Dry-run by default:
 *   node scripts/backfill-ig-posts-rows.mjs
 *
 * Apply for Day 1:
 *   node scripts/backfill-ig-posts-rows.mjs --run
 *
 * Optional client override:
 *   node scripts/backfill-ig-posts-rows.mjs --client <client_id> --run
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')

try {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([^#=\s]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
} catch {
  console.error('Could not read .env.local — make sure it exists at the project root.')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
const DRY = !args.includes('--run')
const clientArgIndex = args.indexOf('--client')
const DAY_1_CLIENT_ID = 'f51bb5e1-9222-44d2-9f0e-795dbe3b6acd'
const CLIENT_ID = clientArgIndex >= 0 ? args[clientArgIndex + 1] : DAY_1_CLIENT_ID

if (!CLIENT_ID) {
  console.error('Missing client id after --client')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function extractIGPostId(rawPostId) {
  return String(rawPostId ?? '')
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .find(part => part.toLowerCase().startsWith('#ig')) ?? null
}

async function hasPostsRow(item, igPostId) {
  const { data: exactFull, error: fullErr } = await sb
    .from('posts')
    .select('id, post_id')
    .eq('post_id', item.post_id)
    .eq('client_id', item.client_id)
    .maybeSingle()
  if (fullErr) throw fullErr
  if (exactFull) return true

  const { data: exactSegment, error: segmentErr } = await sb
    .from('posts')
    .select('id, post_id')
    .eq('post_id', igPostId)
    .eq('client_id', item.client_id)
    .maybeSingle()
  if (segmentErr) throw segmentErr
  return Boolean(exactSegment)
}

console.log('\n── backfill-ig-posts-rows ───────────────────────────────────')
console.log(`Client: ${CLIENT_ID}`)
console.log(`Mode:   ${DRY ? 'DRY RUN (pass --run to apply)' : 'LIVE — writing to DB'}`)
console.log()

const { data: pipelineItems, error: pipeErr } = await sb
  .from('pipeline_items')
  .select('id, client_id, post_id, title, status, posted_at, pillar, ig_video_id')
  .eq('client_id', CLIENT_ID)
  .eq('status', 'POSTED')
  .not('ig_video_id', 'is', null)

if (pipeErr) {
  console.error('Error fetching pipeline_items:', pipeErr.message)
  process.exit(1)
}

const missing = []
for (const item of pipelineItems ?? []) {
  const igPostId = extractIGPostId(item.post_id)
  if (!igPostId) {
    console.warn(`Skipping ${item.post_id}: no #ig segment`)
    continue
  }
  if (await hasPostsRow(item, igPostId)) continue
  missing.push({ ...item, igPostId })
}

if (missing.length === 0) {
  console.log('No missing IG posts rows found.')
  process.exit(0)
}

console.log(`Missing IG posts rows: ${missing.length}\n`)
for (const item of missing) {
  console.log(`  ${item.post_id} -> ${item.igPostId} | ig_video_id=${item.ig_video_id} | status=${item.status}`)
}

if (DRY) {
  console.log('\n[DRY RUN] No changes made. Pass --run to create stub posts rows.')
  process.exit(0)
}

let created = 0
let failed = 0

for (const item of missing) {
  const { error } = await sb.from('posts').insert({
    client_id: item.client_id,
    post_id: item.igPostId,
    title: item.title ?? '(Instagram post)',
    platform: ['ig'],
    pillar: item.pillar ?? null,
    date: item.posted_at ? item.posted_at.slice(0, 10) : null,
  })

  if (error) {
    console.error(`  ✗ ${item.post_id} -> ${item.igPostId}: ${error.message}`)
    failed++
  } else {
    console.log(`  ✓ ${item.post_id} -> created ${item.igPostId}`)
    created++
  }
}

console.log('\n── Result ───────────────────────────────────────────────────')
console.log(`Created: ${created}`)
if (failed) console.log(`Failed:  ${failed}`)
console.log()

if (failed > 0) process.exit(1)
