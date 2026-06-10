/**
 * diagnose-nick.mjs
 * Diagnostic: check Nick's enabled_platforms + post platform distribution
 * Usage: node scripts/diagnose-nick.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = key => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()

const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY  = get('SUPABASE_SECRET_KEY')

const NICK_CLIENT_ID = '913f1794-1506-4449-b56c-b683809cefc3'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// 1. Check clients.enabled_platforms for Nick
const { data: client } = await supabase
  .from('clients')
  .select('name, enabled_platforms, enabled_tabs')
  .eq('id', NICK_CLIENT_ID)
  .single()

console.log('\n=== CLIENT CONFIG ===')
console.log('Name:', client?.name)
console.log('enabled_platforms:', JSON.stringify(client?.enabled_platforms))
console.log('enabled_tabs:', JSON.stringify(client?.enabled_tabs))

// 2. Check platform distribution in posts
const { data: posts } = await supabase
  .from('posts')
  .select('post_id, platform')
  .eq('client_id', NICK_CLIENT_ID)

const platformCounts = {}
for (const p of posts ?? []) {
  for (const plat of (p.platform ?? [])) {
    platformCounts[plat] = (platformCounts[plat] ?? 0) + 1
  }
}

console.log('\n=== POST PLATFORM DISTRIBUTION ===')
for (const [plat, count] of Object.entries(platformCounts)) {
  console.log(`  ${plat}: ${count} posts`)
}
console.log(`  Total posts: ${posts?.length}`)

// 3. Check pipeline items platform distribution
const { data: pipelineItems } = await supabase
  .from('pipeline_items')
  .select('post_id, platform')
  .eq('client_id', NICK_CLIENT_ID)

const pipePlatformCounts = {}
for (const p of pipelineItems ?? []) {
  for (const plat of (p.platform ?? [])) {
    pipePlatformCounts[plat] = (pipePlatformCounts[plat] ?? 0) + 1
  }
}

console.log('\n=== PIPELINE PLATFORM DISTRIBUTION ===')
for (const [plat, count] of Object.entries(pipePlatformCounts)) {
  console.log(`  ${plat}: ${count} items`)
}
console.log(`  Total items: ${pipelineItems?.length}`)

// 4. Sample some TT/YT posts to check platform field
const ttYtPosts = (posts ?? []).filter(p =>
  (p.platform ?? []).some(pl => pl === 'tt' || pl === 'yt')
).slice(0, 5)

console.log('\n=== SAMPLE TT/YT POSTS ===')
if (ttYtPosts.length === 0) {
  console.log('  ⚠️  No TT or YT posts found in posts table!')
} else {
  for (const p of ttYtPosts) {
    console.log(`  ${p.post_id}: ${JSON.stringify(p.platform)}`)
  }
}

console.log('')
