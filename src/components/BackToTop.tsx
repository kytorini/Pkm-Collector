import { useEffect, useState } from 'react'

/**
 * Jumps back to the top of a long list. A vintage set runs to 160+ cards and a
 * search can return 300, which is a lot of flicking to reach the filters again.
 * Stays out of the way until there is something to scroll back from.
 */
export function BackToTop({ threshold = 640 }: { threshold?: number }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <button
      type="button"
      className={`to-top ${shown ? 'is-shown' : ''}`}
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      // Hidden from the tab order and from screen readers while it is invisible,
      // rather than being unmounted, so it can fade rather than pop.
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
    >
      <span aria-hidden>↑</span>
    </button>
  )
}
