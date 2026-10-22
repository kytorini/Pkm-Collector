import { UNLIMITED } from './vintageSets'
import type { ManualCard } from '../lib/manualSet'
import type { SetVariant } from '../types'

/**
 * The cards Wizards of the Coast stamped "Prerelease" for its own launch
 * events, gathered into one set because no feed catalogues them as one: each
 * sits in its parent set's listing, if anywhere.
 *
 * The artwork is the parent card's — the stamp is the only difference — so
 * each points at that card's scan. The printed number is kept as printed,
 * "1/64", which also keeps Clefable and Aerodactyl, both #1, apart.
 *
 * Raichu is the odd one: a Base Set prerelease print given to WotC staff,
 * never distributed, and known from a handful of graded copies.
 */
export const WOTC_PRERELEASE_SOURCE_ID = 'wotc-prerelease'
export const WOTC_PRERELEASE_NAME = 'WOTC Prerelease'

const scan = (set: string, number: number) => ({
  image: `https://images.pokemontcg.io/${set}/${number}.png`,
  imageLarge: `https://images.pokemontcg.io/${set}/${number}_hires.png`,
})

export const WOTC_PRERELEASE_CARDS: ManualCard[] = [
  { number: '14/102', name: 'Raichu', rarity: 'Base Set prerelease · staff only', ...scan('base1', 14) },
  { number: '1/64', name: 'Clefable', rarity: 'Jungle prerelease', ...scan('base2', 1) },
  { number: '1/62', name: 'Aerodactyl', rarity: 'Fossil prerelease', ...scan('base3', 1) },
  { number: '8/82', name: 'Dark Gyarados', rarity: 'Team Rocket prerelease', ...scan('base5', 8) },
  { number: '9/132', name: "Misty's Seadra", rarity: 'Gym Heroes prerelease', ...scan('gym1', 9) },
]

/** One run, named for what makes these cards what they are. */
export const PRERELEASE_RUN: SetVariant = {
  ...UNLIMITED,
  label: 'Prerelease',
  short: 'Prerelease',
  genericFallback: false,
  note: 'A "Prerelease" stamp on the artwork; otherwise the same card as its set’s.',
}
