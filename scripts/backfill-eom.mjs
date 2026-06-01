/**
 * Backfill missing / zero-views eom window data for posts before May 2026.
 *
 * Logic: for any post (date < 2026-05-01) where the eom row is missing OR has
 * views = 0, copy from the best available window: w7 → w3 → w24.
 *
 * Usage:
 *   node scripts/backfill-eom.mjs            # dry-run (no writes)
 *   node scripts/backfill-eom.mjs --run      # actually upsert
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = !process.argv.includes('--run')

// ── Load env ─────────────────────────────────────────────────────────────────
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY   // service role — bypasses RLS
)

if (DRY_RUN) {
  console.log('\n📋 DRY RUN — pass --run to actually write\n')
}

async function main() {
  // 1. Fetch all posts dated before 2026-05-01
  const { data: posts, error: postsErr } = await supabase
    .from('posts')
    .select('id, client_id, post_id, date, platform')
    .lt('date', '2026-05-01')
    .not('date', 'is', null)

  if (postsErr) throw new Error(`posts fetch failed: ${postsErr.message}`)
  console.log(`Found ${posts.length} posts before 2026-05-01\n`)

  const postIds = posts.map(p => p.id)

  // 2. Fetch all analytics rows for those posts in one query
  const { data: allAnalytics, error: analyticsErr } = await supabase
    .from('post_analytics')
    .select('*')
    .in('post_id', postIds)

  if (analyticsErr) throw new Error(`analytics fetch failed: ${analyticsErr.message}`)

  // Group by post_id → { w24, w3, w7, eom }
  const byPost = {}
  for (const row of allAnalytics) {
    if (!byPost[row.post_id]) byPost[row.post_id] = {}
    byPost[row.post_id][row.metric_window] = row
  }

  // 3. Determine which posts need eom backfill
  const toUpsert = []

  for (const post of posts) {
    const windows = byPost[post.id] || {}
    const eom = windows['eom']

    // Skip if eom exists and has real data
    if (eom && (eom.views ?? 0) > 0) continue

    // Find best source window
    const source = windows['w7'] || windows['w3'] || windows['w24']
    if (!source) continue   // no data at all — skip

    toUpsert.push({
      post_id:       post.id,
      client_id:     post.client_id,
      metric_window: 'eom',
      platform:      source.platform,
      views:         source.views        ?? 0,
      likes:         source.likes        ?? 0,
      comments:      source.comments     ?? 0,
      shares:        source.shares       ?? 0,
      saves:         source.saves        ?? 0,
      followers:     source.followers    ?? 0,
      watch_pct:     source.watch_pct    ?? 0,
      hook_rate:     source.hook_rate    ?? 0,
      impressions:   source.impressions  ?? 0,
      ctr:           source.ctr         ?? 0,
      _sourceWindow: eom ? `w7→w3→w24 (was ${eom.views} views)` : `${
        windows['w7'] ? 'w7' : windows['w3'] ? 'w3' : 'w24'
      } (no eom existed)`,
      _postId:       post.post_id,
      _date:         post.date,
    })
  }

  console.log(`Posts needing eom backfill: ${toUpsert.length}`)
  if (toUpsert.length === 0) {
    console.log('\n✅ Nothing to backfill — all eom rows already have data.')
    return
  }

  // Print preview
  console.log('\nPreview (first 10):')
  for (const row of toUpsert.slice(0, 10)) {
    const src = row._sourceWindow
    console.log(`  ${row._postId.padEnd(8)} ${row._date}  views=${String(row.views).padStart(6)}  source=${src}`)
  }
  if (toUpsert.length > 10) {
    console.log(`  ... and ${toUpsert.length - 10} more`)
  }

  if (DRY_RUN) {
    console.log('\n📋 Dry run complete. Run with --run to apply.\n')
    return
  }

  // 4. Upsert in batches of 50
  const clean = toUpsert.map(({ _sourceWindow, _postId, _date, ...rest }) => rest)

  let updated = 0, errors = 0
  for (let i = 0; i < clean.length; i += 50) {
    const chunk = clean.slice(i, i + 50)
    const { error } = await supabase
      .from('post_analytics')
      .upsert(chunk, { onConflict: 'post_id,platform,metric_window' })

    if (error) {
      console.error(`  ✗ chunk ${i}–${i + 50}: ${error.message}`)
      errors += chunk.length
    } else {
      updated += chunk.length
      process.stdout.write('.')
    }
  }

  console.log(`\n\n✅ Backfill complete.`)
  console.log(`   Rows upserted: ${updated}`)
  if (errors > 0) console.log(`   Errors:        ${errors}`)
}

main().catch(err => {
  console.error('\n💥 Backfill failed:', err.message)
  process.exit(1)
})
