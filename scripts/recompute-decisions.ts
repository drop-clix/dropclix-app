/**
 * S78 one-off: recompute posts.decision for every client with the shared rule
 * in src/lib/decision.ts (platform from the posts row's own ID prefix; live
 * window first, else eom → w7 → w3 → w24). ER formulas and thresholds unchanged.
 *
 *   npx tsx scripts/recompute-decisions.ts [--out <dir>]        dry run (default, no writes)
 *   npx tsx scripts/recompute-decisions.ts --run [--out <dir>]  writes changed rows only
 *   --skip-file <json>  JSON array of posts UUIDs to leave untouched (reported as held)
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the environment.
 * Rows with an unknown ID prefix are reported and never written.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { decisionFromWindows, platformFromPostId, platformER, DECISION_WINDOW_ORDER, type DecisionWindow } from '../src/lib/decision'

const RUN = process.argv.includes('--run')
const outIdx = process.argv.indexOf('--out')
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : '.'
const skipIdx = process.argv.indexOf('--skip-file')
const SKIP = new Set<string>(skipIdx > 0 ? JSON.parse(fs.readFileSync(process.argv[skipIdx + 1], 'utf8')) : [])
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY'); process.exit(1) }
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function all<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(select).order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return out
  }
}

type Post = { id: string; client_id: string; post_id: string | null; decision: string | null }
type Row = DecisionWindow & { post_id: string; platform: string; metric_window: string }

;(async () => {
  const [posts, rows, clients] = await Promise.all([
    all<Post>('posts', 'id, client_id, post_id, decision'),
    all<Row>('post_analytics', 'id, post_id, platform, metric_window, views, likes, comments, shares, saves, followers'),
    all<{ id: string; name: string }>('clients', 'id, name'),
  ])
  const clientName = new Map(clients.map(c => [c.id, c.name]))
  const byPost = new Map<string, Row[]>()
  for (const r of rows) (byPost.get(r.post_id) ?? byPost.set(r.post_id, []).get(r.post_id)!).push(r)

  const changes: Record<string, unknown>[] = []
  const unknownPrefix: string[] = []
  let unchanged = 0
  for (const p of posts) {
    const platform = platformFromPostId(p.post_id)
    if (!platform) { unknownPrefix.push(`${clientName.get(p.client_id) ?? p.client_id} ${p.post_id ?? '(null)'} stored=${p.decision ?? 'NULL'}`); continue }
    const windows: Record<string, DecisionWindow> = {}
    for (const r of byPost.get(p.id) ?? []) if (r.platform === platform) windows[r.metric_window] = r
    const next = decisionFromWindows(platform, windows)
    const prev = p.decision ?? null
    if (next === prev) { unchanged++; continue }
    const usedWindow = windows.live != null ? 'live' : DECISION_WINDOW_ORDER.find(k => k !== 'live' && platformER(platform, windows[k]) != null) ?? null
    const w = usedWindow ? windows[usedWindow] : null
    const er = usedWindow ? platformER(platform, w) : null
    changes.push({
      client: clientName.get(p.client_id) ?? p.client_id, uuid: p.id, post: p.post_id, platform,
      before: prev, after: next,
      kind: prev == null ? 'NULL → value' : next == null ? 'value → NULL' : 'flip',
      window: usedWindow, er: er == null ? null : Math.round(er * 100) / 100,
      views: w?.views ?? null, likes: w?.likes ?? null, comments: w?.comments ?? null, shares: w?.shares ?? null,
      fourth: w ? (platform === 'yt' ? w.followers ?? null : w.saves ?? null) : null,
      windowsPresent: Object.keys(windows).sort().join(',') || '(none)',
    })
  }

  const summary = { mode: RUN ? 'RUN' : 'DRY RUN', posts: posts.length, unchanged, changes: changes.length, unknownPrefix: unknownPrefix.length,
    byPlatformKind: changes.reduce<Record<string, number>>((a, c) => { const k = `${c.platform} ${c.kind}`; a[k] = (a[k] ?? 0) + 1; return a }, {}) }
  fs.writeFileSync(path.join(OUT, 'decision-recompute.json'), JSON.stringify({ summary, changes, unknownPrefix }, null, 1))
  console.log(JSON.stringify(summary, null, 1))

  if (RUN) {
    let written = 0
    const held = changes.filter(c => SKIP.has(c.uuid as string))
    if (held.length) console.log(`held (skip-file): ${held.length}`)
    for (const c of changes) {
      if (SKIP.has(c.uuid as string)) continue
      const { error } = await admin.from('posts').update({ decision: c.after }).eq('id', c.uuid as string)
      if (error) console.error(`write failed ${c.post}: ${error.message}`); else written++
    }
    console.log(`written ${written}/${changes.length - held.length}`)
  }
})().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
