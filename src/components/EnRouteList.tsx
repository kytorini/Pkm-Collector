import { useMemo } from 'react'
import { BackToTop } from './BackToTop'
import { adjustedValue, UNASSESSED } from '../lib/condition'
import { formatMoney } from '../lib/pricing'
import { getSet } from '../lib/sets'
import { shortSetName } from '../lib/shortName'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'
import { usePrices } from '../store/prices'
import type { ApiCard, CollectionEntry, SetVariant, VintageSet } from '../types'

interface Incoming {
  entry: CollectionEntry
  card: ApiCard
  set: VintageSet
  variant: SetVariant
  value: number | null
}

/** Every copy marked En Route, wherever it is filed. */
export function useEnRoute(): Incoming[] {
  const { collection } = useCollection()
  const { allCards } = useLibrary()
  const price = usePrices()
  return useMemo(() => {
    const byId = new Map(allCards.map((c) => [c.id, c]))
    const rows: Incoming[] = []
    for (const entry of Object.values(collection)) {
      if (!entry.owned || entry.graded || entry.condition !== 'ENR') continue
      const card = byId.get(entry.cardId)
      const set = card ? getSet(card.set.id) : undefined
      const variant = set?.variants.find((v) => v.id === entry.variantId)
      if (!card || !set || !variant) continue
      const market = adjustedValue(price(card, variant).market, entry)
      rows.push({ entry, card, set, variant, value: market == null ? null : market * Math.max(1, entry.quantity || 1) })
    }
    // Longest in the post first: the ones most worth chasing up.
    return rows.sort((a, b) => (a.entry.updatedAt ?? '').localeCompare(b.entry.updatedAt ?? ''))
  }, [collection, allCards, price])
}

/**
 * The cards on their way to you: bought, paid for, not yet in hand.
 *
 * Every set and both collections — a parcel doesn't care which era it holds.
 * "Arrived" puts a copy back to "Not assessed yet", which is the honest state
 * of a card just out of its envelope, and where the Unrated filter finds it.
 */
export function EnRouteList({ onOpen }: { onOpen: (cardId: string, walk: string[]) => void }) {
  const { update } = useCollection()
  const rows = useEnRoute()
  const paid = rows.reduce((sum, r) => sum + (r.entry.pricePaid ?? 0) * Math.max(1, r.entry.quantity || 1), 0)
  const worth = rows.reduce((sum, r) => sum + (r.value ?? 0), 0)
  const walk = rows.map((r) => r.card.id)

  if (rows.length === 0) {
    return (
      <section className="series-block">
        <h2 className="series-title">Nothing en route</h2>
        <p className="muted pad">
          Cards you’ve bought but not received show up here. Set a card’s condition to En Route to add it.
        </p>
      </section>
    )
  }

  return (
    <section className="series-block">
      <div className="section-head">
        <h2 className="series-title">
          {rows.length} on the way · {formatMoney(worth)}
          {paid > 0 ? ` · ${formatMoney(paid)} paid` : ''}
        </h2>
      </div>
      <ul className="single-list">
        {rows.map(({ entry, card, set, variant, value }) => {
          const qty = Math.max(1, entry.quantity || 1)
          return (
            <li key={`${card.id}::${variant.id}`} className="single-row">
              <button
                type="button"
                className="result-art"
                onClick={() => onOpen(card.id, walk)}
                aria-label={`Open ${card.name}`}
              >
                <img src={card.images.small} alt="" loading="lazy" width={38} height={53} />
              </button>
              <button type="button" className="result-open single-main" onClick={() => onOpen(card.id, walk)}>
                <span className="result-title">
                  <strong>{card.name}</strong>
                  <span className="muted">#{card.number}</span>
                </span>
                <span className="muted small" title={set.name}>
                  {shortSetName(set.name)}
                  {set.variants.length > 1 ? ` · ${variant.label}` : ''}
                  {qty > 1 ? ` · ×${qty}` : ''}
                  {entry.pricePaid != null ? ` · paid ${formatMoney(entry.pricePaid * qty)}` : ''}
                </span>
              </button>
              <span className="single-worth">
                {value == null ? <span className="muted small">no price</span> : formatMoney(value)}
                <button
                  type="button"
                  className="single-tag-btn"
                  onClick={() => update(card.id, variant.id, { condition: UNASSESSED })}
                  title="It's here: mark it ready to be assessed"
                >
                  ✓ Arrived
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {rows.length > 6 && <BackToTop />}
    </section>
  )
}
