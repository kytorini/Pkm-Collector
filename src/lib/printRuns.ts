import type { ApiCard, SetVariant } from '../types'

/**
 * Whether a card was printed in a given run of its set.
 *
 * A set's runs are not every card's runs. Reverse holos are printed for the
 * main numbered list only: the secret rares numbered past the printed total —
 * 151's Illustration Rares and Special Illustration Rares, #166 to #207 — and
 * the lettered subsets (Aquapolis's H1–H32, Trainer Galleries, Shiny Vaults)
 * come in one finish and no other. Offering a reverse holo slot for them
 * invents 42 cards in 151 that can never be found.
 *
 * Pokémon ex are the same: 151's Ninetales ex #38 sits inside the main list
 * but is printed in one finish only. So are the other rule-box Pokémon —
 * EX, GX, V, VMAX, VSTAR.
 *
 * Only a reverse holo run beside another run is trimmed. A set printed in
 * reverse holo throughout has that as its only run, and every card is in it.
 */
export function inRun(card: ApiCard, variant: SetVariant, runs: readonly SetVariant[]): boolean {
  if (variant.id !== 'reverse-holo') return true
  if (!runs.some((run) => run.id !== 'reverse-holo')) return true
  if (isRuleBox(card)) return false
  // The price feed quoting one settles it, whatever the number says.
  if (card.tcgplayer?.prices?.reverseHolofoil) return true
  const printed = card.set.printedTotal
  if (!printed) return true
  if (!/^\d+$/.test(card.number)) return false
  return Number(card.number) <= printed
}

const RULE_BOX = new Set(['ex', 'EX', 'GX', 'V', 'VMAX', 'VSTAR', 'V-UNION'])
const RULE_BOX_NAME = /\s(ex|EX|GX|V|VMAX|VSTAR)$/

/**
 * ex, GX, V and the like. Read from the card's subtypes where the feed gives
 * them; TCGdex doesn't, so the name's suffix ("Ninetales ex") stands in.
 */
function isRuleBox(card: ApiCard): boolean {
  if (card.subtypes?.some((t) => RULE_BOX.has(t))) return true
  return RULE_BOX_NAME.test(card.name.trim())
}

/** The runs this card was printed in, in the set's order. */
export function runsFor(card: ApiCard, runs: readonly SetVariant[]): SetVariant[] {
  return runs.filter((run) => inRun(card, run, runs))
}

/** The cards printed in one run of a set. */
export function cardsInRun(cards: readonly ApiCard[], variant: SetVariant, runs: readonly SetVariant[]): ApiCard[] {
  return cards.filter((card) => inRun(card, variant, runs))
}

/**
 * Whether a set's page opens on every run in one grid. Normal and reverse
 * holo are the same cards in two finishes, collected side by side, so they
 * read best together; 1st Edition and Unlimited are worked through one run
 * at a time and keep their tabs.
 */
export function showsRunsTogether(runs: readonly SetVariant[]): boolean {
  return runs.length > 1 && runs.some((run) => run.id === 'reverse-holo')
}
