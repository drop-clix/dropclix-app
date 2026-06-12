import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

type ContextPost = {
  id: string
  title: string
  platform: string
  pillar: string | null
  hook: string | null
  reach: number
  followers: number
  watch: number
  er: number
  decision: string | null
}

type ContextCampaign = {
  name: string
  status: string
  spend: number
  roas: number
  ctr: number
  cpm: number
  leads: number
  hires: number
}

type Suggestion = {
  icon: string
  headline: string
  body: string
  trigger: string
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      suggestions: [
        {
          icon: 'alert',
          headline: 'Add ANTHROPIC_API_KEY to enable AI insights',
          body: 'Add your Anthropic API key to .env.local as ANTHROPIC_API_KEY to generate personalised suggestions.',
          trigger: 'Configuration required',
        },
      ] satisfies Suggestion[],
    })
  }

  const { posts, campaigns, platform, mode, projectionMetric, goalsSummary } = (await req.json()) as {
    posts: ContextPost[]
    campaigns?: ContextCampaign[]
    platform: string
    mode?: string
    projectionMetric?: string
    goalsSummary?: string
  }

  // ── Ads mode ────────────────────────────────────────────────────
  if (mode === 'ads') {
    if (!campaigns?.length) return NextResponse.json({ suggestions: [] })

    const active   = campaigns.filter(c => c.status === 'Active')
    const byRoas   = [...campaigns].sort((a, b) => b.roas - a.roas)
    const byCtr    = [...campaigns].sort((a, b) => b.ctr  - a.ctr)
    const byCpm    = [...campaigns].sort((a, b) => b.cpm  - a.cpm)
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)
    const avgRoas    = campaigns.filter(c => c.roas > 0).reduce((s, c) => s + c.roas, 0) / (campaigns.filter(c => c.roas > 0).length || 1)
    const avgCtr     = campaigns.filter(c => c.ctr  > 0).reduce((s, c) => s + c.ctr,  0) / (campaigns.filter(c => c.ctr  > 0).length || 1)
    const avgCpm     = campaigns.filter(c => c.cpm  > 0).reduce((s, c) => s + c.cpm,  0) / (campaigns.filter(c => c.cpm  > 0).length || 1)

    const adsPrompt = `You are a paid media strategist. Analyze these ad campaigns and return exactly 4 specific, actionable recommendations.

CAMPAIGNS (${campaigns.length} total, ${active.length} active, $${fmt(totalSpend)} total spend):
${campaigns.map(c => `- "${c.name}" | Status: ${c.status} | Spend: $${c.spend.toLocaleString()} | ROAS: ${c.roas.toFixed(2)}x | CTR: ${c.ctr.toFixed(2)}% | CPM: $${c.cpm.toFixed(2)} | Leads: ${c.leads} | Hires: ${c.hires}`).join('\n')}

BENCHMARKS: avg ROAS ${avgRoas.toFixed(2)}x | avg CTR ${avgCtr.toFixed(2)}% | avg CPM $${avgCpm.toFixed(2)}

TOP ROAS: ${byRoas[0]?.name ?? '—'} (${byRoas[0]?.roas.toFixed(2)}x)
TOP CTR:  ${byCtr[0]?.name ?? '—'} (${byCtr[0]?.ctr.toFixed(2)}%)
WORST ROAS: ${byRoas[byRoas.length - 1]?.name ?? '—'} (${byRoas[byRoas.length - 1]?.roas.toFixed(2)}x)

Return 4 specific, data-driven ad recommendations referencing exact campaign names and numbers. Format (JSON array only):
[
  {
    "icon": "trend" | "fire" | "repair" | "pace" | "ad" | "spark",
    "headline": "5-8 word action headline",
    "body": "One specific sentence referencing actual campaign names and numbers.",
    "trigger": "Key metric that triggered this (e.g. '3.4x vs 1.2x avg')"
  }
]`

    try {
      const client  = new Anthropic({ apiKey })
      const message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: adsPrompt }],
      })
      const text  = message.content[0].type === 'text' ? message.content[0].text : '[]'
      const match = text.match(/\[[\s\S]*\]/)
      const suggestions: Suggestion[] = match ? JSON.parse(match[0]) : []
      return NextResponse.json({ suggestions: suggestions.slice(0, 4) })
    } catch (err) {
      console.error('AI ads suggestions error:', err)
      return NextResponse.json({ suggestions: [] })
    }
  }

  if (!posts?.length) {
    return NextResponse.json({ suggestions: [] })
  }

  const sorted = [...posts].sort((a, b) => b.er - a.er)
  const top5 = sorted.slice(0, 5)
  const bottom5 = sorted.slice(-5).reverse()
  const avgER = posts.reduce((s, p) => s + p.er, 0) / posts.length
  const avgReach = posts.reduce((s, p) => s + p.reach, 0) / posts.length

  const pillarMap = new Map<string, { er: number[]; count: number }>()
  for (const p of posts) {
    const pl = p.pillar ?? 'Other'
    if (!pillarMap.has(pl)) pillarMap.set(pl, { er: [], count: 0 })
    const m = pillarMap.get(pl)!
    m.er.push(p.er); m.count++
  }
  const pillarStats = [...pillarMap.entries()]
    .map(([pillar, m]) => ({ pillar, avgER: +(m.er.reduce((s, v) => s + v, 0) / m.er.length).toFixed(1), count: m.count }))
    .sort((a, b) => b.avgER - a.avgER)

  const hookMap = new Map<string, { er: number[]; count: number }>()
  for (const p of posts) {
    const h = p.hook ?? 'Unknown'
    if (!hookMap.has(h)) hookMap.set(h, { er: [], count: 0 })
    hookMap.get(h)!.er.push(p.er)
    hookMap.get(h)!.count++
  }
  const hookStats = [...hookMap.entries()]
    .map(([hook, m]) => ({ hook, avgER: +(m.er.reduce((s, v) => s + v, 0) / m.er.length).toFixed(1), count: m.count }))
    .sort((a, b) => b.avgER - a.avgER)

  const platformName = platform === 'ig' ? 'Instagram' : platform === 'yt' ? 'YouTube' : platform === 'tt' ? 'TikTok' : platform

  const prompt = `You are a data-driven content strategy advisor for a ${platformName} creator.
${mode === 'projection' ? `Focus on the projection metric: ${projectionMetric ?? 'overall performance'}.` : ''}
${goalsSummary ? `Creator goals: ${goalsSummary}` : ''}

DATA (${posts.length} posts, avg ER ${avgER.toFixed(1)}%, avg reach ${fmt(avgReach)}):

TOP 5:
${top5.map(p => `- ${p.id} "${p.title}" | ER: ${p.er.toFixed(1)}% | Reach: ${fmt(p.reach)} | Pillar: ${p.pillar ?? '—'} | Hook: ${p.hook ?? '—'}`).join('\n')}

BOTTOM 5:
${bottom5.map(p => `- ${p.id} "${p.title}" | ER: ${p.er.toFixed(1)}% | Reach: ${fmt(p.reach)} | Pillar: ${p.pillar ?? '—'}`).join('\n')}

PILLAR BREAKDOWN:
${pillarStats.map(p => `- ${p.pillar}: avg ${p.avgER}% ER (${p.count} posts)`).join('\n')}

HOOK BREAKDOWN:
${hookStats.slice(0, 5).map(h => `- ${h.hook}: avg ${h.avgER}% ER (${h.count} posts)`).join('\n')}

Return exactly 4 specific, data-driven suggestions as JSON. Reference actual post IDs, pillar names, hook types, or ER% numbers. Never give generic advice.

Format (JSON array only, no other text):
[
  {
    "icon": "trend" | "fire" | "pillar" | "hook" | "repair" | "spark" | "pace",
    "headline": "5-8 word action headline",
    "body": "One specific sentence referencing actual data from above.",
    "trigger": "Key metric that triggered this (e.g. '8.2% vs 5.1% avg')"
  }
]`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    const suggestions: Suggestion[] = match ? JSON.parse(match[0]) : []

    return NextResponse.json({ suggestions: suggestions.slice(0, 4) })
  } catch (err) {
    console.error('AI suggestions error:', err)
    return NextResponse.json({ suggestions: [] })
  }
}
