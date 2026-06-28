'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlatformPills, ScopeDropdown } from '@/components/portal/FilterBar'
import { usePortalFilters, filterByPlatform, filterByScope } from '@/hooks/usePortalFilters'
import { EmptyState } from '@/components/portal/EmptyState'
import { OnboardingBanner } from '@/components/portal/OnboardingBanner'
import { AISuggestionsModal } from '@/components/portal/AISuggestionsModal'
import {
  submitApproval,
  getClientNotes,
  saveClientNotes,
  linkUnlinkedDiscovery,
  createPipelineItemFromDiscovery,
  createPipelineItemFromDiscoveryBundle,
  linkMissingPlatformToPipelineItem,
  ignoreUnlinkedDiscovery,
} from '@/app/(dashboard)/edit-actions'
import { RichTextEditor } from '@/components/portal/RichTextEditor'
import { useToast } from '@/components/portal/Toast'
import { PlatformMark, type PlatformLogoKey } from '@/components/portal/PlatformLogos'
import type { AISuggestion } from '@/components/portal/AISuggestionsModal'
import type { PlatformFilter } from '@/hooks/usePortalFilters'

export type RawDashPost = {
  id: string
  post_id: string
  title: string
  platform: string[]
  date: string | null
  format: string | null
  pillar: string | null
  hook: string | null
  decision: string | null
  post_analytics: {
    metric_window: string
    platform: string | null
    views: number | null
    likes: number | null
    comments: number | null
    shares: number | null
    saves: number | null
    followers: number | null
    watch_pct: number | null
  }[]
}

export type RawDashPipeline = {
  id: string
  post_id: string
  title: string
  platform: string[]
  status: string
  week: string | null
  scheduled_date: string | null
  posted_at: string | null
  priority: number
  drive_file_id: string | null
  approval_comment: string | null
  pillar: string | null
  thumbnail_url: string | null
  ig_video_id: string | null
  tt_video_id: string | null
  yt_video_id: string | null
}

export type RawUnlinkedDiscovery = {
  id: string
  client_id: string
  platform: 'ig' | 'tt' | 'yt'
  platform_video_id: string
  permalink: string | null
  title: string | null
  thumbnail_url: string | null
  published_at: string | null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  status: string
  last_seen_at: string | null
}

export type RawDashCalendar = {
  id: string
  title: string
  platform: string | null
  event_date: string
  notes: string | null
}

export type RawDashGoal = {
  metric: string
  target: number
  period: string
}

export type RawDashCampaign = {
  id: string
  name: string
  date: string
  spend: number
  roas: number
  ctr: number
  cpm: number
  impressions: number
}

type WindowKey = 'w24' | 'w3' | 'w7' | 'eom'
type MetricSet = {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  followers: number
  watch_pct: number
}
type PostStat = RawDashPost & {
  date: string
  metric: MetricSet
  er: number
  platformKey: string
}
type Suggestion = AISuggestion

const EMPTY: MetricSet = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, followers: 0, watch_pct: 0 }
const TIER_COLORS = { a: '#39ff88', b: '#4cc9ff', c: '#fbbf24', d: '#ff3b5f', f: '#ff3b5f' }
const PLATFORM_COLORS: Record<string, string> = { ig: '#c9a96e', yt: '#4cc9ff', tt: '#2dd4bf', lf: '#4cc9ff' }
const PLATFORM_LABELS: Record<'ig' | 'tt' | 'yt', string> = { ig: 'Instagram', tt: 'TikTok', yt: 'YouTube' }
const PLATFORM_LOGO_KEYS: Record<'ig' | 'tt' | 'yt', PlatformLogoKey> = { ig: 'instagram', tt: 'tiktok', yt: 'youtube' }
const DISCOVERY_PLATFORMS: Array<'ig' | 'tt' | 'yt'> = ['ig', 'tt', 'yt']
const VIDEO_ID_KEYS: Record<'ig' | 'tt' | 'yt', keyof Pick<RawDashPipeline, 'ig_video_id' | 'tt_video_id' | 'yt_video_id'>> = {
  ig: 'ig_video_id',
  tt: 'tt_video_id',
  yt: 'yt_video_id',
}
type DiscoveryPlatform = RawUnlinkedDiscovery['platform']
const STATUS_COLORS: Record<string, string> = {
  SCRIPTED: '#c9a96e',
  PLANNED: '#4cc9ff',
  FILMING: '#fbbf24',
  EDITING: '#a78bfa',
  REVIEWING: '#ff3b5f',
  PENDING_APPROVAL: '#f97316',
  APPROVED: '#4ade80',
  CHANGES_REQUESTED: '#fb923c',
  SCHEDULED: '#4cc9ff',
  POSTED: '#39ff88',
  CANCELLED: '#555',
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '-'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return Math.round(n).toLocaleString()
}

function pct(n: number): string {
  return Number.isFinite(n) && n > 0 ? n.toFixed(1) + '%' : '-'
}

function getMetric(post: RawDashPost, win: WindowKey, platform: PlatformFilter): MetricSet {
  const preferred = post.post_analytics.find(a =>
    a.metric_window === win &&
    (platform === 'lf' ? a.platform === 'yt' : platform === 'all' || !a.platform || a.platform === platform),
  ) ?? post.post_analytics.find(a => a.metric_window === win)
  if (!preferred) return { ...EMPTY }
  return {
    views: preferred.views ?? 0,
    likes: preferred.likes ?? 0,
    comments: preferred.comments ?? 0,
    shares: preferred.shares ?? 0,
    saves: preferred.saves ?? 0,
    followers: preferred.followers ?? 0,
    watch_pct: preferred.watch_pct ?? 0,
  }
}

function calcER(metric: MetricSet, platformKey: string): number {
  if (!metric.views) return 0
  const fourth = platformKey === 'yt' || platformKey === 'lf' ? metric.followers : metric.saves
  return ((metric.likes + metric.comments + metric.shares + fourth) / metric.views) * 100
}

function grade(er: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (er >= 12) return 'A'
  if (er >= 7) return 'B'
  if (er >= 4) return 'C'
  if (er >= 2) return 'D'
  return 'F'
}

function parsePostId(notes: string | null): string | null {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes) as { post_id?: string }
    return parsed.post_id ?? null
  } catch {
    const match = notes.match(/#(?:ig|yt|tt|LF)?\d{4}/i)
    return match?.[0] ?? null
  }
}

const MON_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function monWkLabel(d: Date): string {
  const mon = MON_ABBR[d.getMonth()]
  const wk  = Math.ceil(d.getDate() / 7)
  return `${mon}Wk${wk}`
}

function startOfWeek(base: Date): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function topStats(post: PostStat, averageER: number): string[] {
  const stats: string[] = []
  if (post.metric.watch_pct >= 35) stats.push('High watch rate')
  if (post.metric.shares >= 20) stats.push('Above avg shares')
  if (post.er >= 12) stats.push('Elite ER')
  if (post.er >= averageER) stats.push('Above avg ER')
  if (post.metric.followers > 0) stats.push('Follower gain')
  return stats.slice(0, 3)
}

