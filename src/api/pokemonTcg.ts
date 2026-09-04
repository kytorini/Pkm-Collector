import type { ApiCard } from '../types'
import { idbGet, idbSet, idbDelete } from '../lib/idb'

const BASE_URL = 'https://api.pokemontcg.io/v2'
const API_KEY_STORAGE = 'pkm-collector:apiKey'

/** Card text/art never changes; prices ride along on the same payload. */
const CARDS_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Prices are stale-ish after a day, so we re-fetch in the background. */
const PRICES_TTL_MS = 24 * 60 * 60 * 1000

export interface CachedSet {
  setId: string
  cards: ApiCard[]
  fetchedAt: number
}

export interface ApiSetMeta {
  id: string
  name: string
  releaseDate: string
  printedTotal: number
  total: number
  images: { symbol: string; logo: string }
}

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? import.meta.env.VITE_POKEMONTCG_API_KEY ?? ''
}

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  if (trimmed) localStorage.setItem(API_KEY_STORAGE, trimmed)
  else localStorage.removeItem(API_KEY_STORAGE)
}

function headers(): HeadersInit {
  const key = getApiKey()
  return key ? { 'X-Api-Key': key } : {}
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() })
  if (!res.ok) {
    if (res.status === 429) throw new Error('Pokémon TCG API rate limit reached. Add a free API key in Settings, or try again later.')
    throw new Error(`Pokémon TCG API returned ${res.status}`)
  }
  return (await res.json()) as T
}

/** Fetches every card in a set, following pagination. */
async function fetchAllCards(setId: string): Promise<ApiCard[]> {
  const cards: ApiCard[] = []
  const pageSize = 250
  for (let page = 1; page <= 10; page++) {
    const body = await getJson<{ data: ApiCard[]; totalCount: number }>(
      `/cards?q=set.id:${encodeURIComponent(setId)}&page=${page}&pageSize=${pageSize}&orderBy=number`,
    )
    cards.push(...body.data)
    if (body.data.length < pageSize) break
  }
  return sortCards(cards)
}

/** Card numbers are strings ("4", "H12", "SH1") — sort numerically where we can. */
export function sortCards(cards: ApiCard[]): ApiCard[] {
  return [...cards].sort((a, b) => {
    const na = parseInt(a.number.replace(/\D/g, ''), 10)
    const nb = parseInt(b.number.replace(/\D/g, ''), 10)
    const pa = a.number.replace(/[0-9]/g, '')
    const pb = b.number.replace(/[0-9]/g, '')
    if (pa !== pb) return pa.localeCompare(pb)
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.number.localeCompare(b.number)
    return na - nb
  })
}

export interface LoadResult {
  cards: ApiCard[]
  fetchedAt: number
  fromCache: boolean
}

/**
 * Returns a set's cards, preferring the local cache. Pass `force` to bypass it
 * (the "Refresh prices" button). `stale` tells the caller the prices are older
 * than a day so it can refresh in the background.
 */
export async function loadSetCards(setId: string, force = false): Promise<LoadResult> {
  const cacheKey = `cards:${setId}`
  if (!force) {
    const cached = await idbGet<CachedSet>(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CARDS_TTL_MS) {
      return { cards: cached.cards, fetchedAt: cached.fetchedAt, fromCache: true }
    }
  }
  try {
    const cards = await fetchAllCards(setId)
    const fetchedAt = Date.now()
    await idbSet(cacheKey, { setId, cards, fetchedAt } satisfies CachedSet)
    return { cards, fetchedAt, fromCache: false }
  } catch (err) {
    // Offline or rate-limited: fall back to whatever we have rather than
    // showing an empty binder.
    const cached = await idbGet<CachedSet>(cacheKey)
    if (cached) return { cards: cached.cards, fetchedAt: cached.fetchedAt, fromCache: true }
    throw err
  }
}

export function pricesAreStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > PRICES_TTL_MS
}

export async function dropSetCache(setId: string): Promise<void> {
  await idbDelete(`cards:${setId}`)
}

export async function loadSetMeta(setId: string): Promise<ApiSetMeta | undefined> {
  const cacheKey = `set:${setId}`
  const cached = await idbGet<{ meta: ApiSetMeta; fetchedAt: number }>(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CARDS_TTL_MS) return cached.meta
  try {
    const body = await getJson<{ data: ApiSetMeta }>(`/sets/${encodeURIComponent(setId)}`)
    await idbSet(cacheKey, { meta: body.data, fetchedAt: Date.now() })
    return body.data
  } catch {
    return cached?.meta
  }
}

/** Cache-only read, used to hydrate the app on start without hitting the network. */
export async function readCachedSet(setId: string): Promise<CachedSet | undefined> {
  return idbGet<CachedSet>(`cards:${setId}`)
}
