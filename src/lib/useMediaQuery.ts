import { useCallback, useSyncExternalStore } from 'react'

/**
 * Where a control lives differs by screen: a phone has no room for a row of
 * set-once preferences, a tablet does. Done in JS rather than by rendering
 * both and hiding one in CSS, which would put two copies of every control in
 * the page for a screen reader to read out and for a test to trip over.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** The breakpoint the stylesheet calls a phone. */
export const usePhone = (): boolean => useMediaQuery('(max-width: 700px)')
