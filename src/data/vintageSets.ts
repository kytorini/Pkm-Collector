import type { SetVariant, VintageSet } from '../types'

/**
 * Print-run variations, defined once and reused across sets.
 *
 * `priceKeys` map to the buckets TCGplayer reports through the Pokemon TCG API.
 * Base Set reports `1stEdition*` / `unlimited*`; later WOTC sets report
 * `1stEdition*` / plain `holofoil` + `normal` for the unlimited run.
 */
const FIRST_EDITION: SetVariant = {
  id: 'first-edition',
  label: '1st Edition',
  short: '1st Ed',
  priceKeys: ['1stEditionHolofoil', '1stEditionNormal', '1stEdition'],
  note: 'Black "Edition 1" stamp to the left of the artwork.',
}

const SHADOWLESS: SetVariant = {
  id: 'shadowless',
  label: 'Shadowless',
  short: 'Shadowless',
  priceKeys: ['unlimitedHolofoil', 'unlimitedNormal', 'holofoil', 'normal'],
  approximatePrice: true,
  genericFallback: true,
  note: 'No drop shadow on the right edge of the art box, thinner HP font. Second print run — no 1st Edition stamp.',
}

const UNLIMITED: SetVariant = {
  id: 'unlimited',
  label: 'Unlimited',
  short: 'Unlimited',
  priceKeys: ['unlimitedHolofoil', 'unlimitedNormal', 'holofoil', 'normal'],
  genericFallback: true,
  note: 'Drop shadow present, no 1st Edition stamp.',
}

const REVERSE_HOLO: SetVariant = {
  id: 'reverse-holo',
  label: 'Reverse Holo',
  short: 'Reverse',
  priceKeys: ['reverseHolofoil'],
  note: 'Foil applied to the card body instead of the artwork.',
}

/**
 * The vintage runs this app tracks, oldest first. `id` is the pokemontcg.io
 * set id — card data, images and prices are pulled with it.
 *
 * Adding a set is a one-line job: find its id at https://api.pokemontcg.io/v2/sets
 * and give it the variations you care about.
 */
export const VINTAGE_SETS: VintageSet[] = [
  {
    id: 'base1',
    name: 'Base Set',
    series: 'Base',
    year: 1999,
    total: 102,
    variants: [FIRST_EDITION, SHADOWLESS, UNLIMITED],
  },
  { id: 'base2', name: 'Jungle', series: 'Base', year: 1999, total: 64, variants: [FIRST_EDITION, UNLIMITED] },
  { id: 'base3', name: 'Fossil', series: 'Base', year: 1999, total: 62, variants: [FIRST_EDITION, UNLIMITED] },
  { id: 'base4', name: 'Base Set 2', series: 'Base', year: 2000, total: 130, variants: [UNLIMITED] },
  { id: 'base5', name: 'Team Rocket', series: 'Base', year: 2000, total: 82, variants: [FIRST_EDITION, UNLIMITED] },
  { id: 'gym1', name: 'Gym Heroes', series: 'Gym', year: 2000, total: 132, variants: [FIRST_EDITION, UNLIMITED] },
  { id: 'gym2', name: 'Gym Challenge', series: 'Gym', year: 2000, total: 132, variants: [FIRST_EDITION, UNLIMITED] },
  { id: 'neo1', name: 'Neo Genesis', series: 'Neo', year: 2000, total: 111, variants: [FIRST_EDITION, UNLIMITED] },
  { id: 'neo2', name: 'Neo Discovery', series: 'Neo', year: 2001, total: 75, variants: [FIRST_EDITION, UNLIMITED] },
  { id: 'neo3', name: 'Neo Revelation', series: 'Neo', year: 2001, total: 66, variants: [FIRST_EDITION, UNLIMITED] },
  { id: 'neo4', name: 'Neo Destiny', series: 'Neo', year: 2002, total: 113, variants: [FIRST_EDITION, UNLIMITED] },
  {
    id: 'base6',
    name: 'Legendary Collection',
    series: 'Legendary Collection',
    year: 2002,
    total: 110,
    variants: [UNLIMITED, REVERSE_HOLO],
  },
  { id: 'ecard1', name: 'Expedition Base Set', series: 'E-Card', year: 2002, total: 165, variants: [UNLIMITED, REVERSE_HOLO] },
  { id: 'ecard2', name: 'Aquapolis', series: 'E-Card', year: 2003, total: 186, variants: [UNLIMITED, REVERSE_HOLO] },
  { id: 'ecard3', name: 'Skyridge', series: 'E-Card', year: 2003, total: 182, variants: [UNLIMITED, REVERSE_HOLO] },
  { id: 'basep', name: 'Wizards Black Star Promos', series: 'Promo', year: 1999, total: 53, variants: [UNLIMITED] },
  { id: 'si1', name: 'Southern Islands', series: 'Other', year: 2001, total: 18, variants: [UNLIMITED] },
]

export const SETS_BY_ID = new Map(VINTAGE_SETS.map((s) => [s.id, s]))

export function getSet(setId: string): VintageSet | undefined {
  return SETS_BY_ID.get(setId)
}

export function getVariant(setId: string, variantId: string): SetVariant | undefined {
  return getSet(setId)?.variants.find((v) => v.id === variantId)
}

/** Every (set, variant) pair, used for collection-wide totals. */
export const ALL_SLOTS = VINTAGE_SETS.flatMap((set) => set.variants.map((variant) => ({ set, variant })))
