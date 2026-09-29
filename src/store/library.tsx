import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dropSetCache, loadSetCards, pricesAreStale, readCachedSet } from '../api/pokemonTcg'
import { loadTcgdexSet } from '../api/tcgdex'
import { idbDelete, idbGet, idbSet } from '../lib/idb'
import { getRegion } from '../lib/regions'
import { loadTrackedSets, useTrackedSets, type TrackedSet } from '../lib/trackedSets'
import type { ApiCard } from '../types'

/**
 * Cards for a set that isn't pokemontcg.io's. That API's own client owns its
 * cache; this is the same shape for everyone else, so the store can treat a
 * Japanese set exactly like an English one.
 */
interface CachedForeign {
  setId: string
  cards: ApiCard[]
  fetchedAt: number
}

async function loadForeignSet(set: TrackedSet, force: boolean): Promise<{ cards: ApiCard[]; fetchedAt: number }> {
  const key = `cards:${set.id}`
  const cached = await idbGet<CachedForeign>(key)
  // Card text and artwork never change, and there are no prices to go stale,
  // so a cached foreign set is refetched only when asked for.
  if (cached && !force) return { cards: cached.cards, fetchedAt: cached.fetchedAt }
  const region = getRegion(set.region)
  const cards = await loadTcgdexSet(set.region, region.lang, set.sourceId)
  const fetchedAt = Date.now()
  await idbSet(key, { setId: set.id, cards, fetchedAt } satisfies CachedForeign)
  return { cards, fetchedAt }
}

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
  /** Sets whose last sync attempt failed, so they can be retried on their own. */
  failedSets: string[]
  syncAll: (force?: boolean, only?: string[]) => Promise<void>
  syncSet: (setId: string, force?: boolean) => Promise<void>
  /** Drops a removed set's cached cards. Collection entries are left alone. */
  forgetSet: (setId: string) => Promise<void>
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
  const [failedSets, setFailedSets] = useState<string[]>([])
  const [progress, setProgress] = useState<SyncProgress>({ running: false, done: 0, total: 0, current: null })
  const syncing = useRef(false)
  const trackedSets = useTrackedSets()

  /*
   * Only what you track gets read back, and only what you track was ever
   * fetched. Re-runs when the list changes, so a set added on this device —
   * or arriving from the other one over sync — is picked up without a reload.
   */
  useEffect(() => {
    let dead = false
    void (async () => {
      const cards: Record<string, ApiCard[]> = {}
      const stamps: Record<string, number> = {}
      for (const set of trackedSets) {
        const cached =
          set.source === 'tcgdex'
            ? await idbGet<CachedForeign>(`cards:${set.id}`)
            : await readCachedSet(set.id)
        if (cached) {
          cards[set.id] = cached.cards
          stamps[set.id] = cached.fetchedAt
        }
      }
      if (dead) return
      // Anything no longer tracked drops out of memory here rather than
      // lingering in totals it no longer belongs to.
      setCardsBySet(cards)
      setFetchedAt(stamps)
      setHydrated(true)
    })()
    return () => {
      dead = true
    }
  }, [trackedSets])

  const syncSet = useCallback(
    async (setId: string, force = false) => {
      /*
       * Read from the store, not from this render's copy. Adding a set and
       * fetching it happen in the same tick, before React has re-rendered
       * with the new list — a snapshot taken here would not contain the set
       * being fetched, and every Japanese one would be looked for in the
       * English API.
       */
      const set = loadTrackedSets().find((s) => s.id === setId)
      try {
        const result =
          set && set.source === 'tcgdex'
            ? await loadForeignSet(set, force)
            : await loadSetCards(setId, force)
        setCardsBySet((prev) => ({ ...prev, [setId]: result.cards }))
        setFetchedAt((prev) => ({ ...prev, [setId]: result.fetchedAt }))
        setFailedSets((prev) => prev.filter((id) => id !== setId))
        setError(null)
      } catch (err) {
        const where = set && set.source === 'tcgdex' ? 'TCGdex' : 'the Pokémon TCG API'
        setError(err instanceof Error ? err.message : `Could not reach ${where}.`)
        setFailedSets((prev) => (prev.includes(setId) ? prev : [...prev, setId]))
        throw err
      }
    },
    [],
  )

  /** Throws away a removed set's cards; its collection entries are untouched. */
  const forgetSet = useCallback(async (setId: string) => {
    setCardsBySet((prev) => {
      const next = { ...prev }
      delete next[setId]
      return next
    })
    setFetchedAt((prev) => {
      const next = { ...prev }
      delete next[setId]
      return next
    })
    await dropSetCache(setId)
    await idbDelete(`cards:${setId}`)
  }, [])

  const syncAll = useCallback(
    async (force = false, only?: string[]) => {
      if (syncing.current) return
      syncing.current = true
      const live = loadTrackedSets()
      const targets = only?.length ? live.filter((s) => only.includes(s.id)) : live
      setProgress({ running: true, done: 0, total: targets.length, current: null })

      const failures: string[] = []
      let lastError: string | null = null
      for (const [i, set] of targets.entries()) {
        setProgress({ running: true, done: i, total: targets.length, current: set.name })
        try {
          await syncSet(set.id, force)
        } catch (err) {
          failures.push(set.id)
          lastError = err instanceof Error ? err.message : null
        }
      }

      setProgress({ running: false, done: targets.length, total: targets.length, current: null })
      syncing.current = false

      // One set failing shouldn't read like everything did — say how many, and
      // leave them retryable on their own.
      if (failures.length === 0) {
        setError(null)
        setFailedSets([])
      } else {
        const names = failures.map((id) => loadTrackedSets().find((s) => s.id === id)?.name ?? id)
        const loaded = targets.length - failures.length
        setError(
          `${loaded} of ${targets.length} sets loaded. ${failures.length} failed (${names.slice(0, 3).join(', ')}${names.length > 3 ? `, +${names.length - 3} more` : ''}). ${lastError ?? ''}`.trim(),
        )
      }
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
    () => ({ cardsBySet, fetchedAt, hydrated, empty, progress, error, failedSets, syncAll, syncSet, forgetSet, allCards, staleSets }),
    [cardsBySet, fetchedAt, hydrated, empty, progress, error, failedSets, syncAll, syncSet, forgetSet, allCards, staleSets],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used inside <LibraryProvider>')
  return ctx
}
