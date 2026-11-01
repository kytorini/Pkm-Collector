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
 *
 * Alongside them, the seven "W" promos: one card from each of six sets
 * reprinted with a gold foil Wizards "W", handed out through magazines,
 * leagues and giveaways between 1999 and 2001.
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
  { number: '60/64', name: 'Pikachu', rarity: 'Jungle · W stamp', ...scan('base2', 60) },
  { number: '50/62', name: 'Kabuto', rarity: 'Fossil · W stamp', ...scan('base3', 50) },
  { number: '63/130', name: 'Wartortle', rarity: 'Base Set 2 · W stamp', ...scan('base4', 63) },
  { number: '19/82', name: 'Dark Arbok', rarity: 'Team Rocket · W stamp', ...scan('base5', 19) },
  { number: '32/82', name: 'Dark Charmeleon', rarity: 'Team Rocket · W stamp', ...scan('base5', 32) },
  { number: '54/132', name: "Misty's Psyduck", rarity: 'Gym Heroes · W stamp', ...scan('gym1', 54) },
  { number: '37/132', name: "Brock's Vulpix", rarity: 'Gym Challenge · W stamp', ...scan('gym2', 37) },
]

/** One run, named for what makes these cards what they are: the stamp. */
export const PRERELEASE_RUN: SetVariant = {
  ...UNLIMITED,
  label: 'Stamped',
  short: 'Stamped',
  genericFallback: false,
  note: 'A "Prerelease" stamp or a gold "W" stamp on the artwork; otherwise the same card as its set’s.',
}
