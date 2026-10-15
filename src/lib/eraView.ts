import type { Era } from './trackedSets'

/**
 * Which collection the home page is showing, vintage or modern.
 *
 * Kept per device like the other ways of looking: the one you opened last is
 * the one you're working on.
 */
const STORAGE_KEY = 'pkm-collector:eraView'

export function loadEraView(): Era {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'modern' ? 'modern' : 'vintage'
  } catch {
    return 'vintage'
  }
}

export function saveEraView(era: Era): void {
  try {
    localStorage.setItem(STORAGE_KEY, era)
  } catch {
    /* a preference isn't worth failing over */
  }
}
