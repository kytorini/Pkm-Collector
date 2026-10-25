import { useSyncExternalStore } from 'react'
import { getJustTcgKey, justTcgUsage, searchSets, setCardsPage, type JustTcgCard, type JustTcgSet } from '../api/justTcg'
import { idbGet, idbSet } from './idb'
import type { TrackedSet } from './trackedSets'
import type { ApiCard, SetVariant } from '../types'

/**
 * Near-mint prices from JustTCG, kept per tracked set.
 *
 * Each of your sets is paired with JustTCG's by name, once, and its cards are
 * then fetched a page at a time with only the near-mint condition asked for.
 * Prices are kept for a week: the free plan's 1,000 requests a month cover a
 * weekly refresh of a large collection, and a daily one would not.
 *
 * Base Set is the awkward one. TCGplayer, and so JustTCG, files its 1st
 * Edition and Shadowless copies under a separate "Base Set (Shadowless)" set,
 * so a tracked set also reads its "(Shadowless)" twin when there is one.
 */

const STALE_MS = 7 * 24 * 60 * 60 * 1000
/** Kept back from the daily and monthly allowances, so a refresh never spends the last of them. */
const DAILY_RESERVE = 5
const MONTHLY_RESERVE = 20

/** Printing → near-mint price for one card number. Shadowless-set printings are prefixed "SL:". */
interface PricedCard {
  name: string
  prices: Record<string, number>
}

export interface SetPrices {
  /** The JustTCG sets read, main first. Empty when no match was found. */
  matched: { id: string; name: string }[]
  byNumber: Record<string, PricedCard[]>
  fetchedAt: number
}

const store = new Map<string, SetPrices>()
let version = 0
const listeners = new Set<() => void>()
const emit = () => {
  version++
  for (const l of listeners) l()
}

const keyFor = (setId: string) => `justtcg:${setId}`

/** Card numbers as both sides write them: "004/102", "4", "4/102" → "4". */
export function normalNumber(number: string | null | undefined): string {
  return (number ?? '').split('/')[0].trim().replace(/^0+(?=\w)/, '').toLowerCase()
}

/** Reads what earlier sessions fetched, so prices show before any request. */
export async function hydrateJustTcg(sets: readonly TrackedSet[]): Promise<void> {
  let changed = false
  for (const set of sets) {
    if (store.has(set.id)) continue
    const cached = await idbGet<SetPrices>(keyFor(set.id))
    if (cached) {
      store.set(set.id, cached)
      changed = true
    }
  }
  if (changed) emit()
}

export function justTcgFor(setId: string): SetPrices | undefined {
  return store.get(setId)
}

export function useJustTcgVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
}

/**
 * Which of JustTCG's sets is this one.
 *
 * TCGplayer names don't always match the card feed's — 151 is "SV: Scarlet &
 * Violet 151" there — so this scores candidates rather than demanding an exact
 * name: exact beats a name ending in ours, which beats one containing it, and
 * a matching year or card count breaks ties.
 */
