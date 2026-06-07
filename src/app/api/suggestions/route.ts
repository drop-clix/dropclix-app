import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export type SuggestionPost = {
  postId: string
  title: string
  platform: string[]
  pillar: string | null
  hook: string | null
  decision: string | null
  views: number
  er: number
  followers: number
  date: string | null
}

export type AISuggestion = {
  icon: 'up' | 'fire' | 'target' | 'alert'
  headline: string
  explanation: string
  dataPoint: string
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      suggestions: [
        { icon: 'alert', headline: 'Add ANTHROPIC_API_KEY to enable AI insights', explanation: 'Add your Anthropic API key to .env.local as ANTHROPIC_API_KEY to generate personalised suggestions.', dataPoint: 'Configuration required' },
      ] satisfies AISuggestion[],
      cached: false,
    })
  }

  const { posts, platform } = (await req.json()) as {
    posts: SuggestionPost[]
    platform: string
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ suggestions: [], cached: false })
  }

  // Sort by ER for top/bottom analysis
  const sorted     = [...posts].sort((a, b) => b.er - a.er)
  const top5       = sorted.slice(0, 5)
  const bottom5    = sorted.slice(-5).reverse()
  const avgER      = posts.reduce((s, p) => s + p.er, 0) / posts.length
  const avgViews   = posts.reduce((s, p) => s + p.views, 0) / posts.length

  // Pillar breakdown
  const pillarMap = new Map<string, { er: number[]; views: number[]; count: number }>()
  for (const p of posts) {
    const pl = p.pillar ?? 'Other'
    if (!pillarMap.has(pl)) pillarMap.set(pl, { er: [], views: [], count: 0 })
    const m = pillarMap.get(pl)!
    m.er.push(p.er); m.views.push(p.views); m.count++
  }
  const pillarStats = [...pillarMap.entries()].map(([pillar, m]) => ({
    pillar,
    avgER:    +(m.er.reduce((s, v) => s + v, 0) / m.er.length).toFixed(1),
    avgViews: Math.round(m.views.reduce((s, v) => s + v, 0) / m.views.length),
    count:    m.count,
  })).sort((a, b) => b.avgER - a.avgER)

  // Hook breakdown
  const hookMap = new Map<string, { er: number[]; count: number }>()
  for (const p of posts) {
    const h = p.hook ?? 'Unknown'
    if (!hookMap.has(h)) hookMap.set(h, { er: [], count: 0 })
    const m = hookMap.get(h)!
    m.er.push(p.er); m.count++
  }
  const hookStats = [...hookMap.entries()].map(([hook, m]) => ({
    hook,
    avgER: +(m.er.reduce((s, v) => s + v, 0) / m.er.length).toFixed(1),
    count: m.count,
  })).sort((a, b) => b.avgER - a.avgER)

  const prompt = `You are a data-driven content strategy advisor for a social media creator on ${platform === 'ig' ? 'Instagram' : platform === 'yt' ? 'YouTube' : platform === 'tt' ? 'TikTok' : platform}.

Here is their actual content performance data:

OVERALL METRICS (${posts.length} posts analyzed):
- Avg ER%: ${avgER.toFixed(1)}%
- Avg Views: ${fmt(avgViews)}

TOP 5 POSTS BY ER%:
${top5.map(p => `- ${p.postId} "${p.title}" | ER: ${p.er.toFixed(1)}% | Views: ${fmt(p.views)} | Pillar: ${p.pillar ?? '—'} | Hook: ${p.hook ?? '—'}`).join('\n')}

BOTTOM 5 POSTS BY ER%:
${bottom5.map(p => `- ${p.postId} "${p.title}" | ER: ${p.er.toFixed(1)}% | Views: ${fmt(p.views)} | Pillar: ${p.pillar ?? '—'} | Hook: ${p.hook ?? '—'}`).join('\n')}

PILLAR PERFORMANCE:
${pillarStats.map(p => `- ${p.pillar}: avg ${p.avgER}% ER, ${fmt(p.avgViews)} avg views (${p.count} posts)`).join('\n')}

HOOK TYPE PERFORMANCE:
${hookStats.slice(0, 5).map(h => `- ${h.hook}: avg ${h.avgER}% ER (${h.count} posts)`).join('\n')}

Generate exactly 4 specific, actionable content suggestions as a JSON array. Each suggestion must reference ACTUAL numbers and names from the data above. Be specific — never give generic advice.

Response format (JSON array only, no other text):
[
  {
    "icon": "up" | "fire" | "target" | "alert",
    "headline": "Short 5-8 word action headline",
    "explanation": "One specific sentence referencing actual data points from above (mention real post IDs, pillar names, hook types, or specific ER% numbers).",
    "dataPoint": "Key metric that triggered this suggestion (e.g. '8.2% ER vs 5.1% avg')"
  }
]

Icons: "up" = growth opportunity, "fire" = top performer to replicate, "target" = precision improvement, "alert" = underperformer to fix.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const suggestions: AISuggestion[] = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    return NextResponse.json({ suggestions: suggestions.slice(0, 4), cached: false })
  } catch (err) {
    console.error('AI suggestions error:', err)
    return NextResponse.json({ suggestions: [], cached: false, error: 'Failed to generate suggestions' })
  }
}
