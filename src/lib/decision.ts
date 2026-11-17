// Canonical ER formula: (likes + comments + shares + saves) / views × 100
// Thresholds: ≥12% = Double Down, 4–11.9% = Iterate, <4% = Kill

export function erToDecision(er: number): string {
  if (er >= 12) return 'Double Down'
  if (er >= 4) return 'Iterate'
  return 'Kill'
}

export function computeDecision(
  likes: number,
  comments: number,
  shares: number,
  saves: number,
  views: number,
): string | null {
  if (!views) return null
  const er = ((likes + comments + shares + saves) / views) * 100
  return erToDecision(er)
}

// ── S78: one Decision rule for IG, TikTok and YouTube ────────────────────────
// Decision = the platform's locked ER formula on the LIVE window, falling back
// to eom → w7 → w3 → w24 only when no live row exists. Thresholds are
// erToDecision() above. Pure: no I/O, safe to call from server, client or scripts.

export type DecisionPlatform = 'ig' | 'tt' | 'yt'

export type DecisionWindow = {
  views?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
  saves?: number | null
  followers?: number | null
}

export const DECISION_WINDOW_ORDER = ['live', 'eom', 'w7', 'w3', 'w24'] as const

/** Platform from a posts row's own ID prefix: #ig → ig, #tt → tt, #yt / #LF → yt. */
export function platformFromPostId(postId: string | null | undefined): DecisionPlatform | null {
  const id = (postId ?? '').trim().toLowerCase()
  if (id.startsWith('#ig')) return 'ig'
  if (id.startsWith('#tt')) return 'tt'
  if (id.startsWith('#yt') || id.startsWith('#lf')) return 'yt'
  return null
}

/**
 * Locked ER% for one window, or null when views is 0/missing.
 * IG: post_analytics.views is Reach. IG/TT: (likes + comments + shares + saves) / views.
 * YT: (likes + comments + shares + subscribers gained) / views. NULL metrics count as 0.
 */
export function platformER(platform: DecisionPlatform, w: DecisionWindow | null | undefined): number | null {
  const views = Number(w?.views ?? 0)
  if (!w || !views || views <= 0) return null
  const base = Number(w.likes ?? 0) + Number(w.comments ?? 0) + Number(w.shares ?? 0)
  const fourth = platform === 'yt' ? Number(w.followers ?? 0) : Number(w.saves ?? 0)
  return ((base + fourth) / views) * 100
}

/**
 * Decision from a posts row's windows. Uses the live window whenever a live
 * row exists (a live row with 0 views yields null). Only when there is no live
 * row does it fall back to the first locked window with views > 0, in
 * eom → w7 → w3 → w24 order. Returns null when there is no usable data or the
 * platform is unknown.
 */
export function decisionFromWindows(
  platform: DecisionPlatform | null,
  windows: Partial<Record<string, DecisionWindow | null | undefined>>,
): string | null {
  if (!platform) return null
  if (windows.live != null) {
    const er = platformER(platform, windows.live)
    return er == null ? null : erToDecision(er)
  }
  for (const key of DECISION_WINDOW_ORDER) {
    if (key === 'live') continue
    const er = platformER(platform, windows[key])
    if (er != null) return erToDecision(er)
  }
  return null
}
