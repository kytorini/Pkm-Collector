import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadSetCards, pricesAreStale, readCachedSet } from '../api/pokemonTcg'
import { VINTAGE_SETS } from '../data/vintageSets'
import type { ApiCard } from '../types'

export interface SyncProgress {
  running: boolean
  done: number
  total: number
  current: string | null
}

interface LibraryContextValue {
  cardsBySet: Record<string, ApiCard[]>
  fetchedAt: Record<string, number>
  /** True once the cache has been read, whether or not it held anything. */
  hydrated: boolean
  /** True when no set has card data yet — the first-run state. */
  empty: boolean
  progress: SyncProgress
  error: string | null
  syncAll: (force?: boolean) => Promise<void>
  syncSet: (setId: string, force?: boolean) => Promise<void>
  allCards: ApiCard[]
  /** Sets whose prices are older than a day. */
  staleSets: string[]
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [cardsBySet, setCardsBySet] = useState<Record<string, ApiCard[]>>({})
  const [fetchedAt, setFetchedAt] = useState<Record<string, number>>({})
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncProgress>({ running: false, done: 0, total: 0, current: null })
  const syncing = useRef(false)

  useEffect(() => {
    let dead = false
    void (async () => {
      const cards: Record<string, ApiCard[]> = {}
      const stamps: Record<string, number> = {}
      for (const set of VINTAGE_SETS) {
        const cached = await readCachedSet(set.id)
        if (cached) {
          cards[set.id] = cached.cards
          stamps[set.id] = cached.fetchedAt
        }
      }
      if (dead) return
      setCardsBySet(cards)
      setFetchedAt(stamps)
      setHydrated(true)
    })()
    return () => {
      dead = true
    }
  }, [])

  const syncSet = useCallback(async (setId: string, force = false) => {
    try {
      const result = await loadSetCards(setId, force)
      setCardsBySet((prev) => ({ ...prev, [setId]: result.cards }))
      setFetchedAt((prev) => ({ ...prev, [setId]: result.fetchedAt }))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the Pokémon TCG API.')
      throw err
    }
  }, [])

  const syncAll = useCallback(
    async (force = false) => {
      if (syncing.current) return
      syncing.current = true
      setProgress({ running: true, done: 0, total: VINTAGE_SETS.length, current: null })
      let failed = false
      for (const [i, set] of VINTAGE_SETS.entries()) {
        setProgress({ running: true, done: i, total: VINTAGE_SETS.length, current: set.name })
        try {
          await syncSet(set.id, force)
        } catch {
          failed = true
        }
      }
      setProgress({ running: false, done: VINTAGE_SETS.length, total: VINTAGE_SETS.length, current: null })
      syncing.current = false
      if (!failed) setError(null)
    },
    [syncSet],
  )

  const allCards = useMemo(() => Object.values(cardsBySet).flat(), [cardsBySet])
  const empty = hydrated && allCards.length === 0
  const staleSets = useMemo(
    () => Object.entries(fetchedAt).filter(([, at]) => pricesAreStale(at)).map(([id]) => id),
    [fetchedAt],
  )

  const value = useMemo(
    () => ({ cardsBySet, fetchedAt, hydrated, empty, progress, error, syncAll, syncSet, allCards, staleSets }),
    [cardsBySet, fetchedAt, hydrated, empty, progress, error, syncAll, syncSet, allCards, staleSets],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used inside <LibraryProvider>')
  return ctx
}
