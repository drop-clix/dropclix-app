/**
 * YouTube Analytics sync script.
 *
 * Reads OAuth tokens from platform_connections for Nick's client_id,
 * then pulls per-video metrics and upserts into post_analytics.
 *
 * Window selection is age-based:
 *   post ≤ 2 days old → w24
 *   post ≤ 3 days old → w3
 *   post ≤ 6 days old → w7
 *   any age           → eom (uses today as end date to capture current totals)
 *
 * Usage:
 *   node scripts/sync-youtube.mjs             # dry-run
 *   node scripts/sync-youtube.mjs --run       # apply
 *   node scripts/sync-youtube.mjs --run --force  # overwrite all existing data
 *
 * Requires .env.local at the project root.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync }  from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN   = !process.argv.includes('--run')
const FORCE     = process.argv.includes('--force')

// ── Load env vars from .env.local ────────────────────────────────────────────
const envPath = join(__dirname, '..', '.env.local')
try {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([^#=\s]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
} catch {
  console.error('Could not read .env.local — make sure it exists at the project root.')
  process.exit(1)
}

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SECRET_KEY
const YT_CLIENT_ID  = process.env.YOUTUBE_CLIENT_ID
const YT_CLIENT_SEC = process.env.YOUTUBE_CLIENT_SECRET

if (!SUPABASE_URL || !SUPABASE_KEY || !YT_CLIENT_ID || !YT_CLIENT_SEC) {
  console.error('Missing required env vars. Check .env.local.')
  process.exit(1)
}

const NICK_CLIENT_ID = '913f1794-1506-4449-b56c-b683809cefc3'
const admin = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Token refresh ─────────────────────────────────────────────────────────────

async function getValidAccessToken() {
  const { data, error } = await admin
    .from('platform_connections')
    .select('access_token, refresh_token, token_expires_at, channel_id, channel_name')
    .eq('client_id', NICK_CLIENT_ID)
    .eq('platform', 'youtube')
    .single()

  if (error || !data) {
    console.error('No YouTube connection found. Run the OAuth flow first from /admin.')
    process.exit(1)
  }

  const expiry = new Date(data.token_expires_at)
  const fiveMin = new Date(Date.now() + 5 * 60 * 1000)

  if (expiry > fiveMin) {
    console.log(`✓ Token valid until ${expiry.toLocaleTimeString()}`)
    return { accessToken: data.access_token, channelId: data.channel_id, channelName: data.channel_name }
  }

  console.log('Token expired — refreshing…')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     YT_CLIENT_ID,
      client_secret: YT_CLIENT_SEC,
      refresh_token: data.refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    console.error('Token refresh failed:', await res.text())
    process.exit(1)
  }

  const json = await res.json()
  const newExpiry = new Date(Date.now() + json.expires_in * 1000).toISOString()

  if (!DRY_RUN) {
    await admin.from('platform_connections').update({
      access_token:     json.access_token,
      token_expires_at: newExpiry,
      updated_at:       new Date().toISOString(),
    }).eq('client_id', NICK_CLIENT_ID).eq('platform', 'youtube')
  }

  console.log('✓ Token refreshed.')
  return { accessToken: json.access_token, channelId: data.channel_id, channelName: data.channel_name }
}

// ── Window logic ──────────────────────────────────────────────────────────────

// Returns which metric windows to sync based on how old the post is.
// eom is always included so old posts always get their current totals written.
function windowsForPost(publishDate) {
  const ageDays = (Date.now() - new Date(publishDate).getTime()) / 86400000
  const wins = ['eom']
  if (ageDays <= 6) wins.push('w7')
  if (ageDays <= 3) wins.push('w3')
  if (ageDays <= 2) wins.push('w24')
  return wins
}

// End date for the Analytics API call for each window.
// eom uses today so it captures all-time totals regardless of publish month.
// w24/w3/w7 use publish date + N days, capped at today.
function windowEndDate(publishDate, win) {
  const today = new Date().toISOString().slice(0, 10)
  if (win === 'eom') return today
  const d = new Date(publishDate)
  if (win === 'w24') d.setDate(d.getDate() + 1)
  else if (win === 'w3') d.setDate(d.getDate() + 3)
  else if (win === 'w7') d.setDate(d.getDate() + 7)
  const dStr = d.toISOString().slice(0, 10)
  return dStr > today ? today : dStr
}

// ── Analytics fetch ───────────────────────────────────────────────────────────

async function fetchMetrics(accessToken, channelId, videoId, startDate, endDate) {
  // Main call: per-video engagement metrics (always supported with yt-analytics.readonly)
  const params = new URLSearchParams({
    ids:      `channel==${channelId}`,
    startDate,
    endDate,
    metrics:  'views,likes,comments,shares,estimatedMinutesWatched,averageViewPercentage,subscribersGained',
    filters:  `video==${videoId}`,
  })

  const res = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    const body = await res.text()
    if (res.status === 403 || body.includes('insufficient')) {
      console.warn(`  ⚠ Insufficient permissions for ${videoId} — skipping`)
    } else {
      console.error(`  ✗ API error ${res.status} for ${videoId}:`, body.slice(0, 200))
    }
    return null
  }

  const json = await res.json()
  const row  = json.rows?.[0]
  if (!row) return null  // video not found / no data available at all

  // Secondary call: impressions + CTR — requires dimensions=video; stored as 0 if unavailable
  let impressions = 0, ctr = 0
  try {
    const iParams = new URLSearchParams({
      ids:        `channel==${channelId}`,
      startDate,
      endDate,
      dimensions: 'video',
      metrics:    'impressions,impressionsClickThroughRate',
      filters:    `video==${videoId}`,
    })
    const iRes = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${iParams}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (iRes.ok) {
      const iJson = await iRes.json()
      const iRow  = iJson.rows?.[0]  // columns: [videoId, impressions, ctr]
      if (iRow) {
        impressions = Math.round(iRow[1] ?? 0)
        ctr         = Math.round((iRow[2] ?? 0) * 10000) / 100
      }
    }
  } catch { /* impressions unavailable — stored as 0 */ }

  return {
    views:       Math.round(row[0] ?? 0),
    likes:       Math.round(row[1] ?? 0),
    comments:    Math.round(row[2] ?? 0),
    shares:      Math.round(row[3] ?? 0),
    watchMins:   Math.round(row[4] ?? 0),
    watchPct:    Math.round((row[5] ?? 0) * 100) / 100,
    subscribers: Math.round(row[6] ?? 0),
    impressions,
    // API returns a decimal (0.045 = 4.5%) — store as percentage
    ctr,
  }
}

