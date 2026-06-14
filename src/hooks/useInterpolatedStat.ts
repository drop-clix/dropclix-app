'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * Animates a stat value between real API polls by estimating growth rate
 * from two consecutive data points. Snaps to the real value immediately
 * when `current` changes. Only active for posts within maxAgeDays.
 *
 * @param current      Latest real value from DB
 * @param prev         Previous real value (from prev_views column)
 * @param lastUpdated  When `current` was recorded (ISO string)
 * @param prevUpdated  When `prev` was recorded (ISO string)
 * @param maxAgeDays   Stop interpolating after this many days (default 7)
 */
export function useInterpolatedStat(
  current: number,
  prev: number | null,
  lastUpdated: string | null,
  prevUpdated: string | null,
  maxAgeDays: number = 7,
): number {
  const [displayed, setDisplayed] = useState(current)
  const rateRef = useRef(0)
  const lastRef = useRef(current)

  useEffect(() => {
    // Snap immediately to real value
    setDisplayed(current)
    lastRef.current = current

    // Don't interpolate if missing data or data is too old
    if (!prev || !lastUpdated || !prevUpdated) { rateRef.current = 0; return }
    const age = (Date.now() - new Date(lastUpdated).getTime()) / 86400000
    if (age > maxAgeDays) { rateRef.current = 0; return }

    // Compute views/second rate from the two real data points
    const dt = (new Date(lastUpdated).getTime() - new Date(prevUpdated).getTime()) / 1000
    if (dt <= 0) { rateRef.current = 0; return }
    const delta = current - prev
    if (delta <= 0) { rateRef.current = 0; return }

    rateRef.current = delta / dt
  }, [current, prev, lastUpdated, prevUpdated, maxAgeDays])

  useEffect(() => {
    if (rateRef.current <= 0) return

    const interval = setInterval(() => {
      setDisplayed(prev => {
        const next = Math.round(prev + rateRef.current)
        lastRef.current = next
        return next
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [current]) // restart interval when a new real value arrives

  return displayed
}

/**
 * Format a potentially large interpolating number with locale separators.
 * Avoids jarring decimal places during animation.
 */
export function fmtInterpolated(n: number): string {
  return Math.round(n).toLocaleString()
}
