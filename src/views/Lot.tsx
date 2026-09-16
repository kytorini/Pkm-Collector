import { useMemo, useState } from 'react'
import { BackToTop } from '../components/BackToTop'
import { getSet } from '../data/vintageSets'
import { adjustedValue, UNASSESSED } from '../lib/condition'
import { clearLot, isPinned, setCondition, setQuantity, togglePin, unpin, useLot } from '../lib/lot'
import { formatMoney } from '../lib/pricing'
import { routeHref } from '../lib/router'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'
import { usePrices } from '../store/prices'
import { CONDITIONS, type ApiCard, type ConditionId, type SetVariant, type VintageSet } from '../types'

/**
 * A pile of cards you're pricing up, and the search that fills it.
 *
 * Someone has a box in front of you and wants an offer. Search a name, tap the
 * print run they're holding, grade what you can see, and the running total
 * tells you what the batch is worth before you say a number. Nothing here
 * touches your collection — a lot is a note you throw away.
 */
export function Lot() {
  const { allCards } = useLibrary()
  const { get } = useCollection()
  const price = usePrices()
  const lot = useLot()
  const [query, setQuery] = useState('')
  const [ownedOnly, setOwnedOnly] = useState(false)

  const byId = useMemo(() => new Map(allCards.map((c) => [c.id, c])), [allCards])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q && !ownedOnly) return []
    return allCards
      .filter((card) => {
        if (q && !card.name.toLowerCase().includes(q)) return false
        if (ownedOnly) {
          const set = getSet(card.set.id)
          if (!set?.variants.some((v) => get(card.id, v.id)?.owned)) return false
        }
        return true
      })
      .slice(0, 300)
  }, [allCards, query, ownedOnly, get])

  /** Everything the lot rows and the total need, resolved once. */
  const lines = useMemo(
    () =>
      lot.map((entry) => {
        const card = byId.get(entry.cardId)
        const set = card ? getSet(card.set.id) : undefined
        const variant = set?.variants.find((v) => v.id === entry.variantId)
        const each = card && variant ? price(card, variant) : null
        // The quote is a near-mint figure; what you'd pay for the copy in
        // front of you is that figure taken down to its condition.
        const worth = adjustedValue(each?.market ?? null, entry)
        return { entry, card, set, variant, each, worth }
      }),
    [lot, byId, price],
  )

  const total = lines.reduce((sum, l) => sum + (l.worth ?? 0) * l.entry.quantity, 0)
  const copies = lines.reduce((sum, l) => sum + l.entry.quantity, 0)
  // A line the feed can't price would otherwise be silently counted as zero.
  const unpriced = lines.filter((l) => l.each?.market == null).length
  const approximate = lines.some((l) => l.each?.approximate)
  // Say "at market" only while it is true of every line. "Assessed", not
  // "graded" — graded means slabbed by PSA or BGS everywhere else in the app.
  const assessed = lines.filter((l) => l.entry.condition !== UNASSESSED).length
  const searching = query.trim() !== '' || ownedOnly

  return (
    <div className="view">
      <header className="view-head">
        <h1>Lot</h1>
        <p className="muted">
          Pin the cards someone is offering you, and see what the batch is worth before you name a price.
        </p>
      </header>

      {lot.length > 0 && (
        <div className="lot-bar">
          <div className="lot-total">
            <span className="lot-total-value">{formatMoney(total)}</span>
            <span className="muted small">
              {approximate ? '≈ ' : ''}
              {lot.length} card{lot.length === 1 ? '' : 's'}
              {copies !== lot.length ? `, ${copies} copies` : ''}
              {assessed === 0
                ? ' at market'
                : assessed === lines.length
                  ? ', adjusted for condition'
                  : `, ${assessed} adjusted for condition`}
              {unpriced > 0 ? ` · ${unpriced} with no price` : ''}
            </span>
          </div>
          <button
            className="btn small"
            onClick={() => {
              if (!confirm(`Clear all ${lot.length} cards from the lot? Your collection isn't touched.`)) return
              clearLot()
            }}
          >
            Clear lot
          </button>
        </div>
      )}

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          autoFocus
          placeholder="Charizard, Blastoise, Dark Raichu…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check-inline">
          <input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} />
          Only cards I own
        </label>
      </div>

      {searching ? (
        results.length === 0 ? (
          <p className="muted pad">No matches.</p>
        ) : (
          <ul className="result-list">
            {results.map((card) => {
              const set = getSet(card.set.id)
              if (!set) return null
              return (
                <li key={card.id} className="result">
                  <img src={card.images.small} alt="" loading="lazy" width={60} height={84} />
                  <div className="result-main">
                    <div className="result-title">
                      <strong>{card.name}</strong>
                      <span className="muted">#{card.number}</span>
                    </div>
                    <a className="result-set muted" href={routeHref.set(set.id)}>{set.name} · {set.year}</a>
                    <div className="chip-row">
                      {set.variants.map((variant) => (
                        <PinChip key={variant.id} card={card} set={set} variant={variant} />
                      ))}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      ) : lot.length === 0 ? (
        <p className="muted pad">
          Search for a card, then tap the print run you're being offered. It lands here with a price, and
          the total adds up as you go.
        </p>
      ) : (
        <ul className="lot-list">
          {lines.map(({ entry, card, set, variant, each, worth }) => {
            const id = `${entry.cardId}::${entry.variantId}`
            if (!card || !set || !variant) {
              return (
                <li key={id} className="lot-row is-missing">
                  <div className="lot-row-main">
                    <strong>{entry.cardId}</strong>
                    <span className="muted small">This set's card data isn't loaded on this device.</span>
                  </div>
                  <button className="btn small" onClick={() => unpin(entry.cardId, entry.variantId)}>
                    Remove
                  </button>
                </li>
              )
            }
            const line = (worth ?? 0) * entry.quantity
            return (
              <li key={id} className="lot-row">
                <img src={card.images.small} alt="" loading="lazy" width={44} height={62} />
                <div className="lot-row-main">
                  <div className="result-title">
                    <strong>{card.name}</strong>
                    <span className="muted">#{card.number}</span>
                  </div>
                  <span className="muted small">{set.name} · {variant.label}</span>
                  {/* The grade sits next to the figure it moves, so the two
                      read as cause and effect rather than as two settings. */}
                  <div className="lot-row-grade">
                    <select
                      className="select select-compact"
                      aria-label={`Condition of ${card.name} ${variant.label}`}
                      value={entry.condition}
                      onChange={(e) =>
                        setCondition(entry.cardId, entry.variantId, e.target.value as ConditionId)
                      }
                    >
                      {CONDITIONS.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    {/* At one copy this figure is the line total, already
                        showing in gold opposite — so it only appears when it
                        says something that one doesn't. */}
                    {worth == null ? (
                      <span className="lot-row-each muted">no price from your source</span>
                    ) : entry.quantity > 1 || each?.approximate || each?.converted ? (
                      <span className="lot-row-each">
                        {each?.approximate ? '~' : ''}{formatMoney(worth)} each
                        {each?.converted ? ' (converted)' : ''}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="lot-row-side">
                  <span className="lot-row-line">{each?.market == null ? '—' : formatMoney(line)}</span>
                  <div className="qty">
                    <button
                      className="qty-btn"
                      aria-label={`One fewer ${card.name} ${variant.label}`}
                      onClick={() => setQuantity(entry.cardId, entry.variantId, entry.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="qty-value" aria-label={`${entry.quantity} in the lot`}>{entry.quantity}</span>
                    <button
                      className="qty-btn"
                      aria-label={`One more ${card.name} ${variant.label}`}
                      onClick={() => setQuantity(entry.cardId, entry.variantId, entry.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="lot-remove"
                    aria-label={`Remove ${card.name} ${variant.label} from the lot`}
                    title="Remove from the lot"
                    onClick={() => unpin(entry.cardId, entry.variantId)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {(results.length > 0 || lot.length > 4) && <BackToTop />}
    </div>
  )
}

/**
 * One print run of one card, in the search results. Tapping it puts that exact
 * run in the lot; a tick says you already own it, which is worth knowing
 * before you pay for another.
 */
function PinChip({ card, set, variant }: { card: ApiCard; set: VintageSet; variant: SetVariant }) {
  const { get } = useCollection()
  const price = usePrices()
  useLot() // re-render this chip when the lot changes anywhere
  const pinned = isPinned(card.id, variant.id)
  const owned = Boolean(get(card.id, variant.id)?.owned)
  const p = price(card, variant)

  return (
    <button
      className={`chip ${pinned ? 'is-pinned' : ''}`}
      aria-pressed={pinned}
      onClick={() => togglePin(card.id, variant.id)}
      title={pinned ? `Remove ${variant.label} from the lot` : `Add ${set.name} ${variant.label} to the lot`}
    >
      <span className="chip-mark" aria-hidden>{pinned ? '−' : '+'}</span>
      {variant.short}
      {owned && <span className="chip-owned" title="You already own this one">✓</span>}
      <span className="chip-price">
        {p.market == null ? '—' : `${p.approximate ? '~' : ''}${formatMoney(p.market)}`}
      </span>
    </button>
  )
}
