import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

const IMPERSONATE_COOKIE = 'dropclix_impersonate_client_id'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      type: 'text',
      content: 'AI command requires ANTHROPIC_API_KEY. Ask your admin to configure it.',
    })
  }

  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('role, client_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 401 })

  const cookieStore = await cookies()
  const cid = profile.role === 'admin'
    ? (cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null)
    : (profile.client_id as string | null)

  if (!cid) return NextResponse.json({ type: 'text', content: 'No client context active. Start impersonating a client first.' })

  const { message } = (await req.json()) as { message: string }
  if (!message?.trim()) return NextResponse.json({ type: 'text', content: 'Please type a command.' })

  const admin = createAdminClient()

  // Fetch context in parallel
  const [pipelineRes, postsRes, clientRes] = await Promise.all([
    admin.from('pipeline_items')
      .select('post_id, title, platform, status, priority, pillar, week')
      .eq('client_id', cid).order('priority', { ascending: true }).limit(25),
    admin.from('posts')
      .select('post_id, title, platform, decision, post_analytics(views, likes, comments, shares, saves, metric_window)')
      .eq('client_id', cid).order('created_at', { ascending: false }).limit(15),
    admin.from('clients').select('name').eq('id', cid).single(),
  ])

  const pipelineItems = (pipelineRes.data ?? []) as {
    post_id: string; title: string; platform: string[];
    status: string; priority: number; pillar: string | null; week: string | null
  }[]
  const posts = (postsRes.data ?? []) as {
    post_id: string; title: string; platform: string[]; decision: string | null;
    post_analytics: { views: number; likes: number; comments: number; shares: number; saves: number; metric_window: string }[]
  }[]
  const clientName = (clientRes.data as { name: string } | null)?.name ?? 'Client'

  // Compute next IDs
  const allIds = [
    ...pipelineItems.map(r => r.post_id ?? ''),
    ...posts.map(r => r.post_id ?? ''),
  ]
  function nextId(prefix: string, pad: number): string {
    const re = new RegExp(`#${prefix}(\\d+)`, 'i')
    const nums = allIds
      .flatMap(id => id.split('|').map(s => s.trim()))
      .map(id => re.exec(id)?.[1]).filter((n): n is string => n != null).map(Number)
    const max = nums.length ? Math.max(...nums) : 0
    return `#${prefix}${String(max + 1).padStart(pad, '0')}`
  }
  const nextIds = {
    ig: nextId('ig', 4),
    tt: nextId('tt', 4),
    yt: nextId('yt', 4),
    lf: nextId('LF', 4),
  }

  // Calculate ER% for posts
  const postsWithER = posts.map(p => {
    const analytics = p.post_analytics ?? []
    const win = analytics.find(a => a.metric_window === 'eom')
      ?? analytics.find(a => a.metric_window === 'w7')
      ?? analytics[0]
    if (!win?.views) return { ...p, er: 0, views: 0 }
    const er = ((win.likes + win.comments + win.shares + win.saves) / win.views) * 100
    return { ...p, er: +er.toFixed(1), views: win.views }
  })

  const now = new Date()
  const currentMonth = MONTHS[now.getMonth()]
  const currentWeekNum = Math.ceil(now.getDate() / 7)

  const systemPrompt = `You are an AI assistant for a content creator management portal called Drop CLIX.

CLIENT: ${clientName}
CURRENT DATE: ${now.toISOString().slice(0, 10)} (${currentMonth} ${now.getFullYear()})

PIPELINE (${pipelineItems.length} items — active only):
${pipelineItems.slice(0, 20).map(i =>
  `  • ${i.post_id} | "${i.title}" | ${(i.platform ?? []).join('/')} | ${i.status} | Wk: ${i.week ?? '—'} | Pillar: ${i.pillar ?? '—'} | Pri: ${i.priority}`
).join('\n')}

RECENT POSTS (by ER%):
${postsWithER.slice(0, 12).map(p =>
  `  • ${p.post_id} | "${p.title}" | ${(p.platform ?? []).join('/')} | ER: ${p.er}% | Views: ${fmt(p.views)} | Decision: ${p.decision ?? '—'}`
).join('\n')}

NEXT AVAILABLE IDs:
  Instagram (ig):        ${nextIds.ig}
  TikTok (tt):           ${nextIds.tt}
  YouTube Shorts (yt):   ${nextIds.yt}
  YouTube Long-form (lf):${nextIds.lf}

WEEK FORMAT: MonWk# — e.g. JanWk1, MayWk3, ${currentMonth}Wk${currentWeekNum}
VALID STATUSES: SCRIPTED, PLANNED, FILMING, EDITING, REVIEWING, SCHEDULED, POSTED, CANCELLED
VALID PLATFORMS: ig, tt, yt, lf

USER MESSAGE: "${message}"

Respond with valid JSON ONLY (no markdown, no commentary). Use one of these exact formats:

1. Text answer: {"type":"text","content":"..."}

2. Add pipeline item: {"type":"action","action":"add_pipeline","summary":"...","data":{"postId":"...","title":"...","platform":["ig"],"status":"PLANNED","priority":3,"pillar":"...","week":"${currentMonth}Wk${currentWeekNum}","scriptContent":null}}
   For multi-platform: join IDs with " | " (e.g. "#ig0053 | #tt0048"), combine platform arrays.

3. Update analytics: {"type":"action","action":"update_analytics","summary":"...","data":{"postTextId":"#ig0034","platform":"ig","metricWindow":"eom","field":"views","value":14200}}
   Valid fields: views, likes, comments, shares, saves, watch_pct, followers

4. Bulk update pipeline status: {"type":"action","action":"bulk_update_status","summary":"...","data":{"fromStatus":"FILMING","toStatus":"REVIEWING"}}

Always use real data from the context above. Never invent post IDs that don't exist (except for add_pipeline which uses NEXT AVAILABLE IDs). For queries/questions use format 1. Keep summaries under 80 characters.`

  try {
    const client = new Anthropic({ apiKey })
    const message_obj = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: systemPrompt }],
    })
    const text = message_obj.content[0].type === 'text' ? message_obj.content[0].text : '{}'
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ type: 'text', content: text })
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('AI command error:', err)
    return NextResponse.json({ type: 'text', content: 'Something went wrong. Please try again.' })
  }
}
