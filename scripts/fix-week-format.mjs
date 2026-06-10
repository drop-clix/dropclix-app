/**
 * fix-week-format.mjs
 * Normalises pipeline_items.week to MonWk# format (e.g. JanWk1, MayWk2).
 * Items with unrecognisable week values → set to 'MayWk2'.
 *
 * Usage:
 *   node scripts/fix-week-format.mjs          # dry-run (shows changes, no writes)
 *   node scripts/fix-week-format.mjs --run     # apply changes
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dir, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}

const DRY_RUN = !process.argv.includes('--run')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_ALIASES = {
  january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr', may: 'May',
  june: 'Jun', july: 'Jul', august: 'Aug', september: 'Sep', october: 'Oct',
  november: 'Nov', december: 'Dec',
  jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', jun: 'Jun', jul: 'Jul',
  aug: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec',
}

const FALLBACK = 'MayWk2'

function normalise(raw) {
  if (!raw || !raw.trim()) return null
  const s = raw.trim()

  // Already in correct format: MonWk# (e.g. JanWk1, MayWk2, JunWk4)
  if (/^[A-Z][a-z]{2}Wk[1-4]$/.test(s)) return s

  // Try to parse month + week number from various formats
  // Patterns: "May Week 2", "May Wk 2", "Week 2 May", "Wk 2 May", "May W2", "May2"
  const lower = s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

  let month = null
  let weekNum = null

  // Check for month name
  for (const [alias, mon] of Object.entries(MONTH_ALIASES)) {
    if (lower.includes(alias)) {
      month = mon
      break
    }
  }

  // Check for week number
  const weekMatch = lower.match(/w(?:ee?k?)?\s*([1-4])\b/) ?? lower.match(/\b([1-4])\b/)
  if (weekMatch) weekNum = parseInt(weekMatch[1], 10)

  if (month && weekNum && weekNum >= 1 && weekNum <= 4) {
    return `${month}Wk${weekNum}`
  }

  // Pure number like "1", "2" with no month context → fallback
  return FALLBACK
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be written\n' : '🚀 APPLYING CHANGES\n')

  const { data: items, error } = await supabase
    .from('pipeline_items')
    .select('id, week, title, client_id')
    .not('week', 'is', null)

  if (error) { console.error('Fetch error:', error.message); process.exit(1) }

  console.log(`Found ${items.length} items with a week value.\n`)

  const toUpdate = []
  let alreadyCorrect = 0

  for (const item of items) {
    const normalised = normalise(item.week)
    if (normalised === item.week) {
      alreadyCorrect++
      continue
    }
    toUpdate.push({ id: item.id, title: item.title, old: item.week, new: normalised })
  }

  console.log(`Already correct: ${alreadyCorrect}`)
  console.log(`Need updating:   ${toUpdate.length}\n`)

  if (toUpdate.length === 0) {
    console.log('Nothing to change.')
    return
  }

  for (const row of toUpdate) {
    console.log(`  ${row.old?.padEnd(20) ?? '(null)'.padEnd(20)} → ${row.new}  |  "${row.title?.slice(0, 50)}"`)
  }

  if (DRY_RUN) {
    console.log('\nRun with --run to apply these changes.')
    return
  }

  console.log('\nApplying…')
  let ok = 0, fail = 0
  for (const row of toUpdate) {
    const { error: upErr } = await supabase
      .from('pipeline_items')
      .update({ week: row.new })
      .eq('id', row.id)
    if (upErr) { console.error(`  ✗ ${row.id}: ${upErr.message}`); fail++ }
    else { ok++ }
  }

  console.log(`\n✓ Updated ${ok} rows.${fail ? ` ✗ ${fail} failed.` : ''}`)
}

main().catch(e => { console.error(e); process.exit(1) })
