'use client'

export function Paginator({
  page,
  total,
  perPage = 10,
  onChange,
}: {
  page: number
  total: number
  perPage?: number
  onChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  if (totalPages <= 1) return null

  return (
    <div
      className="flex items-center justify-center gap-5 py-4"
      style={{ borderTop: '1px solid #141414' }}
    >
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        style={{
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          border: `1px solid ${page <= 1 ? '#1a1a1a' : '#2a2a2a'}`,
          color: page <= 1 ? '#1e1e1e' : '#555',
          cursor: page <= 1 ? 'not-allowed' : 'pointer',
          fontSize: 13,
          transition: 'all .15s',
        }}
        onMouseEnter={e => { if (page > 1) (e.currentTarget as HTMLButtonElement).style.borderColor = '#c9a96e'; (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = page <= 1 ? '#1a1a1a' : '#2a2a2a'; (e.currentTarget as HTMLButtonElement).style.color = page <= 1 ? '#1e1e1e' : '#555' }}
      >
        ←
      </button>

      <span
        className="text-[11px] font-light tracking-[.06em]"
        style={{ color: '#666', fontFamily: 'DM Sans, sans-serif' }}
      >
        Page{' '}
        <span style={{ color: '#c9a96e' }}>{page}</span>
        {' '}of{' '}
        <span style={{ color: '#555' }}>{totalPages}</span>
      </span>

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        style={{
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          border: `1px solid ${page >= totalPages ? '#1a1a1a' : '#2a2a2a'}`,
          color: page >= totalPages ? '#1e1e1e' : '#555',
          cursor: page >= totalPages ? 'not-allowed' : 'pointer',
          fontSize: 13,
          transition: 'all .15s',
        }}
        onMouseEnter={e => { if (page < totalPages) (e.currentTarget as HTMLButtonElement).style.borderColor = '#c9a96e'; (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = page >= totalPages ? '#1a1a1a' : '#2a2a2a'; (e.currentTarget as HTMLButtonElement).style.color = page >= totalPages ? '#1e1e1e' : '#555' }}
      >
        →
      </button>
    </div>
  )
}
