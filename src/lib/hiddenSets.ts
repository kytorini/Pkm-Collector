import { useSyncExternalStore } from 'react'

/**
 * Sets the collector isn't chasing. A hidden set drops out of the Collection
 * page, out of its totals, and out of the Sets page — one choice, applied
 * everywhere, rather than a per-page filter to keep in step.
 *
 * Nothing is deleted: the cards stay cached, a direct link to the set still
 * opens it, and un-hiding puts everything back.
 *
 * Kept per device rather than synced, alongside grid density: it's a view
 * preference, not collection data.
 *
 * Held here as a small store rather than in each view's state so that two
 * mounted views can't disagree about what is hidden.
 */
const STORAGE_KEY = 'pkm-collector:hiddenSets'

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

let hidden: string[] = read()
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  // The same app open in a second tab, or the other half of a split screen.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    hidden = read()
    emit()
  })
}

export function loadHiddenSets(): string[] {
  return hidden
}

export function saveHiddenSets(ids: string[]): void {
  hidden = ids
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* a preference isn't worth failing over */
  }
  emit()
}

export function toggleHiddenSet(id: string): void {
  saveHiddenSets(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id])
}

export function showAllSets(): void {
  saveHiddenSets([])
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** The hidden set ids, re-rendering every view that reads them on a change. */
export function useHiddenSets(): string[] {
  return useSyncExternalStore(subscribe, loadHiddenSets, loadHiddenSets)
}
