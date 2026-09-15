/**
 * Which sets are opened out on the Collection page.
 *
 * Remembered so the page comes back the way you left it: opening a set,
 * stepping into a print run and coming back used to collapse everything, which
 * made working through one set a matter of re-opening it every time.
 *
 * Kept per device rather than synced, alongside grid density and hidden sets:
 * it's where you happen to be looking, not something you own.
 */
const STORAGE_KEY = 'pkm-collector:openSets'

export function loadOpenSets(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function saveOpenSets(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* a preference isn't worth failing over */
  }
}
