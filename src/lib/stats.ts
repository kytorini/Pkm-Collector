import { adjustedValue, isUnassessed } from './condition'
import { priceFor, type PriceResolver } from './pricing'
import { VINTAGE_SETS } from '../data/vintageSets'
import { entryKey, type ApiCard, type CollectionMap, type SetVariant, type VintageSet } from '../types'

export interface VariantStats {
  total: number
  owned: number
  /** Total copies held. Above `owned` when quantities are greater than one. */
  copies: number
  pct: number
  /** Market value of the copies you own (quantity aware). */
  ownedValue: number
  /** Market value of everything still missing — the cost to finish. */
  missingValue: number
  /** What you recorded paying for the copies you own. */
  spend: number
  /** Cards with no price feed at all, so the totals above understate reality. */
  unpriced: number
  /** Owned copies whose condition hasn't been judged yet. */
  unassessed: number
}

const ZERO: VariantStats = { total: 0, owned: 0, copies: 0, pct: 0, ownedValue: 0, missingValue: 0, spend: 0, unpriced: 0, unassessed: 0 }

/** Reads the default source. Callers with price rules pass their own resolver. */
const AUTO_PRICE: PriceResolver = (card, variant) => priceFor(card, variant)

export function statsForVariant(
  cards: ApiCard[],
  variant: SetVariant,
  collection: CollectionMap,
  price: PriceResolver = AUTO_PRICE,
): VariantStats {
  if (cards.length === 0) return { ...ZERO }
  let owned = 0
  let copies = 0
  let ownedValue = 0
  let missingValue = 0
  let spend = 0
  let unpriced = 0
  let unassessed = 0

  for (const card of cards) {
    const entry = collection[entryKey(card.id, variant.id)]
    const market = price(card, variant).market
    if (market == null) unpriced++
    if (entry?.owned) {
      owned++
      if (isUnassessed(entry)) unassessed++
      const quantity = Math.max(1, entry.quantity || 1)
      copies += quantity
      // Condition matters: a played copy is not worth the near-mint quote.
      ownedValue += (adjustedValue(market, entry) ?? 0) * quantity
      spend += (entry.pricePaid ?? 0) * quantity
    } else {
      missingValue += market ?? 0
    }
  }

  return {
    total: cards.length,
    owned,
    copies,
    pct: cards.length ? Math.round((owned / cards.length) * 100) : 0,
    ownedValue,
    missingValue,
    spend,
    unpriced,
    unassessed,
  }
}

export function statsForSet(
  cards: ApiCard[],
  set: VintageSet,
  collection: CollectionMap,
  price: PriceResolver = AUTO_PRICE,
): VariantStats {
  return set.variants
    .map((v) => statsForVariant(cards, v, collection, price))
    .reduce(
      (acc, s) => ({
        total: acc.total + s.total,
        owned: acc.owned + s.owned,
        copies: acc.copies + s.copies,
        pct: 0,
        ownedValue: acc.ownedValue + s.ownedValue,
        missingValue: acc.missingValue + s.missingValue,
        spend: acc.spend + s.spend,
        unpriced: acc.unpriced + s.unpriced,
        unassessed: acc.unassessed + s.unassessed,
      }),
      { ...ZERO },
    )
}

export function statsForCollection(
  cardsBySet: Record<string, ApiCard[]>,
  collection: CollectionMap,
  /** Limits the totals to these sets. Omit to count every tracked set. */
  onlySetIds?: readonly string[],
  price: PriceResolver = AUTO_PRICE,
): VariantStats & { setsStarted: number } {
  let acc = { ...ZERO, setsStarted: 0 }
  const included = onlySetIds ? new Set(onlySetIds) : null
  for (const set of VINTAGE_SETS) {
    if (included && !included.has(set.id)) continue
    const cards = cardsBySet[set.id]
    if (!cards?.length) continue
    const s = statsForSet(cards, set, collection, price)
    acc = {
      total: acc.total + s.total,
      owned: acc.owned + s.owned,
      copies: acc.copies + s.copies,
      pct: 0,
      ownedValue: acc.ownedValue + s.ownedValue,
      missingValue: acc.missingValue + s.missingValue,
      spend: acc.spend + s.spend,
      unpriced: acc.unpriced + s.unpriced,
      unassessed: acc.unassessed + s.unassessed,
      setsStarted: acc.setsStarted + (s.owned > 0 ? 1 : 0),
    }
  }
  return { ...acc, pct: acc.total ? Math.round((acc.owned / acc.total) * 100) : 0 }
}
