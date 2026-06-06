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
