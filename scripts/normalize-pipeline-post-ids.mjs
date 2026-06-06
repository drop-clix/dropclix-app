import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

if (existsSync('.env.local')) {
  const lines = readFileSync('.env.local', 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx)
    const value = trimmed.slice(idx + 1).replace(/^["']|["']$/g, '')
    process.env[key] ??= value
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
const run = process.argv.includes('--run')

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

function prefixFor(row) {
  const platforms = Array.isArray(row.platform) ? row.platform : []
  if (row.yt_type === 'Long-form') return 'LF'
  if (String(row.post_id ?? '').toLowerCase().startsWith('#lf')) return 'LF'
  if (platforms.includes('yt')) return 'yt'
  if (platforms.includes('tt')) return 'tt'
  return 'ig'
}

function normalize(row) {
  const raw = String(row.post_id ?? '').trim()
  const match = raw.match(/^#?(ig|yt|tt|lf|LF)?0*(\d+)$/)
  if (!match) return raw
  const prefix = prefixFor(row)
  const n = String(Number(match[2])).padStart(4, '0')
  return `#${prefix}${n}`
}

const { data, error } = await supabase
  .from('pipeline_items')
  .select('id, post_id, platform, yt_type, title')
  .order('post_id', { ascending: true })

if (error) {
  console.error(error.message)
  process.exit(1)
}

const changes = []
for (const row of data ?? []) {
  const next = normalize(row)
  if (next !== row.post_id) changes.push({ ...row, next })
}

console.log(`Pipeline rows scanned: ${(data ?? []).length}`)
console.log(`Rows needing normalization: ${changes.length}`)
for (const row of changes) {
  console.log(`${row.post_id} -> ${row.next} | ${row.title}`)
}

if (!run || changes.length === 0) {
  if (!run) console.log('Dry run only for pipeline rows. Calendar note audit follows.')
} else {
  for (const row of changes) {
    const { error: updateError } = await supabase
      .from('pipeline_items')
      .update({ post_id: row.next })
      .eq('id', row.id)
    if (updateError) {
      console.error(`Failed ${row.post_id}: ${updateError.message}`)
      process.exitCode = 1
    }
  }

  if (!process.exitCode) console.log('Pipeline post IDs normalized.')
}

const { data: freshPipeline, error: freshError } = await supabase
  .from('pipeline_items')
  .select('id, post_id, platform, title')

if (freshError) {
  console.error(freshError.message)
  process.exit(1)
}

const pipelineByTitle = new Map()
const titleCounts = new Map()
for (const item of freshPipeline ?? []) {
  const key = String(item.title ?? '').trim().toLowerCase()
  if (!key) continue
  titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1)
  if (pipelineByTitle.has(key)) continue
  pipelineByTitle.set(key, item)
}

const { data: calEvents, error: calError } = await supabase
  .from('calendar_events')
  .select('id, title, platform, notes')

if (calError) {
  console.error(calError.message)
  process.exit(1)
}

const calendarChanges = []
for (const event of calEvents ?? []) {
  const key = String(event.title ?? '').trim().toLowerCase()
  if (titleCounts.get(key) !== 1) continue
  const pipeline = pipelineByTitle.get(key)
  if (!pipeline) continue
  let notes = {}
  try {
    notes = event.notes ? JSON.parse(event.notes) : {}
  } catch {
    continue
  }
  if (notes.post_id === pipeline.post_id && event.platform === pipeline.platform?.[0]) continue
  calendarChanges.push({
    event,
    pipeline,
    notes: { ...notes, post_id: pipeline.post_id },
    platform: pipeline.platform?.[0] ?? event.platform,
  })
}

console.log(`Calendar rows scanned: ${(calEvents ?? []).length}`)
console.log(`Calendar notes needing normalization: ${calendarChanges.length}`)
for (const change of calendarChanges) {
  console.log(`${change.event.title}: ${change.event.notes ?? '{}'} -> post_id ${change.pipeline.post_id}`)
}

if (!run || calendarChanges.length === 0) {
  if (!run) console.log('Dry run only. Re-run with --run to update Supabase.')
  process.exit(process.exitCode ?? 0)
}

for (const change of calendarChanges) {
  const { error: updateError } = await supabase
    .from('calendar_events')
    .update({
      notes: JSON.stringify(change.notes),
      platform: change.platform,
      pipeline_item_id: change.pipeline.id,
    })
    .eq('id', change.event.id)
  if (updateError) {
    console.error(`Failed calendar ${change.event.title}: ${updateError.message}`)
    process.exitCode = 1
  }
}

if (!process.exitCode) console.log('Calendar event notes normalized.')