function displayDate(value: string | null): string {
  if (!value) return 'No publish date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function pipelineMatches(item: RawDashPipeline, query: string): boolean {
  const haystack = [
    item.title,
    item.post_id,
    item.platform?.join(' '),
    item.posted_at,
    item.scheduled_date,
    item.pillar,
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(query)
}

function discoveryMatchesQuery(item: RawUnlinkedDiscovery, query: string): boolean {
  const haystack = [
    item.title,
    item.platform,
    PLATFORM_LABELS[item.platform],
    item.platform_video_id,
    item.published_at,
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(query)
}

function linkedVideoEntries(item: RawDashPipeline): { platform: 'ig' | 'tt' | 'yt'; videoId: string }[] {
  return (['ig', 'tt', 'yt'] as const)
    .map(platform => ({ platform, videoId: item[VIDEO_ID_KEYS[platform]] }))
    .filter((entry): entry is { platform: 'ig' | 'tt' | 'yt'; videoId: string } => Boolean(entry.videoId))
}

function dateMs(value: string | null): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

function titleOverlapScore(a: string | null, b: string | null): number {
  const wordsA = new Set((a ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const wordsB = new Set((b ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [])
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  for (const word of wordsA) {
    if (word.length > 2 && wordsB.has(word)) overlap++
  }
  return overlap / Math.max(wordsA.size, wordsB.size)
}

function duplicatePlatformIn(discoveries: RawUnlinkedDiscovery[]): DiscoveryPlatform | null {
  const seen = new Set<DiscoveryPlatform>()
  for (const discovery of discoveries) {
    if (seen.has(discovery.platform)) return discovery.platform
    seen.add(discovery.platform)
  }
  return null
}

function fallbackSuggestions(posts: PostStat[], mode: string): Suggestion[] {
  const sorted = [...posts].sort((a, b) => b.er - a.er)
  const top = sorted[0]
  const bottom = sorted[sorted.length - 1]
  const avgER = posts.length ? posts.reduce((s, p) => s + p.er, 0) / posts.length : 0
  const pillarMap = new Map<string, { er: number; count: number }>()
  for (const p of posts) {
    const key = p.pillar ?? 'Other'
    const cur = pillarMap.get(key) ?? { er: 0, count: 0 }
    pillarMap.set(key, { er: cur.er + p.er, count: cur.count + 1 })
  }
  const bestPillar = [...pillarMap.entries()]
    .map(([pillar, v]) => ({ pillar, avg: v.er / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg)[0]

  if (!top) {
    return [{ icon: 'spark', headline: 'Import more data', body: 'No posts match this filter, so suggestions need fresh analytics first.', trigger: '0 matching posts' }]
  }

  return [
    {
      icon: 'trend',
      headline: `Repeat ${top.pillar ?? 'the top pillar'}`,
      body: `${top.title} is leading at ${top.er.toFixed(1)}% ER with ${fmt(top.metric.views)} reach.`,
      trigger: `${top.post_id} is ${Math.max(0, top.er - avgER).toFixed(1)} pts above avg`,
    },
    {
      icon: 'hook',
      headline: `Use more ${top.hook ?? 'proven'} hooks`,
      body: `${top.hook ?? 'The winning hook'} is attached to the strongest post in this view.`,
      trigger: `${top.post_id} hook type: ${top.hook ?? 'unknown'}`,
    },
    {
      icon: 'pillar',
      headline: `Push ${bestPillar?.pillar ?? 'the best pillar'}`,
      body: `${bestPillar?.pillar ?? 'Top pillar'} averages ${(bestPillar?.avg ?? 0).toFixed(1)}% ER across ${bestPillar?.count ?? 0} posts.`,
      trigger: `Filtered avg is ${avgER.toFixed(1)}% ER`,
    },
    {
      icon: 'repair',
      headline: `Rewrite the weakest angle`,
      body: `${bottom?.title ?? top.title} is dragging the set at ${(bottom?.er ?? top.er).toFixed(1)}% ER.`,
      trigger: `${bottom?.post_id ?? top.post_id} is the low performer`,
    },
    ...(mode === 'projection' ? [{
      icon: 'pace',
      headline: 'Protect cadence',
      body: `The last 10-post average is the basis for this projection; avoid changing multiple variables at once.`,
      trigger: `${Math.min(10, posts.length)} posts in projection sample`,
    }] : []),
  ].slice(0, mode === 'projection' ? 5 : 4)
}

function CardShell({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={{
        width: '100%',
        textAlign: 'left',
        background: '#0a0a0a',
        border: '1px solid #171717',
        borderRadius: 6,
        padding: 24,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform .15s ease, border-color .15s ease, background .15s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = onClick ? 'translateY(-2px)' : 'none'
        e.currentTarget.style.borderColor = '#242424'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = '#171717'
      }}
    >
      {children}
    </button>
  )
}

function SparkIcon({ color = '#c9a96e' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5L9.6 6.4L14.5 8L9.6 9.6L8 14.5L6.4 9.6L1.5 8L6.4 6.4L8 1.5Z" stroke={color} strokeWidth="1.2" />
    </svg>
  )
}

function ArrowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 4,
        border: '1px solid #1f1f1f',
        background: '#0d0d0d',
        color: '#c9a96e',
        cursor: 'pointer',
        transition: 'all .15s ease',
      }}
    >
      {label === 'Previous week' ? '<' : '>'}
    </button>
  )
}

export function DashboardClient({
  rawPosts,
  rawPipeline,
  rawCalendar,
  rawGoals,
  rawCampaigns = [],
  rawUnlinkedDiscoveries = [],
  isAdmin = false,
  clientName,
}: {
  rawPosts: RawDashPost[]
  rawPipeline: RawDashPipeline[]
  rawCalendar: RawDashCalendar[]
  rawGoals: RawDashGoal[]
  rawCampaigns?: RawDashCampaign[]
  rawUnlinkedDiscoveries?: RawUnlinkedDiscovery[]
  isAdmin?: boolean
  clientName: string
}) {
  const router = useRouter()
  const { platform, win, scope, from, to, setFilters } = usePortalFilters()
  const activeWin = win as WindowKey
  const [kpiModes, setKpiModes] = useState({ followers: 0, reach: 0, er: 0 })
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiModalTitle, setAiModalTitle] = useState('Content Performance')
  const [loadingAi, setLoadingAi] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [approvalItemId, setApprovalItemId] = useState<string | null>(null)
  const [discoveries, setDiscoveries] = useState<RawUnlinkedDiscovery[]>(rawUnlinkedDiscoveries)
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState<string | null>(null)
  const [discoverySearch, setDiscoverySearch] = useState('')
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [selectedRelatedDiscoveryIds, setSelectedRelatedDiscoveryIds] = useState<Set<string>>(new Set())
  const [relatedDiscoverySearch, setRelatedDiscoverySearch] = useState('')
  const [discoveryWindowDays, setDiscoveryWindowDays] = useState<1 | 7>(1)
  const [bundleTitle, setBundleTitle] = useState('')
  const [bundleStep, setBundleStep] = useState<'review' | 'title' | 'postCreate'>('review')
  const [bundleError, setBundleError] = useState<string | null>(null)
  const [createdBundlePipelineItemId, setCreatedBundlePipelineItemId] = useState<string | null>(null)
  const [createdBundlePlatforms, setCreatedBundlePlatforms] = useState<DiscoveryPlatform[]>([])
  const [missingPlatformInputs, setMissingPlatformInputs] = useState<Record<DiscoveryPlatform, string>>({ ig: '', tt: '', yt: '' })
  const [missingPlatformSearches, setMissingPlatformSearches] = useState<Record<DiscoveryPlatform, string>>({ ig: '', tt: '', yt: '' })
  const [missingLinkErrors, setMissingLinkErrors] = useState<Record<DiscoveryPlatform, string | null>>({ ig: null, tt: null, yt: null })
  const [missingLinkBusy, setMissingLinkBusy] = useState<DiscoveryPlatform | null>(null)
  const [discoBusy, setDiscoBusy] = useState<null | 'link' | 'create' | 'bundle' | 'ignore'>(null)
  const { toast } = useToast()

  useEffect(() => {
    setDiscoveries(rawUnlinkedDiscoveries)
  }, [rawUnlinkedDiscoveries])

  const pendingApprovals = useMemo(
    () => rawPipeline.filter(i => i.status === 'PENDING_APPROVAL'),
    [rawPipeline],
  )

  const selectedDiscovery = useMemo(
    () => discoveries.find(item => item.id === selectedDiscoveryId) ?? null,
    [discoveries, selectedDiscoveryId],
  )

  const selectedPipelineItem = useMemo(
    () => rawPipeline.find(item => item.id === selectedPipelineId) ?? null,
    [rawPipeline, selectedPipelineId],
  )

  const selectedPipelineConflict = useMemo(() => {
    if (!selectedDiscovery || !selectedPipelineItem) return null
    const existingVideoId = selectedPipelineItem[VIDEO_ID_KEYS[selectedDiscovery.platform]]
    if (!existingVideoId || existingVideoId === selectedDiscovery.platform_video_id) return null
    return {
      platform: selectedDiscovery.platform,
      existingVideoId,
      discoveryVideoId: selectedDiscovery.platform_video_id,
    }
  }, [selectedDiscovery, selectedPipelineItem])

  const selectedRelatedDiscoveries = useMemo(
    () => discoveries.filter(item => selectedRelatedDiscoveryIds.has(item.id)),
    [discoveries, selectedRelatedDiscoveryIds],
  )

  const selectedBundleDiscoveries = useMemo(
    () => selectedDiscovery ? [selectedDiscovery, ...selectedRelatedDiscoveries] : [],
    [selectedDiscovery, selectedRelatedDiscoveries],
  )

  const bundleDuplicatePlatform = useMemo(
    () => duplicatePlatformIn(selectedBundleDiscoveries),
    [selectedBundleDiscoveries],
  )

  const bundleValidationError = useMemo(() => {
    if (selectedBundleDiscoveries.length < 2) return 'Select at least one related discovery to create a bundle.'
    if (bundleDuplicatePlatform) return `Only one ${PLATFORM_LABELS[bundleDuplicatePlatform]} discovery can be bundled at a time.`
    return null
  }, [bundleDuplicatePlatform, selectedBundleDiscoveries.length])

  const relatedDiscoveries = useMemo(() => {
    if (!selectedDiscovery) return []
    const selectedTime = dateMs(selectedDiscovery.published_at)
    if (selectedTime == null) return []
    const windowMs = discoveryWindowDays * 24 * 60 * 60 * 1000
    return discoveries
      .filter(item => {
        if (item.id === selectedDiscovery.id) return false
        if (item.client_id !== selectedDiscovery.client_id) return false
        if (item.status !== 'unlinked') return false
        if (item.platform === selectedDiscovery.platform) return false
        const itemTime = dateMs(item.published_at)
        return itemTime != null && Math.abs(itemTime - selectedTime) <= windowMs
      })
      .map(item => {
        const itemTime = dateMs(item.published_at) ?? selectedTime
        return {
          item,
          distance: Math.abs(itemTime - selectedTime),
          overlap: titleOverlapScore(selectedDiscovery.title, item.title),
        }
      })
      .sort((a, b) => a.distance - b.distance || b.overlap - a.overlap)
      .slice(0, 6)
      .map(entry => entry.item)
  }, [discoveries, discoveryWindowDays, selectedDiscovery])

  const manualDiscoveryMatches = useMemo(() => {
    if (!selectedDiscovery) return []
    const query = relatedDiscoverySearch.trim().toLowerCase()
    if (!query) return []
    const selectedTime = dateMs(selectedDiscovery.published_at)
    if (selectedTime == null) return []
    const windowMs = discoveryWindowDays * 24 * 60 * 60 * 1000
    const autoSuggestionIds = new Set(relatedDiscoveries.map(item => item.id))
    return discoveries
      .filter(item => {
        if (item.id === selectedDiscovery.id) return false
        if (autoSuggestionIds.has(item.id)) return false
        if (item.client_id !== selectedDiscovery.client_id) return false
        if (item.status !== 'unlinked') return false
        const itemTime = dateMs(item.published_at)
        if (itemTime == null || Math.abs(itemTime - selectedTime) > windowMs) return false
        return discoveryMatchesQuery(item, query)
      })
      .map(item => {
        const itemTime = dateMs(item.published_at) ?? selectedTime
        return {
          item,
          distance: Math.abs(itemTime - selectedTime),
          overlap: titleOverlapScore(selectedDiscovery.title, item.title),
        }
      })
      .sort((a, b) => a.distance - b.distance || b.overlap - a.overlap)
      .slice(0, 10)
      .map(entry => entry.item)
  }, [discoveries, discoveryWindowDays, relatedDiscoveries, relatedDiscoverySearch, selectedDiscovery])

  const createdBundleMissingPlatforms = useMemo(
    () => DISCOVERY_PLATFORMS.filter(item => !createdBundlePlatforms.includes(item)),
    [createdBundlePlatforms],
  )

  const missingDiscoveryMatches = useMemo(() => {
    const entries = DISCOVERY_PLATFORMS.map(platform => {
      const query = missingPlatformSearches[platform].trim().toLowerCase()
      if (!query) return [platform, []] as const
      const matches = discoveries
        .filter(item => (
          item.platform === platform &&
          item.status === 'unlinked' &&
          discoveryMatchesQuery(item, query)
        ))
        .sort((a, b) => {
          const aTime = dateMs(a.published_at) ?? 0
          const bTime = dateMs(b.published_at) ?? 0
          return bTime - aTime
        })
        .slice(0, 6)
      return [platform, matches] as const
    })
    return Object.fromEntries(entries) as Record<DiscoveryPlatform, RawUnlinkedDiscovery[]>
  }, [discoveries, missingPlatformSearches])

  const discoveryMatches = useMemo(() => {
    if (!selectedDiscovery) return []
    const query = discoverySearch.trim().toLowerCase()
    const samePlatform = rawPipeline.filter(item => {
      if (selectedDiscovery.platform === 'yt') return item.platform.includes('yt') || item.platform.includes('lf')
      return item.platform.includes(selectedDiscovery.platform)
    })
    const source = query ? rawPipeline.filter(item => pipelineMatches(item, query)) : samePlatform
    return source.slice(0, 8)
  }, [rawPipeline, selectedDiscovery, discoverySearch])

  function closeDiscoveryModal() {
    setSelectedDiscoveryId(null)
    setDiscoverySearch('')
    setSelectedPipelineId(null)
    setSelectedRelatedDiscoveryIds(new Set())
    setRelatedDiscoverySearch('')
    setDiscoveryWindowDays(1)
    setBundleTitle('')
    setBundleStep('review')
    setBundleError(null)
    setCreatedBundlePipelineItemId(null)
    setCreatedBundlePlatforms([])
    setMissingPlatformInputs({ ig: '', tt: '', yt: '' })
    setMissingPlatformSearches({ ig: '', tt: '', yt: '' })
    setMissingLinkErrors({ ig: null, tt: null, yt: null })
    setMissingLinkBusy(null)
    setDiscoBusy(null)
  }

  function toggleRelatedDiscovery(id: string) {
    setBundleError(null)
    setBundleStep('review')
    setSelectedRelatedDiscoveryIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startBundleTitleStep() {
    if (!selectedDiscovery) return
    if (bundleValidationError) {
      setBundleError(bundleValidationError)
      return
    }
    setBundleTitle((selectedDiscovery.title ?? `${PLATFORM_LABELS[selectedDiscovery.platform]} ${selectedDiscovery.platform_video_id}`).trim())
    setBundleError(null)
    setBundleStep('title')
  }

  async function handleLinkDiscovery() {
    if (!selectedDiscovery || !selectedPipelineId) return
    if (selectedPipelineConflict) return
    setDiscoBusy('link')
    const result = await linkUnlinkedDiscovery(selectedDiscovery.id, selectedPipelineId)
    setDiscoBusy(null)
    if (result.error) {
      toast(result.error, 'error')
      return
    }
    setDiscoveries(prev => prev.filter(item => item.id !== selectedDiscovery.id))
    toast('Video linked and syncing now', 'success')
    closeDiscoveryModal()
    router.refresh()
  }

  async function handleCreateFromDiscovery() {
    if (!selectedDiscovery) return
    setDiscoBusy('create')
    const result = await createPipelineItemFromDiscovery(selectedDiscovery.id)
    setDiscoBusy(null)
    if (result.error) {
      toast(result.error, 'error')
      return
    }
    setDiscoveries(prev => prev.filter(item => item.id !== selectedDiscovery.id))
    toast('Pipeline item created and syncing now', 'success')
    closeDiscoveryModal()
    router.refresh()
  }

  async function handleCreateBundle() {
    if (!selectedDiscovery) return
    const title = bundleTitle.trim()
    if (!title) {
      setBundleError('Hero title is required.')
      return
    }
    if (bundleValidationError) {
      setBundleError(bundleValidationError)
      return
    }
    const ids = selectedBundleDiscoveries.map(item => item.id)
    const platforms = Array.from(new Set(selectedBundleDiscoveries.map(item => item.platform)))
    setDiscoBusy('bundle')
    const result = await createPipelineItemFromDiscoveryBundle(ids, title)
    setDiscoBusy(null)
    if (result.error && !result.id) {
      setBundleError(result.error)
      toast(result.error, 'error')
      return
    }
    setDiscoveries(prev => prev.filter(item => item.id === selectedDiscovery.id || !ids.includes(item.id)))
    setCreatedBundlePipelineItemId(result.id ?? null)
    setCreatedBundlePlatforms(platforms)
    setSelectedRelatedDiscoveryIds(new Set())
    setRelatedDiscoverySearch('')
    setMissingPlatformInputs({ ig: '', tt: '', yt: '' })
    setMissingPlatformSearches({ ig: '', tt: '', yt: '' })
    setMissingLinkErrors({ ig: null, tt: null, yt: null })
    setBundleStep('postCreate')
    if (result.syncErrors && result.syncErrors.length > 0) {
      toast(result.error ?? 'Bundle created, but one or more sync steps failed', 'error')
    } else {
      toast('Bundle created and syncing now', 'success')
    }
    router.refresh()
  }

  async function handleLinkMissingPlatform(platformKey: DiscoveryPlatform, source: string) {
    if (!createdBundlePipelineItemId) return
    const value = source.trim()
    if (!value) {
      setMissingLinkErrors(prev => ({ ...prev, [platformKey]: 'Paste a URL/ID or pick a discovery first.' }))
      return
    }

    setMissingLinkBusy(platformKey)
    setMissingLinkErrors(prev => ({ ...prev, [platformKey]: null }))
    const result = await linkMissingPlatformToPipelineItem(createdBundlePipelineItemId, platformKey, value)
    setMissingLinkBusy(null)

    if (result.error && !result.id) {
      setMissingLinkErrors(prev => ({ ...prev, [platformKey]: result.error ?? 'Link failed' }))
      toast(result.error ?? 'Link failed', 'error')
      return
    }

    setCreatedBundlePlatforms(prev => Array.from(new Set([...prev, platformKey])))
    setDiscoveries(prev => prev.filter(item => item.id !== value))
    setMissingPlatformInputs(prev => ({ ...prev, [platformKey]: '' }))
    setMissingPlatformSearches(prev => ({ ...prev, [platformKey]: '' }))

    if (result.syncErrors && result.syncErrors.length > 0) {
      setMissingLinkErrors(prev => ({ ...prev, [platformKey]: result.error ?? 'Linked, but sync failed.' }))
      toast(result.error ?? 'Linked, but sync failed', 'error')
    } else {
      toast(`${PLATFORM_LABELS[platformKey]} linked and syncing now`, 'success')
    }
    router.refresh()
  }

  async function handleIgnoreDiscovery() {
    if (!selectedDiscovery) return
    setDiscoBusy('ignore')
    const result = await ignoreUnlinkedDiscovery(selectedDiscovery.id)
    setDiscoBusy(null)
    if (result.error) {
      toast(result.error, 'error')
      return
    }
    setDiscoveries(prev => prev.filter(item => item.id !== selectedDiscovery.id))
    toast('Discovery ignored', 'success')
    closeDiscoveryModal()
  }

  async function handleApproval(itemId: string, action: 'approve' | 'request_changes') {
    const { error } = await submitApproval(itemId, action, action === 'request_changes' ? approvalComment : undefined)
    if (error) {
      toast(error, 'error')
    } else {
      toast(action === 'approve' ? 'Content approved!' : 'Changes requested', 'success')
      setApprovalItemId(null)
      setApprovalComment('')
      router.refresh()
    }
  }

  const datedPosts = useMemo(
    () => rawPosts.filter((p): p is RawDashPost & { date: string } => Boolean(p.date)),
    [rawPosts],
  )

  const scopedPosts = useMemo(() => {
    const platformPosts = filterByPlatform(datedPosts, platform, p => p.format)
    return filterByScope(platformPosts, scope, from, to)
  }, [datedPosts, platform, scope, from, to])

  const allPlatformPosts = useMemo(
    () => filterByPlatform(datedPosts, platform, p => p.format),
    [datedPosts, platform],
  )

  const posts = useMemo<PostStat[]>(() => scopedPosts.map(post => {
    const platformKey = platform === 'lf' ? 'lf' : post.platform[0] ?? platform
    const metric = getMetric(post, activeWin, platform)
    return { ...post, metric, er: calcER(metric, platformKey), platformKey }
  }), [scopedPosts, activeWin, platform])

  const allStats = useMemo<PostStat[]>(() => allPlatformPosts.map(post => {
    const platformKey = platform === 'lf' ? 'lf' : post.platform[0] ?? platform
    const metric = getMetric(post, activeWin, platform)
    return { ...post, metric, er: calcER(metric, platformKey), platformKey }
  }), [allPlatformPosts, activeWin, platform])

  const avgER = posts.length ? posts.reduce((s, p) => s + p.er, 0) / posts.length : 0
  const postById = useMemo(() => new Map(allStats.map(p => [p.post_id, p])), [allStats])

  const kpis = useMemo(() => {
    const totalReach = posts.reduce((s, p) => s + p.metric.views, 0)
    const gained = posts.reduce((s, p) => s + p.metric.followers, 0)
    const currentFollowers = allStats.reduce((s, p) => s + p.metric.followers, 0)
    const withViews = posts.filter(p => p.metric.views > 0)
    const watch = withViews.length ? withViews.reduce((s, p) => s + p.metric.watch_pct, 0) / withViews.length : 0
    const er = withViews.length ? withViews.reduce((s, p) => s + p.er, 0) / withViews.length : 0
    const top = withViews.slice().sort((a, b) => b.er - a.er)[0]
    const conversion = totalReach ? (gained / totalReach) * 100 : 0
    return { totalReach, gained, currentFollowers, watch, er, top, conversion, posts: posts.length }
  }, [posts, allStats])

  const last10 = useMemo(() => allStats.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10), [allStats])
  const projections = useMemo(() => {
    const spanDays = last10.length > 1
      ? Math.max(7, (new Date(last10[0].date).getTime() - new Date(last10[last10.length - 1].date).getTime()) / 86400000)
      : 30
    const postsPer30 = last10.length ? Math.max(1, (last10.length / spanDays) * 30) : 0
    const avgFollowers = last10.length ? last10.reduce((s, p) => s + p.metric.followers, 0) / last10.length : 0
    const avgReach = last10.length ? last10.reduce((s, p) => s + p.metric.views, 0) / last10.length : 0
    const avgProjectionER = last10.length ? last10.reduce((s, p) => s + p.er, 0) / last10.length : 0
    return {
      followers: Math.round(avgFollowers * postsPer30),
      reach: Math.round(avgReach * postsPer30),
      er: avgProjectionER,
      sample: last10.length,
    }
  }, [last10])

  const filteredPipeline = useMemo(() => {
    let out = rawPipeline
    if (platform === 'lf') out = out.filter(i => i.platform.includes('yt'))
    else out = filterByPlatform(out, platform)
    return out
      .filter(i => {
        const date = i.posted_at?.split('T')[0] ?? i.scheduled_date ?? ''
        if (scope === 'all') return true
        return filterByScope([{ ...i, date }], scope, from, to).length > 0
      })
      .sort((a, b) => {
        const ad = a.posted_at ?? a.scheduled_date ?? ''
        const bd = b.posted_at ?? b.scheduled_date ?? ''
        return bd.localeCompare(ad)
      })
  }, [rawPipeline, platform, scope, from, to])

  const currentWeekLabel = useMemo(() => monWkLabel(new Date()), [])

  const thisWeekItems = useMemo(() => {
    return rawPipeline
      .filter(i => i.week === currentWeekLabel)
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  }, [rawPipeline, currentWeekLabel])

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  }), [weekStart])

  const weekEvents = useMemo(() => {
    const fromDay = isoDate(weekDays[0])
    const toDay = isoDate(weekDays[6])
    return rawCalendar
      .filter(e => e.event_date >= fromDay && e.event_date <= toDay)
      .filter(e => {
        if (platform === 'all') return true
        if (platform === 'lf') return e.platform === 'yt'
        return e.platform === platform
      })
      .map(e => ({ ...e, postId: parsePostId(e.notes) }))
  }, [rawCalendar, weekDays, platform])

  const goalsSummary = useMemo(() => rawGoals.map(g => `${g.period} ${g.metric}: ${g.target}`).join(', '), [rawGoals])

  async function loadSuggestions(mode: 'monthly' | 'projection', projectionMetric?: string) {
    const contextPosts = (mode === 'projection' ? last10 : posts).slice(0, 20).map(p => ({
      id: p.post_id,
      title: p.title,
      platform: p.platformKey,
      pillar: p.pillar,
      hook: p.hook,
      reach: p.metric.views,
      followers: p.metric.followers,
      watch: p.metric.watch_pct,
      er: +p.er.toFixed(2),
      decision: p.decision,
    }))
    setLoadingAi(true)
    try {
      const res = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          platform,
          scope,
          projectionMetric,
          goalsSummary,
          posts: contextPosts,
        }),
      })
      const json = await res.json() as { suggestions?: Suggestion[] }
      const next = json.suggestions?.length ? json.suggestions : fallbackSuggestions(mode === 'projection' ? last10 : posts, mode)
      setSuggestions(next.slice(0, 4))
    } catch {
      const next = fallbackSuggestions(mode === 'projection' ? last10 : posts, mode)
      setSuggestions(next.slice(0, 4))
    } finally {
      setLoadingAi(false)
    }
  }

  useEffect(() => {
    void loadSuggestions('monthly')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, scope, from, to, win, rawPosts.length])

  function openProjection(metric: string, label: string) {
    setAiModalTitle(`${label} — Projection Analysis`)
    setAiModalOpen(true)
    void loadSuggestions('projection', metric)
  }

  const selectedPost = selectedPostId ? postById.get(selectedPostId) ?? null : null

  function renderDiscoveryToggleCard(item: RawUnlinkedDiscovery) {
    const color = PLATFORM_COLORS[item.platform] ?? '#c9a96e'
    const selected = selectedRelatedDiscoveryIds.has(item.id)
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggleRelatedDiscovery(item.id)}
        style={{
          display: 'grid',
          gridTemplateColumns: '34px minmax(0,1fr) auto',
          gap: 10,
          alignItems: 'center',
          textAlign: 'left',
          background: selected ? 'rgba(201,169,110,.10)' : '#0d0d0d',
          border: `1px solid ${selected ? 'rgba(201,169,110,.55)' : `${color}33`}`,
          borderRadius: 5,
          padding: 9,
          cursor: 'pointer',
        }}
      >
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, border: '1px solid #1e1e1e' }} />
        ) : (
          <PlatformMark platform={PLATFORM_LOGO_KEYS[item.platform]} color={color} size={34} />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <PlatformMark platform={PLATFORM_LOGO_KEYS[item.platform]} color={color} size={22} />
            <span className="text-[8px] font-medium tracking-[.14em] uppercase" style={{ color }}>{PLATFORM_LABELS[item.platform]}</span>
            <span className="text-[9px]" style={{ color: '#555', fontFamily: 'monospace' }}>{item.platform_video_id}</span>
          </div>
          <p className="text-[11px] mt-1 overflow-hidden" style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {item.title ?? `${PLATFORM_LABELS[item.platform]} video`}
          </p>
        </div>
        <span className="text-[9px]" style={{ color: selected ? '#c9a96e' : '#666' }}>{selected ? 'Selected' : displayDate(item.published_at)}</span>
      </button>
    )
  }

  if (rawPosts.length === 0 && !(isAdmin && discoveries.length > 0)) {
    return (
      <div className="p-10">
        <EmptyState
          icon="chart"
          headline="No data yet."
          body="Your content manager will import your videos here — check back soon."
        />
      </div>
    )
  }

  return (
    <div className="p-10 max-w-[1320px]">
      <OnboardingBanner postCount={rawPosts.length} />
      <div className="mb-8" style={{ borderBottom: '1px solid #141414', paddingBottom: 28 }}>
        <p className="text-[9px] font-medium tracking-[.26em] uppercase mb-2 flex items-center gap-3" style={{ color: '#c9a96e' }}>
          <span style={{ display: 'block', width: 20, height: 1, background: '#c9a96e' }} />
          Overview
        </p>
        <h1 className="font-jakarta font-light" style={{ fontSize: 'clamp(28px,3vw,44px)', color: '#f2ede4', lineHeight: 1.06 }}>
          Dashboard
        </h1>
        <p className="text-[12px] font-light mt-1" style={{ color: '#666' }}>Welcome back, {clientName}.</p>
      </div>

      <div className="mb-8 flex items-center gap-3 flex-wrap" style={{ minHeight: 52, borderBottom: '1px solid #141414', paddingBottom: 18 }}>
        <PlatformPills platform={platform} onChange={p => setFilters({ platform: p })} />
        <div style={{ width: 1, height: 22, background: '#1a1a1a' }} />
        <ScopeDropdown scope={scope} onChange={s => setFilters({ scope: s })} />
      </div>

      {thisWeekItems.length > 0 && (
        <section className="mb-8">
          <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
            <span style={{ width: 16, height: 1, background: '#c9a96e' }} />
            This Week — {currentWeekLabel}
          </p>
          <div className="flex gap-3 flex-wrap">
            {thisWeekItems.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/pipeline?phase=${encodeURIComponent(item.status)}&item=${encodeURIComponent(item.id)}&platform=${platform}&scope=${scope}`)}
                style={{
                  background: '#0a0a0a',
                  border: `1px solid ${(STATUS_COLORS[item.status] ?? '#555')}44`,
                  borderLeft: `3px solid ${STATUS_COLORS[item.status] ?? '#555'}`,
                  borderRadius: 5,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  minWidth: 200,
                  maxWidth: 260,
                  transition: 'border-color .15s ease, background .15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#0d0d0d' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0a0a0a' }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[8px] font-medium tracking-[.1em] uppercase"
                        style={{ color: STATUS_COLORS[item.status] ?? '#555', background: `${STATUS_COLORS[item.status] ?? '#555'}18`, border: `1px solid ${STATUS_COLORS[item.status] ?? '#555'}44`, padding: '1px 6px' }}>
                    {item.status}
                  </span>
                  <span className="text-[9px] font-light" style={{ color: '#555' }}>#{idx + 1}</span>
                </div>
                <p className="text-[12px] font-light overflow-hidden" style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 228 }}>{item.title}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {item.platform.slice(0, 2).map(pl => (
                    <span key={pl} className="text-[8px] tracking-[.08em] uppercase" style={{ color: PLATFORM_COLORS[pl] ?? '#555' }}>{pl}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {pendingApprovals.length > 0 && (
        <section className="mb-8">
          <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#f97316' }}>
            <span style={{ width: 16, height: 1, background: '#f97316' }} />
            Pending Approval ({pendingApprovals.length})
          </p>
          <div className="flex flex-col gap-3">
            {pendingApprovals.map(item => (
              <div key={item.id} style={{
                background: '#0a0a0a',
                border: '1px solid rgba(249,115,22,.25)',
                borderLeft: '3px solid #f97316',
                borderRadius: 5,
                padding: '16px 20px',
              }}>
                <div className="flex items-start justify-between gap-4">
                  <div style={{ flex: 1 }}>
                    <p className="text-[13px] font-light" style={{ color: '#f2ede4' }}>{item.title}</p>
                    <div className="flex items-center gap-3 mt-2" style={{ fontSize: 9, color: '#555' }}>
                      {item.platform?.slice(0, 2).map(pl => (
                        <span key={pl} className="tracking-[.08em] uppercase" style={{ color: PLATFORM_COLORS[pl] ?? '#555' }}>{pl}</span>
                      ))}
                      {item.pillar && <span>{item.pillar}</span>}
                      {item.scheduled_date && <span>Planned: {item.scheduled_date}</span>}
                    </div>
                    {item.drive_file_id && (
                      <a
                        href={`https://drive.google.com/file/d/${item.drive_file_id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] mt-2 inline-flex items-center gap-1"
                        style={{ color: '#4cc9ff' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M10 2h4v4M7 9l7-7"/></svg>
                        View in Google Drive
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApproval(item.id, 'approve')}
                      style={{
                        padding: '5px 12px', fontSize: 9, fontWeight: 500,
                        letterSpacing: '.1em', textTransform: 'uppercase',
                        color: '#060606', background: '#4ade80',
                        border: 'none', borderRadius: 3,
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setApprovalItemId(approvalItemId === item.id ? null : item.id)}
                      style={{
                        padding: '5px 12px', fontSize: 9, fontWeight: 500,
                        letterSpacing: '.1em', textTransform: 'uppercase',
                        color: '#fb923c', background: 'rgba(251,146,60,.1)',
                        border: '1px solid rgba(251,146,60,.3)', borderRadius: 3,
                      }}
                    >
                      Request Changes
                    </button>
                  </div>
                </div>
                {approvalItemId === item.id && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="Add a comment..."
                      value={approvalComment}
                      onChange={e => setApprovalComment(e.target.value)}
                      style={{
                        flex: 1, background: '#111', border: '1px solid #1e1e1e',
                        borderRadius: 3, padding: '6px 10px', fontSize: 11,
                        color: '#f2ede4',
                      }}
                    />
                    <button
                      onClick={() => handleApproval(item.id, 'request_changes')}
                      style={{
                        padding: '6px 14px', fontSize: 9, fontWeight: 500,
                        color: '#fb923c', background: 'rgba(251,146,60,.1)',
                        border: '1px solid rgba(251,146,60,.3)', borderRadius: 3,
                      }}
                    >
                      Submit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {isAdmin && discoveries.length > 0 && (
        <section className="mb-8">
          <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
            <span style={{ width: 16, height: 1, background: '#c9a96e' }} />
            Unlinked Videos ({discoveries.length})
          </p>
          <div className="flex flex-col gap-3">
            {discoveries.slice(0, 6).map(item => {
              const color = PLATFORM_COLORS[item.platform] ?? '#c9a96e'
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedDiscoveryId(item.id)
                    setDiscoverySearch('')
                    setSelectedPipelineId(null)
                    setSelectedRelatedDiscoveryIds(new Set())
                    setRelatedDiscoverySearch('')
                    setDiscoveryWindowDays(1)
                    setBundleTitle('')
                    setBundleStep('review')
                    setBundleError(null)
                    setCreatedBundlePipelineItemId(null)
                    setCreatedBundlePlatforms([])
                    setMissingPlatformInputs({ ig: '', tt: '', yt: '' })
                    setMissingPlatformSearches({ ig: '', tt: '', yt: '' })
                    setMissingLinkErrors({ ig: null, tt: null, yt: null })
                    setMissingLinkBusy(null)
                  }}
                  style={{
                    background: '#0a0a0a',
                    border: `1px solid ${color}33`,
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 5,
                    padding: '14px 18px',
                    display: 'grid',
                    gridTemplateColumns: '44px minmax(0,1fr) auto',
                    gap: 14,
                    alignItems: 'center',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 5, border: '1px solid #1e1e1e' }} />
                  ) : (
                    <PlatformMark platform={PLATFORM_LOGO_KEYS[item.platform]} color={color} size={44} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2 mb-1">
                      <PlatformMark platform={PLATFORM_LOGO_KEYS[item.platform]} color={color} size={24} />
                      <span className="text-[8px] font-medium tracking-[.14em] uppercase" style={{ color }}>{PLATFORM_LABELS[item.platform]}</span>
                      <span className="text-[9px]" style={{ color: '#555', fontFamily: 'monospace' }}>{item.platform_video_id}</span>
                    </div>
                    <p className="text-[13px] font-light overflow-hidden" style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {item.title ?? `${PLATFORM_LABELS[item.platform]} video`}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: '#666' }}>{displayDate(item.published_at)}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-[10px]" style={{ color: '#555' }}>
                    <span>{fmt(item.views ?? 0)} views</span>
                    <span>{fmt(item.likes ?? 0)} likes</span>
                    <span>{fmt(item.comments ?? 0)} comments</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="grid gap-6 mb-8 dashboard-kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <CardShell onClick={() => setKpiModes(m => ({ ...m, followers: m.followers ? 0 : 1 }))}>
          <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>{kpiModes.followers ? 'Conversion Rate' : 'Followers'}</p>
          <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(30px,3vw,48px)', lineHeight: 1 }}>
            {kpiModes.followers ? pct(kpis.conversion) : fmt(kpis.currentFollowers)}
          </p>
          <p className="text-[10px] mt-3" style={{ color: kpis.gained >= 0 ? '#39ff88' : '#ff3b5f' }}>
            {kpis.gained >= 0 ? '+' : ''}{fmt(kpis.gained)} this period
          </p>
        </CardShell>
        <CardShell onClick={() => setKpiModes(m => ({ ...m, reach: m.reach ? 0 : 1 }))}>
          <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>{kpiModes.reach ? 'Avg Watch %' : 'Total Reach'}</p>
          <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(30px,3vw,48px)', lineHeight: 1 }}>
            {kpiModes.reach ? pct(kpis.watch) : fmt(kpis.totalReach)}
          </p>
          <p className="text-[10px] mt-3" style={{ color: '#666' }}>{activeWin.toUpperCase()} window</p>
        </CardShell>
        <CardShell onClick={() => setKpiModes(m => ({ ...m, er: m.er ? 0 : 1 }))}>
          <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>{kpiModes.er ? 'Top Video' : 'Avg ER %'}</p>
          <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: kpiModes.er ? 'clamp(18px,1.6vw,25px)' : 'clamp(30px,3vw,48px)', lineHeight: 1.1 }}>
            {kpiModes.er ? (kpis.top?.title ?? '-') : pct(kpis.er)}
          </p>
          <p className="text-[10px] mt-3" style={{ color: '#666' }}>{kpiModes.er ? `${pct(kpis.top?.er ?? 0)} ER` : `${posts.length} posts in view`}</p>
        </CardShell>
        <CardShell>
          <p className="text-[8px] font-medium tracking-[.2em] uppercase mb-4" style={{ color: '#555' }}>Posts</p>
          <p className="font-jakarta font-light text-gold-gradient" style={{ fontSize: 'clamp(30px,3vw,48px)', lineHeight: 1 }}>{fmt(kpis.posts)}</p>
          <p className="text-[10px] mt-3" style={{ color: '#666' }}>Published this period</p>
        </CardShell>
      </section>

      <section className="mb-8">
        <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
          <span style={{ width: 16, height: 1, background: '#c9a96e' }} />
          30 Day Projections
        </p>
        <div className="grid gap-6 dashboard-projections" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {[
            ['Projected Follower Gain', `+${fmt(projections.followers)}`, 'followers'],
            ['Projected Reach', fmt(projections.reach), 'reach'],
            ['Projected Avg ER %', pct(projections.er), 'er'],
          ].map(([label, value, key]) => (
            <CardShell key={key} onClick={() => openProjection(key as string, label as string)}>
              <div className="flex items-center justify-between mb-5">
                <p className="text-[8px] font-medium tracking-[.2em] uppercase" style={{ color: '#555' }}>{label}</p>
                <SparkIcon />
              </div>
              <p className="font-jakarta font-light" style={{ color: '#f2ede4', fontSize: 'clamp(26px,2.8vw,42px)', lineHeight: 1 }}>{value}</p>
              <p className="text-[10px] mt-3" style={{ color: '#666' }}>Last {projections.sample} posts average</p>
            </CardShell>
          ))}
        </div>
      </section>

      {rawCampaigns.length > 0 && (() => {
        const totalSpend30 = rawCampaigns.reduce((s, c) => s + +c.spend, 0)
        const avgRoas = rawCampaigns.filter(c => +c.roas > 0)
        const topRoas = avgRoas.length ? Math.max(...avgRoas.map(c => +c.roas)) : 0
        const topCtr  = rawCampaigns.filter(c => +c.ctr > 0)
        const maxCtr  = topCtr.length ? Math.max(...topCtr.map(c => +c.ctr)) : 0
        const avgCpm  = rawCampaigns.filter(c => +c.cpm > 0)
        const cpmAvg  = avgCpm.length ? avgCpm.reduce((s, c) => s + +c.cpm, 0) / avgCpm.length : 0
        const fmtMon  = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(0)}`
        return (
          <section className="mb-8">
            <p className="text-[9px] font-medium tracking-[.24em] uppercase mb-4 flex items-center gap-3" style={{ color: '#c9a96e' }}>
              <span style={{ width: 16, height: 1, background: '#c9a96e' }} />
              Paid Media · 30 Days
            </p>
            <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(4,1fr)', background: '#141414' }}>
              {[
                { label: 'Total Spend',   value: fmtMon(totalSpend30), sub: `${rawCampaigns.length} campaigns` },
                { label: 'Top ROAS',      value: topRoas > 0 ? `${topRoas.toFixed(1)}x` : '—', sub: 'Best campaign' },
                { label: 'Top CTR',       value: maxCtr > 0 ? `${maxCtr.toFixed(2)}%` : '—', sub: 'Click-through rate' },
                { label: 'Avg CPM',       value: cpmAvg > 0 ? fmtMon(cpmAvg) : '—', sub: 'Cost per 1K impressions' },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ background: '#0a0a0a', padding: '22px 20px' }}>
                  <p className="text-[8px] font-medium tracking-[.18em] uppercase mb-3" style={{ color: '#555' }}>{label}</p>
                  <p className="font-jakarta font-light" style={{ fontSize: 'clamp(22px,2.4vw,34px)', color: '#f2ede4', lineHeight: 1 }}>{value}</p>
                  <p className="text-[10px] mt-2" style={{ color: '#666' }}>{sub}</p>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      <section className="grid gap-6 mb-8 dashboard-snapshots" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, .65fr)' }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #171717', borderRadius: 6, padding: 24 }}>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[9px] font-medium tracking-[.22em] uppercase" style={{ color: '#c9a96e' }}>7 Day Calendar</p>
            <div className="flex gap-2">
              <ArrowButton label="Previous week" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })} />
              <ArrowButton label="Next week" onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })} />
            </div>
          </div>
          <div className="grid gap-3 dashboard-calendar" style={{ gridTemplateColumns: 'repeat(7, minmax(104px, 1fr))', overflowX: 'auto' }}>
            {weekDays.map(day => {
              const dayIso = isoDate(day)
              const events = weekEvents.filter(e => e.event_date === dayIso)
              return (
                <div key={dayIso} style={{ minHeight: 154, background: '#070707', border: '1px solid #141414', borderRadius: 5, padding: 10 }}>
                  <p className="text-[8px] tracking-[.16em] uppercase" style={{ color: '#555' }}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                  <p className="font-jakarta text-[20px] mb-3" style={{ color: '#f2ede4' }}>{day.getDate()}</p>
                  <div className="flex flex-col gap-2">
                    {events.slice(0, 2).map(event => {
                      const p = event.platform ?? 'ig'
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => setSelectedPostId(event.postId)}
                          style={{
                            border: `1px solid ${PLATFORM_COLORS[p] ?? '#555'}66`,
                            borderLeft: `3px solid ${PLATFORM_COLORS[p] ?? '#555'}`,
                            color: '#f2ede4',
                            background: '#0d0d0d',
                            borderRadius: 4,
                            padding: '7px 8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 10,
                            lineHeight: 1.25,
                            transition: 'all .15s ease',
                          }}
                        >
                          <span className="block overflow-hidden" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{event.title}</span>
                        </button>
                      )
                    })}
                    {events.length > 2 && <span className="text-[10px]" style={{ color: '#555' }}>+{events.length - 2} more</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: '#0a0a0a', border: '1px solid #171717', borderRadius: 6, padding: 24 }}>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[9px] font-medium tracking-[.22em] uppercase" style={{ color: '#c9a96e' }}>Pipeline Snapshot</p>
            <span className="text-[10px]" style={{ color: '#666' }}>{filteredPipeline.length} items</span>
          </div>
          <div style={{ maxHeight: 384, overflowY: 'auto', paddingRight: 4 }}>
            {filteredPipeline.slice(0, 18).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/pipeline?phase=${encodeURIComponent(item.status)}&item=${encodeURIComponent(item.id)}&platform=${platform}&scope=${scope}`)}
                className="flex items-center gap-3"
                style={{
                  width: '100%',
                  padding: '10px 8px',
                  border: 'none',
                  borderBottom: '1px solid #121212',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: 3,
                  margin: '0 -8px',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0d0d0d' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span className="text-[10px] font-medium" style={{ color: '#c9a96e', fontFamily: 'monospace', width: 70 }}>{item.post_id}</span>
                <span className="text-[12px] flex-1 overflow-hidden" style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.title}</span>
                <span className="text-[7px] font-medium tracking-[.12em] uppercase px-2 py-1" style={{ color: STATUS_COLORS[item.status] ?? '#555', border: `1px solid ${(STATUS_COLORS[item.status] ?? '#555')}55`, background: '#080808' }}>{item.status}</span>
              </button>
            ))}
            {!filteredPipeline.length && <p className="text-[11px] py-10 text-center" style={{ color: '#555' }}>No pipeline items in this view.</p>}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 8 }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-medium tracking-[.24em] uppercase flex items-center gap-3" style={{ color: '#c9a96e' }}>
            <span style={{ width: 16, height: 1, background: '#c9a96e' }} />
            AI Insights
          </p>
          <button
            type="button"
            onClick={() => { setAiModalTitle('Content Performance'); setAiModalOpen(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px',
              background: 'rgba(201,169,110,0.07)',
              border: '1px solid rgba(201,169,110,0.25)',
              borderRadius: 5,
              color: '#c9a96e',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all .15s ease',
            }}
          >
            <SparkIcon />
            View Insights
          </button>
        </div>
        <p className="text-[11px]" style={{ color: '#666', lineHeight: 1.5 }}>
          AI-powered analysis of your top content pillars, hook performance, and engagement trends.
          Click a projection card above to drill into metric-specific insights.
        </p>
      </section>

      {selectedPost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={e => { if (e.currentTarget === e.target) setSelectedPostId(null) }}>
          <div style={{ width: 420, maxWidth: '100%', background: '#0a0a0a', border: '1px solid #242424', borderRadius: 8, boxShadow: '0 24px 80px rgba(0,0,0,.7)' }}>
            <button type="button" onClick={() => router.push(`/calendar?post=${encodeURIComponent(selectedPost.post_id)}`)} style={{ width: '100%', padding: '20px 22px', border: 'none', borderBottom: '1px solid #171717', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <p className="text-[10px] tracking-[.18em] uppercase mb-2" style={{ color: '#c9a96e' }}>{selectedPost.post_id} - {selectedPost.platformKey.toUpperCase()}</p>
              <h3 className="font-jakarta font-light text-[22px]" style={{ color: '#f2ede4', lineHeight: 1.2 }}>{selectedPost.title}</h3>
            </button>
            <div style={{ padding: 22 }}>
              <div className="flex items-center gap-3 mb-5">
                <span className="font-jakarta text-[34px]" style={{ color: TIER_COLORS[grade(selectedPost.er).toLowerCase() as keyof typeof TIER_COLORS] }}>{grade(selectedPost.er)}</span>
                <div>
                  <p className="text-[12px]" style={{ color: '#f2ede4' }}>{pct(selectedPost.er)} ER</p>
                  <p className="text-[10px]" style={{ color: '#555' }}>{fmt(selectedPost.metric.views)} reach - {selectedPost.decision ?? 'No decision'}</p>
                </div>
              </div>
              <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                  ['Views', fmt(selectedPost.metric.views)],
                  ['Watch', pct(selectedPost.metric.watch_pct)],
                  ['Followers', fmt(selectedPost.metric.followers)],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid #171717', borderRadius: 5, padding: 12 }}>
                    <p className="text-[8px] tracking-[.16em] uppercase mb-2" style={{ color: '#555' }}>{label}</p>
                    <p className="text-[16px]" style={{ color: '#f2ede4' }}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {topStats(selectedPost, avgER).map(stat => (
                  <span key={stat} className="text-[9px] px-2 py-1" style={{ color: '#c9a96e', background: 'rgba(201,169,110,.08)', border: '1px solid rgba(201,169,110,.25)', borderRadius: 4 }}>{stat}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDiscovery && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', backdropFilter: 'blur(8px)', zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.currentTarget === e.target) closeDiscoveryModal() }}
        >
          <div style={{ width: 720, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', background: '#070707', border: '1px solid #242424', borderTop: `2px solid ${PLATFORM_COLORS[selectedDiscovery.platform] ?? '#c9a96e'}`, borderRadius: 8, boxShadow: '0 24px 90px rgba(0,0,0,.75)' }}>
            <div style={{ padding: 24, borderBottom: '1px solid #171717' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4" style={{ minWidth: 0 }}>
                  {selectedDiscovery.thumbnail_url ? (
                    <img src={selectedDiscovery.thumbnail_url} alt="" style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 6, border: '1px solid #1e1e1e', flexShrink: 0 }} />
                  ) : (
                    <PlatformMark platform={PLATFORM_LOGO_KEYS[selectedDiscovery.platform]} color={PLATFORM_COLORS[selectedDiscovery.platform] ?? '#c9a96e'} size={92} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <PlatformMark platform={PLATFORM_LOGO_KEYS[selectedDiscovery.platform]} color={PLATFORM_COLORS[selectedDiscovery.platform] ?? '#c9a96e'} size={28} />
                      <span className="text-[9px] font-medium tracking-[.18em] uppercase" style={{ color: PLATFORM_COLORS[selectedDiscovery.platform] ?? '#c9a96e' }}>
                        {PLATFORM_LABELS[selectedDiscovery.platform]}
                      </span>
                      <span className="text-[10px]" style={{ color: '#555', fontFamily: 'monospace' }}>{selectedDiscovery.platform_video_id}</span>
                    </div>
                    <h2 className="font-jakarta font-light text-[22px]" style={{ color: '#f2ede4', lineHeight: 1.2 }}>
                      {selectedDiscovery.title ?? `${PLATFORM_LABELS[selectedDiscovery.platform]} video`}
                    </h2>
                    <p className="text-[11px] mt-2" style={{ color: '#666' }}>{displayDate(selectedDiscovery.published_at)}</p>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {[
                        ['Views', fmt(selectedDiscovery.views ?? 0)],
                        ['Likes', fmt(selectedDiscovery.likes ?? 0)],
                        ['Comments', fmt(selectedDiscovery.comments ?? 0)],
                        ['Shares', fmt(selectedDiscovery.shares ?? 0)],
                      ].map(([label, value]) => (
                        <span key={label} className="text-[9px]" style={{ color: '#f2ede4', border: '1px solid #1e1e1e', borderRadius: 4, padding: '5px 8px', background: '#0a0a0a' }}>
                          <span style={{ color: '#666' }}>{label}: </span>{value}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={closeDiscoveryModal} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
              </div>
            </div>

            <div style={{ padding: 24 }}>
              {bundleStep === 'postCreate' ? (
                <>
                  <p className="text-[9px] font-medium tracking-[.18em] uppercase mb-3" style={{ color: '#c9a96e' }}>
                    Bundle Created
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {createdBundlePlatforms.map(item => (
                      <span
                        key={`created-${item}`}
                        className="inline-flex items-center gap-1.5 text-[9px]"
                        style={{
                          color: '#f2ede4',
                          border: `1px solid ${(PLATFORM_COLORS[item] ?? '#555')}44`,
                          borderRadius: 4,
                          padding: '5px 7px',
                          background: '#050505',
                        }}
                      >
                        <PlatformMark platform={PLATFORM_LOGO_KEYS[item]} color={PLATFORM_COLORS[item] ?? '#c9a96e'} size={20} />
                        <span style={{ color: PLATFORM_COLORS[item] ?? '#c9a96e' }}>{PLATFORM_LABELS[item]}</span>
                      </span>
                    ))}
                  </div>

                  {createdBundleMissingPlatforms.length === 0 ? (
                    <div style={{ border: '1px solid rgba(57,255,136,.28)', borderRadius: 6, padding: 14, background: 'rgba(57,255,136,.06)' }}>
                      <p className="text-[12px]" style={{ color: '#f2ede4' }}>All IG, TikTok, and YouTube links are attached to this pipeline item.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <p className="text-[11px]" style={{ color: '#777', lineHeight: 1.5 }}>
                        Add any missing platform now, or close this modal and handle it later from Pipeline.
                      </p>
                      {createdBundleMissingPlatforms.map(platformKey => {
                        const color = PLATFORM_COLORS[platformKey] ?? '#c9a96e'
                        const inputValue = missingPlatformInputs[platformKey]
                        const searchValue = missingPlatformSearches[platformKey]
                        const matches = missingDiscoveryMatches[platformKey]
                        const busy = missingLinkBusy === platformKey
                        return (
                          <div key={`missing-${platformKey}`} style={{ border: `1px solid ${color}33`, borderRadius: 6, padding: 14, background: '#090909' }}>
                            <div className="flex items-center gap-2 mb-3">
                              <PlatformMark platform={PLATFORM_LOGO_KEYS[platformKey]} color={color} size={24} />
                              <p className="text-[9px] font-medium tracking-[.18em] uppercase" style={{ color }}>{PLATFORM_LABELS[platformKey]}</p>
                            </div>
                            <div className="flex gap-2">
                              <input
                                value={inputValue}
                                onChange={e => {
                                  setMissingPlatformInputs(prev => ({ ...prev, [platformKey]: e.target.value }))
                                  setMissingLinkErrors(prev => ({ ...prev, [platformKey]: null }))
                                }}
                                placeholder={`Paste ${PLATFORM_LABELS[platformKey]} URL or ID...`}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  background: '#0a0a0a',
                                  border: '1px solid #1f1f1f',
                                  borderRadius: 5,
                                  padding: '10px 11px',
                                  color: '#f2ede4',
                                  fontSize: 11,
                                  outline: 'none',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleLinkMissingPlatform(platformKey, inputValue)}
                                disabled={busy || !inputValue.trim()}
                                style={{ padding: '8px 12px', fontSize: 8, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#060606', background: '#c9a96e', border: '1px solid #c9a96e', borderRadius: 4, cursor: busy || !inputValue.trim() ? 'default' : 'pointer', opacity: busy || !inputValue.trim() ? 0.45 : 1 }}
                              >
                                {busy ? 'Adding...' : 'Add'}
                              </button>
                            </div>
                            <label className="text-[8px] font-medium tracking-[.16em] uppercase mt-4 mb-2 block" style={{ color: '#555' }}>Search Remaining Discoveries</label>
                            <input
                              value={searchValue}
                              onChange={e => setMissingPlatformSearches(prev => ({ ...prev, [platformKey]: e.target.value }))}
                              placeholder={`Search ${PLATFORM_LABELS[platformKey]} discoveries...`}
                              style={{
                                width: '100%',
                                background: '#0a0a0a',
                                border: '1px solid #1f1f1f',
                                borderRadius: 5,
                                padding: '10px 11px',
                                color: '#f2ede4',
                                fontSize: 11,
                                outline: 'none',
                              }}
                            />
                            {searchValue.trim() && (
                              <div className="mt-3" style={{ display: 'grid', gap: 8 }}>
                                {matches.length === 0 ? (
                                  <p className="text-[10px]" style={{ color: '#666' }}>No matching unlinked discoveries.</p>
                                ) : matches.map(item => (
                                  <button
                                    key={`missing-match-${item.id}`}
                                    type="button"
                                    onClick={() => handleLinkMissingPlatform(platformKey, item.id)}
                                    disabled={busy}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '34px minmax(0,1fr) auto',
                                      gap: 10,
                                      alignItems: 'center',
                                      textAlign: 'left',
                                      background: '#0d0d0d',
                                      border: `1px solid ${color}33`,
                                      borderRadius: 5,
                                      padding: 9,
                                      cursor: busy ? 'wait' : 'pointer',
                                      opacity: busy ? 0.65 : 1,
                                    }}
                                  >
                                    {item.thumbnail_url ? (
                                      <img src={item.thumbnail_url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, border: '1px solid #1e1e1e' }} />
                                    ) : (
                                      <PlatformMark platform={PLATFORM_LOGO_KEYS[item.platform]} color={color} size={34} />
                                    )}
                                    <div style={{ minWidth: 0 }}>
                                      <p className="text-[11px] overflow-hidden" style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.title ?? `${PLATFORM_LABELS[item.platform]} video`}</p>
                                      <p className="text-[9px] mt-1" style={{ color: '#555', fontFamily: 'monospace' }}>{item.platform_video_id}</p>
                                    </div>
                                    <span className="text-[9px]" style={{ color: '#666' }}>{displayDate(item.published_at)}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {missingLinkErrors[platformKey] && (
                              <p className="text-[11px] mt-3" style={{ color: '#ff3b5f' }}>{missingLinkErrors[platformKey]}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={closeDiscoveryModal}
                      disabled={missingLinkBusy !== null}
                      style={{ padding: '9px 18px', fontSize: 9, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#060606', background: '#c9a96e', border: '1px solid #c9a96e', borderRadius: 4, cursor: missingLinkBusy ? 'wait' : 'pointer', opacity: missingLinkBusy ? 0.65 : 1 }}
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : bundleStep === 'title' ? (
                <>
                  <p className="text-[9px] font-medium tracking-[.18em] uppercase mb-3" style={{ color: '#c9a96e' }}>
                    Confirm Bundle Title
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {selectedBundleDiscoveries.map(item => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1.5 text-[9px]"
                        style={{
                          color: '#f2ede4',
                          border: `1px solid ${(PLATFORM_COLORS[item.platform] ?? '#555')}44`,
                          borderRadius: 4,
                          padding: '5px 7px',
                          background: '#050505',
                        }}
                      >
                        <PlatformMark platform={PLATFORM_LOGO_KEYS[item.platform]} color={PLATFORM_COLORS[item.platform] ?? '#c9a96e'} size={20} />
                        <span style={{ color: PLATFORM_COLORS[item.platform] ?? '#c9a96e' }}>{PLATFORM_LABELS[item.platform]}</span>
                        <span style={{ color: '#777', fontFamily: 'monospace' }}>{item.platform_video_id}</span>
                      </span>
                    ))}
                  </div>
                  <label className="text-[9px] font-medium tracking-[.18em] uppercase mb-2 block" style={{ color: '#555' }}>Hero Title</label>
                  <input
                    value={bundleTitle}
                    onChange={e => {
                      setBundleTitle(e.target.value)
                      setBundleError(null)
                    }}
                    placeholder="Name this content..."
                    style={{
                      width: '100%',
                      background: '#0a0a0a',
                      border: '1px solid #1f1f1f',
                      borderRadius: 5,
                      padding: '11px 12px',
                      color: '#f2ede4',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  />
                  <p className="text-[11px] mt-3" style={{ color: '#777', lineHeight: 1.5 }}>
                    This becomes the locked pipeline title for the bundled content. Platform captions stay discovery metadata only.
                  </p>
                  {bundleError && (
                    <p className="text-[11px] mt-4" style={{ color: '#ff3b5f' }}>{bundleError}</p>
                  )}
                  <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBundleStep('review')
                        setBundleError(null)
                      }}
                      disabled={discoBusy !== null}
                      style={{ padding: '9px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: '#777', background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 4, cursor: discoBusy ? 'wait' : 'pointer', opacity: discoBusy ? 0.65 : 1 }}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateBundle}
                      disabled={discoBusy !== null || !bundleTitle.trim()}
                      style={{ padding: '9px 18px', fontSize: 9, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#060606', background: '#c9a96e', border: '1px solid #c9a96e', borderRadius: 4, cursor: discoBusy || !bundleTitle.trim() ? 'default' : 'pointer', opacity: discoBusy || !bundleTitle.trim() ? 0.45 : 1 }}
                    >
                      {discoBusy === 'bundle' ? 'Creating...' : 'Create & Link Selected'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-6" style={{ border: '1px solid #171717', borderRadius: 6, padding: 14, background: '#090909' }}>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <p className="text-[9px] font-medium tracking-[.18em] uppercase" style={{ color: '#c9a96e' }}>
                        Possible Same Content, Other Platforms
                      </p>
                      <button
                        type="button"
                        onClick={() => setDiscoveryWindowDays(prev => prev === 1 ? 7 : 1)}
                        style={{
                          color: discoveryWindowDays === 7 ? '#060606' : '#c9a96e',
                          background: discoveryWindowDays === 7 ? '#c9a96e' : 'rgba(201,169,110,.08)',
                          border: '1px solid rgba(201,169,110,.35)',
                          borderRadius: 4,
                          padding: '6px 9px',
                          fontSize: 8,
                          fontWeight: 600,
                          letterSpacing: '.12em',
                          textTransform: 'uppercase',
                          cursor: 'pointer',
                        }}
                      >
                        Last 7 days
                      </button>
                    </div>

                    {relatedDiscoveries.length > 0 ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {relatedDiscoveries.map(item => renderDiscoveryToggleCard(item))}
                      </div>
                    ) : (
                      <p className="text-[10px]" style={{ color: '#666' }}>No nearby cross-platform candidates in the selected window.</p>
                    )}

                    <label className="text-[9px] font-medium tracking-[.18em] uppercase mt-5 mb-2 block" style={{ color: '#555' }}>Search Unlinked Discoveries</label>
                    <input
                      value={relatedDiscoverySearch}
                      onChange={e => setRelatedDiscoverySearch(e.target.value)}
                      placeholder={`Search title, platform, or video ID within ${discoveryWindowDays === 7 ? '7 days' : '1 day'}...`}
                      style={{
                        width: '100%',
                        background: '#0a0a0a',
                        border: '1px solid #1f1f1f',
                        borderRadius: 5,
                        padding: '11px 12px',
                        color: '#f2ede4',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                    {relatedDiscoverySearch.trim() && (
                      <div className="mt-3" style={{ display: 'grid', gap: 8 }}>
                        {manualDiscoveryMatches.length === 0 ? (
                          <p className="text-[10px]" style={{ color: '#666' }}>No matching discoveries in this window.</p>
                        ) : manualDiscoveryMatches.map(item => renderDiscoveryToggleCard(item))}
                      </div>
                    )}

                    {(bundleError || (selectedRelatedDiscoveryIds.size > 0 && bundleValidationError)) && (
                      <p className="text-[11px] mt-3" style={{ color: '#ff3b5f' }}>{bundleError ?? bundleValidationError}</p>
                    )}
                  </div>

                  <label className="text-[9px] font-medium tracking-[.18em] uppercase mb-2 block" style={{ color: '#555' }}>Find Pipeline Item</label>
                  <input
                    value={discoverySearch}
                    onChange={e => {
                      setDiscoverySearch(e.target.value)
                      setSelectedPipelineId(null)
                    }}
                    placeholder="Search by title, ID, date, or pillar..."
                    style={{
                      width: '100%',
                      background: '#0a0a0a',
                      border: '1px solid #1f1f1f',
                      borderRadius: 5,
                      padding: '11px 12px',
                      color: '#f2ede4',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  />

                  <div className="mt-4" style={{ display: 'grid', gap: 8 }}>
                    {discoveryMatches.length === 0 ? (
                      <div style={{ border: '1px solid #171717', borderRadius: 5, padding: 14 }}>
                        <p className="text-[11px]" style={{ color: '#666' }}>No matching pipeline items.</p>
                      </div>
                    ) : discoveryMatches.map(item => {
                      const selected = item.id === selectedPipelineId
                      const linkedEntries = linkedVideoEntries(item)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedPipelineId(item.id)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '42px minmax(0,1fr) auto',
                            gap: 12,
                            alignItems: 'center',
                            textAlign: 'left',
                            background: selected ? 'rgba(201,169,110,.10)' : '#0a0a0a',
                            border: `1px solid ${selected ? 'rgba(201,169,110,.55)' : '#1a1a1a'}`,
                            borderRadius: 5,
                            padding: 10,
                            cursor: 'pointer',
                          }}
                        >
                          {item.thumbnail_url ? (
                            <img src={item.thumbnail_url} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 4, border: '1px solid #1e1e1e' }} />
                          ) : (
                            <div style={{ width: 42, height: 42, borderRadius: 4, border: '1px solid #1e1e1e', background: '#111' }} />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <p className="text-[12px] overflow-hidden" style={{ color: '#f2ede4', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.title}</p>
                            <p className="text-[10px] mt-1" style={{ color: '#555', fontFamily: 'monospace' }}>{item.post_id}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {linkedEntries.length === 0 ? (
                              <span className="text-[8px] tracking-[.08em] uppercase" style={{ color: '#555' }}>No linked IDs</span>
                            ) : linkedEntries.map(entry => (
                              <span
                                key={`${item.id}-${entry.platform}`}
                                className="inline-flex items-center gap-1 text-[8px]"
                                style={{
                                  color: '#f2ede4',
                                  border: `1px solid ${(PLATFORM_COLORS[entry.platform] ?? '#555')}44`,
                                  borderRadius: 4,
                                  padding: '3px 5px',
                                  background: '#050505',
                                  maxWidth: 132,
                                }}
                              >
                                <PlatformMark platform={PLATFORM_LOGO_KEYS[entry.platform]} color={PLATFORM_COLORS[entry.platform] ?? '#c9a96e'} size={18} />
                                <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.videoId}</span>
                              </span>
                            ))}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {selectedPipelineItem && (
                    <div className="mt-4" style={{
                      border: `1px solid ${selectedPipelineConflict ? 'rgba(255,59,95,.42)' : 'rgba(201,169,110,.24)'}`,
                      borderRadius: 5,
                      padding: 12,
                      background: selectedPipelineConflict ? 'rgba(255,59,95,.06)' : 'rgba(201,169,110,.06)',
                    }}>
                      <p className="text-[9px] font-medium tracking-[.16em] uppercase" style={{ color: selectedPipelineConflict ? '#ff3b5f' : '#c9a96e' }}>
                        {selectedPipelineConflict ? 'Platform Link Conflict' : 'Selected Pipeline Links'}
                      </p>
                      <p className="text-[11px] mt-2" style={{ color: selectedPipelineConflict ? '#ff9aaa' : '#777' }}>
                        {selectedPipelineConflict
                          ? `${PLATFORM_LABELS[selectedPipelineConflict.platform]} already has ${selectedPipelineConflict.existingVideoId}. This discovery is ${selectedPipelineConflict.discoveryVideoId}. Pick a different pipeline item or clear the existing link first.`
                          : 'Confirm the linked platform IDs below belong to the same content before linking this discovery.'}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {linkedVideoEntries(selectedPipelineItem).length === 0 ? (
                          <span className="text-[10px]" style={{ color: '#666' }}>No platform video IDs are linked on this item yet.</span>
                        ) : linkedVideoEntries(selectedPipelineItem).map(entry => (
                          <span
                            key={`selected-${entry.platform}`}
                            className="inline-flex items-center gap-1.5 text-[9px]"
                            style={{
                              color: '#f2ede4',
                              border: `1px solid ${(PLATFORM_COLORS[entry.platform] ?? '#555')}44`,
                              borderRadius: 4,
                              padding: '5px 7px',
                              background: '#050505',
                            }}
                          >
                            <PlatformMark platform={PLATFORM_LOGO_KEYS[entry.platform]} color={PLATFORM_COLORS[entry.platform] ?? '#c9a96e'} size={20} />
                            <span style={{ color: PLATFORM_COLORS[entry.platform] ?? '#c9a96e' }}>{PLATFORM_LABELS[entry.platform]}</span>
                            <span style={{ color: '#777', fontFamily: 'monospace' }}>{entry.videoId}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleIgnoreDiscovery}
                      disabled={discoBusy !== null}
                      style={{ padding: '9px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: '#ff3b5f', background: 'rgba(255,59,95,.08)', border: '1px solid rgba(255,59,95,.32)', borderRadius: 4, cursor: discoBusy ? 'wait' : 'pointer', opacity: discoBusy ? 0.65 : 1 }}
                    >
                      {discoBusy === 'ignore' ? 'Ignoring...' : 'Ignore'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateFromDiscovery}
                      disabled={discoBusy !== null}
                      style={{ padding: '9px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: '#4cc9ff', background: 'rgba(76,201,255,.08)', border: '1px solid rgba(76,201,255,.32)', borderRadius: 4, cursor: discoBusy ? 'wait' : 'pointer', opacity: discoBusy ? 0.65 : 1 }}
                    >
                      {discoBusy === 'create' ? 'Creating...' : 'Create New Pipeline Item'}
                    </button>
                    <button
                      type="button"
                      onClick={startBundleTitleStep}
                      disabled={discoBusy !== null || bundleValidationError !== null}
                      style={{ padding: '9px 16px', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: bundleValidationError ? '#777' : '#c9a96e', background: bundleValidationError ? '#0a0a0a' : 'rgba(201,169,110,.08)', border: `1px solid ${bundleValidationError ? '#1e1e1e' : 'rgba(201,169,110,.35)'}`, borderRadius: 4, cursor: discoBusy || bundleValidationError ? 'default' : 'pointer', opacity: discoBusy || bundleValidationError ? 0.55 : 1 }}
                    >
                      Link & Create New
                    </button>
                    <button
                      type="button"
                      onClick={handleLinkDiscovery}
                      disabled={!selectedPipelineId || selectedPipelineConflict !== null || discoBusy !== null}
                      style={{ padding: '9px 18px', fontSize: 9, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#060606', background: '#c9a96e', border: '1px solid #c9a96e', borderRadius: 4, cursor: !selectedPipelineId || selectedPipelineConflict || discoBusy ? 'default' : 'pointer', opacity: !selectedPipelineId || selectedPipelineConflict || discoBusy ? 0.45 : 1 }}
                    >
                      {discoBusy === 'link' ? 'Linking...' : 'Link Selected Item'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Client Notes */}
      <ClientNotesPanel />

      <AISuggestionsModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title={aiModalTitle}
        subtitle="Powered by Claude · Based on your recent content data"
        suggestions={suggestions}
        loading={loadingAi}
      />
    </div>
  )
}

function ClientNotesPanel() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [shared, setShared] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && !loaded) {
      getClientNotes().then(res => {
        if (!res.error) {
          setContent(res.content ?? '')
          setShared(res.shared ?? false)
          setLoaded(true)
        }
      })
    }
  }, [open, loaded])

  async function handleSave(html: string) {
    setContent(html)
    setSaving(true)
    const { error } = await saveClientNotes(html, shared)
    setSaving(false)
    if (error) toast(error, 'error')
  }

  return (
    <section className="mt-8" style={{ borderTop: '1px solid #141414', paddingTop: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: 'none', color: '#555',
          fontSize: 9, fontWeight: 500, letterSpacing: '.2em',
          textTransform: 'uppercase', cursor: 'pointer',
          padding: '4px 0',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M6 4l4 4-4 4"/></svg>
        Notes
        {saving && <span style={{ color: '#c9a96e', marginLeft: 4 }}>saving...</span>}
      </button>
      {open && loaded && (
        <div className="mt-3">
          <RichTextEditor
            content={content}
            onChange={handleSave}
            placeholder="Add notes about this client..."
            debounceMs={1500}
            minHeight={100}
          />
        </div>
      )}
    </section>
  )
}
