/**
 * JustTCG: TCGplayer prices split by condition, so a card can be priced at
 * what near-mint copies sell for rather than a figure that mixes every
 * condition. It also keeps the vintage printings apart — 1st Edition,
 * Unlimited, and Base Set's Shadowless run as a set of its own — which is
 * exactly the split this app tracks.
 *
 * The key is the collector's own, pasted into Settings and kept on the
 * device. The free plan allows 20 cards a request, 100 requests a day and
 * 1,000 a month, so prices are fetched a whole set at a time and kept for a
 * week; see lib/justTcgPrices.ts.
 */

const BASE_URL = 'https://api.justtcg.com/v1'
const KEY_STORAGE = 'pkm-collector:justTcgKey'
const REQUEST_TIMEOUT_MS = 25_000
/** The free plan's page size; larger plans accept more, but 20 works for all. */
export const PAGE_SIZE = 20

export function getJustTcgKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setJustTcgKey(key: string): void {
  try {
    const trimmed = key.trim()
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* nowhere to keep it; it works for this session only */
  }
}

/** What the API reports about the plan's allowance, on every response. */
export interface JustTcgUsage {
  apiPlan: string
  apiRequestsRemaining: number
  apiDailyRequestsRemaining: number
  apiRequestLimit: number
  apiDailyLimit: number
}

export interface JustTcgSet {
  id: string
  name: string
  count: number
  release_date: string
}

export interface JustTcgVariant {
  condition: string
  printing: string
  language: string | null
  /** Dollars. Null when the market has stopped reporting this condition. */
  price: number | null
  /** Epoch seconds. */
  lastUpdated: number | null
}

export interface JustTcgCard {
  id: string
  name: string
  set: string
  number: string | null
  rarity: string | null
  variants: JustTcgVariant[]
}

interface Envelope<T> {
  data: T
  meta?: { total: number; limit: number; offset: number; hasMore: boolean }
  _metadata?: JustTcgUsage
  error?: string
}

let lastUsage: JustTcgUsage | null = null
/** The allowance as of the last response, for pacing and for Settings. */
export const justTcgUsage = (): JustTcgUsage | null => lastUsage

export class JustTcgError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'JustTcgError'
  }
}

async function get<T>(path: string, params: Record<string, string | number>): Promise<Envelope<T>> {
  const key = getJustTcgKey()
  if (!key) throw new JustTcgError('No JustTCG key. Add one in Settings.')
  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

  let res: Response
  try {
    res = await fetch(url.toString(), {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new JustTcgError('Could not reach JustTCG (api.justtcg.com). Check your connection and try again.')
  }

  let body: Envelope<T> | undefined
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    body = undefined
  }
  if (body?._metadata) lastUsage = body._metadata

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new JustTcgError('JustTCG rejected the key. Check it in Settings.', res.status)
    }
    if (res.status === 429) {
      throw new JustTcgError("JustTCG's request limit is used up for now. Prices will refresh once it resets.", 429)
    }
    throw new JustTcgError(body?.error || `JustTCG returned ${res.status}.`, res.status)
  }
  if (!body || !Array.isArray(body.data)) throw new JustTcgError('JustTCG sent a response that could not be read.')
  return body
}

/** Pokémon sets whose name matches, for pairing a tracked set with JustTCG's. */
export async function searchSets(name: string): Promise<JustTcgSet[]> {
  const body = await get<JustTcgSet[]>('/sets', { game: 'pokemon', q: name, limit: PAGE_SIZE })
  return body.data
}

/** One page of a set's cards, near-mint prices only. */
export async function setCardsPage(
  setId: string,
  offset: number,
): Promise<{ cards: JustTcgCard[]; hasMore: boolean; total: number }> {
  const body = await get<JustTcgCard[]>('/cards', {
    game: 'pokemon',
    set: setId,
    condition: 'NM',
    limit: PAGE_SIZE,
    offset,
  })
  const total = body.meta?.total ?? body.data.length
  const hasMore = body.meta ? body.meta.hasMore : body.data.length === PAGE_SIZE
  return { cards: body.data, hasMore, total }
}

/** One cheap request: is the key good, and how much allowance is left. */
export async function checkJustTcg(): Promise<JustTcgUsage | null> {
  await get<JustTcgSet[]>('/sets', { game: 'pokemon', q: 'Base Set', limit: 1 })
  return lastUsage
}
