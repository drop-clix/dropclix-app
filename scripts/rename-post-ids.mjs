/**
 * Rename all post IDs to sequential #ig0001, #ig0002, ... format.
 * Ordered by post date ASC (oldest = #ig0001); ties broken by old post_id ASC.
 *
 * Tables updated:
 *   posts            — post_id text field
 *   pipeline_items   — post_id text field (only rows whose id is in posts)
 *   calendar_events  — notes JSON post_id key (only where id is in posts)
 *
 * post_analytics.post_id is a UUID FK to posts.id — NOT touched.
 *
 * Usage:
 *   node scripts/rename-post-ids.mjs          # dry-run
 *   node scripts/rename-post-ids.mjs --run    # apply
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = !process.argv.includes('--run')

const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)

if (DRY_RUN) console.log('\n📋 DRY RUN — pass --run to apply\n')

async function main() {
  // ── 1. Fetch posts ordered by date ASC, post_id ASC (stable tie-break) ──────
  const { data: posts, error: postsErr } = await sb
    .from('posts')
    .select('id, post_id, client_id, date')
    .order('date', { ascending: true })
    .order('post_id', { ascending: true })

  if (postsErr) throw new Error(`posts fetch: ${postsErr.message}`)

  // ── 2. Build mapping ─────────────────────────────────────────────────────────
  const mapping = {}   // old → new
  const postRows = []  // { id, client_id, oldId, newId }

  posts.forEach((p, i) => {
    const newId = `#ig${String(i + 1).padStart(4, '0')}`
    mapping[p.post_id] = newId
    postRows.push({ id: p.id, client_id: p.client_id, oldId: p.post_id, newId, date: p.date })
  })

  console.log('Mapping (old → new):')
  for (const row of postRows) {
    console.log(`  ${row.oldId.padEnd(8)}  →  ${row.newId}  (${row.date})`)
  }

  if (DRY_RUN) {
    // Preview pipeline and calendar impact
    const { data: pipe } = await sb.from('pipeline_items').select('post_id').in('post_id', Object.keys(mapping))
    const pipeCount = pipe?.length ?? 0

    const { data: cal } = await sb.from('calendar_events').select('id,notes').not('notes','is',null)
    const calAffected = (cal ?? []).filter(e => {
      try { const n = JSON.parse(e.notes); return mapping[n.post_id] } catch { return false }
    })

    console.log(`\nWould update:`)
    console.log(`  posts:           ${postRows.length} rows`)
    console.log(`  pipeline_items:  ${pipeCount} rows`)
    console.log(`  calendar_events: ${calAffected.length} rows (notes JSON)`)
    console.log('\n📋 Dry run complete. Pass --run to apply.\n')
    return
  }

  // ── 3. Update posts.post_id ──────────────────────────────────────────────────
  console.log('\nUpdating posts...')
  let postsOk = 0, postsErr2 = 0
  for (const row of postRows) {
    const { error } = await sb
      .from('posts')
      .update({ post_id: row.newId })
      .eq('id', row.id)
    if (error) {
      console.error(`  ✗ ${row.oldId}: ${error.message}`)
      postsErr2++
    } else {
      postsOk++
      process.stdout.write('.')
    }
  }
  console.log(`\n  ✓ ${postsOk} posts updated, ${postsErr2} errors`)

  // ── 4. Update pipeline_items.post_id ────────────────────────────────────────
  console.log('\nUpdating pipeline_items...')
  let pipeOk = 0, pipeErrors = 0
  for (const [oldId, newId] of Object.entries(mapping)) {
    const { error, count } = await sb
      .from('pipeline_items')
      .update({ post_id: newId })
      .eq('post_id', oldId)
      .select('id', { count: 'exact', head: true })
    if (error) {
      console.error(`  ✗ pipeline ${oldId}: ${error.message}`)
      pipeErrors++
    } else {
      pipeOk++
    }
  }
  // Get total rows affected
  const { data: pipeCheck } = await sb
    .from('pipeline_items')
    .select('post_id', { count: 'exact', head: false })
    .in('post_id', Object.values(mapping))
  console.log(`  ✓ ${pipeOk} post_id values updated in pipeline_items, ${pipeErrors} errors`)

  // ── 5. Update calendar_events notes JSON ────────────────────────────────────
  console.log('\nUpdating calendar_events notes...')
  const { data: calRows, error: calErr } = await sb
    .from('calendar_events')
    .select('id, notes')
    .not('notes', 'is', null)

  if (calErr) throw new Error(`calendar fetch: ${calErr.message}`)

  let calOk = 0, calSkip = 0, calErrors = 0
  for (const ev of calRows) {
    let parsed
    try { parsed = JSON.parse(ev.notes) } catch { calSkip++; continue }
    if (!parsed.post_id || !mapping[parsed.post_id]) { calSkip++; continue }

    const updated = { ...parsed, post_id: mapping[parsed.post_id] }
    const { error } = await sb
      .from('calendar_events')
      .update({ notes: JSON.stringify(updated) })
      .eq('id', ev.id)

    if (error) {
      console.error(`  ✗ cal ${ev.id.slice(0,8)}: ${error.message}`)
      calErrors++
    } else {
      calOk++
    }
  }
  console.log(`  ✓ ${calOk} calendar events updated, ${calSkip} skipped (no match), ${calErrors} errors`)

  // ── 6. Summary ───────────────────────────────────────────────────────────────
  console.log('\n✅ Rename complete!\n')
  console.log('Full mapping:')
  console.log('  Old ID    → New ID      Date')
  console.log('  ────────────────────────────────────')
  for (const row of postRows) {
    console.log(`  ${row.oldId.padEnd(8)}  →  ${row.newId}  (${row.date})`)
  }
}

main().catch(err => {
  console.error('\n💥 Failed:', err.message)
  process.exit(1)
})
