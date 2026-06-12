'use client'

import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'

// ── Design tokens ──────────────────────────────────────────────────────────

const GOLD   = '#c9a96e'
const GRID   = 'rgba(255,255,255,.04)'
const TICK   = '#333'
const BG     = '#0a0a0a'

const TIER_COLOR = (er: number) =>
  er >= 12 ? '#39ff88' : er >= 7 ? '#4cc9ff' : er >= 4 ? '#fbbf24' : '#ff3b5f'

// ── Types ──────────────────────────────────────────────────────────────────

export type MonthlyPoint = {
  month: string    // "Feb"
  posts: number
  views: number
  followers: number
  avgER: number
}

export type PillarPoint = {
  pillar: string
  avgER: number
  count: number
}

// ── Shared tooltip style ───────────────────────────────────────────────────

function ChartTooltip({
  active, payload, label, fmt,
}: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: readonly any[]
  label?: string | number
  fmt?: (v: number, name: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0d0d0d',
      border: '1px solid #1e1e1e',
      padding: '8px 12px',
      fontSize: 10,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {label != null && <p style={{ color: '#555', marginBottom: 4, letterSpacing: '.08em' }}>{String(label)}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {fmt ? fmt(Number(p.value), String(p.name)) : Number(p.value).toLocaleString()}
        </p>
      ))}
    </div>
  )
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}

// ── Chart card wrapper ─────────────────────────────────────────────────────

function ChartCard({
  title, children, height = 190, glowColor,
}: {
  title: string; children: React.ReactNode; height?: number; glowColor?: string
}) {
  return (
    <div style={{
      background: BG,
      border: '1px solid #141414',
      padding: '20px 20px 16px',
      boxShadow: glowColor
        ? `0 0 60px ${glowColor}26, 0 4px 24px rgba(0,0,0,.5)`
        : '0 4px 16px rgba(0,0,0,.3)',
      transition: 'box-shadow .3s ease',
    }}>
      <p style={{
        fontSize: 8,
        letterSpacing: '.14em',
        textTransform: 'uppercase',
        color: '#555',
        marginBottom: 14,
      }}>
        {title}
      </p>
      <div style={{ height }}>
        {children}
      </div>
    </div>
  )
}

// ── Chart 1: Follower Growth by Month ─────────────────────────────────────

