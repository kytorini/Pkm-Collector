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
        // Un-marking a card that carries no other detail removes it outright,
        // so the stored collection stays a list of things actually owned.
        const isBare = !existing.notes && existing.pricePaid == null && !existing.graded && existing.quantity <= 1
        if (existing.owned && isBare) {
          const next = { ...prev }
          delete next[key]
          return next
        }
        return { ...prev, [key]: { ...existing, owned: !existing.owned, updatedAt: new Date().toISOString() } }
      })
    },
    [defaultCondition],
  )

  const remove = useCallback((cardId: string, variantId: string) => {
    setCollection((prev) => {
      const next = { ...prev }
      delete next[entryKey(cardId, variantId)]
      return next
    })
  }, [])

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
    () => ({ collection, defaultCondition, setDefaultCondition, get, toggleOwned, update, remove, replaceAll, resetQuantities, resetConditions, ownedCount }),
    [collection, defaultCondition, setDefaultCondition, get, toggleOwned, update, remove, replaceAll, resetQuantities, resetConditions, ownedCount],
  )

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext)
  if (!ctx) throw new Error('useCollection must be used inside <CollectionProvider>')
  return ctx
}
