import { VINTAGE_SETS, getSet } from '../data/vintageSets'
import { entryKey, type ApiCard, type CollectionEntry, type CollectionMap, type ConditionId, type Grader, type VintageSet } from '../types'

/* ------------------------------------------------------------------ *
 * Normalising — spreadsheets are written by humans, so match loosely.
 * ------------------------------------------------------------------ */

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** "004/102" -> "4", "H12" -> "H12", "058" -> "58" */
export function normNumber(raw: string): string {
  const first = raw.split('/')[0].trim().toUpperCase()
  const m = first.match(/^([A-Z]*)0*(\d+)([A-Z]*)$/)
  return m ? `${m[1]}${m[2]}${m[3]}` : first
}

/* ------------------------------------------------------------------ *
 * Sets
 * ------------------------------------------------------------------ */

/** Shorthand collectors actually type in a "Set" column. */
const SET_ALIASES: Record<string, string> = {
  base: 'base1',
  'base set': 'base1',
  'base set 1': 'base1',
  bs: 'base1',
  jungle: 'base2',
  ju: 'base2',
  fossil: 'base3',
  fo: 'base3',
  'base set 2': 'base4',
  b2: 'base4',
  'team rocket': 'base5',
  tr: 'base5',
  'gym heroes': 'gym1',
  g1: 'gym1',
  'gym challenge': 'gym2',
  g2: 'gym2',
  'neo genesis': 'neo1',
  n1: 'neo1',
  'neo discovery': 'neo2',
  n2: 'neo2',
  'neo revelation': 'neo3',
  n3: 'neo3',
  'neo destiny': 'neo4',
  n4: 'neo4',
  'legendary collection': 'base6',
  lc: 'base6',
  expedition: 'ecard1',
  'expedition base set': 'ecard1',
  aquapolis: 'ecard2',
  skyridge: 'ecard3',
  'southern islands': 'si1',
  promo: 'basep',
  promos: 'basep',
  'black star promo': 'basep',
  'black star promos': 'basep',
  'wizards black star promos': 'basep',
}

/** Words that describe a print run rather than a set, e.g. "Base Set Shadowless". */
const VARIATION_WORDS = /\b(1st|first)\s*(ed|edition)?\b|\bshadowless\b|\bunlimited\b|\bunl\b|\breverse\b|\brev\s*holo\b|\bholo\b/gi

export interface SetGuess {
  set: VintageSet | null
  /** A print run named inside the set cell, e.g. "Base Set 1st Edition". */
  variantHint: string | null
}

export function matchSet(raw: string): SetGuess {
  if (!raw.trim()) return { set: null, variantHint: null }

  const variantHint = raw.match(VARIATION_WORDS)?.join(' ') ?? null
  const withoutVariation = raw.replace(VARIATION_WORDS, ' ')
  const key = norm(withoutVariation)

  const byAlias = SET_ALIASES[key]
  if (byAlias) return { set: getSet(byAlias) ?? null, variantHint }

  const byId = VINTAGE_SETS.find((s) => norm(s.id) === key)
  if (byId) return { set: byId, variantHint }

  const byName = VINTAGE_SETS.find((s) => norm(s.name) === key)
  if (byName) return { set: byName, variantHint }

  // Last resort: a set whose name is contained in the cell ("1999 Base Set").
  const contained = VINTAGE_SETS.filter((s) => key.includes(norm(s.name)))
  if (contained.length === 1) return { set: contained[0], variantHint }
  // Prefer the longest name, so "Base Set 2" beats "Base Set".
  if (contained.length > 1) {
    const best = [...contained].sort((a, b) => b.name.length - a.name.length)[0]
    return { set: best, variantHint }
  }

  return { set: null, variantHint }
}

/* ------------------------------------------------------------------ *
 * Print variations
 * ------------------------------------------------------------------ */

export function matchVariantId(raw: string): string | null {
  const v = norm(raw)
  if (!v) return null
  if (/\b(1st|first)\b/.test(v) || v === 'ed1' || v === '1e') return 'first-edition'
  if (v.includes('shadowless') || v === 'sl') return 'shadowless'
  if (v.includes('reverse') || v === 'rh' || v.includes('rev holo')) return 'reverse-holo'
  if (v.includes('unlimited') || v === 'unl' || v === 'ul') return 'unlimited'
  return null
}

/* ------------------------------------------------------------------ *
 * Conditions
 * ------------------------------------------------------------------ */

