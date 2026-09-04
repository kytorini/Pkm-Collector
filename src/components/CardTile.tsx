import { memo } from 'react'
import { priceFor, formatMoney } from '../lib/pricing'
import { useCollection } from '../store/collection'
import type { ApiCard, SetVariant } from '../types'

interface Props {
  card: ApiCard
  variant: SetVariant
  onOpen: (card: ApiCard) => void
}

/**
 * One card in the binder grid. The whole tile opens the detail panel; the
 * corner check is a one-click "got it" so filling in a set stays fast.
 */
export const CardTile = memo(function CardTile({ card, variant, onOpen }: Props) {
  const { get, toggleOwned } = useCollection()
  const entry = get(card.id, variant.id)
  const owned = Boolean(entry?.owned)
  const price = priceFor(card, variant)

  return (
    <div className={`tile ${owned ? 'is-owned' : ''}`}>
      <button className="tile-art" onClick={() => onOpen(card)} aria-label={`Open ${card.name}`}>
        <img src={card.images.small} alt={card.name} loading="lazy" decoding="async" width={245} height={342} />
        {!owned && <span className="tile-veil" aria-hidden />}
      </button>

      <button
        className={`tile-check ${owned ? 'is-on' : ''}`}
        onClick={() => toggleOwned(card.id, variant.id)}
        aria-pressed={owned}
        title={owned ? 'Owned — click to unmark' : 'Mark as owned'}
      >
        {owned ? '✓' : '+'}
      </button>

      {owned && entry && (
        <span className="tile-condition" title="Condition">
          {entry.graded ? `${entry.graded.company} ${entry.graded.grade}` : entry.condition}
          {entry.quantity > 1 ? ` ×${entry.quantity}` : ''}
        </span>
      )}

      <div className="tile-meta">
        <span className="tile-number">#{card.number}</span>
        <span className="tile-name" title={card.name}>{card.name}</span>
        <span className={`tile-price ${price.approximate ? 'is-approx' : ''}`}>
          {price.market == null ? '—' : `${price.approximate ? '~' : ''}${formatMoney(price.market, price.currency)}`}
        </span>
      </div>
    </div>
  )
})
