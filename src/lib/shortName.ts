/**
 * Set names cut down to what a collector would actually say.
 *
 * "Scarlet & Violet Black Star Promos" is 33 characters riding in a row that
 * already carries a card name, a number, a print run and a price. On a phone
 * it either wrapped or was cut off mid-word, and neither told you anything.
 * Nobody says it in full anyway — it's the S&V promos.
 *
 * Three tactics, in order of how much they keep:
 *
 *  1. Series everyone already writes as initials: Scarlet & Violet is S&V.
 *  2. Phrases with a settled short form: Black Star Promos is just Promos.
 *  3. Only if it is *still* long: drop a trailing filler word, then clip on a
 *     word boundary rather than mid-syllable.
 *
 * The first two run always, because the short form is what the name is called
 * — not a compromise. The third runs only under pressure, because clipping
 * genuinely loses something. Callers keep the full name in a `title`, so it is
 * never gone, only folded away.
 */

/** Characters a name can take before tactic 3 starts cutting. */
const BUDGET = 24

/**
 * Series prefixes, abbreviated only when something follows them: the set
 * actually *named* "Scarlet & Violet" would become a bare "S&V", which reads
 * as the era rather than the set.
 */
const SERIES: Array<[RegExp, string]> = [
  [/^Scarlet & Violet (?=\S)/, 'S&V '],
  [/^Sword & Shield (?=\S)/, 'S&S '],
  [/^Sun & Moon (?=\S)/, 'S&M '],
  [/^Diamond & Pearl (?=\S)/, 'D&P '],
  [/^Black & White (?=\S)/, 'B&W '],
  [/^HeartGold & SoulSilver (?=\S)/, 'HGSS '],
  [/^Legend Maker (?=\S)/, 'LM '],
]

/** Phrases collectors have their own shorthand for. */
const PHRASES: Array<[RegExp, string]> = [
  [/\bBlack Star Promos\b/g, 'Promos'],
  [/\bTrainer Gallery\b/g, 'TG'],
  [/\bGalarian Gallery\b/g, 'GG'],
  [/\bAnniversary\b/g, 'Anniv.'],
]

/** Words carrying no information once the rest of the name is there. */
const FILLER = [/ Collection$/, / Expansion$/, / Series$/, /^Pokémon /]

export function shortSetName(name: string, budget = BUDGET): string {
  let out = name.trim()
  for (const [pattern, short] of SERIES) out = out.replace(pattern, short)
  for (const [pattern, short] of PHRASES) out = out.replace(pattern, short)
  if (out.length <= budget) return out

  for (const pattern of FILLER) {
    const trimmed = out.replace(pattern, '').trim()
    // Never trim a name away to nothing, or to a fragment that names nothing.
    if (trimmed.length >= 3) out = trimmed
    if (out.length <= budget) return out
  }
  return clip(out, budget)
}

/**
 * Cuts on a word boundary, so "Phantasmal Flames" becomes "Phantasmal…"
 * rather than "Phantasmal Fla…" — a half word reads as a typo. A single word
 * longer than the budget has no boundary to use, so it is cut where it falls.
 */
function clip(text: string, budget: number): string {
  const space = text.lastIndexOf(' ', budget)
  if (space >= Math.ceil(budget / 2)) return `${text.slice(0, space)}…`
  return `${text.slice(0, budget)}…`
}
