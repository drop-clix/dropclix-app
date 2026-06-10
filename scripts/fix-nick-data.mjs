/**
 * fix-nick-data.mjs
 * CLIENT: Nick Nascimento — data cleanup
 *
 * Fixes:
 *   1. Week format → MonWk# (e.g. "May WK1" → "MayWk1", "M3 WK1" → "MarWk1")
 *   2. Non-standard post IDs: SL001–SL005 → #ig0118–#ig0122
 *   3. enabled_platforms → ['ig','tt','yt','lf']
 *
 * Usage:
 *   node scripts/fix-nick-data.mjs          # dry-run (shows changes, no writes)
 *   node scripts/fix-nick-data.mjs --run     # apply changes
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

const NICK_CLIENT_ID = '913f1794-1506-4449-b56c-b683809cefc3'
const DRY_RUN = !process.argv.includes('--run')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── Week normalisation ────────────────────────────────────────────────────────

const MONTH_MAP = {
  jan: 'Jan', january:   'Jan',
  feb: 'Feb', february:  'Feb',
  mar: 'Mar', march:     'Mar',
  apr: 'Apr', april:     'Apr',
  may: 'May',
  jun: 'Jun', june:      'Jun',
  jul: 'Jul', july:      'Jul',
  aug: 'Aug', august:    'Aug',
  sep: 'Sep', september: 'Sep',
  oct: 'Oct', october:   'Oct',
  nov: 'Nov', november:  'Nov',
  dec: 'Dec', december:  'Dec',
  // Numeric months
  m1:  'Jan', m2: 'Feb', m3: 'Mar', m4:  'Apr',
  m5:  'May', m6: 'Jun', m7: 'Jul', m8:  'Aug',
  m9:  'Sep', m10:'Oct', m11:'Nov', m12: 'Dec',
}

const FALLBACK = 'MayWk2'

function normaliseWeek(raw) {
  if (!raw || !raw.trim()) return null
  const s = raw.trim()

  // Already correct
  if (/^[A-Z][a-z]{2}Wk[1-4]$/.test(s)) return s

  const lower = s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
  const tokens = lower.split(' ')

  let month = null
  let weekNum = null

  // Match month aliases (longest-first so m10/m11/m12 match before m1)
  const sortedAliases = Object.keys(MONTH_MAP).sort((a, b) => b.length - a.length)
  for (const alias of sortedAliases) {
    if (tokens.some(t => t === alias)) {
      month = MONTH_MAP[alias]
      break
    }
  }

  // Match week number — handles wk1, wk 1, week1, week 1, wk5 (capped to 4)
  const wkMatch = lower.match(/\bw(?:k|ee?k?)?\s*([1-9])\b/)
    ?? lower.match(/\b([1-9])\b/)
  if (wkMatch) weekNum = parseInt(wkMatch[1], 10)

  // Cap week 5 → 4 (some calendars have partial 5th weeks)
  if (weekNum && weekNum > 4) weekNum = 4

  if (month && weekNum && weekNum >= 1 && weekNum <= 4) {
    return `${month}Wk${weekNum}`
  }

  return FALLBACK
}

// ── ID fixes ─────────────────────────────────────────────────────────────────
// SL001–SL005 → #ig0118–#ig0122 (confirmed from previous session)

const ID_FIXES = {
  'SL001': '#ig0118',
  'SL002': '#ig0119',
  'SL003': '#ig0120',
  'SL004': '#ig0121',
  'SL005': '#ig0122',
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN
    ? '\n🔍  DRY RUN — no changes will be written\n'
    : '\n🚀  APPLYING CHANGES\n')

  // ── Part 1: Week format fixes ──────────────────────────────────────────────
  console.log('━━━ Part 1: Week format ━━━\n')

  const { data: items, error: fetchErr } = await supabase
    .from('pipeline_items')
    .select('id, week, title, post_id')
    .eq('client_id', NICK_CLIENT_ID)
    .not('week', 'is', null)

  if (fetchErr) { console.error('Fetch error:', fetchErr.message); process.exit(1) }

  const weekFixes = []
  let weekCorrect = 0

  for (const item of items) {
    const normalised = normaliseWeek(item.week)
    if (normalised === item.week) {
      weekCorrect++
    } else {
      weekFixes.push({ id: item.id, post_id: item.post_id, title: item.title, old: item.week, new: normalised })
    }
  }

  console.log(`Items with week set: ${items.length}`)
  console.log(`Already correct:     ${weekCorrect}`)
  console.log(`Need fixing:         ${weekFixes.length}\n`)

  for (const f of weekFixes) {
    console.log(`  ${String(f.old).padEnd(22)} → ${String(f.new).padEnd(10)}  "${(f.title ?? '').slice(0, 50)}"`)
  }

  // ── Part 2: ID fixes ───────────────────────────────────────────────────────
  console.log('\n━━━ Part 2: Post ID fixes ━━━\n')

  const { data: allItems } = await supabase
    .from('pipeline_items')
    .select('id, post_id, title, platform, status')
    .eq('client_id', NICK_CLIENT_ID)

  const idFixes = []
  for (const item of allItems ?? []) {
    const currentId = (item.post_id ?? '').trim()
    if (ID_FIXES[currentId]) {
      idFixes.push({
        id: item.id,
        post_id: item.post_id,
        newPostId: ID_FIXES[currentId],
        title: item.title,
        platform: item.platform,
        status: item.status,
      })
    }
  }

  if (idFixes.length === 0) {
    console.log('  No SL### IDs found — already fixed or not present.')
  } else {
    for (const f of idFixes) {
      console.log(`  ${String(f.post_id).padEnd(10)} → ${f.newPostId}  [${(f.platform ?? []).join(',')}] ${f.status}  "${(f.title ?? '').slice(0, 45)}"`)
    }
  }

  // ── Part 3: enabled_platforms ──────────────────────────────────────────────
  console.log('\n━━━ Part 3: enabled_platforms ━━━\n')

  const { data: client } = await supabase
    .from('clients')
    .select('name, enabled_platforms')
    .eq('id', NICK_CLIENT_ID)
    .single()

  console.log(`  Current: ${JSON.stringify(client?.enabled_platforms)}`)
  console.log(`  New:     ["ig","tt","yt","lf"]`)

  // ── Apply ──────────────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n\nRun with --run to apply these changes.\n')
    return
  }

  console.log('\n\nApplying…\n')

  // Week fixes
  let weekOk = 0, weekFail = 0
  for (const f of weekFixes) {
    const { error } = await supabase
      .from('pipeline_items')
      .update({ week: f.new })
      .eq('id', f.id)
    if (error) { console.error(`  ✗ week ${f.id}: ${error.message}`); weekFail++ }
    else weekOk++
  }
  console.log(`  Week fixes: ✓ ${weekOk}${weekFail ? ` ✗ ${weekFail}` : ''}`)

  // ID fixes
  let idOk = 0, idFail = 0
  for (const f of idFixes) {
    const { error } = await supabase
      .from('pipeline_items')
      .update({ post_id: f.newPostId })
      .eq('id', f.id)
    if (error) { console.error(`  ✗ id ${f.id}: ${error.message}`); idFail++ }
    else idOk++
  }
  console.log(`  ID fixes:   ✓ ${idOk}${idFail ? ` ✗ ${idFail}` : ''}`)

  // enabled_platforms
  const { error: platErr } = await supabase
    .from('clients')
    .update({ enabled_platforms: ['ig', 'tt', 'yt', 'lf'] })
    .eq('id', NICK_CLIENT_ID)
  if (platErr) {
    console.error(`  ✗ enabled_platforms: ${platErr.message}`)
  } else {
    console.log(`  enabled_platforms: ✓ updated to ["ig","tt","yt","lf"]`)
  }

  console.log('\n✅  Done.\n')
}

main().catch(e => { console.error(e); process.exit(1) })
