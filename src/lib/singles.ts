import { adjustedValue } from './condition'
import { priceFor, type PriceResolver } from './pricing'
import { allSets, type TrackedSet } from './sets'
import { isChasing } from './trackedSets'
import { entryKey, type ApiCard, type CollectionEntry, type CollectionMap, type SetVariant } from '../types'

/**
 * The cards you keep on the side.
 *
 * Not a second collection with a store of its own — they are the same owned
 * slots, read through a different question. A set you are chasing asks "how
 * far off am I"; a set you are not asks "what have I got, and what is it
 * worth". Singles are the answer to the second.
 *
 * They divide by your own tags rather than by set, because the groupings a
 * collector keeps — every Eevee, every Van Gogh, everything slabbed — cut
 * across sets, regions and years, and no printer's arrangement will produce
 * them.
 */
const AUTO_PRICE: PriceResolver = (card, variant) => priceFor(card, variant)

export interface Single {
  card: ApiCard
  set: TrackedSet
  variant: SetVariant
  entry: CollectionEntry
  /** Market value of the copies held, adjusted for condition. */
  worth: number | null
  tags: string[]
}

export interface SingleGroup {
  /** The tag, or '' for the cards you haven't grouped. */
  tag: string
  singles: Single[]
  copies: number
  worth: number
  /** Cards no feed will price, so the group's figure is short of the truth. */
  unpriced: number
}

/** Untagged cards sort last, under a heading that says what they are. */
export const UNGROUPED = ''

export function collectSingles(
  cardsBySet: Record<string, ApiCard[]>,
  collection: CollectionMap,
  price: PriceResolver = AUTO_PRICE,
): Single[] {
  const singles: Single[] = []
  for (const set of allSets()) {
    if (isChasing(set)) continue
    const cards = cardsBySet[set.id]
    if (!cards?.length) continue
    for (const card of cards) {
      for (const variant of set.variants) {
        const entry = collection[entryKey(card.id, variant.id)]
        if (!entry?.owned) continue
        const market = price(card, variant).market
        const each = adjustedValue(market, entry)
        singles.push({
          card,
          set,
          variant,
          entry,
          worth: each == null ? null : each * Math.max(1, entry.quantity || 1),
          tags: entry.tags ?? [],
        })
      }
    }
  }
  return singles
}

/**
 * Grouped by tag, with a card appearing under each of its tags.
 *
 * A Van Gogh Pikachu belongs in "Van Gogh" and in "Pikachu collection" at
 * once, so the groups overlap on purpose — which is why the totals across
 * groups can exceed the collection's, and why the page shows its own figure
 * separately rather than summing the groups.
 */
export function groupSingles(singles: readonly Single[]): SingleGroup[] {
  const byTag = new Map<string, Single[]>()
  for (const single of singles) {
    const tags = single.tags.length > 0 ? single.tags : [UNGROUPED]
    for (const tag of tags) {
      const held = byTag.get(tag)
      if (held) held.push(single)
      else byTag.set(tag, [single])
    }
  }

  const groups = [...byTag.entries()].map(([tag, list]) => ({
    tag,
    singles: list,
    copies: list.reduce((n, s) => n + Math.max(1, s.entry.quantity || 1), 0),
    worth: list.reduce((n, s) => n + (s.worth ?? 0), 0),
    unpriced: list.filter((s) => s.worth == null).length,
  }))

  // Named groups first, alphabetically; the ungrouped pile last, because it
  // is a leftover rather than a collection.
  groups.sort((a, b) => {
    if ((a.tag === UNGROUPED) !== (b.tag === UNGROUPED)) return a.tag === UNGROUPED ? 1 : -1
    return a.tag.localeCompare(b.tag)
  })
  return groups
}

/** Every tag in use, for offering them rather than making them be retyped. */
export function allTags(collection: CollectionMap): string[] {
  const seen = new Set<string>()
  for (const entry of Object.values(collection)) {
    for (const tag of entry.tags ?? []) seen.add(tag)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

/** Trimmed, de-duplicated, and never blank — tags are typed by hand. */
export function cleanTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, 40)
    if (tag) seen.add(tag)
  }
  return [...seen]
}
