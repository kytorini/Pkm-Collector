import { allSets } from './sets'
import type { PriceResolver } from './pricing'
import { priceFor } from './pricing'
import { entryKey, type ApiCard, type CollectionMap, type SetVariant, type VintageSet } from '../types'

/**
 * The slots no feed will put a number on.
 *
 * They're the quiet gap in every total: a card with no price counts as
 * nothing, so market value reads low for the ones you own and remaining cost
 * reads low for the ones you don't. The figures say how many there are; this
 * says which, so you can go and type a price in.
 *
 * A slot, not a card — a Charizard can have an Unlimited price and no 1st
 * Edition one, and it's the run without the price that needs the work.
 */
export interface UnpricedSlot {
  card: ApiCard
  set: VintageSet
  variant: SetVariant
  owned: boolean
}

const AUTO_PRICE: PriceResolver = (card, variant) => priceFor(card, variant)

export function unpricedSlots(
  cardsBySet: Record<string, ApiCard[]>,
  collection: CollectionMap,
  /** Limits the sweep to these sets. Omit to cover every tracked set. */
  onlySetIds?: readonly string[],
  price: PriceResolver = AUTO_PRICE,
): UnpricedSlot[] {
  const included = onlySetIds ? new Set(onlySetIds) : null
  const found: UnpricedSlot[] = []

  // Set order, then the order the cards come in, which is the set's own —
  // the same order the binder page shows, so the list reads as a walk through
  // the sets rather than a pile.
  for (const set of allSets()) {
    if (included && !included.has(set.id)) continue
    const cards = cardsBySet[set.id]
    if (!cards?.length) continue
    for (const card of cards) {
      for (const variant of set.variants) {
        if (price(card, variant).market != null) continue
        found.push({ card, set, variant, owned: Boolean(collection[entryKey(card.id, variant.id)]?.owned) })
      }
    }
  }
  return found
}

/** The cards those slots belong to, each once, in the same order. */
export function unpricedCards(slots: readonly UnpricedSlot[]): Array<{ card: ApiCard; set: VintageSet }> {
  const seen = new Set<string>()
  const cards: Array<{ card: ApiCard; set: VintageSet }> = []
  for (const slot of slots) {
    if (seen.has(slot.card.id)) continue
    seen.add(slot.card.id)
    cards.push({ card: slot.card, set: slot.set })
  }
  return cards
}
