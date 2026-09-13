/**
 * Sets the collector isn't chasing, hidden from the Collection page.
 *
 * Kept per device rather than synced, alongside grid density: it's a view
 * preference, not collection data. The Sets page still lists everything, so a
 * hidden set is always reachable.
 */
const STORAGE_KEY = 'pkm-collector:hiddenSets'

export function loadHiddenSets(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function saveHiddenSets(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* a preference isn't worth failing over */
  }
}
