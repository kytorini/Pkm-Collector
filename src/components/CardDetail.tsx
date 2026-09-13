import { useEffect } from 'react'
import { CONDITION_NOTE, adjustedValue, valueMultiplier } from '../lib/condition'
import { externalLinks } from '../lib/externalLinks'
import { convertEurToUsd } from '../lib/fx'
import { formatMoney, priceFor } from '../lib/pricing'
import {
  RECORDED_SOURCES,
  isRecorded,
  previewSource,
  recordedKey,
  recordedPrice,
  type PriceSourceId,
} from '../lib/priceSources'
import { useCollection } from '../store/collection'
import { usePrices } from '../store/prices'
import { PriceInput } from './PriceInput'
import { PriceSourceSelect } from './PriceSourceSelect'
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
  const { get, update, toggleOwned, remove, setPriceOverride } = useCollection()
  const resolvePrice = usePrices()

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
            const price = resolvePrice(card, variant)
            const isActive = variant.id === activeVariantId
            const chosenRecorded =
              entry?.priceSource && isRecorded(entry.priceSource)
                ? RECORDED_SOURCES.find((r) => r.key === recordedKey(entry.priceSource!)) ?? null
                : null
            // Each option says what it would actually give you for this card,
            // so a source with nothing to offer is visible before it's chosen.
            const annotate = (id: PriceSourceId): string | null => {
              if (id === 'inherit') return null
              if (isRecorded(id)) {
                const value = recordedPrice(entry, recordedKey(id))
                return value == null ? 'not recorded yet' : formatMoney(value)
              }
              if (id === 'auto') {
                const auto = priceFor(card, variant).market
                return auto == null ? 'no price' : formatMoney(auto)
              }
              const value = previewSource(card, id)
              if (value == null) return 'no price'
              // Cardmarket quotes euros; showing the raw number as dollars
              // would make the wrong option look like the cheap one.
              return id.startsWith('cm:') ? formatMoney(convertEurToUsd(value)) : formatMoney(value)
            }
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
                        <strong>{price.approximate ? '~' : ''}{formatMoney(price.market)}</strong>
                        {price.low != null && price.high != null && (
                          <span className="muted"> ({formatMoney(price.low)}–{formatMoney(price.high)})</span>
                        )}
                      </>
                    )}
                  </span>
                </div>

                {variant.note && <p className="variant-note">{variant.note}</p>}
                {/* What this particular copy is worth, which is what the
                    collection totals actually count. */}
                {owned && entry && price.market != null && (
                  <p className={`your-copy ${valueMultiplier(entry) !== 1 ? 'is-adjusted' : ''}`}>
                    Your copy:{' '}
                    <strong>{formatMoney(adjustedValue(price.market, entry))}</strong>
                    {entry.quantity > 1 && (
                      <span className="muted"> each · {formatMoney((adjustedValue(price.market, entry) ?? 0) * entry.quantity)} for {entry.quantity}</span>
                    )}
                    <span className="muted">
                      {' — '}
                      {entry.graded
                        ? `graded copies aren’t estimated; this is ${CONDITION_NOTE.NM}`
                        : CONDITION_NOTE[entry.condition]}
                    </span>
                  </p>
                )}

                {price.converted && price.market != null && (
                  <p className="variant-note">Converted from a euro listing — no US price is published for this one.</p>
                )}

                {price.sourceEmpty && (
                  <p className="variant-note warn">
                    The price source chosen for this card has nothing for it. Pick another below, or record
                    your own figure from one of the links.
                  </p>
                )}

                {price.approximate && price.market != null && (
                  <p className="variant-note warn">
                    Reference price only — the feed has no separate {variant.label} listing
                    {price.bucket ? ` (showing “${price.bucket}”)` : ''}. Real {variant.label} copies usually trade higher.
                  </p>
                )}

                <div className="comp-links">
                  {externalLinks(card, set, variant, entry).map((link) => (
                    <a
                      key={link.id}
                      className="comp-link"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <span className="comp-link-label">{link.label}</span>
                      <span className="comp-link-hint">{link.hint}</span>
                    </a>
                  ))}
                </div>

                <div className="price-source-card">
                  <PriceSourceSelect
                    level="card"
                    id={`price-source-${card.id}-${variant.id}`}
                    label="Price from"
                    inheritLabel={`Use the ${variant.label} setting`}
                    value={entry?.priceSource ?? 'inherit'}
                    onChange={(id) => setPriceOverride(card.id, variant.id, { priceSource: id })}
                    annotate={annotate}
                  />
                  {chosenRecorded && (
                    <label className="manual-price">
                      <span>
                        {chosenRecorded.site
                          ? `${chosenRecorded.site} price for this card (USD)`
                          : 'Your price (USD)'}
                      </span>
                      <PriceInput
                        label={
                          chosenRecorded.site
                            ? `${chosenRecorded.site} price for ${card.name}`
                            : `Your price for ${card.name}`
                        }
                        value={recordedPrice(entry, chosenRecorded.key)}
                        onChange={(value) =>
                          setPriceOverride(card.id, variant.id, {
                            recorded: { key: chosenRecorded.key, value },
                          })
                        }
                      />
                    </label>
                  )}
                  <p className="muted small">
                    {chosenRecorded
                      ? chosenRecorded.site
                        ? `${chosenRecorded.site} publishes no feed this app can read, so the figure is yours: open the link above, read the price, type it here. It is used everywhere this card is valued and travels with your collection.`
                        : 'Type what a card is worth to you. It is used everywhere this card is valued, and travels with your collection.'
                      : `Showing ${price.bucket ? `the ${price.bucket} price` : 'no price'}. This card only — the print run, set and collection keep their own choice.`}
                  </p>
                </div>

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
