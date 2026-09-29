import { scopedId, type RegionId } from '../lib/regions'
import type { ApiCard } from '../types'

/**
 * TCGdex — the Japanese and Chinese card data.
 *
 * Free, no key, and the only source here that covers a printing outside
 * English. It publishes no market prices for those regions, so its cards
 * arrive without one and show up under "not priced yet" to be given a figure
 * by hand.
 *
 * Endpoints (https://api.tcgdex.net/v2/<lang>/…):
 *   /sets            every set in that language, briefly
 *   /sets/<id>       one set, with its cards
 *
 * Artwork comes back as a URL with no extension on purpose: a size and a
 * format are appended to it, so the same card can be asked for small or large.
 */
const BASE_URL = 'https://api.tcgdex.net/v2'

/** What the brief set list gives us. Fields beyond `id` are all optional in practice. */
interface TcgdexSetBrief {
  id: string
  name?: string
  logo?: string
  releaseDate?: string
  cardCount?: { total?: number; official?: number }
  serie?: { id?: string; name?: string }
}

interface TcgdexCardBrief {
  id: string
  localId?: string
  name?: string
  image?: string
}

interface TcgdexSetFull extends TcgdexSetBrief {
  cards?: TcgdexCardBrief[]
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`TCGdex returned ${res.status} for ${path}`)
  return (await res.json()) as T
}

/** `https://assets.tcgdex.net/…/3` -> `…/3/high.webp`. Absent for a card with no scan. */
function artwork(image: string | undefined): { small: string; large: string } {
  if (!image) return { small: '', large: '' }
  return { small: `${image}/low.webp`, large: `${image}/high.webp` }
}

const yearOf = (releaseDate: string | undefined): number => {
  const year = Number(releaseDate?.slice(0, 4))
  return Number.isFinite(year) && year > 1900 ? year : 0
}

export interface CatalogueSet {
  sourceId: string
  name: string
  series: string
  year: number
  total: number
  releaseDate: string
  logo?: string
}

export async function listTcgdexSets(lang: string): Promise<CatalogueSet[]> {
  const sets = await get<TcgdexSetBrief[]>(`/${lang}/sets`)
  return sets
    .filter((s) => typeof s?.id === 'string')
    .map((s) => ({
      sourceId: s.id,
      name: s.name ?? s.id,
      series: s.serie?.name ?? '',
      year: yearOf(s.releaseDate),
      total: s.cardCount?.official ?? s.cardCount?.total ?? 0,
      releaseDate: s.releaseDate ?? '',
      logo: s.logo,
    }))
}

/**
 * One set's cards, mapped into the shape the rest of the app reads.
 *
 * Ids carry the region, because TCGdex gives the Japanese and the Chinese
 * printing of a set the same ids — without it, ticking a card in one would
 * tick it in the other.
 */
export async function loadTcgdexSet(region: RegionId, lang: string, sourceId: string): Promise<ApiCard[]> {
  const set = await get<TcgdexSetFull>(`/${lang}/sets/${encodeURIComponent(sourceId)}`)
  const cards = set.cards ?? []
  const setId = scopedId(region, sourceId)
  const total = set.cardCount?.official ?? set.cardCount?.total ?? cards.length
  return cards
    .filter((c) => typeof c?.id === 'string')
    .map((card) => ({
      id: scopedId(region, card.id),
      name: card.name ?? card.id,
      number: card.localId ?? '',
      supertype: 'Pokémon',
      set: {
        id: setId,
        name: set.name ?? sourceId,
        printedTotal: total,
        total,
        releaseDate: set.releaseDate ?? '',
      },
      images: artwork(card.image),
    }))
}
