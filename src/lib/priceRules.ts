import { useSyncExternalStore } from 'react'
import { AUTO, type PriceSourceId } from './priceSources'

/**
 * The price source chosen for the whole collection, for a set, and for one
 * print run within a set.
 *
 * The print run is the unit that matters: Base 1st Edition can have no feed
 * of its own while Unlimited is perfectly priced, and they are different
 * markets besides. A set-wide choice still exists, as the shorthand for "all
 * the runs in here", and a run may override it.
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
  /** setId -> source. Applies to the runs in it that have no choice. */
  bySet: Record<string, PriceSourceId>
  /** `setId::variantId` -> source. The most specific rule short of a card. */
  byVariant: Record<string, PriceSourceId>
}

export const DEFAULT_RULES: PriceRules = { collection: AUTO, bySet: {}, byVariant: {} }

export const variantRuleKey = (setId: string, variantId: string) => `${setId}::${variantId}`

function read(): PriceRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_RULES }
    const parsed = JSON.parse(raw) as Partial<PriceRules>
    const strings = (value: unknown): Record<string, PriceSourceId> =>
      value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string'))
        : {}
    return {
      collection: typeof parsed.collection === 'string' ? parsed.collection : AUTO,
      // Rules stored before print runs could be set individually still apply
      // to the whole set, which is what they always meant.
      bySet: strings(parsed.bySet),
      byVariant: strings(parsed.byVariant),
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

export function setVariantSource(setId: string, variantId: string, id: PriceSourceId): void {
  const key = variantRuleKey(setId, variantId)
  const byVariant = { ...rules.byVariant }
  if (id === 'inherit') delete byVariant[key]
  else byVariant[key] = id
  save({ ...rules, byVariant })
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
