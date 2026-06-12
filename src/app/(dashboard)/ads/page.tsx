import { getPortalContext } from '@/lib/supabase/portal'
import { AdsClient } from '@/components/portal/AdsClient'
import { FilterBar } from '@/components/portal/FilterBar'

// ── Types ──────────────────────────────────────────────────────────────────

export type AdCampaign = {
  id: string
  name: string
  date: string          // launch date (ISO)
  endDate: string | null // inferred from next campaign's start - 1 day
  objective: string
  status: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  leads: number
  hires: number
  ctr: number
  cpm: number
  cpc: number
  cpl: number
  cph: number
  roas: number
  effectiveRevenue: number  // roas * spend (since revenue col is 0 in migration)
}

export type AdCreative = {
  id: string
  campaignId: string | null
  campaignName: string
  name: string
  type: string
  status: string
  impressions: number
  ctr: number
  watchPct: number
  cpl: number
  cph: number
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function AdsPage() {
  const { supabase, clientId } = await getPortalContext()
  const fallback = '00000000-0000-0000-0000-000000000000'
  const cid      = clientId ?? fallback

  type RawCampaign = {
    id: string; name: string; date: string; objective: string; status: string;
    spend: number; impressions: number; reach: number; clicks: number;
    leads: number; hires: number; revenue: number;
    ctr: number; cpm: number; cpc: number; cpl: number; cph: number; roas: number;
  }
  type RawCreative = {
    id: string; campaign_id: string | null; name: string; type: string; status: string;
    impressions: number; ctr: number; watch_pct: number; cpl: number; cph: number;
  }

  const [campaignRes, creativeRes] = await Promise.all([
    supabase
      .from('ad_campaigns')
      .select('id,name,date,objective,status,spend,impressions,reach,clicks,leads,hires,revenue,ctr,cpm,cpc,cpl,cph,roas')
      .eq('client_id', cid)
      .order('date', { ascending: true }),
    supabase
      .from('ad_creatives')
      .select('id,campaign_id,name,type,status,impressions,ctr,watch_pct,cpl,cph')
      .eq('client_id', cid)
      .order('created_at', { ascending: true }),
  ])

  const rawCampaigns = (campaignRes.data ?? []) as unknown as RawCampaign[]
  const rawCreatives = (creativeRes.data ?? []) as unknown as RawCreative[]

  // Infer end dates: end of campaign N = day before campaign N+1 starts
  const campaigns: AdCampaign[] = rawCampaigns.map((c, i) => {
    const nextStart = rawCampaigns[i + 1]?.date ?? null
    const endDate   = nextStart
      ? new Date(new Date(nextStart).getTime() - 86_400_000)
          .toISOString().split('T')[0]
      : null

    const effectiveRevenue = c.revenue > 0
      ? c.revenue
      : (c.roas > 0 ? +(c.roas * c.spend).toFixed(2) : 0)

    return {
      id: c.id, name: c.name, date: c.date, endDate,
      objective: c.objective, status: c.status,
      spend: +c.spend, impressions: +c.impressions, reach: +c.reach,
      clicks: +c.clicks, leads: +c.leads, hires: +c.hires,
      ctr: +c.ctr, cpm: +c.cpm, cpc: +c.cpc, cpl: +c.cpl, cph: +c.cph,
      roas: +c.roas, effectiveRevenue,
    }
  })

  // Build a name lookup for creatives
  const campaignNameById = Object.fromEntries(campaigns.map(c => [c.id, c.name]))

  const creatives: AdCreative[] = rawCreatives.map(cr => ({
    id:           cr.id,
    campaignId:   cr.campaign_id,
    campaignName: cr.campaign_id ? (campaignNameById[cr.campaign_id] ?? '—') : '—',
    name:         cr.name,
    type:         cr.type,
    status:       cr.status,
    impressions:  +cr.impressions,
    ctr:          +cr.ctr,
    watchPct:     +cr.watch_pct,
    cpl:          +cr.cpl,
    cph:          +cr.cph,
  }))

  const totalSpend    = campaigns.reduce((s, c) => s + c.spend, 0)
  const totalRevenue  = campaigns.reduce((s, c) => s + c.effectiveRevenue, 0)
  const totalHires    = campaigns.reduce((s, c) => s + c.hires, 0)
  const portfolioROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0

  return (
    <div className="p-10">
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 24 }}>
        <p
          className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3"
          style={{ color: '#c9a96e' }}
        >
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Paid Media
        </p>
        <h1
          className="font-jakarta font-light"
          style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}
        >
          Ads
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#666' }}>
          {campaigns.length} campaigns · Meta · all spend and results
        </p>
      </div>

      <FilterBar />
      <AdsClient
        campaigns={campaigns}
        creatives={creatives}
        totalSpend={totalSpend}
        totalRevenue={totalRevenue}
        totalHires={totalHires}
        portfolioROAS={portfolioROAS}
      />
    </div>
  )
}
