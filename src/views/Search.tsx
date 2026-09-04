import { useMemo, useState } from 'react'
import { getSet } from '../data/vintageSets'
import { formatMoney, priceFor } from '../lib/pricing'
import { routeHref } from '../lib/router'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'

/** Cross-set lookup: type a Pokémon, mark every print you own from one screen. */
export function Search() {
  const { allCards } = useLibrary()
  const { get, toggleOwned } = useCollection()
  const [query, setQuery] = useState('')
  const [ownedOnly, setOwnedOnly] = useState(false)

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

  return (
    <div className="view">
      <header className="view-head">
        <h1>Search</h1>
        <p className="muted">Every card across every vintage set you’ve loaded.</p>
      </header>

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

      {results.length === 0 ? (
        <p className="muted pad">{query || ownedOnly ? 'No matches.' : 'Start typing a card name.'}</p>
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
                    {set.variants.map((variant) => {
                      const owned = Boolean(get(card.id, variant.id)?.owned)
                      const price = priceFor(card, variant)
                      return (
                        <button
                          key={variant.id}
                          className={`chip ${owned ? 'is-on' : ''}`}
                          onClick={() => toggleOwned(card.id, variant.id)}
                          title={`Toggle ${variant.label}`}
                        >
                          {owned ? '✓ ' : ''}{variant.short}
                          <span className="chip-price">
                            {price.market == null ? '—' : `${price.approximate ? '~' : ''}${formatMoney(price.market, price.currency)}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
