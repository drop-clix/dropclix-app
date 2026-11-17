// Meta Graph API rate-limit awareness for Instagram sync.
//
// Graph reports usage as percentages in response headers:
//   x-app-usage:                  {"call_count":n,"total_cputime":n,"total_time":n}
//   x-business-use-case-usage:    {"<id>":[{"type":"instagram","call_count":n,...,
//                                   "estimated_time_to_regain_access":minutes}]}
// We track the highest percentage seen, pause before calls when it is high, and
// retry a rate-limited call exactly once. Request URLs carry the access token
// and are never logged.

import { sleep } from '@/lib/concurrency'

export const GRAPH_RATE_LIMIT_CODES = new Set([4, 17, 32, 613])

const SLOW_AT_PCT = 75
const PAUSE_AT_PCT = 90
const BLOCK_AT_PCT = 100
const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 30_000

type UsageState = { pct: number; regainMinutes: number; updatedAt: number }
const usage: UsageState = { pct: 0, regainMinutes: 0, updatedAt: 0 }

function numbersIn(value: unknown): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) return [value]
  if (Array.isArray(value)) return value.flatMap(numbersIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbersIn)
  return []
}

function recordUsage(headers: Headers) {
  let pct = 0
  let regainMinutes = 0
  const app = headers.get('x-app-usage')
  if (app) {
    try {
      const parsed = JSON.parse(app) as Record<string, unknown>
      pct = Math.max(pct, ...numbersIn([parsed.call_count, parsed.total_cputime, parsed.total_time]))
    } catch { /* ignore malformed header */ }
  }
  const buc = headers.get('x-business-use-case-usage')
  if (buc) {
    try {
      const parsed = JSON.parse(buc) as Record<string, Array<Record<string, unknown>>>
      for (const entries of Object.values(parsed)) {
        for (const entry of entries ?? []) {
          pct = Math.max(pct, ...numbersIn([entry.call_count, entry.total_cputime, entry.total_time]))
          regainMinutes = Math.max(regainMinutes, ...numbersIn([entry.estimated_time_to_regain_access]))
        }
      }
    } catch { /* ignore malformed header */ }
  }
  if (app || buc) {
    usage.pct = pct
    usage.regainMinutes = regainMinutes
    usage.updatedAt = Date.now()
  }
}

/** Highest Graph usage percentage reported by the most recent response. */
export function graphUsagePct(): number {
  return usage.pct
}

/**
 * True when Graph says we are out of quota for longer than we can wait inside
 * one request. Callers should stop starting new work and return a resume cursor.
 */
export function graphBlocked(): boolean {
  return usage.pct >= BLOCK_AT_PCT || usage.regainMinutes >= 1
}

async function throttle(label: string) {
  if (usage.pct >= PAUSE_AT_PCT) {
    console.warn(`[graph] usage ${usage.pct}% before ${label}; pausing 10s`)
    await sleep(10_000)
  } else if (usage.pct >= SLOW_AT_PCT) {
    await sleep(1_000)
  }
}

export type GraphResult = {
  ok: boolean
  status: number
  text: string
  json: unknown
  errorCode: number | null
  errorMessage: string | null
  rateLimited: boolean
  retried: boolean
}

async function once(url: string): Promise<Omit<GraphResult, 'retried'>> {
  const res = await fetch(url)
  recordUsage(res.headers)
  const text = await res.text()
  let json: unknown = null
  try { json = text ? JSON.parse(text) : null } catch { /* keep raw text */ }
  const error = (json && typeof json === 'object' && 'error' in json)
    ? (json as { error?: { code?: number; message?: string } }).error ?? null
    : null
  const errorCode = typeof error?.code === 'number' ? error.code : null
  return {
    ok: res.ok && !error,
    status: res.status,
    text,
    json,
    errorCode,
    errorMessage: error?.message ?? null,
    rateLimited: errorCode !== null && GRAPH_RATE_LIMIT_CODES.has(errorCode),
  }
}

/**
 * GET a Graph URL with usage-based throttling. A rate-limited response
 * (codes 4, 17, 32, 613) is retried exactly once after a delay; it never loops.
 * `label` is used in logs instead of the URL, which contains the token.
 */
export async function graphFetch(url: string, label: string): Promise<GraphResult> {
  await throttle(label)
  const first = await once(url)
  if (!first.rateLimited) return { ...first, retried: false }

  const regainMs = usage.regainMinutes * 60_000
  const waitMs = Math.min(RETRY_MAX_MS, Math.max(RETRY_MIN_MS, regainMs))
  console.warn(`[graph] rate limited (code ${first.errorCode}) on ${label}; retrying once in ${Math.round(waitMs / 1000)}s`)
  await sleep(waitMs)
  const second = await once(url)
  if (second.rateLimited) {
    console.warn(`[graph] still rate limited (code ${second.errorCode}) on ${label}; giving up on this call`)
  }
  return { ...second, retried: true }
}
