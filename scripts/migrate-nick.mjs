/**
 * Session 8 — Nick Nascimento (Sparta Solar) data migration
 * Migrates all seed data from portal-nick-updated.html into Supabase.
 *
 * Usage:
 *   node scripts/migrate-nick.mjs           # dry-run check first
 *   node scripts/migrate-nick.mjs --run     # actually insert
 *   node scripts/migrate-nick.mjs --force   # wipe client data then re-insert
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = !process.argv.includes('--run') && !process.argv.includes('--force')
const FORCE   = process.argv.includes('--force')

// ── Load env ────────────────────────────────────────────────────────────────
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY          // service role key — bypasses RLS
)

// ── Seed data ────────────────────────────────────────────────────────────────
const RAW = JSON.parse(readFileSync(join(__dirname, 'seed-data/nick.json'), 'utf-8'))
const VIDS       = RAW.SEED_VIDS        // 44 analytics videos
const PIPELINE   = [...RAW.SEED_PIPELINE, ...RAW.SCRIPT_LAB_SEEDS]  // 93 items
const CALENDAR   = RAW.SEED_CALENDAR   // 48 events
const ADS        = RAW.SEED_ADS        // 6 campaigns
const CREATIVES  = RAW.SEED_CREATIVES  // 4
const AUDIENCES  = RAW.SEED_AUDIENCES  // 4

// ── Helpers ───────────────────────────────────────────────────────────────────
const log = (...args) => console.log(...args)

function normPlatforms(p) {
  const arr = Array.isArray(p) ? p : [p || 'ig']
  return arr.map(x => {
    const s = String(x).toLowerCase()
    return s.includes('yt') ? 'yt' : s.includes('tt') ? 'tt' : 'ig'
  })
}

function parseNum(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const n = parseFloat(String(v ?? 0).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

// Map portal statuses → Supabase schema statuses
const STATUS_MAP = {
  'SCRIPT LAB':    'SCRIPTED',
  'FILMED':        'FILMING',
  'NEEDS REVISION':'REVIEWING',
  'DEAD':          'CANCELLED',
}
const mapStatus = s => STATUS_MAP[s] || s || 'PLANNED'

async function db(label, fn) {
  if (DRY_RUN) return { data: null, error: null }
  const result = await fn()
  if (result.error) {
    console.error(`  ✗ ${label}: ${result.error.message}`)
  }
  return result
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function migrate() {
  if (DRY_RUN) {
    log('\n📋 DRY RUN — pass --run to actually insert data\n')
    log(`  SEED_VIDS:      ${VIDS.length} videos`)
    log(`  SEED_PIPELINE:  ${PIPELINE.length} items (${RAW.SEED_PIPELINE.length} pipeline + ${RAW.SCRIPT_LAB_SEEDS.length} script lab)`)
    log(`  SEED_CALENDAR:  ${CALENDAR.length} events`)
    log(`  SEED_ADS:       ${ADS.length} campaigns`)
    log(`  SEED_CREATIVES: ${CREATIVES.length} creatives`)
    log(`  SEED_AUDIENCES: ${AUDIENCES.length} audiences`)
    log(`\n  Analytics rows to insert: ${VIDS.length * 4} (w24 + w3 + w7 + eom per video)`)

    const statusCounts = {}
    PIPELINE.forEach(p => { statusCounts[p.status] = (statusCounts[p.status]||0)+1 })
    log('\n  Pipeline status breakdown (before mapping):')
    Object.entries(statusCounts).sort((a,b)=>b[1]-a[1]).forEach(([s,n]) => {
      log(`    ${s.padEnd(16)} → ${mapStatus(s).padEnd(12)} (${n})`)
    })
    log('\n  Run with --run to execute.\n')
    return
  }

  log('\n🚀 Starting Nick Nascimento migration...\n')

  // ── 1. Client ───────────────────────────────────────────────────────────────
  log('1. Client — Sparta Solar')

  // Match by slug OR email — handles pre-existing records with different slug
  const { data: existing } = await supabase
    .from('clients')
    .select('id, name')
    .or("slug.eq.sparta-solar,email.eq.nick@spartasolar.com")
    .maybeSingle()

  let clientId

  if (existing) {
    clientId = existing.id
    log(`   ↳ exists: ${clientId}`)

    if (FORCE) {
      log('   ↳ --force: clearing all client data...')
      // Delete in FK-safe order
      for (const table of ['calendar_events','ad_results','ad_audiences','ad_creatives',
                            'ad_campaigns','approvals','pipeline_items','post_analytics','posts']) {
        const { error } = await supabase.from(table).delete().eq('client_id', clientId)
        if (error) log(`     ✗ ${table}: ${error.message}`)
        else log(`     ✓ cleared ${table}`)
      }
    } else {
      // Check if already has posts
      const { count } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)

      if ((count ?? 0) > 0) {
        log(`\n⚠️  Client already has ${count} posts. Use --force to wipe and re-migrate.\n`)
        process.exit(0)
      }
    }
  } else {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name: 'Nick Nascimento — Sparta Solar',
        email: 'nick@spartasolar.com',
        slug: 'sparta-solar',
        timezone: 'America/Denver',
      })
      .select('id')
      .single()

    if (error) throw new Error(`Client insert failed: ${error.message}`)
    clientId = data.id
    log(`   ↳ created: ${clientId}`)
  }

  // ── 2. Posts ────────────────────────────────────────────────────────────────
  log('\n2. Posts (44 videos)')
  const postIdMap = {}   // "#0031" → uuid

  for (const vid of VIDS) {
    const { data, error } = await supabase
      .from('posts')
      .upsert({
        client_id:  clientId,
        post_id:    vid.id,
        title:      vid.title || 'Untitled',
        platform:   normPlatforms(vid.platform || vid.platforms),
        pillar:     vid.pillar   || null,
        hook:       vid.hook     || null,
        format:     vid.format   || null,
        cta:        vid.cta      || null,
        date:       vid.date     || null,
        notes:      vid.notes    || null,
        decision:   vid.decision || null,
      }, { onConflict: 'client_id,post_id' })
      .select('id')
      .single()

    if (error) {
      log(`   ✗ ${vid.id}: ${error.message}`)
    } else {
      postIdMap[vid.id] = data.id
      process.stdout.write('.')
    }
  }
  log(`\n   ↳ ${Object.keys(postIdMap).length} posts`)

  // ── 3. Post analytics ───────────────────────────────────────────────────────
  log('\n3. Post analytics (up to 4 windows × 44 = 176 rows)')
  let analyticsOk = 0, analyticsErr = 0

  for (const vid of VIDS) {
    const postUuid = postIdMap[vid.id]
    if (!postUuid) continue

    const platform = normPlatforms(vid.platform || vid.platforms)[0]

    // Insert w24, w3, w7 as-is
    for (const win of ['w24', 'w3', 'w7']) {
      const w = vid[win]
      if (!w) continue

      const { error } = await supabase
        .from('post_analytics')
        .upsert({
          post_id:       postUuid,
          client_id:     clientId,
          metric_window: win,
          platform,
          views:         w.reach     || 0,
          likes:         w.likes     || 0,
          comments:      w.comments  || 0,
          shares:        w.shares    || 0,
          saves:         w.saves     || 0,
          followers:     w.followers || 0,
          watch_pct:     w.watch ? parseFloat((w.watch * 100).toFixed(1)) : 0,
        }, { onConflict: 'post_id,platform,metric_window' })

      error ? analyticsErr++ : analyticsOk++
    }

    // eom = best available window (w7 preferred, fall back to w3)
    const eomSource = vid.w7 || vid.w3
    if (eomSource) {
      const { error } = await supabase
        .from('post_analytics')
        .upsert({
          post_id:       postUuid,
          client_id:     clientId,
          metric_window: 'eom',
          platform,
          views:         eomSource.reach     || 0,
          likes:         eomSource.likes     || 0,
          comments:      eomSource.comments  || 0,
          shares:        eomSource.shares    || 0,
          saves:         eomSource.saves     || 0,
          followers:     eomSource.followers || 0,
          watch_pct:     eomSource.watch ? parseFloat((eomSource.watch * 100).toFixed(1)) : 0,
        }, { onConflict: 'post_id,platform,metric_window' })

      error ? analyticsErr++ : analyticsOk++
    }
  }
  log(`   ↳ ${analyticsOk} inserted, ${analyticsErr} errors`)

  // ── 4. Pipeline items ───────────────────────────────────────────────────────
  log('\n4. Pipeline items (93 total)')
  const pipeRows = PIPELINE.map(p => ({
    client_id:      clientId,
    post_id:        p.id,
    title:          p.title || 'Untitled',
    platform:       normPlatforms(p.platform),
    yt_type:        p.ytType || null,
    pillar:         p.pillar || null,
    status:         mapStatus(p.status),
    priority:       typeof p.priority === 'number' ? p.priority : 4,
    week:           p.week || null,
    scheduled_date: p.scheduledDate && p.scheduledDate.match(/^\d{4}/) ? p.scheduledDate : null,
    script_content: p.script || null,
    notes:          p.notes || null,
  }))

  // Batch insert in chunks of 50
  let pipeOk = 0
  for (let i = 0; i < pipeRows.length; i += 50) {
    const chunk = pipeRows.slice(i, i + 50)
    const { error, data } = await supabase
      .from('pipeline_items')
      .insert(chunk)
      .select('id')
    if (error) {
      log(`   ✗ chunk ${i}–${i+50}: ${error.message}`)
    } else {
      pipeOk += (data?.length ?? chunk.length)
    }
  }
  log(`   ↳ ${pipeOk} pipeline items inserted`)

  // ── 5. Ad campaigns ─────────────────────────────────────────────────────────
  log('\n5. Ad campaigns (6)')
  let adOk = 0
  for (const ad of ADS) {
    const { error } = await supabase
      .from('ad_campaigns')
      .insert({
        client_id:   clientId,
        name:        ad.name,
        date:        ad.date || null,
        objective:   ad.obj  || 'Lead Generation',
        status:      ad.status || 'Active',
        spend:       parseNum(ad.spend),
        impressions: Math.round(parseNum(ad.imp)),
        reach:       Math.round(parseNum(ad.reach)),
        clicks:      Math.round(parseNum(ad.clicks)),
        leads:       Math.round(parseNum(ad.leads)),
        hires:       Math.round(parseNum(ad.hires)),
        ctr:         parseNum(ad.ctr),
        cpm:         parseNum(ad.cpm),
        cpc:         parseNum(ad.cpc),
        cpl:         parseNum(ad.cpl),
        cph:         parseNum(ad.cph),
        roas:        parseNum(ad.roas),
      })
    error ? log(`   ✗ ${ad.name}: ${error.message}`) : adOk++
  }
  log(`   ↳ ${adOk} ad campaigns`)

  // ── 6. Ad creatives ─────────────────────────────────────────────────────────
  log('\n6. Ad creatives (4)')
  // First get the Hat Toss campaign id to link creatives to it
  const { data: hatToss } = await supabase
    .from('ad_campaigns')
    .select('id')
    .eq('client_id', clientId)
    .eq('name', 'Hat Toss — Recruiting')
    .maybeSingle()

  let creativeOk = 0
  for (const cr of CREATIVES) {
    const { error } = await supabase
      .from('ad_creatives')
      .insert({
        client_id:   clientId,
        campaign_id: hatToss?.id || null,
        name:        cr.name || 'Creative',
        type:        cr.type || 'video',
        description: cr.desc || null,
        impressions: Math.round(parseNum(cr.imp || cr.impressions || 0)),
        ctr:         parseNum(cr.ctr),
        watch_pct:   parseNum(cr.watch || cr.watch_pct || 0),
        status:      cr.status || 'Testing',
      })
    error ? log(`   ✗ ${cr.name}: ${error.message}`) : creativeOk++
  }
  log(`   ↳ ${creativeOk} creatives`)

  // ── 7. Calendar events ───────────────────────────────────────────────────────
  log('\n7. Calendar events (48)')
  const calRows = CALENDAR.map(ev => ({
    client_id:  clientId,
    title:      ev.title || ev.postId || 'Event',
    platform:   normPlatforms(ev.platform)[0],  // schema is text, not text[]
    event_date: ev.date,
    notes:      JSON.stringify({
      post_id:        ev.postId || null,
      caption_status: ev.captionStatus || null,
      post_time:      ev.postTime || null,
      content_type:   ev.contentType || null,
      cta:            ev.cta || null,
    }),
  })).filter(e => e.event_date)   // skip rows with no date

  let calOk = 0
  for (let i = 0; i < calRows.length; i += 50) {
    const chunk = calRows.slice(i, i + 50)
    const { error, data } = await supabase
      .from('calendar_events')
      .insert(chunk)
      .select('id')
    if (error) {
      log(`   ✗ calendar chunk: ${error.message}`)
    } else {
      calOk += data?.length ?? chunk.length
    }
  }
  log(`   ↳ ${calOk} calendar events`)

  // ── Summary ──────────────────────────────────────────────────────────────────
  log(`\n✅ Migration complete!`)
  log(`\n   Client ID:  ${clientId}`)
  log(`   Slug:       sparta-solar`)
  log(`\n   Next: add this client_id to Nick's user row in Supabase:`)
  log(`   UPDATE users SET client_id = '${clientId}' WHERE email = 'nick@...';`)
  log(`\n   Or run in Supabase SQL Editor:`)
  log(`   UPDATE public.users SET client_id = '${clientId}' WHERE email = 'YOUR_NICK_EMAIL';`)
}

migrate().catch(err => {
  console.error('\n💥 Migration failed:', err.message)
  process.exit(1)
})
