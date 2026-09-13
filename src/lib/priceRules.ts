import { useSyncExternalStore } from 'react'
import { AUTO, type PriceSourceId } from './priceSources'

/**
 * The price source chosen for the whole collection, and for individual sets.
 *
 * Per-card choices are not here: those live on the collection entry, because a
 * price you recorded yourself is collection data and travels between devices
 * with the rest of it. These two are a reading preference, kept per device
 * alongside grid density and hidden sets.
 */
const STORAGE_KEY = 'pkm-collector:priceRules'

export interface PriceRules {
  /** Applied to every set that has no choice of its own. */
  collection: PriceSourceId
  /** setId -> source. */
  bySet: Record<string, PriceSourceId>
}

export const DEFAULT_RULES: PriceRules = { collection: AUTO, bySet: {} }

function read(): PriceRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_RULES }
    const parsed = JSON.parse(raw) as Partial<PriceRules>
    return {
      collection: typeof parsed.collection === 'string' ? parsed.collection : AUTO,
      bySet:
        parsed.bySet && typeof parsed.bySet === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.bySet).filter(([, v]) => typeof v === 'string'),
            )
          : {},
    }
  } catch {
    return { ...DEFAULT_RULES }
  }
}

let rules: PriceRules = read()
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    rules = read()
    emit()
  })
}

export function loadPriceRules(): PriceRules {
  return rules
}

function save(next: PriceRules): void {
  rules = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* a preference isn't worth failing over */
  }
  emit()
}

export function setCollectionSource(id: PriceSourceId): void {
  save({ ...rules, collection: id })
}

/** 'inherit' clears the set's own choice rather than storing a placeholder. */
export function setSetSource(setId: string, id: PriceSourceId): void {
  const bySet = { ...rules.bySet }
  if (id === 'inherit') delete bySet[setId]
  else bySet[setId] = id
  save({ ...rules, bySet })
}

export function resetPriceRules(): void {
  save({ ...DEFAULT_RULES })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function usePriceRules(): PriceRules {
  return useSyncExternalStore(subscribe, loadPriceRules, loadPriceRules)
}
