import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReportCardClient } from '@/components/portal/ReportCardClient'

// ── Exported types (consumed by client component) ─────────────────────────

export type PostSummary = {
  postId: string; title: string; er: number; views: number
  pillar: string; hook: string; decision: string
}

export type ScoreComponents = {
  label: string; score: number; max: number
}[]

export type WeekGrade = {
  weekStart: string       // ISO Monday date 'YYYY-MM-DD'
  label: string           // 'Mar 16 – Mar 22'
  score: number           // 0-100
  grade: string           // A B C D F
  gradeLabel: string      // Exceptional / Strong / Developing / Needs Work / Miss
  posts: number; views: number; avgER: number; eliteCount: number
  components: ScoreComponents
  topPosts: PostSummary[]
  wins: string[]
  misses: string[]
}

export type MonthGrade = {
  monthKey: string        // 'YYYY-MM'
  label: string           // 'March 2026'
  score: number
  grade: string
  gradeLabel: string
  posts: number; views: number; avgER: number; followers: number; eliteCount: number
  components: ScoreComponents
  topPosts: PostSummary[]
  wins: string[]
  misses: string[]
  strategy: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function gradeFor(score: number): { grade: string; label: string } {
  if (score >= 90) return { grade: 'A', label: 'Exceptional'  }
  if (score >= 80) return { grade: 'B', label: 'Strong'       }
  if (score >= 70) return { grade: 'C', label: 'Developing'   }
  if (score >= 60) return { grade: 'D', label: 'Needs Work'   }
  return              { grade: 'F', label: 'Miss'          }
}

/** ISO Monday for any date */
function weekStart(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

/** 'Mar 16 – Mar 22' from a Monday ISO string */
function weekLabel(mon: string): string {
  const s = new Date(mon + 'T12:00:00')
  const e = new Date(mon + 'T12:00:00')
  e.setDate(e.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(s)} – ${fmt(e)}`
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ── Score computation ──────────────────────────────────────────────────────

interface PeriodRaw {
  posts: number; totalER: number; totalViews: number
  totalFollowers: number; eliteCount: number
  postList: PostSummary[]
}

function computeWeekGrade(
  weekKey: string,
  raw: PeriodRaw,
  goals: Record<string, number>,
): WeekGrade {
  const tgtPosts = goals['Posts']       || 5
  const tgtViews = goals['Total Views'] || 50_000
  const tgtER    = goals['Avg ER%']     || 7.5
  const avgER    = raw.posts > 0 ? raw.totalER / raw.posts : 0

  const postScore  = Math.min(25, Math.round((raw.posts       / tgtPosts) * 25))
  const viewScore  = Math.min(30, Math.round((raw.totalViews  / tgtViews) * 30))
  const erScore    = Math.min(35, Math.round((avgER            / tgtER)   * 35))
  const eliteScore = Math.min(10, raw.eliteCount * 5)
  const total      = postScore + viewScore + erScore + eliteScore

  const components: ScoreComponents = [
    { label: 'Posts',        score: postScore,  max: 25 },
    { label: 'Views / Reach',score: viewScore,  max: 30 },
    { label: 'Avg ER%',      score: erScore,    max: 35 },
    { label: 'Elite Videos', score: eliteScore, max: 10 },
  ]

  // Wins
  const wins: string[] = []
  if (raw.posts >= tgtPosts) {
    wins.push(
      `Published ${raw.posts} post${raw.posts !== 1 ? 's' : ''}${raw.posts > tgtPosts ? ` — ${raw.posts - tgtPosts} above` : ' — hit'} the ${tgtPosts}/week target.`,
    )
  }
  if (raw.totalViews >= tgtViews) {
    const over = Math.round((raw.totalViews / tgtViews - 1) * 100)
    wins.push(
      `Reach: ${fmtNum(raw.totalViews)} views${over > 0 ? ` — ${over}% above the ${fmtNum(tgtViews)} target` : ' — at target'}.`,
    )
  }
  if (avgER >= tgtER && raw.posts > 0) {
    wins.push(`ER hit ${avgER.toFixed(1)}% — at or above the ${tgtER}% target.`)
  }
  if (raw.eliteCount > 0) {
    const best = [...raw.postList].sort((a, b) => b.er - a.er)[0]
    wins.push(`Elite video: ${best.postId} at ${best.er.toFixed(1)}% ER.`)
  }

  // Misses
  const misses: string[] = []
  if (raw.posts < tgtPosts * 0.8 && raw.posts < tgtPosts) {
    misses.push(
      `${raw.posts} post${raw.posts !== 1 ? 's' : ''} published vs ${tgtPosts} target — posting cadence dropped.`,
    )
  }
  if (raw.totalViews < tgtViews * 0.5) {
    const gap = tgtViews - raw.totalViews
    misses.push(
      `Views at ${fmtNum(raw.totalViews)} — ${fmtNum(gap)} short of the ${fmtNum(tgtViews)} weekly target.`,
    )
  }
  if (avgER > 0 && avgER < tgtER * 0.85) {
    const hookHint = avgER < 5.5
      ? ' Switch to Hard Statement or Volume hooks — both outperform Authority.'
      : ''
    misses.push(`Avg ER ${avgER.toFixed(1)}% — ${(tgtER - avgER).toFixed(1)}pp below ${tgtER}% target.${hookHint}`)
  }
  if (raw.eliteCount === 0 && raw.posts > 0) {
    misses.push('No elite videos (≥12% ER) this week.')
  }

  const topPosts = [...raw.postList].sort((a, b) => b.views - a.views).slice(0, 5)
  const { grade, label } = gradeFor(total)

  return {
    weekStart: weekKey,
    label: weekLabel(weekKey),
    score: total, grade, gradeLabel: label,
    posts: raw.posts, views: raw.totalViews, avgER, eliteCount: raw.eliteCount,
    components, topPosts, wins, misses,
  }
}

function computeMonthGrade(
  monthKey: string,
  raw: PeriodRaw,
  goals: Record<string, number>,
): MonthGrade {
  const tgtPosts     = goals['Posts']            || 20
  const tgtViews     = goals['Total Views']      || 200_000
  const tgtER        = goals['Avg ER%']          || 7.5
  const tgtFollowers = goals['Followers Gained'] || 500
  const tgtElite     = goals['Elite Videos']     || 2
  const avgER        = raw.posts > 0 ? raw.totalER / raw.posts : 0

  const postScore  = Math.min(20, Math.round((raw.posts           / tgtPosts)     * 20))
  const viewScore  = Math.min(25, Math.round((raw.totalViews      / tgtViews)     * 25))
  const erScore    = Math.min(30, Math.round((avgER               / tgtER)        * 30))
  const follScore  = Math.min(15, Math.round((raw.totalFollowers  / tgtFollowers) * 15))
  const eliteScore = Math.min(10, Math.round((raw.eliteCount      / tgtElite)     * 10))
  const total      = postScore + viewScore + erScore + follScore + eliteScore

  const components: ScoreComponents = [
    { label: 'Posts',             score: postScore,  max: 20 },
    { label: 'Total Views',       score: viewScore,  max: 25 },
    { label: 'Avg ER%',           score: erScore,    max: 30 },
    { label: 'Followers Gained',  score: follScore,  max: 15 },
    { label: 'Elite Videos',      score: eliteScore, max: 10 },
  ]

  // Wins
  const wins: string[] = []
  if (raw.posts >= tgtPosts) {
    wins.push(`Published ${raw.posts} posts — ${raw.posts >= tgtPosts ? 'hit' : ''} the ${tgtPosts}-post monthly target${raw.posts > tgtPosts ? ` (${raw.posts - tgtPosts} extra)` : ''}.`)
  }
  if (raw.totalViews >= tgtViews) {
    const pct = Math.round((raw.totalViews / tgtViews - 1) * 100)
    wins.push(`${fmtNum(raw.totalViews)} views — ${pct > 0 ? `${pct}% above` : 'at'} the ${fmtNum(tgtViews)} monthly target.`)
  }
  if (raw.totalFollowers >= tgtFollowers) {
    wins.push(`+${raw.totalFollowers.toLocaleString()} followers — ${Math.round(raw.totalFollowers / tgtFollowers * 10) / 10}× the ${tgtFollowers} target.`)
  }
  if (avgER >= tgtER && raw.posts > 0) {
    wins.push(`Avg ER ${avgER.toFixed(1)}% — at or above the ${tgtER}% goal.`)
  }
  if (raw.eliteCount >= tgtElite) {
    wins.push(`${raw.eliteCount} elite video${raw.eliteCount !== 1 ? 's' : ''} — hit the ${tgtElite}-elite target.`)
  }

  // Misses
  const misses: string[] = []
  if (raw.posts < tgtPosts * 0.8) {
    misses.push(`Only ${raw.posts} posts vs ${tgtPosts} target — ${tgtPosts - raw.posts} short. Consistency is the lever.`)
  }
  if (raw.totalViews < tgtViews * 0.7) {
    misses.push(`Views at ${fmtNum(raw.totalViews)} — ${Math.round((1 - raw.totalViews / tgtViews) * 100)}% below the ${fmtNum(tgtViews)} target.`)
  }
  if (raw.totalFollowers < tgtFollowers * 0.8) {
    misses.push(`Follower gain ${raw.totalFollowers} vs ${tgtFollowers} target — more Volume/50-150 content drives the most follows.`)
  }
  if (avgER > 0 && avgER < tgtER * 0.85) {
    misses.push(`Avg ER ${avgER.toFixed(1)}% — ${(tgtER - avgER).toFixed(1)}pp below ${tgtER}% target. Authority hook (${raw.posts > 0 ? avgER.toFixed(1) : '–'}%) is the weakest link.`)
  }
  if (raw.eliteCount < tgtElite) {
    misses.push(`${raw.eliteCount} elite video${raw.eliteCount !== 1 ? 's' : ''} vs ${tgtElite} target — focus on Volume/50-150 + Hard Statement hook.`)
  }

  // Next-month strategy
  const strategy: string[] = []
  if (avgER < tgtER * 0.9) {
    strategy.push(
      'ER below target: shift away from Authority hook (5.0% avg) toward Hard Statement (6.1%) or Volume (8.6%). ' +
      'Volume/50-150 pillar is your best angle — 7.1% avg ER, 37.5K avg views/post.',
    )
  }
  if (raw.posts < tgtPosts) {
    strategy.push(
      `Post count was ${raw.posts}/${tgtPosts}. ` +
      'Aim for 5 posts every week — your strongest month (March: 22 posts) shows this cadence is achievable.',
    )
  } else {
    strategy.push('Posting cadence is solid. Next month: prioritise quality — make at least 2 posts specifically designed to hit Elite tier (≥12% ER).')
  }
  if (raw.eliteCount === 0) {
    strategy.push(
      'No elite videos this period. Study #0074 (Volume/50-150 + Authority, 12.3% ER): hook lands in the first second, immediate polarising claim, no soft intro.',
    )
  } else {
    strategy.push(
      `You had ${raw.eliteCount} elite video${raw.eliteCount !== 1 ? 's' : ''} — now scale it. ` +
      'Identify what the hook and pillar had in common and run 3+ posts with that same pattern.',
    )
  }

  const topPosts = [...raw.postList].sort((a, b) => b.views - a.views).slice(0, 5)
  const [y, m]   = monthKey.split('-').map(Number)
  const { grade, label } = gradeFor(total)

  return {
    monthKey, label: `${MONTH_NAMES[m - 1]} ${y}`,
    score: total, grade, gradeLabel: label,
    posts: raw.posts, views: raw.totalViews,
    avgER, followers: raw.totalFollowers, eliteCount: raw.eliteCount,
    components, topPosts, wins, misses, strategy,
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function ReportCardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('client_id')
    .eq('id', user.id)
    .single()

  const cid = (profile?.client_id as string | null) ?? '00000000-0000-0000-0000-000000000000'

  type RawGoal = { metric: string; target: number; period: string }
  type RawPost = {
    post_id: string; title: string; date: string | null
    pillar: string | null; hook: string | null; decision: string | null
    post_analytics: {
      metric_window: string; views: number; likes: number; comments: number
      shares: number; saves: number; followers: number; watch_pct: number
    }[]
  }

  const [goalsRes, postsRes] = await Promise.all([
    supabase.from('goals').select('metric,target,period').eq('client_id', cid),
    supabase.from('posts')
      .select('post_id,title,date,pillar,hook,decision,post_analytics(metric_window,views,likes,comments,shares,saves,followers,watch_pct)')
      .eq('client_id', cid)
      .order('date', { ascending: true }),
  ])

  const rawGoals  = (goalsRes.data ?? []) as unknown as RawGoal[]
  const rawPosts  = (postsRes.data ?? []) as unknown as RawPost[]

  const monthlyGoals: Record<string, number> = {}
  const weeklyGoals:  Record<string, number> = {}
  for (const g of rawGoals) {
    if (g.period === 'monthly') monthlyGoals[g.metric] = +g.target
    if (g.period === 'weekly')   weeklyGoals[g.metric]  = +g.target
  }

  // ── Accumulate raw data by week and month ──────────────────────────────
  const weekMap  = new Map<string, PeriodRaw>()
  const monthMap = new Map<string, PeriodRaw>()

  function ensurePeriod(map: Map<string, PeriodRaw>, key: string): PeriodRaw {
    if (!map.has(key)) map.set(key, { posts: 0, totalER: 0, totalViews: 0, totalFollowers: 0, eliteCount: 0, postList: [] })
    return map.get(key)!
  }

  for (const p of rawPosts) {
    if (!p.date) continue
    const eom = p.post_analytics.find(a => a.metric_window === 'eom')
    const views     = eom?.views     ?? 0
    const likes     = eom?.likes     ?? 0
    const comments  = eom?.comments  ?? 0
    const shares    = eom?.shares    ?? 0
    const saves     = eom?.saves     ?? 0
    const followers = eom?.followers ?? 0
    const er        = views > 0 ? ((likes + comments + shares + saves) / views) * 100 : 0
    const isElite   = er >= 12

    const ps: PostSummary = {
      postId:   p.post_id,
      title:    p.title,
      er, views,
      pillar:   p.pillar   ?? '—',
      hook:     p.hook     ?? '—',
      decision: p.decision ?? '—',
    }

    // Week
    const wk = weekStart(p.date)
    const w  = ensurePeriod(weekMap, wk)
    w.posts++; w.totalER += er; w.totalViews += views; w.totalFollowers += followers
    if (isElite) w.eliteCount++
    w.postList.push(ps)

    // Month
    const mk = p.date.slice(0, 7)
    const mo = ensurePeriod(monthMap, mk)
    mo.posts++; mo.totalER += er; mo.totalViews += views; mo.totalFollowers += followers
    if (isElite) mo.eliteCount++
    mo.postList.push(ps)
  }

  // ── Build graded arrays ────────────────────────────────────────────────
  const weekGrades: WeekGrade[] = [...weekMap.keys()]
    .sort()
    .map(k => computeWeekGrade(k, weekMap.get(k)!, weeklyGoals))

  const monthGrades: MonthGrade[] = [...monthMap.keys()]
    .sort()
    .map(k => computeMonthGrade(k, monthMap.get(k)!, monthlyGoals))

  return (
    <div className="p-10">
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
        <p className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
           style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Performance Review
        </p>
        <h1 className="font-jakarta font-light"
            style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}>
          Report Card
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#444' }}>
          {weekGrades.length} weeks · {monthGrades.length} months · score out of 100
        </p>
      </div>

      <ReportCardClient weekGrades={weekGrades} monthGrades={monthGrades} />
    </div>
  )
}
