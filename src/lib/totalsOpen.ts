/**
 * Whether the Collection page's four totals are opened out.
 *
 * They answer "how am I doing", which is worth a glance and then worth
 * getting out of the way: on a phone they are 252px before the first set.
 * Folded up, the completion bar stays — that's the one you actually watch —
 * and the rest is a tap away.
 *
 * Kept per device alongside grid density, sort order and which sets are
 * opened out. Open is the default: a first visit should show what the app is
 * for, not hide it.
 */
const STORAGE_KEY = 'pkm-collector:totalsOpen'

export function loadTotalsOpen(): boolean {
  try {
    // Only an explicit "closed" closes it, so a cleared or unreadable store
    // opens rather than hiding the figures for no reason anyone could see.
    return localStorage.getItem(STORAGE_KEY) !== 'closed'
  } catch {
    return true
  }
}

export function saveTotalsOpen(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed')
  } catch {
    /* a preference isn't worth failing over */
  }
}