function erPct(m) {
  if (!m.views) return 0
  return ((m.likes + m.comments + m.shares + m.subscribers) / m.views) * 100
}

function decision(er) {
  if (er >= 12) return 'Double Down'
  if (er >= 4)  return 'Iterate'
  return 'Kill'
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nDrop CLIX — YouTube Analytics Sync`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --run to apply)' : 'LIVE'} ${FORCE ? '+ FORCE' : ''}`)
  console.log('─'.repeat(50))

  const { accessToken, channelId, channelName } = await getValidAccessToken()
  console.log(`Channel: ${channelName ?? channelId}\n`)

  const { data: posts, error: postsErr } = await admin
    .from('posts')
    .select('id, post_id, date, decision, yt_id')
    .eq('client_id', NICK_CLIENT_ID)
    .not('yt_id', 'is', null)

  if (postsErr) {
    console.error('Failed to fetch posts:', postsErr.message)
    console.error('Hint: run supabase/migrations/add_posts_yt_id.sql in the Supabase SQL Editor first.')
    process.exit(1)
  }

  if (!posts || posts.length === 0) {
    console.log('No posts with yt_id found. Run the YouTube CSV importer (ingest-yt-csv.mjs) first.')
    return
  }

  console.log(`Found ${posts.length} posts with YouTube video IDs\n`)

  let synced = 0, skipped = 0, errors = 0

  for (const post of posts) {
    const videoId = post.yt_id
    const windows = windowsForPost(post.date)
    console.log(`\n▸ ${post.post_id} — ${videoId} (published ${post.date}) → [${windows.join(', ')}]`)

    let bestEr = 0, bestViews = 0

    for (const win of windows) {
      // With --force, overwrite everything. Without it, skip windows that already have data.
      if (!FORCE) {
        const { data: existing } = await admin
          .from('post_analytics')
          .select('metric_window, views')
          .eq('post_id', post.id)
          .eq('platform', 'yt')
          .eq('metric_window', win)
          .single()
        if (existing && (existing.views ?? 0) > 0) {
          console.log(`  ${win}: has data (${(existing.views ?? 0).toLocaleString()} views) — pass --force to overwrite`)
          skipped++
          continue
        }
      }

      const endDate = windowEndDate(post.date, win)
      const m = await fetchMetrics(accessToken, channelId, videoId, post.date, endDate)

      if (!m) {
        // API returned no rows at all for this video — skip this window
        console.log(`  ${win}: no data from API — skipping`)
        skipped++
        continue
      }

      const er = erPct(m)
      if (m.views > bestViews) { bestViews = m.views; bestEr = er }

      console.log(
        `  ${win}: ${m.views.toLocaleString()} views · ` +
        `${m.likes}L ${m.comments}C ${m.shares}S ${m.subscribers}SubsG · ` +
        `${er.toFixed(2)}% ER · ${m.watchPct}% watch · ` +
        `${m.impressions.toLocaleString()} impr · ${m.ctr}% CTR · ${decision(er)}`
      )

      if (!DRY_RUN) {
        const { error: uErr } = await admin.from('post_analytics').upsert(
          {
            post_id:       post.id,
            client_id:     NICK_CLIENT_ID,
            platform:      'yt',
            metric_window: win,
            yt_id:         videoId,
            views:         m.views,
            likes:         m.likes,
            comments:      m.comments,
            shares:        m.shares,
            saves:         null,
            watch_pct:     m.watchPct,
            followers:     m.subscribers,
            impressions:   m.impressions,
            ctr:           m.ctr,
          },
          { onConflict: 'post_id,platform,metric_window' },
        )
        if (uErr) { console.error(`  ✗ DB error: ${uErr.message}`); errors++ }
        else synced++
      } else {
        synced++
      }
    }

    if (bestViews > 0 && !DRY_RUN) {
      await admin.from('posts').update({ decision: decision(bestEr) }).eq('id', post.id)
    }
  }

  if (!DRY_RUN) {
    await admin.from('platform_connections').update({
      last_synced_at: new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    }).eq('client_id', NICK_CLIENT_ID).eq('platform', 'youtube')
  }

  console.log('\n' + '─'.repeat(50))
  console.log(`Done.  ${synced} windows ${DRY_RUN ? 'would be' : ''} synced · ${skipped} skipped · ${errors} errors`)
  if (DRY_RUN) console.log('Re-run with --run to apply changes.')
}

run().catch(err => { console.error(err); process.exit(1) })
