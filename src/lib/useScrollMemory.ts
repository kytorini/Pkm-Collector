import { useEffect, useLayoutEffect, useRef } from 'react'

/** How long to keep insisting on the restored position while a page settles. */
const SETTLE_MS = 700
/** Frames of unchanged page height that count as "settled". */
const STILL_FRAMES = 6

/**
 * Remembers where you were on each page.
 *
 * The app is one document behind a hash router, so nothing resets the scroll
 * when the route changes: scrolling halfway down the collection and tapping
 * Lot left you halfway down the lot, at an offset that meant nothing there.
 * Each page now keeps its own position and gets it back on return.
 *
 * Held in memory for the session rather than stored. This is where you were a
 * moment ago, not a preference — and a reload landing you mid-page, before the
 * card data has even been read back, would be its own kind of strange.
 */
export function useScrollMemory(key: string): void {
  const positions = useRef(new Map<string, number>())
  const current = useRef(key)
  /** True while we are still placing the page, so a shift isn't mistaken for you. */
  const placing = useRef(false)

  useEffect(() => {
    // Otherwise the browser restores a position of its own on back and
    // forward, and the two answers fight.
    const had = 'scrollRestoration' in history
    const previous = had ? history.scrollRestoration : undefined
    if (had) history.scrollRestoration = 'manual'

    const onScroll = () => {
      if (!placing.current) positions.current.set(current.current, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (had && previous) history.scrollRestoration = previous
    }
  }, [])

  useLayoutEffect(() => {
    if (current.current === key) return
    current.current = key

    const to = positions.current.get(key) ?? 0
    window.scrollTo(0, to)
    if (to === 0) return

    /*
     * One jump isn't enough. A page keeps growing for a few frames after it
     * mounts — a stored figure read back, artwork taking its size — and when
     * that growth is above the fold the browser's scroll anchoring drags the
     * position along with it, landing you a screen below where you left off.
     * So hold the offset until the page stops changing height under it.
     */
    placing.current = true
    const startedAt = performance.now()
    let height = document.documentElement.scrollHeight
    let still = 0
    let frame = 0

    /*
     * Only ever stops the placing; it must not record where we ended up. As
     * cleanup this runs after React has swapped in the next page, by which
     * point a shorter page has already clamped the scroll to its own height —
     * recording then would write that clamp over the position you left. The
     * scroll listener keeps the live figure; nothing else needs to.
     */
    const done = () => {
      placing.current = false
      cancelAnimationFrame(frame)
      for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
        window.removeEventListener(type, done)
      }
    }

    const hold = () => {
      if (!placing.current) return
      if (Math.abs(window.scrollY - to) > 0.5) window.scrollTo(0, to)
      const now = document.documentElement.scrollHeight
      if (now === height) still++
      else {
        height = now
        still = 0
      }
      if (still >= STILL_FRAMES || performance.now() - startedAt > SETTLE_MS) done()
      else frame = requestAnimationFrame(hold)
    }

    frame = requestAnimationFrame(hold)
    // Whatever we think the page is still doing, you asked to be elsewhere.
    for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
      window.addEventListener(type, done, { passive: true })
    }
    return done
  }, [key])
}
