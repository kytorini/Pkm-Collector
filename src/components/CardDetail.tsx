import { useEffect } from 'react'
import { formatMoney, priceFor } from '../lib/pricing'
import { useCollection } from '../store/collection'
import { CONDITIONS, GRADERS, type ApiCard, type ConditionId, type Grader, type VintageSet } from '../types'

interface Props {
  card: ApiCard
  set: VintageSet
  activeVariantId: string
  onClose: () => void
  onStep: (delta: number) => void
}

/**
 * Detail panel for one card. Every print variation of the set is editable here,
 * so a card you own in two runs is one screen rather than two.
 */
export function CardDetail({ card, set, activeVariantId, onClose, onStep }: Props) {
  const { get, update, toggleOwned, remove } = useCollection()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onStep(1)
      if (e.key === 'ArrowLeft') onStep(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onStep])

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={card.name}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="modal-art">
          <img src={card.images.large} alt={card.name} />
          <div className="modal-nav">
            <button onClick={() => onStep(-1)} aria-label="Previous card">‹</button>
            <button onClick={() => onStep(1)} aria-label="Next card">›</button>
          </div>
        </div>

        <div className="modal-body">
          <header className="modal-head">
            <h2>{card.name}</h2>
            <p className="muted">
              {set.name} · #{card.number}
              {card.rarity ? ` · ${card.rarity}` : ''}
              {card.artist ? ` · Illus. ${card.artist}` : ''}
            </p>
          </header>

          {set.variants.map((variant) => {
            const entry = get(card.id, variant.id)
            const owned = Boolean(entry?.owned)
            const price = priceFor(card, variant)
            const isActive = variant.id === activeVariantId
            return (
              <section key={variant.id} className={`variant-row ${owned ? 'is-owned' : ''} ${isActive ? 'is-active' : ''}`}>
                <div className="variant-head">
                  <label className="variant-toggle">
                    <input type="checkbox" checked={owned} onChange={() => toggleOwned(card.id, variant.id)} />
                    <span className="variant-label">{variant.label}</span>
                  </label>
                  <span className="variant-price">
                    {price.market == null ? (
                      <span className="muted">no price feed</span>
                    ) : (
                      <>
                        <strong>{price.approximate ? '~' : ''}{formatMoney(price.market, price.currency)}</strong>
                        {price.low != null && price.high != null && (
                          <span className="muted"> ({formatMoney(price.low, price.currency)}–{formatMoney(price.high, price.currency)})</span>
                        )}
                      </>
                    )}
                  </span>
                </div>

                {variant.note && <p className="variant-note">{variant.note}</p>}
                {price.approximate && price.market != null && (
                  <p className="variant-note warn">
                    Reference price only — the feed has no separate {variant.label} listing
                    {price.bucket ? ` (showing “${price.bucket}”)` : ''}. Real {variant.label} copies usually trade higher.
                  </p>
                )}

                {owned && entry && (
                  <div className="variant-fields">
                    <label>
                      <span>Condition</span>
                      <select
                        value={entry.condition}
                        onChange={(e) => update(card.id, variant.id, { condition: e.target.value as ConditionId })}
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>Qty</span>
                      <input
                        type="number"
                        min={1}
                        value={entry.quantity}
                        onChange={(e) => update(card.id, variant.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>

                    <label>
                      <span>Paid</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="—"
                        value={entry.pricePaid ?? ''}
                        onChange={(e) =>
                          update(card.id, variant.id, {
                            pricePaid: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </label>

                    <label>
                      <span>Graded</span>
                      <div className="grade-pair">
                        <select
                          value={entry.graded?.company ?? ''}
                          onChange={(e) =>
                            update(card.id, variant.id, {
                              graded: e.target.value
                                ? { company: e.target.value as Grader, grade: entry.graded?.grade ?? '' }
                                : undefined,
                            })
                          }
                        >
                          <option value="">Raw</option>
                          {GRADERS.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                        {entry.graded && (
                          <input
                            type="text"
                            className="grade-value"
                            placeholder="10"
                            value={entry.graded.grade}
                            onChange={(e) =>
                              update(card.id, variant.id, {
                                graded: { company: entry.graded!.company, grade: e.target.value },
                              })
                            }
                          />
                        )}
                      </div>
                    </label>

                    <label className="full">
                      <span>Notes</span>
                      <input
                        type="text"
                        placeholder="Centering, where you bought it, anything worth remembering"
                        value={entry.notes ?? ''}
                        onChange={(e) => update(card.id, variant.id, { notes: e.target.value || undefined })}
                      />
                    </label>

                    <button className="link-btn danger" onClick={() => remove(card.id, variant.id)}>
                      Clear this entry
                    </button>
                  </div>
                )}
              </section>
            )
          })}

          <footer className="modal-foot">
            {card.tcgplayer?.url && (
              <a href={card.tcgplayer.url} target="_blank" rel="noreferrer noopener">Open on TCGplayer ↗</a>
            )}
            {card.cardmarket?.url && (
              <a href={card.cardmarket.url} target="_blank" rel="noreferrer noopener">Cardmarket ↗</a>
            )}
            {card.tcgplayer?.updatedAt && <span className="muted">Prices as of {card.tcgplayer.updatedAt}</span>}
          </footer>
        </div>
      </div>
    </div>
  )
}
