import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

type Suggestion = {
  icon: string
  headline: string
  body: string
  trigger: string
}

type SuggestionPost = {
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

type Payload = {
  mode?: 'monthly' | 'projection'
  platform?: string
  scope?: string
  projectionMetric?: string
  goalsSummary?: string
  posts?: SuggestionPost[]
}

function fallback(posts: SuggestionPost[], mode: string): Suggestion[] {
  const sorted = [...posts].sort((a, b) => b.er - a.er)
  const top = sorted[0]
  const bottom = sorted[sorted.length - 1]
  if (!top) {
    return [{ icon: 'spark', headline: 'Import fresh analytics', body: 'No matching posts were available for this filter.', trigger: '0 posts in request' }]
  }
  const avg = posts.reduce((s, p) => s + p.er, 0) / posts.length
  return [
    {
      icon: 'trend',
      headline: `Repeat ${top.pillar ?? 'the top pillar'}`,
      body: `${top.title} leads this view at ${top.er.toFixed(1)}% ER and ${top.reach.toLocaleString()} reach.`,
      trigger: `${top.id} is ${(top.er - avg).toFixed(1)} pts above avg`,
    },
    {
      icon: 'hook',
      headline: `Use ${top.hook ?? 'the winning hook'} earlier`,
      body: `The strongest post uses this hook type, so test it in the first line of the next batch.`,
      trigger: `${top.id} hook: ${top.hook ?? 'unknown'}`,
    },
    {
      icon: 'watch',
      headline: 'Protect retention',
      body: `Use the top post pacing as the baseline before changing CTA or format.`,
      trigger: `${top.watch.toFixed(1)}% watch on ${top.id}`,
    },
    {
      icon: 'repair',
      headline: 'Rewrite the low performer',
      body: `${bottom?.title ?? top.title} is the clearest place to test a sharper opening.`,
      trigger: `${bottom?.id ?? top.id} sits at ${(bottom?.er ?? top.er).toFixed(1)}% ER`,
    },
    ...(mode === 'projection' ? [{
      icon: 'pace',
      headline: 'Keep one variable stable',
      body: 'The projection uses the last 10 posts, so change pillar or hook, not both in the same test.',
      trigger: `${Math.min(posts.length, 10)} posts in projection sample`,
    }] : []),
  ].slice(0, mode === 'projection' ? 6 : 4)
}

function coerceSuggestions(value: unknown): Suggestion[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const headline = typeof row.headline === 'string' ? row.headline : ''
      const body = typeof row.body === 'string' ? row.body : ''
      const trigger = typeof row.trigger === 'string' ? row.trigger : ''
      const icon = typeof row.icon === 'string' ? row.icon : 'spark'
      if (!headline || !body || !trigger) return null
      return { icon, headline, body, trigger }
    })
    .filter((item): item is Suggestion => Boolean(item))
}

export async function POST(request: Request) {
  const payload = await request.json() as Payload
  const posts = (payload.posts ?? []).slice(0, 24)
  const mode = payload.mode ?? 'monthly'
  const fallbackSuggestions = fallback(posts, mode)

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ suggestions: fallbackSuggestions, source: 'fallback' })
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const count = mode === 'projection' ? '4 to 6' : '4'
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 900,
      temperature: 0.2,
      system: [
        `You write concise analytics recommendations for a premium social media dashboard.`,
        `Return JSON only with shape {"suggestions":[{"icon":"trend","headline":"...","body":"...","trigger":"..."}]}.`,
        `Every suggestion must cite actual post IDs, numbers, pillar names, hook types, or goals from the provided data.`,
        `Do not give generic advice. Use no markdown.`,
      ].join(' '),
      messages: [{
        role: 'user',
        content: JSON.stringify({
          mode,
          count,
          platform: payload.platform,
          scope: payload.scope,
          projectionMetric: payload.projectionMetric,
          goals: payload.goalsSummary,
          posts,
        }),
      }],
    })

    const text = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim()
    const parsed = JSON.parse(text) as { suggestions?: unknown }
    const suggestions = coerceSuggestions(parsed.suggestions)
    return NextResponse.json({ suggestions: suggestions.length ? suggestions : fallbackSuggestions, source: suggestions.length ? 'claude' : 'fallback' })
  } catch (error) {
    console.error('Claude suggestions failed:', error)
    return NextResponse.json({ suggestions: fallbackSuggestions, source: 'fallback' })
  }
}
