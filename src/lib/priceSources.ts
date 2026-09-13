import type { ApiCard, SetVariant, TcgPriceBucket } from '../types'

/**
 * Where a price comes from.
 *
 * The card feed publishes several price buckets per card, and which one is
 * right is a judgement call the collector is better placed to make than we
 * are: a set whose 1st Edition run has no TCGplayer listing may still be
 * priced on Cardmarket, and a scarce card may only have a figure on a site we
 * can't read at all. So the source is selectable, at three levels — the whole
 * collection, one set, or one card — and "your own price" is always available
 * as the last resort.
 *
 * An id is one of:
 *   'auto'                    the variation's own buckets, then its permitted
 *                             fallback — what the app has always done
 *   'manual'                  a figure you recorded yourself
 *   'tcg:<bucket>'            one named TCGplayer bucket, and only that one
 *   'cm:<stat>'               one named Cardmarket figure, converted to USD
 */
export type PriceSourceId = string

export const AUTO: PriceSourceId = 'auto'
export const MANUAL: PriceSourceId = 'manual'

/** Every bucket the API is known to publish, in the order they're offered. */
export const TCG_BUCKETS: { key: string; label: string }[] = [
  { key: '1stEditionHolofoil', label: '1st Edition Holofoil' },
  { key: '1stEditionNormal', label: '1st Edition Normal' },
  { key: '1stEdition', label: '1st Edition' },
  { key: 'unlimitedHolofoil', label: 'Unlimited Holofoil' },
  { key: 'unlimitedNormal', label: 'Unlimited Normal' },
  { key: 'holofoil', label: 'Holofoil' },
  { key: 'normal', label: 'Normal' },
  { key: 'reverseHolofoil', label: 'Reverse Holofoil' },
]

export const CM_STATS: { key: 'trendPrice' | 'averageSellPrice' | 'lowPrice'; label: string }[] = [
  { key: 'trendPrice', label: 'Trend price' },
  { key: 'averageSellPrice', label: 'Average sold' },
  { key: 'lowPrice', label: 'Lowest listing' },
]

export interface PriceSourceOption {
  id: PriceSourceId
  label: string
  /** Groups the options under an <optgroup>. */
  group: string
}

/**
 * The sources offerable at a given level. "Your own price" is a per-card
 * figure, so it is only offered there.
 */
export function sourceOptions(level: 'collection' | 'set' | 'card'): PriceSourceOption[] {
  const options: PriceSourceOption[] = [
    { id: AUTO, label: level === 'card' ? 'Auto' : 'Auto (recommended)', group: 'Automatic' },
  ]
  if (level !== 'collection') {
    options.push({ id: 'inherit', label: level === 'set' ? 'Use the collection default' : 'Use the set default', group: 'Automatic' })
  }
  for (const bucket of TCG_BUCKETS) {
    options.push({ id: `tcg:${bucket.key}`, label: bucket.label, group: 'TCGplayer' })
  }
  for (const stat of CM_STATS) {
    options.push({ id: `cm:${stat.key}`, label: `${stat.label} (converted from €)`, group: 'Cardmarket' })
  }
  if (level === 'card') options.push({ id: MANUAL, label: 'Your own price', group: 'Manual' })
  return options
}

export function labelFor(id: PriceSourceId): string {
  if (id === AUTO) return 'Auto'
  if (id === MANUAL) return 'Your own price'
  if (id === 'inherit') return 'Inherited'
  if (id.startsWith('tcg:')) {
    const key = id.slice(4)
    return TCG_BUCKETS.find((b) => b.key === key)?.label ?? key
  }
  if (id.startsWith('cm:')) {
    const key = id.slice(3)
    return CM_STATS.find((s) => s.key === key)?.label ?? key
  }
  return id
}

/** Inside one chosen bucket, the figure to read — never another bucket. */
export function readBucket(bucket: TcgPriceBucket | undefined): number | null {
  if (!bucket) return null
  return bucket.market ?? bucket.mid ?? bucket.low ?? null
}

/**
 * What a source would return for this card, without applying it. Used to show
 * what the feed actually holds, so a source is chosen from what exists rather
 * than guessed at.
 */
export function previewSource(card: ApiCard, id: PriceSourceId): number | null {
  if (id.startsWith('tcg:')) return readBucket(card.tcgplayer?.prices?.[id.slice(4)])
  if (id.startsWith('cm:')) {
    const stat = id.slice(3) as 'trendPrice' | 'averageSellPrice' | 'lowPrice'
    return card.cardmarket?.prices?.[stat] ?? null
  }
  return null
}

/** True when the chosen bucket is one the variation would have used anyway. */
export function matchesVariant(id: PriceSourceId, variant: SetVariant): boolean {
  return id.startsWith('tcg:') && variant.priceKeys.includes(id.slice(4))
}
