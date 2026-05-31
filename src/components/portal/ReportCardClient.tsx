'use client'
import { useState } from 'react'
import type { WeekGrade, MonthGrade, PostSummary } from '@/app/(dashboard)/report-card/page'

type View = 'monthly' | 'weekly'

const gradeColor = (g: string) =>
  g === 'A' ? '#c9a96e' : g === 'B' ? '#4ade80' : g === 'C' ? '#f59e0b' : g === 'D' ? '#f97316' : '#ef4444'

const fmtN = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M'
  : n >= 1_000 ? (n / 1_000).toFixed(1) + 'K'
  : n.toLocaleString()

function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? (score / max) * 100 : 0
  const barColor = pct >= 80 ? '#4ade80' : pct >= 55 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: '#555', letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 10, color: '#f2ede4' }}>
          {score}<span style={{ color: '#444' }}>/{max}</span>
        </span>
      </div>
      <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2 }}>
        <div style={{
          height: '100%', width: `${Math.min(pct, 100)}%`,
          background: barColor, borderRadius: 2, transition: 'width .4s ease',
        }} />
      </div>
    </div>
  )
}

function PostsTable({ posts }: { posts: PostSummary[] }) {
  if (!posts.length) {
    return <p style={{ fontSize: 10, color: '#444', padding: '6px 0' }}>No posts this period.</p>
  }
  return (
    <div>
      <div style={{
        display: 'flex', gap: 8, fontSize: 9, color: '#444',
        letterSpacing: '.12em', textTransform: 'uppercase',
        paddingBottom: 6, borderBottom: '1px solid #141414', marginBottom: 2,
      }}>
        <span style={{ minWidth: 44 }}>ID</span>
        <span style={{ flex: 1 }}>Title</span>
        <span style={{ minWidth: 52, textAlign: 'right' }}>Views</span>
        <span style={{ minWidth: 44, textAlign: 'right' }}>ER%</span>
        <span style={{ minWidth: 74, textAlign: 'right' }}>Decision</span>
      </div>
      {posts.map(p => {
        const decColor = p.decision === 'Double Down' ? '#c9a96e'
          : p.decision === 'Iterate' ? '#f59e0b' : '#ef4444'
        const erColor = p.er >= 12 ? '#4ade80' : p.er >= 7 ? '#60a5fa' : p.er >= 4 ? '#f59e0b' : '#ef4444'
        return (
          <div key={p.postId} style={{
            display: 'flex', gap: 8, alignItems: 'center',
            padding: '6px 0', borderBottom: '1px solid #0d0d0d', fontSize: 10,
          }}>
            <span style={{ color: '#c9a96e', fontFamily: 'monospace', minWidth: 44, fontSize: 9 }}>{p.postId}</span>
            <span style={{ flex: 1, color: '#f2ede4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
            <span style={{ color: '#888', minWidth: 52, textAlign: 'right' }}>{fmtN(p.views)}</span>
            <span style={{ color: erColor, minWidth: 44, textAlign: 'right' }}>{p.er.toFixed(1)}%</span>
            <span style={{ color: decColor, minWidth: 74, textAlign: 'right', fontSize: 9, letterSpacing: '.04em' }}>{p.decision}</span>
          </div>
        )
      })}
    </div>
  )
}

export function ReportCardClient({
  weekGrades, monthGrades,
}: {
  weekGrades: WeekGrade[]
  monthGrades: MonthGrade[]
}) {
  const [view, setView]       = useState<View>('monthly')
  const [selMonth, setSelMonth] = useState(Math.max(0, monthGrades.length - 1))
  const [selWeek, setSelWeek]   = useState(Math.max(0, weekGrades.length - 1))

  const isMonthly = view === 'monthly'
  const periods   = isMonthly ? monthGrades : weekGrades
  const selIdx    = isMonthly ? selMonth : selWeek
  const setSel    = isMonthly
    ? (i: number) => setSelMonth(i)
    : (i: number) => setSelWeek(i)
  const current   = periods[selIdx] as (MonthGrade | WeekGrade) | undefined

  if (!current && periods.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#444' }}>No data available yet. Post content to see your report card.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 200px)', overflow: 'hidden' }}>

      {/* ── Left: Period List ──────────────────────────────────── */}
      <div style={{ width: 230, borderRight: '1px solid #141414', overflowY: 'auto', flexShrink: 0 }}>
        {/* View Toggle */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #141414', display: 'flex', gap: 6 }}>
          {(['monthly', 'weekly'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                flex: 1, padding: '6px 0',
                fontSize: 9, fontWeight: 500,
                letterSpacing: '.14em', textTransform: 'uppercase',
                background: view === v ? 'rgba(201,169,110,.08)' : 'transparent',
                color: view === v ? '#c9a96e' : '#3a3a3a',
                border: `1px solid ${view === v ? 'rgba(201,169,110,.3)' : '#1e1e1e'}`,
                borderRadius: 3, cursor: 'pointer', transition: 'all .2s',
              }}
            >
              {v === 'monthly' ? 'Monthly' : 'Weekly'}
            </button>
          ))}
        </div>

        {/* Period Items — newest first */}
        {[...periods].reverse().map((p, revIdx) => {
          const realIdx = periods.length - 1 - revIdx
          const active  = realIdx === selIdx
          const gc      = gradeColor(p.grade)
          const key     = isMonthly
            ? (p as MonthGrade).monthKey
            : (p as WeekGrade).weekStart
          return (
            <button
              key={key}
              onClick={() => setSel(realIdx)}
              style={{
                width: '100%', padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
                background: active ? 'rgba(201,169,110,.05)' : 'transparent',
                borderLeft: `2px solid ${active ? '#c9a96e' : 'transparent'}`,
                borderRight: 'none', borderTop: 'none',
                borderBottom: '1px solid #0d0d0d',
                cursor: 'pointer', textAlign: 'left', transition: 'background .15s',
              }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: 5, flexShrink: 0,
                background: `${gc}18`, border: `1px solid ${gc}35`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, color: gc,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                {p.grade}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 10, color: active ? '#f2ede4' : '#777', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.label}
                </p>
                <p style={{ fontSize: 9, color: '#3a3a3a', margin: '1px 0 0' }}>
                  {p.score}/100 · {p.gradeLabel}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Right: Detail Panel ───────────────────────────────── */}
      {current ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 28 }}>
            <div style={{
              width: 76, height: 76, borderRadius: 12, flexShrink: 0,
              background: `${gradeColor(current.grade)}10`,
              border: `1.5px solid ${gradeColor(current.grade)}35`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 32, fontWeight: 600, lineHeight: 1,
                color: gradeColor(current.grade),
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                {current.grade}
              </span>
              <span style={{ fontSize: 9, color: gradeColor(current.grade), opacity: .65, marginTop: 2 }}>
                {current.score}/100
              </span>
            </div>
            <div>
              <h2 style={{
                fontSize: 22, fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 300, color: '#f2ede4', margin: 0,
              }}>
                {current.label}
              </h2>
              <p style={{ fontSize: 12, color: gradeColor(current.grade), margin: '4px 0 8px' }}>
                {current.gradeLabel}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 10, color: '#555' }}>
                <span><span style={{ color: '#f2ede4' }}>{current.posts}</span> posts</span>
                <span><span style={{ color: '#f2ede4' }}>{fmtN(current.views)}</span> views</span>
                <span><span style={{ color: '#f2ede4' }}>{current.avgER.toFixed(1)}%</span> avg ER</span>
                <span><span style={{ color: '#f2ede4' }}>{current.eliteCount}</span> elite</span>
                {isMonthly && 'followers' in current && (
                  <span><span style={{ color: '#f2ede4' }}>+{(current as MonthGrade).followers.toLocaleString()}</span> followers</span>
                )}
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#333', marginBottom: 12 }}>
              Score Breakdown
            </p>
            <div style={{ background: '#0a0a0a', border: '1px solid #141414', borderRadius: 6, padding: '18px 22px' }}>
              {current.components.map(c => (
                <ScoreBar key={c.label} label={c.label} score={c.score} max={c.max} />
              ))}
            </div>
          </div>

          {/* Wins & Misses */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
            <div style={{ background: '#0a0a0a', border: '1px solid #141414', borderRadius: 6, padding: '16px 20px' }}>
              <p style={{ fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 12 }}>Wins</p>
              {current.wins.length === 0
                ? <p style={{ fontSize: 10, color: '#333' }}>No wins logged this period.</p>
                : current.wins.map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11, color: '#aaa', lineHeight: 1.55 }}>
                    <span style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }}>✓</span>
                    <span>{w}</span>
                  </div>
                ))
              }
            </div>
            <div style={{ background: '#0a0a0a', border: '1px solid #141414', borderRadius: 6, padding: '16px 20px' }}>
              <p style={{ fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 12 }}>Misses</p>
              {current.misses.length === 0
                ? <p style={{ fontSize: 10, color: '#333' }}>Clean sheet — no misses this period.</p>
                : current.misses.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11, color: '#aaa', lineHeight: 1.55 }}>
                    <span style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }}>↓</span>
                    <span>{m}</span>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Top Posts */}
          <div style={{ background: '#0a0a0a', border: '1px solid #141414', borderRadius: 6, padding: '16px 22px', marginBottom: 24 }}>
            <p style={{ fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#333', marginBottom: 12 }}>Top Posts</p>
            <PostsTable posts={current.topPosts} />
          </div>

          {/* Monthly Strategy */}
          {isMonthly && 'strategy' in current && (current as MonthGrade).strategy.length > 0 && (
            <div style={{
              background: 'rgba(201,169,110,.04)',
              border: '1px solid rgba(201,169,110,.14)',
              borderRadius: 6, padding: '16px 22px',
            }}>
              <p style={{ fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: 12 }}>
                Next Period Focus
              </p>
              {(current as MonthGrade).strategy.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 11, color: '#999', lineHeight: 1.65 }}>
                  <span style={{ color: '#c9a96e', flexShrink: 0, marginTop: 2 }}>→</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}

        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 12, color: '#333' }}>Select a period to view details.</p>
        </div>
      )}
    </div>
  )
}
