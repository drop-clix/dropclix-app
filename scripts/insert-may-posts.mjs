/**
 * Insert 8 new May 2026 posts for Nick (#ig0045–#ig0052).
 * Dates are placeholders — update in Supabase or via the data-entry form.
 *
 * Usage:
 *   node scripts/insert-may-posts.mjs          # dry-run
 *   node scripts/insert-may-posts.mjs --run    # insert
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = !process.argv.includes('--run')

const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)

const CLIENT_ID = '913f1794-1506-4449-b56c-b683809cefc3'

// Dates spread across May after #ig0043 (May 8). Update real dates in the form.
const newPosts = [
  { post_id: '#ig0045', title: 'Weak leader need their reps',               date: '2026-05-10' },
  { post_id: '#ig0046', title: 'Door 2 Door sucks...',                       date: '2026-05-13' },
  { post_id: '#ig0047', title: 'Pipeline paradox 80%',                       date: '2026-05-16' },
  { post_id: '#ig0048', title: 'The reason your scripts are failing you',    date: '2026-05-18' },
  { post_id: '#ig0049', title: 'The fire trap',                              date: '2026-05-21' },
  { post_id: '#ig0050', title: 'How to get more time',                       date: '2026-05-23' },
  { post_id: '#ig0051', title: 'Increase the effort & Decrease the expectation', date: '2026-05-26' },
  { post_id: '#ig0052', title: "You're in control of your success",          date: '2026-05-29' },
]

if (DRY_RUN) {
  console.log('DRY RUN — would insert:\n')
  newPosts.forEach(p => console.log(`  ${p.post_id}  ${p.date}  ${p.title}`))
  console.log('\nRun with --run to insert.')
  process.exit(0)
}

const { data: existing } = await supabase
  .from('posts')
  .select('post_id')
  .in('post_id', newPosts.map(p => p.post_id))

const existingIds = new Set((existing ?? []).map(p => p.post_id))
if (existingIds.size) {
  console.log(`⚠  Already exists (skipping): ${[...existingIds].join(', ')}`)
}

const toInsert = newPosts
  .filter(p => !existingIds.has(p.post_id))
  .map(p => ({
    id:        randomUUID(),
    client_id: CLIENT_ID,
    post_id:   p.post_id,
    title:     p.title,
    date:      p.date,
    platform:  ['ig'],
    pillar:    null,
    hook:      null,
    format:    null,
    cta:       null,
    decision:  null,
    notes:     null,
  }))

if (!toInsert.length) {
  console.log('Nothing to insert.')
  process.exit(0)
}

const { error } = await supabase.from('posts').insert(toInsert)
if (error) { console.error('Insert error:', error.message); process.exit(1) }

console.log(`✓ Inserted ${toInsert.length} posts:`)
toInsert.forEach(p => console.log(`  ${p.post_id}  ${p.date}  ${p.title}`))