const CONDITION_ALIASES: Record<string, ConditionId> = {
  m: 'M', mint: 'M', 'gem mint': 'M', 'nm mt': 'NM', 'nm m': 'NM',
  nm: 'NM', 'near mint': 'NM', 'near mint mint': 'NM',
  lp: 'LP', 'lightly played': 'LP', 'light play': 'LP', 'slightly played': 'LP', sp: 'LP',
  ex: 'LP', excellent: 'LP', 'ex mt': 'LP', 'excellent mint': 'LP',
  mp: 'MP', 'moderately played': 'MP', 'moderate play': 'MP', played: 'MP',
  gd: 'MP', good: 'MP', vg: 'MP', 'very good': 'MP',
  hp: 'HP', 'heavily played': 'HP', 'heavy play': 'HP', poor: 'HP',
  dmg: 'DMG', damaged: 'DMG', dmgd: 'DMG',
}

export interface ConditionGuess {
  condition: ConditionId | null
  graded: { company: Grader; grade: string } | null
}

/** Reads "NM", "Near Mint", "PSA 10", "BGS 9.5" from one cell. */
export function matchCondition(raw: string): ConditionGuess {
  const value = raw.trim()
  if (!value) return { condition: null, graded: null }

  const graded = value.match(/\b(psa|bgs|cgc|sgc|ace)\b\s*\.?\s*(\d{1,2}(?:\.\d)?)?/i)
  if (graded) {
    const company = graded[1].toUpperCase()
    return {
      // A graded slab is Mint-adjacent; the grade itself carries the detail.
      condition: 'NM',
      graded: {
        company: (['PSA', 'BGS', 'CGC', 'SGC'].includes(company) ? company : 'Other') as Grader,
        grade: graded[2] ?? '',
      },
    }
  }

  const key = norm(value)
  return { condition: CONDITION_ALIASES[key] ?? null, graded: null }
}

/* ------------------------------------------------------------------ *
 * Yes/no and numbers
 * ------------------------------------------------------------------ */

const TRUTHY = new Set(['y', 'yes', 'x', 'true', '1', 'owned', 'own', 'have', 'got', 'complete', 'done', '✓', '✔', 'v'])
const FALSY = new Set(['n', 'no', 'false', '0', 'missing', 'need', 'wanted', 'want', '-', 'none'])

export type Truthiness = 'yes' | 'no' | 'unknown'

export function matchTruthy(raw: string): Truthiness {
  const v = raw.trim().toLowerCase()
  if (!v) return 'unknown'
  if (TRUTHY.has(v)) return 'yes'
  if (FALSY.has(v)) return 'no'
  return 'unknown'
}

