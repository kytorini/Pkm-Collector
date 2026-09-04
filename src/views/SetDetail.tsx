import { useEffect, useMemo, useState } from 'react'
import { CardDetail } from '../components/CardDetail'
import { CardTile } from '../components/CardTile'
import { ProgressBar } from '../components/ProgressBar'
import { getSet } from '../data/vintageSets'
import { formatMoney, priceFor } from '../lib/pricing'
import { navigate, routeHref } from '../lib/router'
import { statsForVariant } from '../lib/stats'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'
import type { ApiCard } from '../types'

type Filter = 'all' | 'owned' | 'missing'
type Sort = 'number' | 'name' | 'price-desc' | 'price-asc'

export function SetDetail({ setId, variantId }: { setId: string; variantId?: string }) {
  const set = getSet(setId)
  const { cardsBySet, fetchedAt, syncSet, progress } = useLibrary()
  const { collection } = useCollection()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('number')
  const [query, setQuery] = useState('')
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const cards = useMemo(() => cardsBySet[setId] ?? [], [cardsBySet, setId])
  const activeVariant = useMemo(
    () => set?.variants.find((v) => v.id === variantId) ?? set?.variants[0],
    [set, variantId],
  )

  // A set the user navigated to directly may not be cached yet.
  useEffect(() => {
    if (set && cards.length === 0 && !progress.running) void syncSet(setId).catch(() => undefined)
  }, [set, setId, cards.length, syncSet, progress.running])

  const visible = useMemo(() => {
    if (!activeVariant) return []
    const q = query.trim().toLowerCase()
    let list = cards.filter((card) => {
      const entry = collection[`${card.id}::${activeVariant.id}`]
      const owned = Boolean(entry?.owned)
      if (filter === 'owned' && !owned) return false
      if (filter === 'missing' && owned) return false
      if (q && !card.name.toLowerCase().includes(q) && !card.number.toLowerCase().includes(q)) return false
      return true
    })
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'price-desc' || sort === 'price-asc') {
      const dir = sort === 'price-desc' ? -1 : 1
      list = [...list].sort(
        (a, b) => dir * ((priceFor(a, activeVariant).market ?? 0) - (priceFor(b, activeVariant).market ?? 0)),
      )
    }
    return list
  }, [cards, collection, activeVariant, filter, sort, query])

  if (!set) return <div className="view"><p>Unknown set. <a href={routeHref.sets}>Back to sets</a></p></div>
  if (!activeVariant) return <div className="view"><p>This set has no print variations configured.</p></div>

  const stats = statsForVariant(cards, activeVariant, collection)
  const openCard = openCardId ? cards.find((c) => c.id === openCardId) ?? null : null

  const step = (delta: number) => {
    if (!openCard) return
    const pool: ApiCard[] = visible.length ? visible : cards
    const idx = pool.findIndex((c) => c.id === openCard.id)
    const next = pool[(idx + delta + pool.length) % pool.length]
    if (next) setOpenCardId(next.id)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await syncSet(setId, true)
    } finally {
      setRefreshing(false)
    }
  }

  const stamp = fetchedAt[setId]

  return (
    <div className="view">
      <header className="view-head set-head">
        <div>
          <a className="back-link" href={routeHref.sets}>‹ Sets</a>
          <h1>{set.name}</h1>
          <p className="muted">{set.series} series · {set.year} · {cards.length || set.total} cards</p>
        </div>
        <button className="btn ghost" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh prices'}
        </button>
      </header>

      <nav className="variant-tabs" aria-label="Print variation">
        {set.variants.map((variant) => {
          const s = statsForVariant(cards, variant, collection)
          return (
            <button
              key={variant.id}
              className={`variant-tab ${variant.id === activeVariant.id ? 'is-active' : ''}`}
              onClick={() => navigate(routeHref.set(setId, variant.id))}
            >
              <span className="variant-tab-name">{variant.label}</span>
              <span className="variant-tab-count">{s.owned}/{s.total || set.total}</span>
            </button>
          )
        })}
      </nav>

      <div className="set-summary">
        <div className="summary-progress">
          <ProgressBar value={stats.owned} total={stats.total || set.total} tone="gold" />
          <span className="muted">{stats.pct}% complete</span>
        </div>
        <dl className="summary-stats">
          <div><dt>Owned value</dt><dd>{formatMoney(stats.ownedValue)}</dd></div>
          <div>
            <dt>Cost to finish</dt>
            <dd>{formatMoney(stats.missingValue)}</dd>
            {stats.unpriced > 0 && <span className="muted small">{stats.unpriced} card{stats.unpriced === 1 ? '' : 's'} with no price feed</span>}
          </div>
          <div><dt>Spent</dt><dd>{stats.spend ? formatMoney(stats.spend) : '—'}</dd></div>
        </dl>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Filter by name or number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="segmented">
          {(['all', 'owned', 'missing'] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="number">Set order</option>
          <option value="name">Name</option>
          <option value="price-desc">Price, high to low</option>
          <option value="price-asc">Price, low to high</option>
        </select>
      </div>

      {cards.length === 0 ? (
        <p className="muted pad">Loading cards from the Pokémon TCG API…</p>
      ) : visible.length === 0 ? (
        <p className="muted pad">Nothing matches those filters.</p>
      ) : (
        <div className="card-grid">
          {visible.map((card) => (
            <CardTile key={card.id} card={card} variant={activeVariant} onOpen={(c) => setOpenCardId(c.id)} />
          ))}
        </div>
      )}

      {stamp && <p className="muted pad small">Prices last updated {new Date(stamp).toLocaleString()}.</p>}

      {openCard && (
        <CardDetail
          card={openCard}
          set={set}
          activeVariantId={activeVariant.id}
          onClose={() => setOpenCardId(null)}
          onStep={step}
        />
      )}
    </div>
  )
}
