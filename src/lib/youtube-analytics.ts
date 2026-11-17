// YouTube Analytics fetch helpers for /api/admin/sync-youtube.
//
// Date rule (S77): YouTube Analytics reports days in Pacific time, while
// posts.date is the UTC date of publishedAt. A video published between 00:00
// and ~07:00 UTC belongs to the previous Pacific day, so a query starting at
// posts.date drops the whole publish day. Lifetime queries avoid this.

export type YTVideoMetrics = {
  views: number; likes: number; comments: number; shares: number
  estimatedMinutesWatched: number; averageViewPercentage: number
  subscribersGained: number; impressions: number; ctr: number
}

// Lifetime start: earlier than any Day 1 video. Analytics returns no rows for
// days before a video existed, so an early start only widens the range.
export const YT_LIFETIME_START = '2015-01-01'
const YT_BATCH_MAX_IDS = 200
const MAIN_METRICS = 'views,likes,comments,shares,estimatedMinutesWatched,averageViewPercentage,subscribersGained'

export function ytLifetimeStart(earliestPostDate: string | null): string {
  if (!earliestPostDate || earliestPostDate >= YT_LIFETIME_START) return YT_LIFETIME_START
  const d = new Date(`${earliestPostDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 2)
  return d.toISOString().slice(0, 10)
}

export async function fetchYTAnalytics(
  accessToken: string,
  channelId: string,
  videoId: string,
  startDate: string,
  endDate: string,
): Promise<{
  views: number; likes: number; comments: number; shares: number
  estimatedMinutesWatched: number; averageViewPercentage: number
  subscribersGained: number; impressions: number; ctr: number
} | null> {
  // Main call: per-video engagement metrics (always supported with yt-analytics.readonly)
  const params = new URLSearchParams({
    ids:      `channel==${channelId}`,
    startDate,
    endDate,
    metrics:  'views,likes,comments,shares,estimatedMinutesWatched,averageViewPercentage,subscribersGained',
    filters:  `video==${videoId}`,
  })

  const res = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    console.error(`YT Analytics error for ${videoId}:`, await res.text())
    return null
  }

  const json = await res.json()
  const row = json.rows?.[0]
  if (!row) return null

  // Secondary call: impressions + CTR — requires dimensions=video; stored as 0 if unavailable
  let impressions = 0
  let ctr = 0
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
      `https://youtubeanalytics.googleapis.com/v2/reports?${iParams.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (iRes.ok) {
      const iJson = await iRes.json()
      const iRow = iJson.rows?.[0]  // columns: [videoId, impressions, ctr]
      if (iRow) {
        impressions = Math.round(iRow[1] ?? 0)
        ctr         = Math.round((iRow[2] ?? 0) * 10000) / 100
      }
    }
  } catch { /* impressions unavailable — stored as 0 */ }

  return {
    views:                   Math.round(row[0] ?? 0),
    likes:                   Math.round(row[1] ?? 0),
    comments:                Math.round(row[2] ?? 0),
    shares:                  Math.round(row[3] ?? 0),
    estimatedMinutesWatched: Math.round(row[4] ?? 0),
    averageViewPercentage:   Math.round((row[5] ?? 0) * 100) / 100,
    subscribersGained:       Math.round(row[6] ?? 0),
    impressions,
    ctr,
  }
}

export type YTLifetimeBatchResult = {
  metrics: Map<string, YTVideoMetrics>
  /** Video IDs absent from the batch rows (no activity, not owned, or batch failed). */
  missing: string[]
  /** Set when a batch call failed; transient 5xx failures are retried per video by the caller. */
  batchErrors: { status: number; message: string; ids: string[] }[]
}

/**
 * One batched dimensions=video Analytics call per 200 IDs over the lifetime
 * range, plus one batched impressions/CTR call (stored as 0 when unavailable,
 * matching the per-video behavior).
 */
export async function fetchYTLifetimeBatch(
  accessToken: string,
  channelId: string,
  videoIds: string[],
  startDate: string,
  endDate: string,
): Promise<YTLifetimeBatchResult> {
  const result: YTLifetimeBatchResult = { metrics: new Map(), missing: [], batchErrors: [] }
  const ids = Array.from(new Set(videoIds.filter(Boolean)))

  for (let i = 0; i < ids.length; i += YT_BATCH_MAX_IDS) {
    const chunk = ids.slice(i, i + YT_BATCH_MAX_IDS)
    const base = {
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      dimensions: 'video',
      filters: `video==${chunk.join(',')}`,
      maxResults: String(YT_BATCH_MAX_IDS),
    }
    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ...base, metrics: MAIN_METRICS, sort: '-views' })}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) {
      const message = await res.text()
      console.error(`[yt-sync] lifetime batch failed (${res.status}) for ${chunk.length} videos:`, message.slice(0, 500))
      result.batchErrors.push({ status: res.status, message: message.slice(0, 300), ids: chunk })
      continue
    }
    const json = await res.json() as { rows?: (string | number)[][] }
    for (const row of json.rows ?? []) {
      result.metrics.set(String(row[0]), {
        views:                   Math.round(Number(row[1] ?? 0)),
        likes:                   Math.round(Number(row[2] ?? 0)),
        comments:                Math.round(Number(row[3] ?? 0)),
        shares:                  Math.round(Number(row[4] ?? 0)),
        estimatedMinutesWatched: Math.round(Number(row[5] ?? 0)),
        averageViewPercentage:   Math.round(Number(row[6] ?? 0) * 100) / 100,
        subscribersGained:       Math.round(Number(row[7] ?? 0)),
        impressions: 0,
        ctr: 0,
      })
    }

    // Impressions + CTR: same batched shape; 0 when unavailable (unchanged behavior).
    try {
      const iRes = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ...base, metrics: 'impressions,impressionsClickThroughRate', sort: '-impressions' })}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (iRes.ok) {
        const iJson = await iRes.json() as { rows?: (string | number)[][] }
        for (const iRow of iJson.rows ?? []) {
          const m = result.metrics.get(String(iRow[0]))
          if (!m) continue
          m.impressions = Math.round(Number(iRow[1] ?? 0))
          m.ctr = Math.round(Number(iRow[2] ?? 0) * 10000) / 100
        }
      }
    } catch { /* impressions unavailable — stored as 0 */ }
  }

  result.missing = ids.filter(id => !result.metrics.has(id))
  return result
}