export function parseMoney(raw: string): number | undefined {
  if (!raw.trim()) return undefined
  const cleaned = raw.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '')
  const n = Number(cleaned.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function parseCount(raw: string): number | undefined {
  if (!raw.trim()) return undefined
  const n = parseInt(raw.replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/* ------------------------------------------------------------------ *
 * Building an import plan
 * ------------------------------------------------------------------ */

/** How the sheet is laid out. */
export type Layout =
  /** One row per card, with a column naming the print run. */
  | 'long'
  /** One row per card, with a column per print run (1st Ed | Shadowless | ...). */
  | 'wide'

export interface ColumnMapping {
  layout: Layout
  set: number | null
  name: number | null
  number: number | null
  variation: number | null
  condition: number | null
  owned: number | null
  quantity: number | null
  pricePaid: number | null
  notes: number | null
  /** Wide layout: column index -> variant id. */
  variantColumns: Record<number, string>
  /** Print run to assume when a row names none. */
  defaultVariantId: string | null
  /** Set to assume when the sheet has no set column. */
  fallbackSetId: string | null
}

export interface PlannedEntry {
  key: string
  entry: CollectionEntry
  cardName: string
  cardNumber: string
  setName: string
  variantLabel: string
  /** True when this slot is already in the collection. */
  clashes: boolean
}

export interface PlannedRow {
  rowNumber: number
  label: string
  status: 'ready' | 'skipped' | 'unmatched'
  /** Why it was skipped or dropped — or, on a ready row, what to double-check. */
  reason?: string
  entries: PlannedEntry[]
}

export interface ImportPlan {
  rows: PlannedRow[]
  ready: PlannedRow[]
  skipped: PlannedRow[]
  unmatched: PlannedRow[]
  /** Rows that will import, but matched on something the sheet contradicts. */
  warned: PlannedRow[]
  /** Distinct slots that would be written. */
  entryCount: number
  clashCount: number
}

interface SetIndex {
  byNumber: Map<string, ApiCard>
  byName: Map<string, ApiCard[]>
}

export interface CardIndex {
  bySet: Map<string, SetIndex>
  byNameGlobal: Map<string, ApiCard[]>
}

export function buildCardIndex(cards: ApiCard[]): CardIndex {
  const bySet = new Map<string, SetIndex>()
  const byNameGlobal = new Map<string, ApiCard[]>()

  for (const card of cards) {
    let index = bySet.get(card.set.id)
    if (!index) {
      index = { byNumber: new Map(), byName: new Map() }
      bySet.set(card.set.id, index)
    }
    index.byNumber.set(normNumber(card.number), card)

    const nameKey = norm(card.name)
    const inSet = index.byName.get(nameKey)
    if (inSet) inSet.push(card)
    else index.byName.set(nameKey, [card])

    const global = byNameGlobal.get(nameKey)
    if (global) global.push(card)
    else byNameGlobal.set(nameKey, [card])
  }

  return { bySet, byNameGlobal }
}

const cell = (row: string[], col: number | null): string => (col == null ? '' : (row[col] ?? '').trim())

interface CardResolution {
  card: ApiCard | null
  set: VintageSet | null
  variantHint: string | null
  reason?: string
  /** Set when the match is usable but disagrees with the sheet. */
  warning?: string
}

function resolveCard(row: string[], mapping: ColumnMapping, index: CardIndex): CardResolution {
  const setCell = cell(row, mapping.set)
  const nameCell = cell(row, mapping.name)
  const numberCell = cell(row, mapping.number)

  let set: VintageSet | null = null
  let variantHint: string | null = null

  if (setCell) {
    const guess = matchSet(setCell)
    set = guess.set
    variantHint = guess.variantHint
    if (!set) return { card: null, set: null, variantHint, reason: `Set “${setCell}” isn’t one of the tracked vintage sets` }
  } else if (mapping.fallbackSetId) {
    set = getSet(mapping.fallbackSetId) ?? null
  }

  if (!set) {
    // No set to work from — a unique name across the whole library will do.
    if (!nameCell) return { card: null, set: null, variantHint, reason: 'No set and no card name' }
    const matches = index.byNameGlobal.get(norm(nameCell)) ?? []
    if (matches.length === 1) {
      return { card: matches[0], set: getSet(matches[0].set.id) ?? null, variantHint }
    }
    if (matches.length === 0) return { card: null, set: null, variantHint, reason: `No card named “${nameCell}”` }
    const sets = [...new Set(matches.map((c) => c.set.name))]
    return { card: null, set: null, variantHint, reason: `“${nameCell}” appears in ${sets.length} sets — add a Set column` }
  }

  const setIndex = index.bySet.get(set.id)
  if (!setIndex) return { card: null, set, variantHint, reason: `${set.name} card data isn’t downloaded yet` }

  if (numberCell) {
    const byNumber = setIndex.byNumber.get(normNumber(numberCell))
    if (byNumber) return { card: byNumber, set, variantHint }
  }

  if (nameCell) {
    const byName = setIndex.byName.get(norm(nameCell)) ?? []
    if (byName.length === 1) {
      // The number was given and didn't resolve, so say so rather than
      // quietly importing a different card than the row names.
      const warning = numberCell
        ? `Sheet says #${numberCell}, matched ${set.name} #${byName[0].number} by name`
        : undefined
      return { card: byName[0], set, variantHint, warning }
    }
    if (byName.length > 1) {
      return { card: null, set, variantHint, reason: `${set.name} has ${byName.length} cards named “${nameCell}” — add a Number column` }
    }
  }

  const what = [numberCell && `#${numberCell}`, nameCell && `“${nameCell}”`].filter(Boolean).join(' ')
  return { card: null, set, variantHint, reason: what ? `No ${what} in ${set.name}` : 'Row has no card name or number' }
}

export function buildPlan(
  rows: string[][],
  mapping: ColumnMapping,
  index: CardIndex,
  existing: CollectionMap,
  defaultCondition: ConditionId,
): ImportPlan {
  const planned: PlannedRow[] = []
  const seen = new Set<string>()

  rows.forEach((row, i) => {
    const rowNumber = i + 2 // +1 for the header, +1 for 1-based rows
    const label = [cell(row, mapping.number) && `#${cell(row, mapping.number)}`, cell(row, mapping.name)]
      .filter(Boolean)
      .join(' ') || `Row ${rowNumber}`

    const resolution = resolveCard(row, mapping, index)
    if (!resolution.card || !resolution.set) {
      planned.push({ rowNumber, label, status: 'unmatched', reason: resolution.reason, entries: [] })
      return
    }
    const { card, set } = resolution

    // Which print runs does this row speak for, and what's in each cell?
    const targets: { variantId: string; source: string }[] = []
    if (mapping.layout === 'wide') {
      for (const [col, variantId] of Object.entries(mapping.variantColumns)) {
        const value = cell(row, Number(col))
        if (!value) continue
        if (matchTruthy(value) === 'no') continue
        targets.push({ variantId, source: value })
      }
      if (targets.length === 0) {
        planned.push({ rowNumber, label, status: 'skipped', reason: 'No print run marked', entries: [] })
        return
      }
    } else {
      const variationCell = cell(row, mapping.variation)
      const variantId =
        matchVariantId(variationCell) ??
        (resolution.variantHint ? matchVariantId(resolution.variantHint) : null) ??
        mapping.defaultVariantId
      if (!variantId) {
        planned.push({
          rowNumber,
          label,
          status: 'unmatched',
          reason: variationCell ? `Unrecognised print run “${variationCell}”` : 'No print run given',
          entries: [],
        })
        return
      }
      targets.push({ variantId, source: cell(row, mapping.condition) })
    }

    // An explicit "no" in an Owned column takes the row out entirely.
    if (mapping.owned != null && matchTruthy(cell(row, mapping.owned)) === 'no') {
      planned.push({ rowNumber, label, status: 'skipped', reason: 'Marked as not owned', entries: [] })
      return
    }

    const entries: PlannedEntry[] = []
    let reason: string | undefined

    for (const target of targets) {
      const variant = set.variants.find((v) => v.id === target.variantId)
      if (!variant) {
        reason = `${set.name} has no ${target.variantId.replace(/-/g, ' ')} print run`
        continue
      }

      // Condition can come from a dedicated column or, in wide sheets, from
      // whatever was written in the print-run cell ("NM", "PSA 9", "x").
      const conditionCell = mapping.condition != null ? cell(row, mapping.condition) : ''
      const fromColumn = matchCondition(conditionCell)
      const fromCell = matchCondition(target.source)
      const condition = fromColumn.condition ?? fromCell.condition ?? defaultCondition
      const graded = fromColumn.graded ?? fromCell.graded ?? undefined

      const key = entryKey(card.id, variant.id)
      if (seen.has(key)) {
        reason = 'Duplicate of an earlier row'
        continue
      }
      seen.add(key)

      const notes = cell(row, mapping.notes)
      entries.push({
        key,
        cardName: card.name,
        cardNumber: card.number,
        setName: set.name,
        variantLabel: variant.label,
        clashes: Boolean(existing[key]),
        entry: {
          cardId: card.id,
          variantId: variant.id,
          owned: true,
          quantity: parseCount(cell(row, mapping.quantity)) ?? 1,
          condition,
          ...(graded ? { graded } : {}),
          ...(parseMoney(cell(row, mapping.pricePaid)) != null
            ? { pricePaid: parseMoney(cell(row, mapping.pricePaid)) }
            : {}),
          ...(notes ? { notes } : {}),
          updatedAt: new Date().toISOString(),
        },
      })
    }

    if (entries.length === 0) {
      planned.push({ rowNumber, label, status: 'unmatched', reason: reason ?? 'Nothing to import', entries: [] })
      return
    }
    planned.push({ rowNumber, label, status: 'ready', reason: reason ?? resolution.warning, entries })
  })

  const ready = planned.filter((r) => r.status === 'ready')
  return {
    rows: planned,
    ready,
    skipped: planned.filter((r) => r.status === 'skipped'),
    unmatched: planned.filter((r) => r.status === 'unmatched'),
    warned: ready.filter((r) => r.reason),
    entryCount: ready.reduce((n, r) => n + r.entries.length, 0),
    clashCount: ready.reduce((n, r) => n + r.entries.filter((e) => e.clashes).length, 0),
  }
}

export type MergeMode =
  /** Keep what's already in the collection when a slot clashes. */
  | 'keep'
  /** Let the spreadsheet win on clashes. */
  | 'overwrite'
  /** Throw away the current collection and use the sheet alone. */
  | 'replace'

export function applyPlan(plan: ImportPlan, existing: CollectionMap, mode: MergeMode): CollectionMap {
  const next: CollectionMap = mode === 'replace' ? {} : { ...existing }
  for (const row of plan.ready) {
    for (const planned of row.entries) {
      if (mode === 'keep' && next[planned.key]) continue
      next[planned.key] = planned.entry
    }
  }
  return next
}

/* ------------------------------------------------------------------ *
 * Guessing the mapping from the header row
 * ------------------------------------------------------------------ */

/**
 * Header normalising keeps "#", unlike the data normaliser — it's the one
 * punctuation mark that carries meaning in a header ("Card #" vs "Card Name").
 */
const normHeader = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim()

/** Header patterns, most specific first — "price paid" must beat "price". */
const HEADER_PATTERNS: { field: keyof ColumnMapping; patterns: RegExp[] }[] = [
  { field: 'pricePaid', patterns: [/paid/, /\bcost\b/, /purchase/, /buy price/, /acquired for/] },
  { field: 'number', patterns: [/^#$/, /card\s*(no|num|number|#)/, /^(no|num|number|nr)$/, /^card\s*id$/, /^#\s/] },
  { field: 'name', patterns: [/^card$/, /card ?name/, /^name$/, /pokemon/, /^title$/] },
  { field: 'set', patterns: [/^set$/, /set ?name/, /expansion/, /^series$/] },
  { field: 'variation', patterns: [/variation/, /variant/, /^edition$/, /print/, /^version$/, /1st.*unlimited/] },
  { field: 'condition', patterns: [/condition/, /^cond\.?$/, /^grade$/, /grading/, /^state$/] },
  { field: 'owned', patterns: [/owned/, /^own$/, /^have$/, /^got$/, /in collection/, /collected/, /acquired/, /^status$/, /^\?$/] },
  { field: 'quantity', patterns: [/quantity/, /^qty$/, /^count$/, /^copies$/, /^amount$/] },
  { field: 'notes', patterns: [/note/, /comment/, /remark/] },
]

/** Header text that names a print run rather than a field (wide layout). */
function variantColumnId(header: string): string | null {
  const h = norm(header)
  // Only treat it as a print-run column when the header is essentially just
  // the print run's name, so "Unlimited Price" doesn't become a checkbox.
  if (/(price|value|market|paid|cost|worth)/.test(h)) return null
  return matchVariantId(header)
}

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    layout: 'long',
    set: null,
    name: null,
    number: null,
    variation: null,
    condition: null,
    owned: null,
    quantity: null,
    pricePaid: null,
    notes: null,
    variantColumns: {},
    defaultVariantId: null,
    fallbackSetId: null,
  }

  const normalised = headers.map((h) => normHeader(h))
  const taken = new Set<number>()

  // Columns whose header is a print-run name make this a wide sheet.
  headers.forEach((header, i) => {
    const variantId = variantColumnId(header)
    if (variantId) {
      mapping.variantColumns[i] = variantId
      taken.add(i)
    }
  })
  if (Object.keys(mapping.variantColumns).length >= 2) {
    mapping.layout = 'wide'
  } else {
    // A single print-run column is more likely a value than a layout.
    mapping.variantColumns = {}
    taken.clear()
  }

  for (const { field, patterns } of HEADER_PATTERNS) {
    if (mapping[field] != null) continue
    const found = normalised.findIndex((h, i) => !taken.has(i) && patterns.some((p) => p.test(h)))
    if (found >= 0) {
      ;(mapping[field] as number | null) = found
      taken.add(found)
    }
  }

  // In a wide sheet the per-run columns carry ownership, so a stray "owned"
  // column would only fight them.
  if (mapping.layout === 'wide') mapping.owned = null

  return mapping
}

export const MAPPABLE_FIELDS = [
  { field: 'name', label: 'Card name', hint: 'Charizard' },
  { field: 'number', label: 'Card number', hint: '4 or 4/102' },
  { field: 'set', label: 'Set', hint: 'Base Set, Jungle…' },
  { field: 'variation', label: 'Print run', hint: '1st Edition, Shadowless…' },
  { field: 'condition', label: 'Condition', hint: 'NM, Lightly Played, PSA 9' },
  { field: 'owned', label: 'Owned', hint: 'Yes/No, X, ✓' },
  { field: 'quantity', label: 'Quantity', hint: '1, 2, 3…' },
  { field: 'pricePaid', label: 'Price paid', hint: '$9,500' },
  { field: 'notes', label: 'Notes', hint: 'Anything else' },
] as const satisfies readonly { field: keyof ColumnMapping; label: string; hint: string }[]
