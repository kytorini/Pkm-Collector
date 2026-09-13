/**
 * Currency conversion for the minority of cards priced only in euros.
 *
 * Most prices come from TCGplayer in USD, but cards without a TCGplayer entry
 * fall back to Cardmarket, which quotes EUR. Mixing the two silently made
 * collection totals meaningless — adding euros to dollars — so euro prices are
 * converted to USD before anything sums them.
 */

const CACHE_KEY = 'pkm-collector:fx'
/** European Central Bank rates, free and without a key. */
const RATE_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD'
const TTL_MS = 24 * 60 * 60 * 1000

/**
 * Used only until a live rate arrives, and on a device that has never had one.
 * Approximate by nature: a euro-priced card is an estimate regardless.
 */
const FALLBACK_EUR_USD = 1.08

interface FxCache {
  eurToUsd: number
  fetchedAt: number
}

function readCache(): FxCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FxCache>
    if (typeof parsed.eurToUsd !== 'number' || !Number.isFinite(parsed.eurToUsd)) return null
    // A nonsensical rate is worse than no rate.
    if (parsed.eurToUsd <= 0.5 || parsed.eurToUsd >= 2) return null
    return { eurToUsd: parsed.eurToUsd, fetchedAt: Number(parsed.fetchedAt) || 0 }
  } catch {
    return null
  }
}

// Held in memory so pricing stays synchronous: every card in a set is priced
// during render, and none of that can wait on a network round trip.
let current: FxCache = readCache() ?? { eurToUsd: FALLBACK_EUR_USD, fetchedAt: 0 }

export function eurToUsdRate(): number {
  return current.eurToUsd
}

export function fxFetchedAt(): number {
  return current.fetchedAt
}

/** True while running on the built-in rate rather than a fetched one. */
export function usingFallbackRate(): boolean {
  return current.fetchedAt === 0
}

export function convertEurToUsd(amount: number): number {
  return amount * current.eurToUsd
}

export async function refreshFxRate(): Promise<void> {
  if (current.fetchedAt && Date.now() - current.fetchedAt < TTL_MS) return
  try {
    const res = await fetch(RATE_URL, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return
    const body = (await res.json()) as { rates?: { USD?: number } }
    const rate = body.rates?.USD
    if (typeof rate !== 'number' || rate <= 0.5 || rate >= 2) return
    current = { eurToUsd: rate, fetchedAt: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(current))
  } catch {
    // Keep whatever rate we already have; a stale rate beats a wrong total.
  }
}
