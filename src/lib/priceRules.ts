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
 * Per-card choices are not here: those live on the collection entry and travel
 * with the rest of the collection.
 *
 * These do travel too, and have to. A figure you typed in syncs, but a figure
 * nothing is reading is invisible: fill a print run in on one device, point
 * that run at your readings, and the other device would show blanks because
 * the rule stayed behind. Carried as a whole object with one timestamp —
 * per-key merging would need a timestamp per key to settle an argument that
 * hardly ever happens.
 */
const STORAGE_KEY = 'pkm-collector:priceRules'
/** The rules stamp this device last pushed or adopted. */
const SYNCED_KEY = 'pkm-collector:priceRulesSyncedAt'

export interface PriceRules {
  /** Applied to every set that has no choice of its own. */
  collection: PriceSourceId
  /** setId -> source. Applies to the runs in it that have no choice. */
  bySet: Record<string, PriceSourceId>
  /** `setId::variantId` -> source. The most specific rule short of a card. */
  byVariant: Record<string, PriceSourceId>
  /** When these were last changed here, so a sync can tell which copy is newer. */
  updatedAt?: string
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
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
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
  rules = { ...next, updatedAt: new Date().toISOString() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch {
    /* a preference isn't worth failing over */
  }
  emit()
}

/**
 * Takes the other device's rules wholesale, keeping their timestamp so this
 * doesn't then look like the newer copy and bounce straight back.
 */
export function adoptPriceRules(next: PriceRules): void {
  rules = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  markRulesSynced()
  emit()
}

/** Zero when this device has never changed them, so remote always wins. */
export function rulesChangedAt(): number {
  const at = rules.updatedAt ? Date.parse(rules.updatedAt) : 0
  return Number.isFinite(at) ? at : 0
}

function syncedAt(): number {
  try {
    const at = Number(localStorage.getItem(SYNCED_KEY) ?? 0)
    return Number.isFinite(at) ? at : 0
  } catch {
    return 0
  }
}

/**
 * Whether these rules were last changed *here*, by the person using this
 * device, rather than arriving from the other one.
 *
 * The push decision hangs on this rather than on comparing timestamps with
 * the server. Two devices syncing seconds apart otherwise let a device that
 * had merely re-sent unchanged rules look like the newer copy and overwrite a
 * change the other had just made. A device that has adopted or already pushed
 * has nothing to say, and says nothing.
 */
export function rulesNeedPush(): boolean {
  if (rulesAreDefault()) return false
  return rulesChangedAt() > syncedAt()
}

export function markRulesSynced(): void {
  try {
    localStorage.setItem(SYNCED_KEY, String(rulesChangedAt()))
  } catch {
    /* ignore */
  }
}

/** True when nothing here has been chosen, so there is nothing to push. */
export function rulesAreDefault(): boolean {
  return (
    rules.collection === AUTO &&
    Object.keys(rules.bySet).length === 0 &&
    Object.keys(rules.byVariant).length === 0
  )
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