function FollowerGrowthChart({ data }: { data: MonthlyPoint[] }) {
  if (!data.length) return <p style={{ fontSize: 11, color: '#666', textAlign: 'center', paddingTop: 60 }}>No monthly data</p>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tick={{ fill: TICK, fontSize: 9 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: TICK, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} />
        <Tooltip
          content={(props: any) => (
            <ChartTooltip active={props.active} payload={props.payload} label={props.label} fmt={v => '+' + v.toLocaleString()} />
          )}
        />
        <Bar dataKey="followers" name="Followers" radius={[2, 2, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={GOLD} fillOpacity={0.75 + (i / data.length) * 0.25} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Chart 2: Monthly Views ─────────────────────────────────────────────────

function MonthlyViewsChart({ data }: { data: MonthlyPoint[] }) {
  if (!data.length) return <p style={{ fontSize: 11, color: '#666', textAlign: 'center', paddingTop: 60 }}>No monthly data</p>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tick={{ fill: TICK, fontSize: 9 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: TICK, fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} />
        <Tooltip
          content={(props: any) => (
            <ChartTooltip active={props.active} payload={props.payload} label={props.label} fmt={fmtNum} />
          )}
        />
        <Line
          type="monotone"
          dataKey="views"
          name="Views"
          stroke={GOLD}
          strokeWidth={2}
          dot={{ fill: GOLD, strokeWidth: 0, r: 4 }}
          activeDot={{ r: 5, fill: GOLD }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Chart 3: Posts Volume + Followers Gained (dual axis) ──────────────────

function PostsVolumeChart({ data }: { data: MonthlyPoint[] }) {
  if (!data.length) return <p style={{ fontSize: 11, color: '#666', textAlign: 'center', paddingTop: 60 }}>No monthly data</p>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tick={{ fill: TICK, fontSize: 9 }} tickLine={false} axisLine={false} />
        <YAxis
          yAxisId="posts"
          tick={{ fill: TICK, fontSize: 9 }} tickLine={false} axisLine={false}
          label={{ value: 'Posts', angle: -90, position: 'insideLeft', fill: '#555', fontSize: 8 }}
        />
        <YAxis
          yAxisId="followers"
          orientation="right"
          tick={{ fill: TICK, fontSize: 9 }} tickLine={false} axisLine={false}
          tickFormatter={fmtNum}
        />
        <Tooltip
          content={(props: any) => (
            <ChartTooltip active={props.active} payload={props.payload} label={props.label}
              fmt={(v, name) => name === 'Followers' ? '+' + fmtNum(v) : String(v)} />
          )}
        />
        <Bar yAxisId="posts" dataKey="posts" name="Posts" radius={[2, 2, 0, 0]} fill={GOLD} fillOpacity={0.55} />
        <Line
          yAxisId="followers"
          type="monotone"
          dataKey="followers"
          name="Followers"
          stroke="#39ff88"
          strokeWidth={2}
          dot={{ fill: '#39ff88', strokeWidth: 0, r: 3 }}
          activeDot={{ r: 4, fill: '#39ff88' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Chart 4: Avg ER% by Pillar (horizontal bar) ───────────────────────────

function PillarERChart({ data }: { data: PillarPoint[] }) {
  if (!data.length) return <p style={{ fontSize: 11, color: '#666', textAlign: 'center', paddingTop: 60 }}>No pillar data</p>
  const sorted = [...data].sort((a, b) => b.avgER - a.avgER)
  const chartH = Math.max(160, sorted.length * 36)
  return (
    <ResponsiveContainer width="100%" height={chartH}>
      <BarChart
        layout="vertical"
        data={sorted}
        margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
      >
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          type="number"
          tick={{ fill: TICK, fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => v + '%'}
          domain={[0, 'dataMax + 2']}
        />
        <YAxis
          type="category"
          dataKey="pillar"
          tick={{ fill: '#555', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip
          content={(props: any) => (
            <ChartTooltip active={props.active} payload={props.payload} label={props.label} fmt={v => v.toFixed(1) + '%'} />
          )}
        />
        <Bar dataKey="avgER" name="Avg ER" radius={[0, 2, 2, 0]}>
          {sorted.map((entry, i) => (
            <Cell key={i} fill={TIER_COLOR(entry.avgER)} fillOpacity={0.8} />
          ))}
          <LabelList
            dataKey="avgER"
            position="right"
            formatter={((v: unknown) => (typeof v === 'number' ? v.toFixed(1) + '%' : '')) as any}
            style={{ fill: '#555', fontSize: 9 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

export function DashboardCharts({
  monthly,
  pillars,
  glowColor,
}: {
  monthly: MonthlyPoint[]
  pillars: PillarPoint[]
  glowColor?: string
}) {
  const hasPillars = pillars.length > 0

  return (
    <div>
      {/* Row 1: Follower growth + Monthly views */}
      <div
        className="grid gap-px mb-px"
        style={{ gridTemplateColumns: '1fr 1fr', background: '#141414' }}
      >
        <ChartCard title="Follower Growth by Month" glowColor={glowColor}>
          <FollowerGrowthChart data={monthly} />
        </ChartCard>
        <ChartCard title="Monthly Views" glowColor={glowColor}>
          <MonthlyViewsChart data={monthly} />
        </ChartCard>
      </div>

      {/* Row 2: Posts volume + Pillar ER */}
      <div
        className="grid gap-px mb-px"
        style={{ gridTemplateColumns: hasPillars ? '1fr 1fr' : '1fr', background: '#141414' }}
      >
        <ChartCard title="Posts Volume + Follower Gain" glowColor={glowColor}>
          <PostsVolumeChart data={monthly} />
        </ChartCard>
        {hasPillars && (
          <ChartCard title="Avg ER% by Content Pillar" height={Math.max(190, pillars.length * 36)} glowColor={glowColor}>
            <PillarERChart data={pillars} />
          </ChartCard>
        )}
      </div>
    </div>
  )
}
