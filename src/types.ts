/** Condition grades, ordered best -> worst. Raw (ungraded) cards only. */
export const CONDITIONS = [
  { id: 'M', label: 'Mint' },
  { id: 'NM', label: 'Near Mint' },
  { id: 'LP', label: 'Lightly Played' },
  { id: 'MP', label: 'Moderately Played' },
  { id: 'HP', label: 'Heavily Played' },
  { id: 'DMG', label: 'Damaged' },
] as const

export type ConditionId = (typeof CONDITIONS)[number]['id']

export const GRADERS = ['PSA', 'BGS', 'CGC', 'SGC', 'Other'] as const
export type Grader = (typeof GRADERS)[number]

/**
 * One print variation of a set (e.g. Base Set 1st Edition vs Shadowless vs
 * Unlimited). Each variation is tracked separately in the collection.
 */
export interface SetVariant {
  id: string
  label: string
  /** Compact label used on tabs and badges. */
  short: string
  /**
   * TCGplayer price buckets to try, in order, when pricing this variation.
   * The first bucket present on a card wins.
   */
  priceKeys: string[]
  /**
   * True when no price feed maps cleanly to this variation, so the displayed
   * price is only a reference point (shown with a "~" and a caveat).
   */
  approximatePrice?: boolean
  /**
   * Allows a set-wide price (Cardmarket trend) to stand in when this
   * variation's own buckets are missing. Only for variations that trade near
   * the set baseline — never for scarce prints like 1st Edition.
   */
  genericFallback?: boolean
  /** Shown in the UI to explain how to identify this print. */
  note?: string
}

export interface VintageSet {
  /** pokemontcg.io set id, e.g. "base1". */
  id: string
  name: string
  series: string
  year: number
  /** Printed card count, used before the API responds. */
  total: number
  variants: SetVariant[]
}

/** A card as returned by api.pokemontcg.io/v2 (only the fields we use). */
export interface ApiCard {
  id: string
  name: string
  number: string
  supertype: string
  subtypes?: string[]
  rarity?: string
  artist?: string
  types?: string[]
  hp?: string
  flavorText?: string
  set: { id: string; name: string; printedTotal: number; total: number; releaseDate: string }
  images: { small: string; large: string }
  tcgplayer?: {
    url?: string
    updatedAt?: string
    prices?: Record<string, TcgPriceBucket | undefined>
  }
  cardmarket?: {
    url?: string
    updatedAt?: string
    prices?: { trendPrice?: number; averageSellPrice?: number; lowPrice?: number }
  }
}

export interface TcgPriceBucket {
  low?: number | null
  mid?: number | null
  high?: number | null
  market?: number | null
  directLow?: number | null
}

/** One tracked slot: a specific card in a specific print variation. */
export interface CollectionEntry {
  cardId: string
  variantId: string
  owned: boolean
  quantity: number
  condition: ConditionId
  graded?: { company: Grader; grade: string }
  pricePaid?: number
  acquiredOn?: string
  notes?: string
  updatedAt: string
}

export type CollectionMap = Record<string, CollectionEntry>

export const entryKey = (cardId: string, variantId: string) => `${cardId}::${variantId}`
