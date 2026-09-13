import type { ApiCard, CollectionEntry, SetVariant, TcgPriceBucket } from '../types'

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
 *   'rec:<where>'             a figure you read on that site and typed in
 */
export type PriceSourceId = string

export const AUTO: PriceSourceId = 'auto'
/** Written before prices were tagged by where they were read. Means 'rec:own'. */
export const MANUAL: PriceSourceId = 'manual'

/**
 * Sites whose prices you read yourself.
 *
 * PriceCharting and eBay publish no free interface a browser can call — there
 * is no key to paste and no endpoint to hit — so there is nothing to fetch
 * automatically. What there is instead: the card panel already links to both,
 * a set can be filled in one pass, and the figure is then a first-class
 * source like any other.
 */
export const RECORDED_SOURCES: { key: string; label: string; linkId: string; site: string }[] = [
  { key: 'pricecharting', label: 'PriceCharting', linkId: 'pricecharting', site: 'PriceCharting' },
  { key: 'ebay', label: 'eBay sold', linkId: 'ebay', site: 'eBay' },
  { key: 'own', label: 'Your own price', linkId: '', site: '' },
]

export const isRecorded = (id: PriceSourceId): boolean => id === MANUAL || id.startsWith('rec:')
export const recordedKey = (id: PriceSourceId): string => (id === MANUAL ? 'own' : id.slice(4))
export const recordedSourceId = (key: string): PriceSourceId => `rec:${key}`

/** The figure you recorded for one site, honouring the older single field. */
export function recordedPrice(entry: CollectionEntry | undefined, key: string): number | null {
  const tagged = entry?.manualPrices?.[key]
  if (tagged != null) return tagged
  if (key === 'own' && entry?.manualPrice != null) return entry.manualPrice
  return null
}

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
export function sourceOptions(
  level: 'collection' | 'set' | 'variant' | 'card',
  /** What "inherit" means here, e.g. "Use the Base Set setting". */
  inheritLabel?: string,
): PriceSourceOption[] {
  const options: PriceSourceOption[] = [
    { id: AUTO, label: level === 'collection' ? 'Auto (recommended)' : 'Auto', group: 'Automatic' },
  ]
  if (level !== 'collection') {
    options.push({ id: 'inherit', label: inheritLabel ?? 'Inherit', group: 'Automatic' })
  }
  for (const bucket of TCG_BUCKETS) {
    options.push({ id: `tcg:${bucket.key}`, label: bucket.label, group: 'TCGplayer' })
  }
  for (const stat of CM_STATS) {
    options.push({ id: `cm:${stat.key}`, label: `${stat.label} (converted from €)`, group: 'Cardmarket' })
  }
  // Offered everywhere: after filling a run in, the set is pointed at it.
  for (const source of RECORDED_SOURCES) {
    options.push({ id: recordedSourceId(source.key), label: source.label, group: 'Read by you' })
  }
  return options
}

export function labelFor(id: PriceSourceId): string {
  if (id === AUTO) return 'Auto'
  if (id === 'inherit') return 'Inherited'
  if (isRecorded(id)) {
    const key = recordedKey(id)
    return RECORDED_SOURCES.find((s) => s.key === key)?.label ?? 'Your own price'
  }
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
