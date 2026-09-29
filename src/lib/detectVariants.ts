import { FIRST_EDITION, REVERSE_HOLO, UNLIMITED } from '../data/vintageSets'
import type { ApiCard, SetVariant } from '../types'

/**
 * Which print runs a set actually has, read from its cards.
 *
 * Guessing this from a set's age does not work. "Modern sets have a normal
 * and a reverse holo" is true of most and false of plenty: the 30th
 * Celebration set is reverse holo throughout, its Classic Collection is holo
 * throughout, and giving either one two runs invents a second slot for every
 * card in it — 322 to collect where there are 161, with the completion bar
 * and the remaining cost wrong to match.
 *
 * The price feed already knows. TCGplayer quotes a set per printing, so the
 * buckets that appear across a set's cards are the printings that exist. Read
 * that instead of guessing.
 */

const BASE_RUN: SetVariant = { ...UNLIMITED, label: 'Normal', short: 'Normal', note: undefined }

/** Bucket name -> the run it belongs to, in the order runs are shown. */
const RUNS: Array<{ variant: SetVariant; buckets: string[] }> = [
  { variant: FIRST_EDITION, buckets: ['1stEditionHolofoil', '1stEditionNormal', '1stEdition'] },
  { variant: BASE_RUN, buckets: ['unlimitedHolofoil', 'unlimitedNormal', 'holofoil', 'normal'] },
  { variant: REVERSE_HOLO, buckets: ['reverseHolofoil'] },
]

export interface Detection {
  variants: SetVariant[]
  /** How many cards carried each run's buckets, for saying what was found. */
  counts: Record<string, number>
  /** False when no card carried a price at all, so nothing could be read. */
  confident: boolean
}

/**
 * A printing has to show up on a reasonable share of the set to count as a
 * run. One card in two hundred quoting a reverse holo is a stray entry in the
 * feed, not a run worth doubling the set for.
 */
const SHARE = 0.2

export function detectVariants(cards: readonly ApiCard[]): Detection {
  const counts: Record<string, number> = {}
  let priced = 0

  for (const card of cards) {
    const prices = card.tcgplayer?.prices
    if (!prices) continue
    let any = false
    for (const run of RUNS) {
      if (!run.buckets.some((bucket) => prices[bucket] != null)) continue
      counts[run.variant.id] = (counts[run.variant.id] ?? 0) + 1
      any = true
    }
    if (any) priced++
  }

  // Nothing quotes this set — a brand new release, or a region with no feed.
  // One run is the safe answer: it under-counts nothing, where two runs would
  // invent a slot per card.
  if (priced === 0) return { variants: [BASE_RUN], counts, confident: false }

  const found = RUNS.filter((run) => (counts[run.variant.id] ?? 0) >= priced * SHARE).map((r) => r.variant)
  return { variants: found.length > 0 ? found : [BASE_RUN], counts, confident: true }
}

/** "Normal and Reverse Holo", for telling someone what was found. */
export function describeVariants(variants: readonly SetVariant[]): string {
  const names = variants.map((v) => v.label)
  if (names.length <= 1) return names[0] ?? 'one run'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
