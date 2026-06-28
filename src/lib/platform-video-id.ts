export type PlatformVideoIdPlatform = 'ig' | 'tt' | 'yt' | 'lf'

export function parsePlatformVideoId(input: string, platform: PlatformVideoIdPlatform | string): string {
  const value = input.trim()
  if (!value) return ''

  if (platform === 'yt' || platform === 'lf') {
    const match = value.match(/youtu\.be\/([A-Za-z0-9_-]{10,12})/) ??
      value.match(/[?&]v=([A-Za-z0-9_-]{10,12})/) ??
      value.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{10,12})/)
    if (match) return match[1]
  }

  if (platform === 'tt') {
    const match = value.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/)
    if (match) return match[1]
  }

  if (platform === 'ig') {
    const match = value.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/)
    if (match) return match[1]
  }

  if (!value.startsWith('http')) return value
  return ''
}
