import { convertEurToUsd } from './fx'
import { AUTO, MANUAL, labelFor, matchesVariant, readBucket } from './priceSources'
import type { PriceRules } from './priceRules'
import type { PriceSourceId } from './priceSources'
import type { ApiCard, CollectionEntry, SetVariant, TcgPriceBucket } from '../types'

export interface VariantPrice {
  /** Best available "what it trades at" number, in USD. */
  market: number | null
  low: number | null
  high: number | null
  /** Which TCGplayer bucket this came from, e.g. "1stEditionHolofoil". */
  bucket: string | null
  /** True when the bucket does not exactly match the variation (Shadowless). */
  approximate: boolean
  updatedAt?: string
  url?: string
  /** Everything is reported in USD; euro sources are converted. */
  currency: 'USD'
  /** True when the figure came from a euro source and was converted. */
  converted?: boolean
  /** The source that produced this figure, for the UI to name. */
  sourceId: PriceSourceId
  /**
   * True when a source was chosen explicitly and has nothing for this card.
   * Distinguishes "no price anywhere" from "no price from the feed you picked",
   * which is the difference between a gap and a bad choice of source.
   */
  sourceEmpty?: boolean
}

const EMPTY: VariantPrice = { market: null, low: null, high: null, bucket: null, approximate: false, currency: 'USD', sourceId: AUTO }

const toUsd = (value: number | null | undefined): number | null =>
  value == null ? null : convertEurToUsd(value)

function pick(bucket: TcgPriceBucket): number | null {
  return bucket.market ?? bucket.mid ?? bucket.low ?? null
}

/**
 * Which source applies to one slot: the card's own choice, else the set's,
 * else the collection's, else automatic.
 */
export function resolveSourceId(
  setId: string,
  entry: CollectionEntry | undefined,
  rules: PriceRules,
): PriceSourceId {
  return entry?.priceSource ?? rules.bySet[setId] ?? rules.collection ?? AUTO
}

/**
 * A price reader bound to the current rules and collection. Passing this
 * around keeps every total, tile and panel reading the same sources.
 */
export type PriceResolver = (card: ApiCard, variant: SetVariant) => VariantPrice

export function makePriceResolver(
  rules: PriceRules,
  entryFor: (cardId: string, variantId: string) => CollectionEntry | undefined,
): PriceResolver {
  return (card, variant) => {
    const entry = entryFor(card.id, variant.id)
    return priceFor(card, variant, { source: resolveSourceId(card.set.id, entry, rules), entry })
  }
}

export interface PriceOptions {
  source?: PriceSourceId
  entry?: CollectionEntry
}

/**
 * Resolves the market price for one card in one print variation.
 *
 * On 'auto' this walks the variation's preferred TCGplayer buckets and then
 * its permitted fallback. Any other source is read literally: if the bucket
 * you picked has nothing for this card, the answer is "nothing", not a
 * quietly substituted figure from a different print run.
 */
export function priceFor(card: ApiCard, variant: SetVariant, options: PriceOptions = {}): VariantPrice {
  const source = options.source ?? AUTO

  if (source === MANUAL) {
    const manual = options.entry?.manualPrice
    if (manual == null) return { ...EMPTY, url: card.tcgplayer?.url, sourceId: MANUAL, sourceEmpty: true }
    return {
      market: manual,
      low: null,
      high: null,
      bucket: 'your own price',
      approximate: false,
      url: card.tcgplayer?.url,
      currency: 'USD',
      sourceId: MANUAL,
    }
  }

  if (source.startsWith('tcg:')) {
    const key = source.slice(4)
    const value = readBucket(card.tcgplayer?.prices?.[key])
    if (value == null) {
      return { ...EMPTY, url: card.tcgplayer?.url, sourceId: source, sourceEmpty: true }
    }
    const bucket = card.tcgplayer?.prices?.[key]
    return {
      market: value,
      low: bucket?.low ?? null,
      high: bucket?.high ?? null,
      bucket: key,
      // A hand-picked bucket from another print run is a reference, not a quote.
      approximate: !matchesVariant(source, variant) || Boolean(variant.approximatePrice),
      updatedAt: card.tcgplayer?.updatedAt,
      url: card.tcgplayer?.url,
      currency: 'USD',
      sourceId: source,
    }
  }

  if (source.startsWith('cm:')) {
    const stat = source.slice(3) as 'trendPrice' | 'averageSellPrice' | 'lowPrice'
    const value = card.cardmarket?.prices?.[stat]
    if (value == null) {
      return { ...EMPTY, url: card.cardmarket?.url, sourceId: source, sourceEmpty: true }
    }
    return {
      market: toUsd(value),
      low: toUsd(card.cardmarket?.prices?.lowPrice),
      high: null,
      bucket: `cardmarket ${labelFor(source).toLowerCase()}`,
      // Cardmarket quotes a set-wide figure, not a per-print-run one.
      approximate: true,
      converted: true,
      updatedAt: card.cardmarket?.updatedAt,
      url: card.cardmarket?.url,
      currency: 'USD',
      sourceId: source,
    }
  }

  return autoPrice(card, variant)
}

function autoPrice(card: ApiCard, variant: SetVariant): VariantPrice {
  const buckets = card.tcgplayer?.prices ?? {}
  for (const key of variant.priceKeys) {
    const bucket = buckets[key]
    if (bucket && pick(bucket) != null) {
      return {
        market: pick(bucket),
        low: bucket.low ?? null,
        high: bucket.high ?? null,
        bucket: key,
        approximate: Boolean(variant.approximatePrice),
        updatedAt: card.tcgplayer?.updatedAt,
        url: card.tcgplayer?.url,
        currency: 'USD',
        sourceId: AUTO,
      }
    }
  }

  // The variation's own buckets are missing. Only variations that trade close
  // to the set's baseline may borrow a generic price — never fall back onto
  // another variation's bucket, which would price an Unlimited Charizard off
  // the 1st Edition listing.
  if (!variant.genericFallback) return { ...EMPTY, url: card.tcgplayer?.url }

  const cm = card.cardmarket?.prices
  const cmPrice = cm?.trendPrice ?? cm?.averageSellPrice ?? null
  if (cmPrice != null) {
    // Cardmarket quotes euros. Convert so this can be added to USD prices
    // without producing a total that means nothing.
    return {
      market: toUsd(cmPrice),
      low: toUsd(cm?.lowPrice),
      high: null,
      bucket: 'cardmarket',
      approximate: true,
      converted: true,
      updatedAt: card.cardmarket?.updatedAt,
      url: card.cardmarket?.url,
      currency: 'USD',
      sourceId: AUTO,
    }
  }

  return { ...EMPTY, url: card.tcgplayer?.url }
}

export function formatMoney(value: number | null | undefined, currency: 'USD' = 'USD'): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}
