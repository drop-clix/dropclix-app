'use client'

import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { MonthGrade, WeekGrade, PostSummary } from '@/app/(dashboard)/report-card/page'

Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf', fontWeight: 300 },
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hjQ.ttf', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hjQ.ttf', fontWeight: 700 },
  ],
})

const GOLD = '#c9a96e'
const BG = '#0a0a0a'
const CARD_BG = '#111111'
const BORDER = '#1e1e1e'
const WHITE = '#f2ede4'
const MUTED = '#888888'
const DIM = '#555555'

const s = StyleSheet.create({
  page: {
    backgroundColor: BG,
    padding: 40,
    fontFamily: 'Inter',
    color: WHITE,
  },
  header: {
    marginBottom: 24,
    borderBottom: `1px solid ${BORDER}`,
    paddingBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandText: {
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: WHITE,
  },
  brandGold: {
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: GOLD,
  },
  brandDivider: {
    width: 1,
    height: 12,
    backgroundColor: GOLD,
    marginHorizontal: 8,
    opacity: 0.5,
  },
  clientName: {
    fontSize: 22,
    fontWeight: 300,
    color: WHITE,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: DIM,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  dateRange: {
    fontSize: 9,
    color: MUTED,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: GOLD,
    marginBottom: 10,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 6,
    border: `1px solid ${BORDER}`,
    padding: 16,
    marginBottom: 16,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  gradeCircle: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${BORDER}`,
  },
  gradeText: {
    fontSize: 28,
    fontWeight: 700,
  },
  gradeScore: {
    fontSize: 8,
    opacity: 0.65,
    marginTop: 2,
  },
  periodLabel: {
    fontSize: 18,
    fontWeight: 300,
    color: WHITE,
  },
  gradeLabel: {
    fontSize: 10,
    marginTop: 3,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 6,
  },
  kpiItem: {
    fontSize: 9,
    color: DIM,
  },
  kpiValue: {
    color: WHITE,
    fontWeight: 600,
  },
  barContainer: {
    marginBottom: 10,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 8,
    color: DIM,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  barValue: {
    fontSize: 8,
    color: WHITE,
  },
  barTrack: {
    height: 3,
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
  },
  barFill: {
    height: 3,
    borderRadius: 2,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
  listItem: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  listIcon: {
    fontSize: 9,
    flexShrink: 0,
    marginTop: 1,
  },
  listText: {
    fontSize: 8,
    color: MUTED,
    lineHeight: 1.5,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: `1px solid ${BORDER}`,
    paddingBottom: 5,
    marginBottom: 3,
  },
  tableHeaderText: {
    fontSize: 7,
    color: DIM,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottom: `1px solid #0f0f0f`,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 7,
    color: DIM,
    letterSpacing: 1,
  },
  footerGold: {
    fontSize: 7,
    color: GOLD,
    letterSpacing: 1,
  },
  strategyItem: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  strategyText: {
    fontSize: 8,
    color: MUTED,
    lineHeight: 1.6,
  },
})

function fmtN(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function gradeColor(g: string): string {
  return g === 'A' ? GOLD : g === 'B' ? '#4ade80' : g === 'C' ? '#f59e0b' : g === 'D' ? '#f97316' : '#ef4444'
}

function decisionColor(d: string): string {
  return d === 'Double Down' ? GOLD : d === 'Iterate' ? '#f59e0b' : '#ef4444'
}

function barColor(pct: number): string {
  return pct >= 80 ? '#4ade80' : pct >= 55 ? '#f59e0b' : '#ef4444'
}

function ScoreBarPDF({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? (score / max) * 100 : 0
  return (
    <View style={s.barContainer}>
      <View style={s.barLabelRow}>
        <Text style={s.barLabel}>{label}</Text>
        <Text style={s.barValue}>{score}/{max}</Text>
      </View>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor(pct) }]} />
      </View>
    </View>
  )
}

function PostsTablePDF({ posts }: { posts: PostSummary[] }) {
  if (!posts.length) return <Text style={{ fontSize: 8, color: DIM }}>No posts this period.</Text>
  return (
    <View>
      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderText, { width: 40 }]}>ID</Text>
        <Text style={[s.tableHeaderText, { flex: 1 }]}>Title</Text>
        <Text style={[s.tableHeaderText, { width: 50, textAlign: 'right' }]}>Views</Text>
        <Text style={[s.tableHeaderText, { width: 40, textAlign: 'right' }]}>ER%</Text>
        <Text style={[s.tableHeaderText, { width: 70, textAlign: 'right' }]}>Decision</Text>
      </View>
      {posts.map(p => (
        <View key={p.postId} style={s.tableRow}>
          <Text style={[s.tableCell, { width: 40, color: GOLD, fontSize: 7 }]}>{p.postId}</Text>
          <Text style={[s.tableCell, { flex: 1, color: WHITE, maxLines: 1 }]}>{p.title}</Text>
          <Text style={[s.tableCell, { width: 50, textAlign: 'right', color: MUTED }]}>{fmtN(p.views)}</Text>
          <Text style={[s.tableCell, { width: 40, textAlign: 'right', color: p.er >= 12 ? '#4ade80' : p.er >= 4 ? '#f59e0b' : '#ef4444' }]}>{p.er.toFixed(1)}%</Text>
          <Text style={[s.tableCell, { width: 70, textAlign: 'right', color: decisionColor(p.decision), fontSize: 7 }]}>{p.decision}</Text>
        </View>
      ))}
    </View>
  )
}

