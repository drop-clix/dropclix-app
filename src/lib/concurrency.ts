// Bounded-concurrency runner shared by the platform sync loops.

export type PoolOptions<T> = {
  /** Maximum workers in flight at once (minimum 1). */
  concurrency: number
  /**
   * Checked synchronously before each item starts. Returning false stops the
   * pool from starting any further items; in-flight items still finish.
   * Kept synchronous so items always start in order and `nextIndex` is exact.
   */
  canStart?: () => boolean
  /** Called when a worker throws. The pool never aborts on a worker error. */
  onError: (err: unknown, item: T, index: number) => void
}

export type PoolResult = {
  /** Index of the first item that was NOT started (items.length when all ran). */
  nextIndex: number
  /** True when canStart() stopped the pool before every item started. */
  stoppedEarly: boolean
}

export async function runPool<T>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<void>,
  options: PoolOptions<T>,
): Promise<PoolResult> {
  const concurrency = Math.max(1, Math.floor(options.concurrency))
  let next = 0
  let stopped = false

  async function lane() {
    while (true) {
      if (stopped || next >= items.length) return
      if (options.canStart && !options.canStart()) {
        stopped = true
        return
      }
      const index = next++
      try {
        await worker(items[index], index)
      } catch (err) {
        options.onError(err, items[index], index)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => lane()))
  return { nextIndex: next, stoppedEarly: stopped && next < items.length }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
