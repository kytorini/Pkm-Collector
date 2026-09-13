import type { CollectionEntry, ConditionId } from '../types'

/**
 * What a copy is worth relative to the quoted market price.
 *
 * TCGplayer's market price tracks Near Mint sales, so counting a Heavily
 * Played copy at the same figure overstates a collection badly. These are the
 * rough spreads vintage singles tend to trade at — they are estimates, not
 * market data, and the comp links on each card are there for a real answer.
 */
export const CONDITION_MULTIPLIER: Record<ConditionId, number> = {
  M: 1.1,
  NM: 1,
  LP: 0.8,
  MP: 0.6,
  HP: 0.4,
  DMG: 0.25,
}

export const CONDITION_NOTE: Record<ConditionId, string> = {
  M: '10% above the near-mint market price',
  NM: 'the quoted market price',
  LP: '80% of the near-mint market price',
  MP: '60% of the near-mint market price',
  HP: '40% of the near-mint market price',
  DMG: '25% of the near-mint market price',
}

/**
 * Graded cards are left at the quoted price rather than guessed at. A PSA 10
 * can be worth many times a raw copy and the multiple varies wildly by card,
 * so inventing one would be worse than declining to.
 */
export function valueMultiplier(entry: Pick<CollectionEntry, 'condition' | 'graded'> | undefined): number {
  if (!entry) return 1
  if (entry.graded) return 1
  return CONDITION_MULTIPLIER[entry.condition] ?? 1
}

export function adjustedValue(market: number | null, entry: Pick<CollectionEntry, 'condition' | 'graded'> | undefined): number | null {
  if (market == null) return null
  return market * valueMultiplier(entry)
}
