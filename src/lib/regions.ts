/**
 * The print regions this app can track, and where each one's cards come from.
 *
 * English keeps coming from pokemontcg.io, which is the only source here that
 * publishes market prices — every money figure in the app rests on it, so it
 * stays put. Japanese and Chinese come from TCGdex, which covers seventeen
 * languages but quotes no prices for them. Those cards arrive unpriced and
 * turn up under "not priced yet", where a figure can be typed in by hand and
 * then travels with the collection like any other.
 */
export type RegionId = 'en' | 'ja' | 'zh-cn' | 'zh-tw'

export type SourceId = 'pokemontcg' | 'tcgdex'

export interface Region {
  id: RegionId
  label: string
  /** Shown on a set row where the full label would crowd it. */
  short: string
  source: SourceId
  /** The language segment TCGdex takes in its path. Unused for pokemontcg. */
  lang: string
  /** True where the source quotes market prices for this region. */
  priced: boolean
}

export const REGIONS: Region[] = [
  { id: 'en', label: 'English', short: 'EN', source: 'pokemontcg', lang: 'en', priced: true },
  { id: 'ja', label: 'Japanese', short: 'JP', source: 'tcgdex', lang: 'ja', priced: false },
  { id: 'zh-cn', label: 'Chinese (Simplified)', short: 'CN', source: 'tcgdex', lang: 'zh-cn', priced: false },
  { id: 'zh-tw', label: 'Chinese (Traditional)', short: 'TW', source: 'tcgdex', lang: 'zh-tw', priced: false },
]

const BY_ID = new Map(REGIONS.map((r) => [r.id, r]))

export const DEFAULT_REGION: RegionId = 'en'

export function getRegion(id: string): Region {
  return BY_ID.get(id as RegionId) ?? REGIONS[0]
}

export const isRegion = (id: string): id is RegionId => BY_ID.has(id as RegionId)

/**
 * The app's id for a set, and for the cards in it.
 *
 * English is left exactly as pokemontcg.io names it, so every set link,
 * cached page and collection entry written before regions existed still
 * points at the same thing. Everything else carries its region, because
 * TCGdex gives the Japanese and the Chinese printing of a set the same id —
 * without the prefix, ticking a card in one would tick it in the other.
 */
export function scopedId(region: RegionId, sourceId: string): string {
  return region === 'en' ? sourceId : `${region}:${sourceId}`
}
