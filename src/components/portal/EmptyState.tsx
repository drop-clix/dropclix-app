'use client'

// ── SVG icon library ──────────────────────────────────────────────────────────

function ChartIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20V10M8 20V5M13 20V13M18 20V7" />
    </svg>
  )
}
function PipelineIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h18M3 12h18M3 16h18" />
    </svg>
  )
}
function TriangleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20L12 4l9 16H3z" />
    </svg>
  )
}
function VideoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4l13 8-13 8V4z" />
    </svg>
  )
}
function AdIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M9 5h4.5a3 3 0 010 6H9m0 4h5" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  )
}
function TargetIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}
function GridIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

export const EMPTY_ICONS = {
  chart:    <ChartIcon />,
  pipeline: <PipelineIcon />,
  triangle: <TriangleIcon />,
  video:    <VideoIcon />,
  ad:       <AdIcon />,
  calendar: <CalendarIcon />,
  target:   <TargetIcon />,
  grid:     <GridIcon />,
} as const

export type EmptyIconKey = keyof typeof EMPTY_ICONS

// ── Component ─────────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  headline,
  body,
  action,
}: {
  icon: EmptyIconKey
  headline: string
  body: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div
      style={{
        minHeight: 240,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px',
        background: '#080808',
        border: '1px solid #141414',
        textAlign: 'center',
        gap: 0,
      }}
    >
      <div style={{ color: '#555', marginBottom: 20 }}>
        {EMPTY_ICONS[icon]}
      </div>
      <p style={{
        fontSize: 13,
        fontWeight: 300,
        color: '#f2ede4',
        marginBottom: 8,
        letterSpacing: '.01em',
      }}>
        {headline}
      </p>
      <p style={{
        fontSize: 11,
        fontWeight: 300,
        color: '#555',
        maxWidth: 360,
        lineHeight: 1.7,
        marginBottom: action ? 24 : 0,
      }}>
        {body}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            padding: '9px 20px',
            background: 'rgba(201,169,110,.1)',
            border: '1px solid rgba(201,169,110,.3)',
            color: '#c9a96e',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all .15s',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
