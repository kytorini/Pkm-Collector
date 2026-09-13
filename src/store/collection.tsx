import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { UNASSESSED } from '../lib/condition'
import { entryKey, type CollectionEntry, type CollectionMap, type ConditionId } from '../types'

const STORAGE_KEY = 'pkm-collector:collection:v1'
const DEFAULT_CONDITION_KEY = 'pkm-collector:defaultCondition'

interface CollectionContextValue {
  collection: CollectionMap
  defaultCondition: ConditionId
  setDefaultCondition: (c: ConditionId) => void
  get: (cardId: string, variantId: string) => CollectionEntry | undefined
  /** Flips owned on/off, creating the entry on first touch. */
  toggleOwned: (cardId: string, variantId: string) => void
  update: (cardId: string, variantId: string, patch: Partial<CollectionEntry>) => void
  /**
   * Sets where this slot's price comes from. Unlike `update`, recording a
   * price is not a claim to own the card: a source can be chosen for a card
   * that is still missing, so the cost to finish is right too.
   */
  setPriceOverride: (
    cardId: string,
    variantId: string,
    patch: { priceSource?: string; recorded?: { key: string; value: number | undefined } },
  ) => void
  remove: (cardId: string, variantId: string) => void
  replaceAll: (next: CollectionMap) => void
  /** Sets every quantity back to one, for undoing a bad import mapping. */
  resetQuantities: () => number
  /** Puts every ungraded card back to the unassessed state. */
  resetConditions: () => number
  ownedCount: number
}

const CollectionContext = createContext<CollectionContextValue | null>(null)

function load(): CollectionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CollectionMap) : {}
  } catch {
    return {}
  }
}

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [collection, setCollection] = useState<CollectionMap>(load)
  const [defaultCondition, setDefaultConditionState] = useState<ConditionId>(
    () => (localStorage.getItem(DEFAULT_CONDITION_KEY) as ConditionId) || 'NM',
  )

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collection))
    } catch {
      console.warn('Could not save collection — browser storage is full or blocked.')
    }
  }, [collection])

  const setDefaultCondition = useCallback((c: ConditionId) => {
    setDefaultConditionState(c)
    localStorage.setItem(DEFAULT_CONDITION_KEY, c)
  }, [])

  const get = useCallback(
    (cardId: string, variantId: string) => collection[entryKey(cardId, variantId)],
    [collection],
  )

  const update = useCallback(
    (cardId: string, variantId: string, patch: Partial<CollectionEntry>) => {
      setCollection((prev) => {
        const key = entryKey(cardId, variantId)
        const existing = prev[key]
        const base: CollectionEntry = existing ?? {
          cardId,
          variantId,
          owned: true,
          quantity: 1,
          condition: defaultCondition,
          updatedAt: new Date().toISOString(),
        }
        return { ...prev, [key]: { ...base, ...patch, updatedAt: new Date().toISOString() } }
      })
    },
    [defaultCondition],
  )

  const toggleOwned = useCallback(
    (cardId: string, variantId: string) => {
      setCollection((prev) => {
        const key = entryKey(cardId, variantId)
        const existing = prev[key]
        if (!existing) {
          return {
            ...prev,
            [key]: {
              cardId,
              variantId,
              owned: true,
              quantity: 1,
              condition: defaultCondition,
              updatedAt: new Date().toISOString(),
            },
          }
        }
        // Un-marking records owned: false rather than dropping the entry. A
        // deletion has to carry a timestamp to survive syncing: an absent key
        // is indistinguishable from one the other device hasn't seen yet, so a
        // removed entry would simply be pulled back from the server.
        return { ...prev, [key]: { ...existing, owned: !existing.owned, updatedAt: new Date().toISOString() } }
      })
    },
    [defaultCondition],
  )

  const setPriceOverride = useCallback(
    (
      cardId: string,
      variantId: string,
      patch: { priceSource?: string; recorded?: { key: string; value: number | undefined } },
    ) => {
      setCollection((prev) => {
        const key = entryKey(cardId, variantId)
        const existing = prev[key]
        const base: CollectionEntry = existing ?? {
          cardId,
          variantId,
          owned: false,
          quantity: 1,
          condition: defaultCondition,
          updatedAt: new Date().toISOString(),
        }
        const next: CollectionEntry = { ...base, updatedAt: new Date().toISOString() }

        if (patch.priceSource !== undefined) {
          // "Inherit" is the absence of a choice, not a choice of its own.
          if (patch.priceSource === 'inherit') delete next.priceSource
          else next.priceSource = patch.priceSource
        }

        if (patch.recorded) {
          const { key: where, value } = patch.recorded
          const prices = { ...(next.manualPrices ?? {}) }
          // A hand-entered price never refreshes itself, so it is stamped with
          // the day it was taken and re-stamped whenever it is changed.
          const stamps = { ...(next.manualPricesAt ?? {}) }
          if (value == null || Number.isNaN(value)) {
            delete prices[where]
            delete stamps[where]
          } else {
            prices[where] = value
            stamps[where] = next.updatedAt
          }
          if (Object.keys(prices).length > 0) next.manualPrices = prices
          else delete next.manualPrices
          if (Object.keys(stamps).length > 0) next.manualPricesAt = stamps
          else delete next.manualPricesAt
          // The single pre-tagging field is superseded once one is written.
          if (where === 'own') delete next.manualPrice
        }

        return { ...prev, [key]: next }
      })
    },
    [defaultCondition],
  )

  /**
   * Clears everything recorded about a card. Like un-marking, this leaves a
   * dated "not owned" entry behind rather than removing the key, so the
   * clearing propagates instead of being undone by the next sync.
   */
  const remove = useCallback(
    (cardId: string, variantId: string) => {
      setCollection((prev) => ({
        ...prev,
        [entryKey(cardId, variantId)]: {
          cardId,
          variantId,
          owned: false,
          quantity: 1,
          condition: defaultCondition,
          updatedAt: new Date().toISOString(),
        },
      }))
    },
    [defaultCondition],
  )

  const replaceAll = useCallback((next: CollectionMap) => setCollection(next), [])

  const resetConditions = useCallback(() => {
    let changed = 0
    setCollection((prev) => {
      const next: CollectionMap = {}
      const now = new Date().toISOString()
      for (const [key, entry] of Object.entries(prev)) {
        // A graded card has already been assessed, by someone with a loupe.
        const skip = Boolean(entry.graded) || entry.condition === UNASSESSED
        if (skip) {
          next[key] = entry
          continue
        }
        changed++
        next[key] = { ...entry, condition: UNASSESSED, updatedAt: now }
      }
      return next
    })
    return changed
  }, [])

  const resetQuantities = useCallback(() => {
    let changed = 0
    setCollection((prev) => {
      const next: CollectionMap = {}
      for (const [key, entry] of Object.entries(prev)) {
        if (entry.quantity > 1) changed++
        next[key] = entry.quantity > 1 ? { ...entry, quantity: 1 } : entry
      }
      return next
    })
    return changed
  }, [])

  const ownedCount = useMemo(
    () => Object.values(collection).filter((e) => e.owned).length,
    [collection],
  )

  const value = useMemo(
    () => ({ collection, defaultCondition, setDefaultCondition, get, toggleOwned, update, setPriceOverride, remove, replaceAll, resetQuantities, resetConditions, ownedCount }),
    [collection, defaultCondition, setDefaultCondition, get, toggleOwned, update, setPriceOverride, remove, replaceAll, resetQuantities, resetConditions, ownedCount],
  )

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext)
  if (!ctx) throw new Error('useCollection must be used inside <CollectionProvider>')
  return ctx
}
