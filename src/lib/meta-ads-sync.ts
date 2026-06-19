import { createAdminClient } from '@/lib/supabase/admin'

type MetaCampaign = {
  id: string
  name?: string | null
  status?: string | null
  objective?: string | null
  start_time?: string | null
  stop_time?: string | null
}

type MetaInsights = {
  spend?: string | null
  impressions?: string | null
  reach?: string | null
  clicks?: string | null
  ctr?: string | null
  cpm?: string | null
  cpc?: string | null
}

export type MetaAdsSyncResult = {
  synced: number
  skipped: number
  errors: string[]
}

type MetaAdsCampaignPayload = {
  client_id: string
  meta_campaign_id: string
  name: string
  date: string | null
  objective: string | null
  status: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpm: number
  cpc: number
}

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForLog)
  if (!value || typeof value !== 'object') return value

  const redacted = new Set(['access_token', 'token'])
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      redacted.has(key.toLowerCase()) ? '[REDACTED]' : sanitizeForLog(val),
    ]),
  )
}

function parseNumber(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : parseFloat(value ?? '0')
  return Number.isFinite(n) ? n : 0
}

function parseInteger(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : parseInt(value ?? '0', 10)
  return Number.isFinite(n) ? n : 0
}

function mapStatus(status: string | null | undefined): string {
  if (status === 'ACTIVE') return 'Active'
  if (status === 'PAUSED') return 'Paused'
  if (status === 'DELETED' || status === 'ARCHIVED') return 'Completed'
  return 'Completed'
}

async function graphGet<T extends object>(
  label: string,
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/v19.0/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString())
  const rawText = await res.text()
  let body: unknown = rawText
  try { body = rawText ? JSON.parse(rawText) : null } catch { /* keep raw text */ }

  console.log(`[meta-ads-sync] ${label} raw:`, {
    status: res.status,
    ok: res.ok,
    body: sanitizeForLog(body),
  })

  if (!res.ok) {
    const graphError = typeof body === 'object' && body && 'error' in body
      ? (body as { error?: { message?: string; code?: number } }).error
      : null
    throw new Error(graphError?.message ?? `${label} failed (${res.status})`)
  }

  return body as T
}

async function fetchCampaigns(
  accessToken: string,
  adAccountId: string,
): Promise<MetaCampaign[]> {
  const json = await graphGet<{ data?: MetaCampaign[] }>(
    `${adAccountId}/campaigns`,
    `${adAccountId}/campaigns`,
    {
      fields: 'id,name,status,objective,start_time,stop_time',
      date_preset: 'maximum',
      limit: '100',
    },
    accessToken,
  )
  return json.data ?? []
}

async function fetchCampaignInsights(
  accessToken: string,
  campaignId: string,
): Promise<MetaInsights | null> {
  const json = await graphGet<{ data?: MetaInsights[] }>(
    `${campaignId}/insights`,
    `${campaignId}/insights`,
    {
      fields: 'spend,impressions,reach,clicks,ctr,cpm,cpc',
      date_preset: 'maximum',
    },
    accessToken,
  )
  return json.data?.[0] ?? null
}

async function saveCampaignMetrics(
  admin: ReturnType<typeof createAdminClient>,
  payload: MetaAdsCampaignPayload,
): Promise<{ error?: { message: string; code?: string; details?: string } }> {
  const { data: existing, error: lookupError } = await admin
    .from('ad_campaigns')
    .select('id')
    .eq('client_id', payload.client_id)
    .eq('meta_campaign_id', payload.meta_campaign_id)
    .maybeSingle()

  if (lookupError) return { error: lookupError }

  if (existing?.id) {
    const { client_id: _clientId, meta_campaign_id: _metaCampaignId, ...apiFields } = payload
    const { error } = await admin
      .from('ad_campaigns')
      .update(apiFields)
      .eq('id', (existing as { id: string }).id)
      .eq('client_id', payload.client_id)
    return { error: error ?? undefined }
  }

  const { error } = await admin
    .from('ad_campaigns')
    .insert(payload)

  return { error: error ?? undefined }
}

export async function syncMetaAdsForClient(
  clientId: string,
  accessToken: string,
  adAccountId: string,
): Promise<MetaAdsSyncResult> {
  const admin = createAdminClient()
  const result: MetaAdsSyncResult = { synced: 0, skipped: 0, errors: [] }

  const campaigns = await fetchCampaigns(accessToken, adAccountId)
  if (campaigns.length === 0) return result

  for (const campaign of campaigns) {
    if (!campaign.id) {
      result.skipped++
      continue
    }

    try {
      const insights = await fetchCampaignInsights(accessToken, campaign.id)
      const payload = {
        client_id: clientId,
        meta_campaign_id: campaign.id,
        name: campaign.name ?? campaign.id,
        date: campaign.start_time?.split('T')[0] ?? null,
        objective: campaign.objective ?? null,
        status: mapStatus(campaign.status),
        spend: parseNumber(insights?.spend),
        impressions: parseInteger(insights?.impressions),
        reach: parseInteger(insights?.reach),
        clicks: parseInteger(insights?.clicks),
        ctr: parseNumber(insights?.ctr),
        cpm: parseNumber(insights?.cpm),
        cpc: parseNumber(insights?.cpc),
      }

      const { error } = await saveCampaignMetrics(admin, payload)

      if (error) {
        console.error(`[meta-ads-sync] upsert failed for campaign ${campaign.id}:`, error.message, error.code, error.details)
        result.errors.push(`${campaign.id}: ${error.message}`)
        continue
      }

      console.log(`[meta-ads-sync] synced campaign ${campaign.id}: spend=${payload.spend} impressions=${payload.impressions} reach=${payload.reach} clicks=${payload.clicks}`)
      result.synced++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown campaign sync error'
      console.error(`[meta-ads-sync] campaign ${campaign.id} failed:`, message)
      result.errors.push(`${campaign.id}: ${message}`)
    }
  }

  return result
}
