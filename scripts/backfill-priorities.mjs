/**
 * Backfill pipeline_items.priority to match the STATUS_PRIORITY mapping.
 * Run: node scripts/backfill-priorities.mjs [--run]
 *
 * STATUS_PRIORITY:
 *   REVIEWING → 1, FILMING → 2, SCRIPTED → 3, PLANNED → 4,
 *   EDITING → 5, SCHEDULED → 5, POSTED → 6, CANCELLED → 6
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// Load env from .env.local
const envPath = resolve(__dirname, '../.env.local')
const env = {}
try {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '')
  })
} catch { /* ok */ }

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SECRET_KEY      || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const STATUS_PRIORITY = {
  REVIEWING: 1,
  FILMING:   2,
  SCRIPTED:  3,
  PLANNED:   4,
  EDITING:   5,
  SCHEDULED: 5,
  POSTED:    6,
  CANCELLED: 6,
}

const DRY_RUN = !process.argv.includes('--run')
if (DRY_RUN) {
  console.log('DRY RUN — pass --run to apply changes\n')
}

const { data: rows, error } = await supabase
  .from('pipeline_items')
  .select('id, post_id, status, priority, client_id')
  .order('created_at', { ascending: true })

if (error) { console.error('Fetch error:', error.message); process.exit(1) }

const toUpdate = rows.filter(r => {
  const expected = STATUS_PRIORITY[r.status]
  return expected !== undefined && r.priority !== expected
})

console.log(`Total rows:     ${rows.length}`)
console.log(`Rows to fix:    ${toUpdate.length}`)
console.log()

if (toUpdate.length === 0) {
  console.log('All priorities already match — nothing to do.')
  process.exit(0)
}

// Group by expected priority for summary
const groups = {}
for (const r of toUpdate) {
  const expected = STATUS_PRIORITY[r.status]
  const key = `${r.status} → pri ${expected} (was ${r.priority})`
  if (!groups[key]) groups[key] = []
  groups[key].push(r.post_id || r.id)
}
for (const [key, ids] of Object.entries(groups)) {
  console.log(`  ${key}: ${ids.length} row(s)`)
}
console.log()

if (DRY_RUN) {
  console.log('Pass --run to apply.')
  process.exit(0)
}

let fixed = 0
let errors = 0
for (const r of toUpdate) {
  const expected = STATUS_PRIORITY[r.status]
  const { error: upErr } = await supabase
    .from('pipeline_items')
    .update({ priority: expected })
    .eq('id', r.id)

  if (upErr) {
    console.error(`  ✗ ${r.post_id || r.id}: ${upErr.message}`)
    errors++
  } else {
    fixed++
    process.stdout.write(`\r  Fixed ${fixed}/${toUpdate.length}…`)
  }
}

console.log(`\n\nDone. Fixed: ${fixed}, Errors: ${errors}`)
