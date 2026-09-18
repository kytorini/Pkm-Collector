import type { ApiCard } from '../types'

/**
 * Finding one card among fifteen hundred.
 *
 * Shared by the two places that search: the lot, where you're pricing up a
 * box someone is holding, and the collection, where you've just bought
 * something and want it ticked off. Both have the same problem — you know the
 * name, or the number printed at the bottom of the card, or roughly which set
 * it came from, and rarely all three.
 *
 * So every word you type has to match the card somehow, but each is free to
 * match a different part of it: "charizard 4" finds the one numbered 4,
 * "pikachu jungle" finds the Jungle one, "4" on its own finds every card
 * numbered 4.
 */

/** Cards are numbered "4/102" on the card itself; only the first half is the number. */
function asNumber(token: string): string | null {
  const match = /^0*(\d+)(?:\/\d+)?$/.exec(token)
  return match ? match[1] : null
}

/** Leading zeros are a printing convention, not part of the number. */
const bare = (value: string): string => value.replace(/^0+(?=\d)/, '').toLowerCase()

function matches(card: ApiCard, token: string): boolean {
  if (card.name.toLowerCase().includes(token)) return true
  if (card.set.name.toLowerCase().includes(token)) return true
  const number = asNumber(token)
  return number != null && bare(card.number) === number
}

/**
 * Lower sorts first: a card whose name begins with what you typed is almost
 * always the one you meant, and a card that merely contains it beats one that
 * matched on a number or a set.
 */
function rank(card: ApiCard, query: string): number {
  const name = card.name.toLowerCase()
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(query)) return 2
  return 3
}

export interface SearchOptions {
  /** Caps the work and the page. Matches beyond it are counted, not rendered. */
  limit?: number
}

export function searchCards(cards: readonly ApiCard[], query: string, options: SearchOptions = {}): ApiCard[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const tokens = q.split(/\s+/).filter(Boolean)

  const found = cards.filter((card) => tokens.every((token) => matches(card, token)))
  found.sort((a, b) => {
    const byRank = rank(a, q) - rank(b, q)
    if (byRank !== 0) return byRank
    const byName = a.name.localeCompare(b.name)
    if (byName !== 0) return byName
    // Same card across sets: oldest print first, the way the app lists sets.
    const byRelease = a.set.releaseDate.localeCompare(b.set.releaseDate)
    if (byRelease !== 0) return byRelease
    return bare(a.number).localeCompare(bare(b.number), undefined, { numeric: true })
  })

  const limit = options.limit ?? 300
  return found.length > limit ? found.slice(0, limit) : found
}

/** How many cards match, without building the list. For "more in sets you've hidden". */
export function countMatches(cards: readonly ApiCard[], query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const tokens = q.split(/\s+/).filter(Boolean)
  return cards.reduce((n, card) => (tokens.every((token) => matches(card, token)) ? n + 1 : n), 0)
}