function PeriodPage({
  period,
  isMonthly,
  clientName,
  pageNum,
  totalPages,
}: {
  period: MonthGrade | WeekGrade
  isMonthly: boolean
  clientName: string
  pageNum: number
  totalPages: number
}) {
  const gc = gradeColor(period.grade)
  return (
    <Page size="A4" style={s.page}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.brandRow}>
          <Text style={s.brandText}>Drop</Text>
          <View style={s.brandDivider} />
          <Text style={s.brandGold}>Clix</Text>
        </View>
        <Text style={s.clientName}>{clientName}</Text>
        <Text style={s.subtitle}>
          {isMonthly ? 'Monthly' : 'Weekly'} Performance Report
        </Text>
        <Text style={s.dateRange}>{period.label}</Text>
      </View>

      {/* Grade + KPIs */}
      <View style={s.gradeRow}>
        <View style={[s.gradeCircle, { backgroundColor: `${gc}15`, borderColor: `${gc}40` }]}>
          <Text style={[s.gradeText, { color: gc }]}>{period.grade}</Text>
          <Text style={[s.gradeScore, { color: gc }]}>{period.score}/100</Text>
        </View>
        <View>
          <Text style={s.periodLabel}>{period.label}</Text>
          <Text style={[s.gradeLabel, { color: gc }]}>{period.gradeLabel}</Text>
          <View style={s.kpiRow}>
            <Text style={s.kpiItem}><Text style={s.kpiValue}>{period.posts}</Text> posts</Text>
            <Text style={s.kpiItem}><Text style={s.kpiValue}>{fmtN(period.views)}</Text> views</Text>
            <Text style={s.kpiItem}><Text style={s.kpiValue}>{period.avgER.toFixed(1)}%</Text> avg ER</Text>
            <Text style={s.kpiItem}><Text style={s.kpiValue}>{period.eliteCount}</Text> elite</Text>
            {isMonthly && 'followers' in period && (
              <Text style={s.kpiItem}><Text style={s.kpiValue}>+{(period as MonthGrade).followers.toLocaleString()}</Text> followers</Text>
            )}
          </View>
        </View>
      </View>

      {/* Score Breakdown */}
      <View style={s.card}>
        <Text style={s.sectionLabel}>Score Breakdown</Text>
        {period.components.map(c => (
          <ScoreBarPDF key={c.label} label={c.label} score={c.score} max={c.max} />
        ))}
      </View>

      {/* Wins & Misses */}
      <View style={s.columnsRow}>
        <View style={[s.card, s.halfCol]}>
          <Text style={[s.sectionLabel, { color: '#4ade80' }]}>Wins</Text>
          {period.wins.length === 0
            ? <Text style={{ fontSize: 8, color: DIM }}>No wins logged.</Text>
            : period.wins.map((w, i) => (
              <View key={i} style={s.listItem}>
                <Text style={[s.listIcon, { color: '#4ade80' }]}>✓</Text>
                <Text style={s.listText}>{w}</Text>
              </View>
            ))
          }
        </View>
        <View style={[s.card, s.halfCol]}>
          <Text style={[s.sectionLabel, { color: '#ef4444' }]}>Misses</Text>
          {period.misses.length === 0
            ? <Text style={{ fontSize: 8, color: DIM }}>Clean sheet.</Text>
            : period.misses.map((m, i) => (
              <View key={i} style={s.listItem}>
                <Text style={[s.listIcon, { color: '#ef4444' }]}>↓</Text>
                <Text style={s.listText}>{m}</Text>
              </View>
            ))
          }
        </View>
      </View>

      {/* Top Posts */}
      <View style={s.card}>
        <Text style={s.sectionLabel}>Top 5 Posts</Text>
        <PostsTablePDF posts={period.topPosts} />
      </View>

      {/* Strategy (monthly only) */}
      {isMonthly && 'strategy' in period && (period as MonthGrade).strategy.length > 0 && (
        <View style={[s.card, { borderColor: `${GOLD}30` }]}>
          <Text style={s.sectionLabel}>Next Period Focus</Text>
          {(period as MonthGrade).strategy.map((st, i) => (
            <View key={i} style={s.strategyItem}>
              <Text style={[s.listIcon, { color: GOLD }]}>→</Text>
              <Text style={s.strategyText}>{st}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={s.footer} fixed>
        <Text style={s.footerGold}>DROP CLIX</Text>
        <Text style={s.footerText}>
          Page {pageNum} of {totalPages} · Generated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>
      </View>
    </Page>
  )
}

export function ReportPDFDocument({
  clientName,
  monthGrades,
  weekGrades,
  view,
  selectedIdx,
}: {
  clientName: string
  monthGrades: MonthGrade[]
  weekGrades: WeekGrade[]
  view: 'monthly' | 'weekly'
  selectedIdx: number
}) {
  const isMonthly = view === 'monthly'
  const periods = isMonthly ? monthGrades : weekGrades
  const selected = periods[selectedIdx]

  if (!selected) return null

  return (
    <Document>
      <PeriodPage
        period={selected}
        isMonthly={isMonthly}
        clientName={clientName}
        pageNum={1}
        totalPages={1}
      />
    </Document>
  )
}
