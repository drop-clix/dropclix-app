import { useMemo } from 'react'

// Muted tones that work on dark backgrounds
const PALETTE = [
  '#9c7a4e', // warm gold
  '#4a7c9c', // steel blue
  '#9c4a6c', // rose
  '#4a9c6c', // sage green
  '#6c4a9c', // muted purple
  '#9c6c4a', // terracotta
  '#4a9c9c', // teal
  '#7c4a9c', // violet
  '#9c9c4a', // olive
  '#4a5c9c', // indigo
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function usePillarColors(pillars: string[]): Map<string, string> {
  const key = pillars.join('\x00')
  return useMemo(() => {
    const distinct = [...new Set(pillars.filter(Boolean))]
    const map = new Map<string, string>()
    for (const p of distinct) {
      map.set(p, PALETTE[hashString(p) % PALETTE.length])
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
