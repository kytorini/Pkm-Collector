import { useState } from 'react'
import { findCardsByName, loadSetMeta } from '../api/pokemonTcg'
import { searchCards } from '../lib/searchCards'
import { detectVariants } from '../lib/detectVariants'
import { formatMoney, priceFor } from '../lib/pricing'
import { addSet, isTracked, setDetectedVariants } from '../lib/trackedSets'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'
import { getSet } from '../lib/sets'
import type { ApiCard, SetVariant } from '../types'

/**
 * Adding one card you own, without signing up to finish its set.
 *
 * The collection's own search only knows sets you've downloaded, which made
 * adding a single a five-step detour through Manage sets with the deciding
 * checkbox on a different screen. This asks the API by name instead, so the
 * card can be found first and its set dealt with quietly afterwards — added
 * for singles, never as something you mean to complete.
 */
export function SingleFinder({ onDone }: { onDone: () => void }) {
  const { syncSet } = useLibrary()
  const { toggleOwned, get } = useCollection()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiCard[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<string[]>([])

  const search = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setSearching(true)
    setError(null)
    try {
      /*
       * Sifted with the same matcher the collection search uses, so the
       * fallback's wide net — every card whose name holds one word — is
       * narrowed back to what was actually asked for, and the closest name
       * comes first.
       */
      const found = await findCardsByName(q)
      const sifted = searchCards(found, q, { limit: 60 })
      setResults(sifted.length > 0 ? sifted : found.slice(0, 60))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the Pokémon TCG API.')
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  /**
   * Its set comes along, because a card needs one — but as a set you keep
   * singles from, so its other cards never become a bill.
   */
  const add = async (card: ApiCard, variant?: SetVariant) => {
    setAdding(card.id)
    try {
      let set = getSet(card.set.id)
      if (!set) {
        const meta = await loadSetMeta(card.set.id).catch(() => undefined)
        const year = Number((meta?.releaseDate ?? card.set.releaseDate ?? '').slice(0, 4)) || 0
        set = addSet({
          sourceId: card.set.id,
          region: 'en',
          name: meta?.name ?? card.set.name,
          series: meta?.series ?? '',
          year,
          total: meta?.printedTotal ?? card.set.printedTotal ?? 0,
          preset: 'single',
          chasing: false,
        })
        const { cards } = await syncSet(set.id)
        if (cards.length > 0) setDetectedVariants(set.id, detectVariants(cards).variants)
        set = getSet(card.set.id) ?? set
      }
      const run = variant ?? set.variants[0]
      if (!get(card.id, run.id)?.owned) toggleOwned(card.id, run.id)
      setAdded((a) => [...a, card.id])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that card.')
    } finally {
      setAdding(null)
    }
  }

  return (
    <section className="series-block">
      <div className="section-head is-single">
        <h2 className="series-title">Add a single</h2>
        <div className="btn-row">
          <button className="btn ghost small" onClick={onDone}>Done</button>
        </div>
      </div>
      <p className="muted pad small">
        Search every English set, tracked or not, by card name or set name — “Van Gogh pikachu” finds
        it. Whatever you pick comes in as a single: its set is kept for singles, so the rest of it
        never counts as a bill.
      </p>

      <div className="toolbar dash-search">
        <input
          className="search-input"
          type="search"
          autoFocus
          placeholder="Van Gogh, Pikachu, Charizard…"
          aria-label="Search every set for a card"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search()
          }}
        />
        <button className="btn primary small" disabled={query.trim().length < 2 || searching} onClick={() => void search()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && <div className="error-banner"><p>{error}</p></div>}
      {results?.length === 0 && !searching && (
        <p className="muted pad">
          Nothing matches. Try the card's name, or the set's — “Van Gogh”, “Pikachu”, or both.
        </p>
      )}

      <ul className="result-list">
        {(results ?? []).map((card) => {
          const tracked = getSet(card.set.id)
          const price = tracked ? priceFor(card, tracked.variants[0]).market : card.tcgplayer?.prices?.normal?.market
          const done = added.includes(card.id)
          return (
            <li key={card.id} className="result">
              <img src={card.images.small} alt="" loading="lazy" width={60} height={84} />
              <div className="result-main">
                <span className="result-title">
                  <strong>{card.name}</strong>
                  <span className="muted">#{card.number}</span>
                </span>
                <span className="result-set muted">
                  {card.set.name}
                  {card.set.releaseDate ? ` · ${card.set.releaseDate.slice(0, 4)}` : ''}
                  {price != null ? ` · ${formatMoney(price)}` : ''}
                </span>
                {tracked && isTracked(card.set.id) && (
                  <span className="muted small">
                    {tracked.chasing === false ? 'From a set you keep singles from' : "From a set you're chasing"}
                  </span>
                )}
              </div>
              <button
                className={`btn small ${done ? 'ghost' : 'primary'}`}
                disabled={adding === card.id || done}
                onClick={() => void add(card)}
              >
                {adding === card.id ? 'Adding…' : done ? 'Added' : 'Add'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