function bestMatch(set: TrackedSet, candidates: JustTcgSet[]): JustTcgSet | undefined {
  const ours = set.name.toLowerCase().trim()
  let best: { set: JustTcgSet; score: number } | undefined
  for (const c of candidates) {
    const theirs = c.name.toLowerCase().trim()
    if (/\(shadowless\)/.test(theirs) && !/shadowless/.test(ours)) continue
    let score = 0
    if (theirs === ours) score = 100
    else if (theirs.endsWith(`: ${ours}`) || theirs.endsWith(` ${ours}`)) score = 60
    else if (new RegExp(`\\b${ours.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(theirs)) score = 30
    else continue
    if (set.year && c.release_date?.startsWith(String(set.year))) score += 15
    if (set.total && c.count && Math.abs(c.count - set.total) <= Math.max(3, set.total * 0.1)) score += 10
    if (!best || score > best.score) best = { set: c, score }
  }
  return best?.set
}

/** True when a refresh of this set would do anything useful. */
export function canPrice(set: TrackedSet): boolean {
  return set.region === 'en' && set.source !== 'manual'
}

function isStale(setId: string): boolean {
  const held = store.get(setId)
  return !held || Date.now() - held.fetchedAt > STALE_MS
}

/** Whether the allowance can stand `requests` more without touching the reserve. */
function affordable(requests: number): boolean {
  const usage = justTcgUsage()
  if (!usage) return true
  return (
    usage.apiDailyRequestsRemaining - requests >= DAILY_RESERVE &&
    usage.apiRequestsRemaining - requests >= MONTHLY_RESERVE
  )
}

async function fetchAllCards(jtSetId: string): Promise<JustTcgCard[]> {
  const cards: JustTcgCard[] = []
  for (let offset = 0; offset < 2000; ) {
    if (!affordable(1)) throw new Error('allowance')
    const page = await setCardsPage(jtSetId, offset)
    cards.push(...page.cards)
    if (!page.hasMore || page.cards.length === 0) break
    offset += page.cards.length
  }
  return cards
}

/** Fetches one set's near-mint prices. Throws on a failed request. */
export async function refreshSet(set: TrackedSet): Promise<SetPrices> {
  let matched = store.get(set.id)?.matched
  if (!matched || matched.length === 0) {
    const candidates = await searchSets(set.name)
    const main = bestMatch(set, candidates)
    matched = []
    if (main) {
      matched.push({ id: main.id, name: main.name })
      const twin = candidates.find((c) => c.name.toLowerCase() === `${main.name.toLowerCase()} (shadowless)`)
      const wantsTwin = set.variants.some((v) => v.id === 'shadowless' || v.id === 'first-edition')
      if (twin && wantsTwin) matched.push({ id: twin.id, name: twin.name })
    }
  }

  const byNumber: Record<string, PricedCard[]> = {}
  for (const [i, jt] of matched.entries()) {
    const prefix = i > 0 ? 'SL:' : ''
    for (const card of await fetchAllCards(jt.id)) {
      const num = normalNumber(card.number)
      if (!num) continue
      const prices: Record<string, number> = {}
      for (const v of card.variants ?? []) {
        if (v.price == null) continue
        if (v.language && v.language !== 'English') continue
        if (!/near mint/i.test(v.condition)) continue
        prices[`${prefix}${v.printing}`] = v.price
      }
      const list = (byNumber[num] ??= [])
      const same = list.find((p) => p.name === card.name)
      if (same) Object.assign(same.prices, prices)
      else list.push({ name: card.name, prices })
    }
  }

  const result: SetPrices = { matched, byNumber, fetchedAt: Date.now() }
  store.set(set.id, result)
  await idbSet(keyFor(set.id), result)
  emit()
  return result
}

export interface RefreshReport {
  refreshed: string[]
  unmatched: string[]
  /** Sets left for later because the allowance ran low. */
  deferred: string[]
  error?: string
}

let running: Promise<RefreshReport> | null = null

/**
 * Refreshes whatever is a week old, oldest first, stopping before the
 * allowance runs low. Safe to call on every launch: with nothing stale it
 * makes no requests, and two calls at once share one run.
 */
export function refreshStale(sets: readonly TrackedSet[], force = false): Promise<RefreshReport> {
  if (running) return running
  running = (async () => {
    const report: RefreshReport = { refreshed: [], unmatched: [], deferred: [] }
    if (!getJustTcgKey()) return report
    const due = sets
      .filter(canPrice)
      .filter((s) => force || isStale(s.id))
      .sort((a, b) => (store.get(a.id)?.fetchedAt ?? 0) - (store.get(b.id)?.fetchedAt ?? 0))
    for (const set of due) {
      // A set costs one request per 20 cards, plus one to find it the first time.
      const cost = Math.ceil((set.total || 100) / 20) + (store.get(set.id)?.matched.length ? 0 : 1)
      if (!affordable(cost)) {
        report.deferred.push(set.name)
        continue
      }
      try {
        const result = await refreshSet(set)
        if (result.matched.length === 0) report.unmatched.push(set.name)
        else report.refreshed.push(set.name)
      } catch (err) {
        if (err instanceof Error && err.message === 'allowance') {
          report.deferred.push(set.name)
          continue
        }
        report.error = err instanceof Error ? err.message : 'JustTCG could not be reached.'
        break
      }
    }
    return report
  })().finally(() => {
    running = null
  })
  return running
}

/** Which printings stand for a print run. */
function printingsFor(variant: SetVariant, prices: Record<string, number>): string[] {
  const keys = Object.keys(prices)
  const first = (k: string) => /1st edition/i.test(k)
  const reverse = (k: string) => /reverse/i.test(k)
  const twin = (k: string) => k.startsWith('SL:')
  switch (variant.id) {
    case 'first-edition':
      // The Shadowless twin is where Base Set's 1st Editions are filed.
      return [...keys.filter((k) => first(k) && twin(k)), ...keys.filter((k) => first(k) && !twin(k))]
    case 'shadowless':
      return keys.filter((k) => twin(k) && !first(k))
    case 'reverse-holo':
      return keys.filter((k) => reverse(k) && !twin(k))
    default:
      return keys.filter((k) => !first(k) && !reverse(k) && !twin(k))
  }
}

/** A card's near-mint price for one run, when JustTCG has one. */
export function nearMintPrice(card: ApiCard, variant: SetVariant): { price: number; printing: string } | null {
  const held = store.get(card.set.id)
  if (!held) return null
  const candidates = held.byNumber[normalNumber(card.number)]
  if (!candidates?.length) return null
  // Numbers repeat across a promo set's reprints; the name settles it.
  const entry =
    candidates.find((c) => c.name.toLowerCase() === card.name.toLowerCase()) ??
    candidates.find((c) => c.name.toLowerCase().startsWith(card.name.toLowerCase())) ??
    (candidates.length === 1 ? candidates[0] : undefined)
  if (!entry) return null
  const keys = printingsFor(variant, entry.prices)
  if (keys.length === 0) return null
  // A holo card's own printing over a stray non-holo listing, and vice versa.
  const holo = /holo/i.test(card.rarity ?? '')
  const key = keys.find((k) => /holo/i.test(k) === holo) ?? keys[0]
  return { price: entry.prices[key], printing: key.replace(/^SL:/, 'Shadowless set · ') }
}
