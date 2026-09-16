import { useSyncExternalStore } from 'react'
import { UNASSESSED } from './condition'
import { CONDITIONS, type ConditionId } from '../types'

/**
 * The lot: a scratch pile of cards you're pricing up, usually because someone
 * has a box in front of you and you need to know what the batch is worth
 * before making an offer.
 *
 * A specific print run is pinned, not a card — a 1st Edition Charizard and an
 * Unlimited one are different markets, and the whole point is an accurate
 * number. Quantity rides along, because a lot is as likely to hold three of
 * something as one, and so does condition: the cards are in your hand while
 * you price them, and a played Charizard is not a near-mint one.
 *
 * Kept per device and not synced: it's a working note for the next ten
 * minutes, not part of what you own.
 */
const STORAGE_KEY = 'pkm-collector:lot'

export interface LotEntry {
  cardId: string
  variantId: string
  quantity: number
  /**
   * What shape this copy is in. Starts unassessed — you pin from a search
   * before you've looked properly — which values it at the quoted price, so a
   * lot you haven't graded reads exactly as it did before conditions existed.
   */
  condition: ConditionId
}

const IDS = new Set<string>(CONDITIONS.map((c) => c.id))
const asCondition = (value: unknown): ConditionId =>
  typeof value === 'string' && IDS.has(value) ? (value as ConditionId) : UNASSESSED

export const lotKey = (cardId: string, variantId: string) => `${cardId}::${variantId}`

function read(): LotEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (e): e is LotEntry =>
          Boolean(e) &&
          typeof (e as LotEntry).cardId === 'string' &&
          typeof (e as LotEntry).variantId === 'string',
      )
      .map((e) => ({
        ...e,
        quantity: Math.max(1, Math.trunc(e.quantity) || 1),
        // Lots pinned before conditions existed have none, and a grade that
        // has since been renamed is not one we can honour.
        condition: asCondition(e.condition),
      }))
  } catch {
    return []
  }
}

let lot: LotEntry[] = read()
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    lot = read()
    emit()
  })
}

export function loadLot(): LotEntry[] {
  return lot
}

function save(next: LotEntry[]): void {
  lot = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* a scratch pile isn't worth failing over */
  }
  emit()
}

export function isPinned(cardId: string, variantId: string): boolean {
  return lot.some((e) => e.cardId === cardId && e.variantId === variantId)
}

/** Newest first: on a phone, what you just added should be what you see. */
export function pin(cardId: string, variantId: string): void {
  if (isPinned(cardId, variantId)) return
  save([{ cardId, variantId, quantity: 1, condition: UNASSESSED }, ...lot])
}

export function unpin(cardId: string, variantId: string): void {
  save(lot.filter((e) => !(e.cardId === cardId && e.variantId === variantId)))
}

export function togglePin(cardId: string, variantId: string): void {
  if (isPinned(cardId, variantId)) unpin(cardId, variantId)
  else pin(cardId, variantId)
}

/** Below one, the card leaves the lot — that is what "none of them" means. */
export function setQuantity(cardId: string, variantId: string, quantity: number): void {
  if (quantity < 1) {
    unpin(cardId, variantId)
    return
  }
  save(
    lot.map((e) =>
      e.cardId === cardId && e.variantId === variantId ? { ...e, quantity: Math.trunc(quantity) } : e,
    ),
  )
}

/**
 * The grade you've put on this copy, which moves what the lot is worth.
 * Unknown grades fall back to unassessed rather than being stored as typed.
 */
export function setCondition(cardId: string, variantId: string, condition: ConditionId): void {
  save(
    lot.map((e) =>
      e.cardId === cardId && e.variantId === variantId ? { ...e, condition: asCondition(condition) } : e,
    ),
  )
}

export function clearLot(): void {
  save([])
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useLot(): LotEntry[] {
  return useSyncExternalStore(subscribe, loadLot, () => [])
}
