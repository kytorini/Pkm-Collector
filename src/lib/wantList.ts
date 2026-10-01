import { formatMoney, priceFor, type PriceResolver } from './pricing'
import { allSets, type TrackedSet } from './sets'
import { entryKey, type ApiCard, type CollectionMap, type SetVariant } from '../types'

/**
 * The cards you still need, written out for somebody else to read.
 *
 * The app knows what is missing — that is what the remaining-cost figure is
 * counting — but only as a number on a tile. Buying the cards means telling a
 * seller which ones, and nobody is going to read a list of 300 slots off a
 * phone screen and retype it into a message.
 *
 * Three shapes, because "a list of what I need" means something different
 * depending on who is reading it:
 *
 *  - `message` for a person: grouped, named, countable at a glance.
 *  - `numbers` for a dealer's chat window: just the numbers, with runs of
 *    consecutive cards collapsed, because "4-19" is the same information as
 *    sixteen commas and fits in a message.
 *  - `csv` for a seller who works from a spreadsheet.
 *
 * Only sets you are chasing can be missing anything: a set kept for singles
 * has no complete state to fall short of, so its unowned cards aren't wants.
 */

export interface WantSlot {
  card: ApiCard
  set: TrackedSet
  variant: SetVariant
  /** Market price of this run, when any feed has one. */
  market: number | null
}

export type WantFormat = 'message' | 'numbers' | 'csv'

export interface WantOptions {
  /** Put market prices beside the cards, for pricing the ask up front. */
  prices?: boolean
  /** Stamped on the export so a list found later says when it was true. */
  now?: Date
}

const AUTO_PRICE: PriceResolver = (card, variant) => priceFor(card, variant)

/** Every run of every card you don't own, in the sets you picked. */
export function missingSlots(
  cardsBySet: Record<string, ApiCard[]>,
  collection: CollectionMap,
  setIds: readonly string[],
  price: PriceResolver = AUTO_PRICE,
): WantSlot[] {
  const wanted = new Set(setIds)
  const slots: WantSlot[] = []
  // Your own set order, then the set's own card order, so the list reads as a
  // walk through the binder rather than a pile.
  for (const set of allSets()) {
    if (!wanted.has(set.id)) continue
    const cards = cardsBySet[set.id]
    if (!cards?.length) continue
    for (const card of cards) {
      for (const variant of set.variants) {
        if (collection[entryKey(card.id, variant.id)]?.owned) continue
        slots.push({ card, set, variant, market: price(card, variant).market })
      }
    }
  }
  return slots
}

/** How many a set is short, for the picker to show before anything is exported. */
export function missingBySet(
  cardsBySet: Record<string, ApiCard[]>,
  collection: CollectionMap,
  sets: readonly TrackedSet[],
  price: PriceResolver = AUTO_PRICE,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const set of sets) {
    counts.set(set.id, missingSlots(cardsBySet, collection, [set.id], price).length)
  }
  return counts
}

interface Group {
  set: TrackedSet
  variant: SetVariant
  slots: WantSlot[]
}

/** Split by set and run, keeping the order the slots arrived in. */
function groupSlots(slots: readonly WantSlot[]): Group[] {
  const groups: Group[] = []
  const index = new Map<string, Group>()
  for (const slot of slots) {
    const key = `${slot.set.id}::${slot.variant.id}`
    let group = index.get(key)
    if (!group) {
      group = { set: slot.set, variant: slot.variant, slots: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.slots.push(slot)
  }
  return groups
}

/**
 * "2, 4, 10-14, SH1" — consecutive numbers collapsed into ranges.
 *
 * Only for runs of three or more: "4-5" is longer to read than "4, 5" and
 * saves nothing. Lettered numbers (SH1, TG05, SWSH284) are grouped by their
 * prefix so a promo run collapses too, and anything that doesn't parse is
 * passed through untouched rather than guessed at.
 */
export function collapseNumbers(numbers: readonly string[]): string {
  const parts: string[] = []
  let runPrefix: string | null = null
  let runStart: number | null = null
  let runEnd = 0
  let runStartText = ''
  let runEndText = ''

  const flush = () => {
    if (runStart === null) return
    const length = runEnd - runStart + 1
    if (length >= 3) parts.push(`${runStartText}-${runEndText}`)
    else for (let n = 0; n < length; n++) parts.push(n === 0 ? runStartText : runEndText)
    runPrefix = null
    runStart = null
  }

  for (const raw of numbers) {
    const match = /^([A-Za-z]*)(\d+)$/.exec(raw.trim())
    if (!match) {
      flush()
      parts.push(raw)
      continue
    }
    const [, prefix, digits] = match
    const value = parseInt(digits, 10)
    if (runStart !== null && prefix === runPrefix && value === runEnd + 1) {
      runEnd = value
      runEndText = raw
      continue
    }
    flush()
    runPrefix = prefix
    runStart = value
    runEnd = value
    runStartText = raw
    runEndText = raw
  }
  flush()
  return parts.join(', ')
}

const csvCell = (value: unknown): string => {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A set's runs only need naming when it has more than one. */
const runLabel = (group: Group): string =>
  group.set.variants.length > 1 ? ` (${group.variant.label})` : ''

const dated = (now: Date): string =>
  now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

export function wantListText(
  slots: readonly WantSlot[],
  format: WantFormat,
  { prices = false, now = new Date() }: WantOptions = {},
): string {
  if (format === 'csv') return wantListCsv(slots)
  const groups = groupSlots(slots)
  if (groups.length === 0) return 'Nothing missing — every card in those sets is accounted for.'

  const lines: string[] = [`Want list · ${dated(now)} · ${slots.length} card${slots.length === 1 ? '' : 's'}`, '']

  for (const group of groups) {
    const head = `${group.set.name}${runLabel(group)} — ${group.slots.length} missing`
    if (format === 'numbers') {
      lines.push(head, collapseNumbers(group.slots.map((s) => s.card.number)), '')
      continue
    }
    lines.push(head)
    for (const slot of group.slots) {
      const total = slot.card.set.printedTotal || slot.set.total
      const number = total ? `${slot.card.number}/${total}` : `#${slot.card.number}`
      const price = prices && slot.market != null ? ` — ${formatMoney(slot.market)}` : ''
      lines.push(`  ${number} ${slot.card.name}${price}`)
    }
    lines.push('')
  }

  if (prices) {
    const known = slots.filter((s) => s.market != null)
    const sum = known.reduce((n, s) => n + (s.market ?? 0), 0)
    lines.push(
      known.length === slots.length
        ? `Market total: ${formatMoney(sum)}`
        : `Market total: ${formatMoney(sum)} across ${known.length} of ${slots.length} — the rest have no listed price.`,
    )
  }
  return lines.join('\n').trimEnd()
}

export function wantListCsv(slots: readonly WantSlot[]): string {
  const header = ['Set', 'Year', 'Run', 'Number', 'Printed total', 'Card', 'Rarity', 'Market price (USD)']
  const rows = slots.map((slot) => [
    slot.set.name,
    slot.set.year,
    slot.variant.label,
    slot.card.number,
    slot.card.set.printedTotal || slot.set.total,
    slot.card.name,
    slot.card.rarity ?? '',
    slot.market ?? '',
  ])
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
}

/** What the downloaded file is called, so several of them stay apart. */
export function wantListFilename(format: WantFormat, now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10)
  return `pkm-want-list-${stamp}.${format === 'csv' ? 'csv' : 'txt'}`
}
