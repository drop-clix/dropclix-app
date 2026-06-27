import { MetaLogo } from '@/components/portal/MetaLogo'

export type PlatformLogoKey = 'instagram' | 'tiktok' | 'youtube' | 'meta_ads'

export function InstagramLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="platform-ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffd600" />
          <stop offset="50%" stopColor="#ff0069" />
          <stop offset="100%" stopColor="#7638fa" />
        </linearGradient>
      </defs>
      <path fill="url(#platform-ig-gradient)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

export function TikTokLogo({ color = '#2dd4bf', size = 17 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill={color} d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  )
}

export function YouTubeLogo({ color = '#4cc9ff', size = 19 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M23.5 6.2s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.6 2 12 2 12 2s-4.6 0-7.3.1c-.6.1-1.9.1-3 1.3C.8 4.2.5 6.2.5 6.2S.2 8.5.2 10.8v2.1c0 2.3.3 4.6.3 4.6s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.2 21.7 12 21.8 12 21.8s4.6 0 7.3-.2c.6-.1 1.9-.1 3-1.2.9-.8 1.2-2.8 1.2-2.8s.3-2.3.3-4.6v-2.1C23.8 8.5 23.5 6.2 23.5 6.2zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z" />
    </svg>
  )
}

export function PlatformLogo({
  platform,
  color,
  size,
}: {
  platform: PlatformLogoKey
  color: string
  size?: number
}) {
  if (platform === 'instagram') return <InstagramLogo size={size ?? 18} />
  if (platform === 'tiktok') return <TikTokLogo color={color} size={size ?? 17} />
  if (platform === 'meta_ads') return <MetaLogo color={color} size={size ?? 18} />
  return <YouTubeLogo color={color} size={size ?? 19} />
}

export function PlatformMark({
  platform,
  color,
  size = 34,
}: {
  platform: PlatformLogoKey
  color: string
  size?: number
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        border: `1px solid ${color}55`,
        background: `${color}14`,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <PlatformLogo platform={platform} color={color} />
    </span>
  )
}
