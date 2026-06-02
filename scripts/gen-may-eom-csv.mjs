/**
 * Fetches all posts with date >= 2026-05-01 and writes may-eom-input.csv
 * to the project root for Chase to fill in EOM metrics.
 *
 * Usage: node scripts/gen-may-eom-csv.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY
)

const { data: posts, error } = await supabase
  .from('posts')
  .select('post_id, title, date')
  .gte('date', '2026-05-01')
  .order('date', { ascending: true })

if (error) {
  console.error('Supabase error:', error.message)
  process.exit(1)
}

if (!posts || posts.length === 0) {
  console.log('No posts found with date >= 2026-05-01.')
  process.exit(0)
}

const header = 'post_id,title,date,views,likes,comments,shares,saves,watch_pct,followers_gained'

const rows = posts.map(p => {
  const title = `"${(p.title ?? '').replace(/"/g, '""')}"`
  return `${p.post_id},${title},${p.date},,,,,,,`
})

const csv = [header, ...rows].join('\n') + '\n'

const outPath = join(__dirname, '../may-eom-input.csv')
writeFileSync(outPath, csv, 'utf-8')

console.log(`✓ Wrote ${posts.length} rows → may-eom-input.csv`)
posts.forEach(p => console.log(`  ${p.post_id}  ${p.date}  ${p.title}`))
