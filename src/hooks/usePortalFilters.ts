'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export type PlatformFilter = 'all' | 'ig' | 'tt' | 'yt' | 'lf'
export type WindowFilter   = 'live' | 'w24' | 'w3' | 'w7' | 'eom'
export type ScopeFilter    =
  | 'all' | 'week' | 'month' | 'custom'
  | 'jan' | 'feb' | 'mar' | 'apr' | 'may' | 'jun'
  | 'jul' | 'aug' | 'sep' | 'oct' | 'nov' | 'dec'

export type PortalFilters = {
  platform: PlatformFilter
  win:      WindowFilter
  scope:    ScopeFilter
  from:     string | null
  to:       string | null
}

export type FilterUpdate = Partial<PortalFilters>

const MONTH_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

export function getScopeRange(
  scope: ScopeFilter,
  customFrom: string | null,
  customTo:   string | null,
): { from: string | null; to: string | null } {
  const now  = new Date()
  const year = now.getFullYear()

  if (scope === 'all') return { from: null, to: null }

  if (scope === 'week') {
    const day  = now.getDay()
    const diff = day === 0 ? -6 : 1 - day   // Monday offset
    const mon  = new Date(now); mon.setDate(now.getDate() + diff)
    const sun  = new Date(mon);  sun.setDate(mon.getDate() + 6)
    return {
      from: mon.toISOString().split('T')[0],
      to:   sun.toISOString().split('T')[0],
    }
  }

  if (scope === 'month') {
    const m = now.getMonth() + 1
    const last = new Date(year, m, 0).getDate()
    return {
      from: `${year}-${String(m).padStart(2, '0')}-01`,
      to:   `${year}-${String(m).padStart(2, '0')}-${last}`,
    }
  }

  if (scope in MONTH_NUM) {
    const m    = MONTH_NUM[scope]
    const last = new Date(year, m, 0).getDate()
    return {
      from: `${year}-${String(m).padStart(2, '0')}-01`,
      to:   `${year}-${String(m).padStart(2, '0')}-${last}`,
    }
  }

  if (scope === 'custom') return { from: customFrom, to: customTo }

  return { from: null, to: null }
}

export function filterByScope<T extends { date: string }>(
  items: T[],
  scope: ScopeFilter,
  customFrom: string | null,
  customTo:   string | null,
): T[] {
  const { from, to } = getScopeRange(scope, customFrom, customTo)
  if (!from && !to) return items
  return items.filter(item => {
    const d = item.date
    if (from && d < from) return false
    if (to   && d > to  ) return false
    return true
  })
}

export function filterByPlatform<T extends { platform: string[] }>(
  items: T[],
  platform: PlatformFilter,
  getFormat?: (item: T) => string | null,
): T[] {
  if (platform === 'all') return items
  if (platform === 'lf') {
    return items.filter(item =>
      item.platform.includes('yt') &&
      (getFormat ? getFormat(item) === 'Long-form' : true)
    )
  }
  return items.filter(item => item.platform.includes(platform))
}

export function usePortalFilters(): PortalFilters & {
  setFilters: (update: FilterUpdate) => void
} {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const pathname     = usePathname()

  // Read stored platform from localStorage when no URL param present
  const storedPlatform = typeof window !== 'undefined'
    ? (localStorage.getItem('dropclix_platform') as PlatformFilter | null) ?? 'ig'
    : 'ig'
  const platform = (searchParams.get('platform') ?? storedPlatform) as PlatformFilter
  const win      = (searchParams.get('win')      ?? 'live') as WindowFilter
  const scope    = (searchParams.get('scope')    ?? 'all') as ScopeFilter
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')

  const setFilters = useCallback((update: FilterUpdate) => {
    const params = new URLSearchParams(searchParams.toString())
    if (update.platform !== undefined) {
      params.set('platform', update.platform)
      if (typeof window !== 'undefined') localStorage.setItem('dropclix_platform', update.platform)
    }
    if (update.win      !== undefined) params.set('win',      update.win)
    if (update.scope    !== undefined) {
      params.set('scope', update.scope)
      if (update.scope !== 'custom') { params.delete('from'); params.delete('to') }
    }
    if (update.from !== undefined) {
      update.from ? params.set('from', update.from) : params.delete('from')
    }
    if (update.to !== undefined) {
      update.to ? params.set('to', update.to) : params.delete('to')
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  return { platform, win, scope, from, to, setFilters }
}
