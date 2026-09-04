import type { ApiCard, SetVariant, TcgPriceBucket } from '../types'

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
  /** Set when we could only fall back to Cardmarket (EUR). */
  currency: 'USD' | 'EUR'
}

const EMPTY: VariantPrice = { market: null, low: null, high: null, bucket: null, approximate: false, currency: 'USD' }

function pick(bucket: TcgPriceBucket): number | null {
  return bucket.market ?? bucket.mid ?? bucket.low ?? null
}

/**
 * Resolves the market price for one card in one print variation by walking the
 * variation's preferred TCGplayer buckets, then falling back to Cardmarket.
 */
export function priceFor(card: ApiCard, variant: SetVariant): VariantPrice {
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
    return {
      market: cmPrice,
      low: cm?.lowPrice ?? null,
      high: null,
      bucket: 'cardmarket',
      approximate: true,
      updatedAt: card.cardmarket?.updatedAt,
      url: card.cardmarket?.url,
      currency: 'EUR',
    }
  }

  return { ...EMPTY, url: card.tcgplayer?.url }
}

export function formatMoney(value: number | null | undefined, currency: 'USD' | 'EUR' = 'USD'): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}
