import type { ApiCard, CollectionEntry, SetVariant, VintageSet } from '../types'

/**
 * Links out to the places people actually check comps. Each query carries the
 * print run, because a 1st Edition and an Unlimited copy of the same card are
 * different markets — a search that ignores the distinction returns comps for
 * the wrong card.
 */

export interface ExternalLink {
  id: string
  label: string
  url: string
  /** Shown under the button so it's clear what the search will look for. */
  hint: string
}

/**
 * How each print run reads in a marketplace search. Unlimited is left out
 * deliberately: sellers rarely write it, so including it hides real listings.
 */
function marketTerm(variant: SetVariant): string {
  switch (variant.id) {
    case 'first-edition':
      return '1st Edition'
    case 'shadowless':
      return 'Shadowless'
    case 'reverse-holo':
      return 'Reverse Holo'
    default:
      return ''
  }
}

/** "4/102" reads better to a marketplace than a bare "4". */
function printedNumber(card: ApiCard): string {
  const total = card.set.printedTotal || card.set.total
  return total ? `${card.number}/${total}` : card.number
}

function searchTerms(card: ApiCard, set: VintageSet, variant: SetVariant, entry?: CollectionEntry): string[] {
  const grade = entry?.graded ? `${entry.graded.company} ${entry.graded.grade}`.trim() : ''
  return ['Pokemon', set.name, card.name, printedNumber(card), marketTerm(variant), grade].filter(Boolean)
}

export function externalLinks(
  card: ApiCard,
  set: VintageSet,
  variant: SetVariant,
  entry?: CollectionEntry,
): ExternalLink[] {
  const terms = searchTerms(card, set, variant, entry)
  const query = encodeURIComponent(terms.join(' '))

  // The API hands back a product URL for the card itself, which beats a search.
  const tcgUrl = card.tcgplayer?.url
    ? card.tcgplayer.url
    : `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${query}`

  return [
    {
      id: 'tcgplayer',
      label: 'TCGplayer',
      url: tcgUrl,
      hint: card.tcgplayer?.url ? 'Exact product page' : 'Search',
    },
    {
      id: 'pricecharting',
      label: 'PriceCharting',
      // type=prices lands on the price history rather than a product blurb.
      url: `https://www.pricecharting.com/search-products?type=prices&q=${query}`,
      hint: 'Price history',
    },
    {
      id: 'ebay',
      label: 'eBay sold',
      // Sold and completed only: asking prices aren't comps.
      url: `https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1&_sop=13`,
      hint: 'Sold listings, newest first',
    },
  ]
}
