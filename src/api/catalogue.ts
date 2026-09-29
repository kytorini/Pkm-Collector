import { getRegion, type RegionId } from '../lib/regions'
import { idbGet, idbSet } from '../lib/idb'
import { listPokemonTcgSets } from './pokemonTcg'
import { listTcgdexSets, type CatalogueSet } from './tcgdex'

export type { CatalogueSet } from './tcgdex'

/**
 * What there is to add, per region.
 *
 * Only the list of sets — names, years, card counts — which is a few tens of
 * kilobytes. The cards themselves are not fetched until a set is actually
 * added, which is the point of the whole arrangement: a collection of three
 * sets should cost three sets' worth of storage, not every set ever printed.
 *
 * Cached for a week. New sets appear a handful of times a year, and a picker
 * that re-downloads a catalogue every time it opens is a picker nobody opens.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000

interface CachedCatalogue {
  sets: CatalogueSet[]
  fetchedAt: number
}

const yearOf = (releaseDate: string): number => {
  const year = Number(releaseDate.slice(0, 4))
  return Number.isFinite(year) && year > 1900 ? year : 0
}

async function fetchCatalogue(region: RegionId): Promise<CatalogueSet[]> {
  const meta = getRegion(region)
  if (meta.source === 'tcgdex') return listTcgdexSets(meta.lang)
  const sets = await listPokemonTcgSets()
  return sets.map((s) => ({
    sourceId: s.id,
    name: s.name,
    series: s.series ?? '',
    year: yearOf(s.releaseDate ?? ''),
    total: s.printedTotal || s.total || 0,
    releaseDate: s.releaseDate ?? '',
    logo: s.images?.logo,
  }))
}

/** Newest first: the set you just bought into is far likelier than Base Set. */
const newestFirst = (sets: CatalogueSet[]): CatalogueSet[] =>
  [...sets].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '') || a.name.localeCompare(b.name))

export async function loadCatalogue(region: RegionId, force = false): Promise<CatalogueSet[]> {
  const key = `catalogue:${region}`
  const cached = await idbGet<CachedCatalogue>(key)
  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.sets
  try {
    const sets = newestFirst(await fetchCatalogue(region))
    await idbSet(key, { sets, fetchedAt: Date.now() })
    return sets
  } catch (err) {
    // A stale catalogue beats an empty picker when the network is out.
    if (cached) return cached.sets
    throw err
  }
}
