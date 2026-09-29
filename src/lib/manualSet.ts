import { scopedId, type RegionId } from './regions'
import type { ApiCard } from '../types'

/**
 * Sets built by hand, for cards no feed lists yet.
 *
 * New releases reach the APIs weeks after they reach a binder — a promo set
 * printed this month is catalogued by collectors long before it is catalogued
 * by anything this app can call. Rather than leave those cards untrackable,
 * a set can be typed in: a name, how many cards, and optionally the checklist
 * itself.
 *
 * The checklist is kept on the tracked set rather than in the card cache, so
 * it travels with the set list over sync. It is a few hundred short strings;
 * every other device can rebuild the cards from it without being told where
 * to download them, which is the whole point, since there is nowhere.
 */
export interface ManualCard {
  number: string
  name: string
}

/**
 * Reads a pasted checklist.
 *
 * Collectors copy these from a dozen different sites, so the shapes vary:
 * "96 Moltres", "096/102 Moltres", "Moltres - 96", "1. Bulbasaur", or just a
 * bare name per line. A number anywhere obvious is taken as the card's;
 * otherwise the line is a name and takes its position in the list.
 */
export function parseChecklist(text: string): ManualCard[] {
  const cards: ManualCard[] = []
  for (const raw of text.split(/\r?\n/)) {
    // Bullets, tabs and the "1." of a numbered list are formatting, not data.
    const line = raw.replace(/^[\s*•\-–—]+/, '').trim()
    if (!line) continue

    /*
     * "96 Moltres", "096/102 Moltres", "12. Pikachu", and the lettered
     * numbering promos use — SWSH284, MEP096 — which is the numbering most
     * likely to be typed in here, since promo sets are exactly what the feeds
     * are slowest to catalogue.
     */
    const leading = /^([A-Za-z]{0,5}\d{1,4}[A-Za-z]?)(?:\/\d+)?[.)\]]?[\s·:–—-]+(.*)$/.exec(line)
    if (leading && leading[2].trim()) {
      cards.push({ number: leading[1].replace(/^0+(?=\d)/, ''), name: leading[2].trim() })
      continue
    }

    // "Moltres - 96", "Moltres #96", "Charizard SWSH284"
    const trailing = /^(.*?)[\s·:–—-]+#?([A-Za-z]{0,5}\d{1,4}[A-Za-z]?)(?:\/\d+)?$/.exec(line)
    if (trailing && trailing[1].trim()) {
      cards.push({ number: trailing[2].replace(/^0+(?=\d)/, ''), name: trailing[1].trim() })
      continue
    }

    cards.push({ number: String(cards.length + 1), name: line })
  }
  return cards
}

/** Numbered blanks, for someone who knows the size but not the checklist. */
export function blankChecklist(count: number): ManualCard[] {
  const n = Math.max(0, Math.min(2000, Math.trunc(count) || 0))
  return Array.from({ length: n }, (_, i) => ({ number: String(i + 1), name: `Card ${i + 1}` }))
}

/**
 * The cards themselves, in the shape the rest of the app reads.
 *
 * No artwork and no prices: nothing published either. They land in "not
 * priced yet" with everything else that needs a figure by hand.
 */
export function buildManualCards(
  setId: string,
  region: RegionId,
  setName: string,
  checklist: readonly ManualCard[],
): ApiCard[] {
  const total = checklist.length
  return checklist.map((card, i) => ({
    id: scopedId(region, `${setId.replace(/^[a-z-]+:/, '')}-${card.number || i + 1}`),
    name: card.name,
    number: card.number || String(i + 1),
    supertype: 'Pokémon',
    set: { id: setId, name: setName, printedTotal: total, total, releaseDate: '' },
    images: { small: '', large: '' },
  }))
}

/** A set id from a typed name, kept unique so two "Promos" don't collide. */
export function manualSetId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
  return `${slug || 'set'}-${Math.random().toString(36).slice(2, 6)}`
}
