import { useSyncExternalStore } from 'react'

/**
 * The lot: a scratch pile of cards you're pricing up, usually because someone
 * has a box in front of you and you need to know what the batch is worth
 * before making an offer.
 *
 * A specific print run is pinned, not a card — a 1st Edition Charizard and an
 * Unlimited one are different markets, and the whole point is an accurate
 * number. Quantity rides along, because a lot is as likely to hold three of
 * something as one.
 *
 * Kept per device and not synced: it's a working note for the next ten
 * minutes, not part of what you own.
 */
const STORAGE_KEY = 'pkm-collector:lot'

export interface LotEntry {
  cardId: string
  variantId: string
  quantity: number
}

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
      .map((e) => ({ ...e, quantity: Math.max(1, Math.trunc(e.quantity) || 1) }))
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
  save([{ cardId, variantId, quantity: 1 }, ...lot])
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
