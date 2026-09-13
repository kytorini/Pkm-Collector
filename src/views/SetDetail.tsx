import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BackToTop } from '../components/BackToTop'
import { CardDetail } from '../components/CardDetail'
import { CardTile } from '../components/CardTile'
import { OverflowMenu } from '../components/OverflowMenu'
import { PriceSourceSelect } from '../components/PriceSourceSelect'
import { ProgressBar } from '../components/ProgressBar'
import { getSet } from '../data/vintageSets'
import { formatMoney, priceFor } from '../lib/pricing'
import { setSetSource, setVariantSource, usePriceRules, variantRuleKey } from '../lib/priceRules'
import {
  AUTO,
  RECORDED_SOURCES,
  isRecorded,
  recordedKey,
  recordedPrice,
  recordedSourceId,
  type PriceSourceId,
} from '../lib/priceSources'
import { externalLinks } from '../lib/externalLinks'
import { usePrices } from '../store/prices'
import { navigate, routeHref } from '../lib/router'
import { isUnassessed } from '../lib/condition'
import { DENSITIES, gridTemplate, loadDensity, saveDensity, type Density } from '../lib/density'
import { statsForVariant } from '../lib/stats'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'
import type { ApiCard } from '../types'

type Filter = 'all' | 'owned' | 'missing' | 'unassessed'
type Sort = 'number' | 'name' | 'price-desc' | 'price-asc'

export function SetDetail({ setId, variantId }: { setId: string; variantId?: string }) {
  const set = getSet(setId)
  const { cardsBySet, fetchedAt, syncSet, progress, error } = useLibrary()
  const { collection, setPriceOverride } = useCollection()
  const price = usePrices()
  const rules = usePriceRules()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('number')
  const [query, setQuery] = useState('')
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Distinguishes "still waiting" from "tried and failed", so a dead request
  // doesn't sit under a Loading message forever.
  const [loadFailed, setLoadFailed] = useState(false)
  const [density, setDensity] = useState<Density>(loadDensity)
  // Which site's prices are being typed in, if any. Filling a run in one pass
  // beats opening a hundred card panels.
  const [entering, setEntering] = useState<string | null>(null)

  const cards = useMemo(() => cardsBySet[setId] ?? [], [cardsBySet, setId])
  const activeVariant = useMemo(
    () => set?.variants.find((v) => v.id === variantId) ?? set?.variants[0],
    [set, variantId],
  )

  // A set the user navigated to directly may not be cached yet.
  useEffect(() => {
    if (!set || cards.length > 0 || progress.running) return
    setLoadFailed(false)
    void syncSet(setId).catch(() => setLoadFailed(true))
  }, [set, setId, cards.length, syncSet, progress.running])

  const visible = useMemo(() => {
    if (!activeVariant) return []
    const q = query.trim().toLowerCase()
    let list = cards.filter((card) => {
      const entry = collection[`${card.id}::${activeVariant.id}`]
      const owned = Boolean(entry?.owned)
      if (filter === 'owned' && !owned) return false
      if (filter === 'missing' && owned) return false
      if (filter === 'unassessed' && !isUnassessed(entry)) return false
      if (q && !card.name.toLowerCase().includes(q) && !card.number.toLowerCase().includes(q)) return false
      return true
    })
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'price-desc' || sort === 'price-asc') {
      const dir = sort === 'price-desc' ? -1 : 1
      list = [...list].sort(
        (a, b) => dir * ((price(a, activeVariant).market ?? 0) - (price(b, activeVariant).market ?? 0)),
      )
    }
    return list
  }, [cards, collection, activeVariant, filter, sort, query, price])

  if (!set) return <div className="view"><p>Unknown set. <a href={routeHref.dashboard}>Back to your collection</a></p></div>
  if (!activeVariant) return <div className="view"><p>This set has no print variations configured.</p></div>

  const stats = statsForVariant(cards, activeVariant, collection, price)
  const openCard = openCardId ? cards.find((c) => c.id === openCardId) ?? null : null

  // What each level falls back to, so the pickers can say what "inherit" means
  // and the coverage counts can resolve it.
  const setFallback = rules.bySet[setId] ?? rules.collection ?? AUTO
  const variantRule = rules.byVariant?.[variantRuleKey(setId, activeVariant.id)] ?? 'inherit'
  const effectiveVariantSource = variantRule === 'inherit' ? setFallback : variantRule

  // Which site's prices the "type them in" button offers: the one this run
  // already reads from, or PriceCharting, the usual reason to be here.
  const enterKey = isRecorded(effectiveVariantSource) ? recordedKey(effectiveVariantSource) : 'pricecharting'

  /**
   * A whole print run in one pass: every card, its link, and a box for the
   * figure. The filter and search above narrow this list too, so a run can be
   * filled in a few sittings, or only for the cards that matter.
   */
  function PriceEntryList() {
    if (!set || !activeVariant || !entering) return null
    const source = RECORDED_SOURCES.find((r) => r.key === entering)
    if (!source) return null
    const filled = cards.filter(
      (c) => recordedPrice(collection[`${c.id}::${activeVariant.id}`], entering) != null,
    ).length
    const alreadyUsing = effectiveVariantSource === recordedSourceId(entering)

    return (
      <div className="price-entry">
        <div className="price-entry-head">
          <div>
            <h3>{source.site || 'Your own'} prices · {activeVariant.label}</h3>
            <p className="muted small">
              {source.site
                ? `Open a card's link, read the price, type it here. ${filled} of ${cards.length} filled in.`
                : `${filled} of ${cards.length} filled in.`}
            </p>
          </div>
          <div className="btn-row">
            {!alreadyUsing && filled > 0 && (
              <button
                className="btn primary small"
                onClick={() => setVariantSource(setId, activeVariant.id, recordedSourceId(entering))}
              >
                Use these for {activeVariant.label}
              </button>
            )}
            <button className="btn small" onClick={() => setEntering(null)}>Done</button>
          </div>
        </div>

        <ul className="price-entry-list">
          {visible.map((card) => {
            const entry = collection[`${card.id}::${activeVariant.id}`]
            const link = source.linkId
              ? externalLinks(card, set, activeVariant, entry).find((l) => l.id === source.linkId)
              : undefined
            return (
              <li key={card.id}>
                <span className="pe-num muted">#{card.number}</span>
                <span className="pe-name">{card.name}</span>
                {link && (
                  <a className="pe-link" href={link.url} target="_blank" rel="noreferrer noopener">
                    Look up ↗
                  </a>
                )}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="—"
                  aria-label={`${source.site || 'Your'} price for ${card.name}`}
                  value={recordedPrice(entry, entering) ?? ''}
                  onChange={(e) =>
                    setPriceOverride(card.id, activeVariant.id, {
                      recorded: {
                        key: entering,
                        value: e.target.value === '' ? undefined : Number(e.target.value),
                      },
                    })
                  }
                />
              </li>
            )
          })}
        </ul>
        {visible.length === 0 && <p className="muted pad">Nothing matches those filters.</p>}
        <BackToTop />
      </div>
    )
  }

  /**
   * How many cards of the active print run a source can actually price. Shown
   * on each option so the choice is made against the feed's real contents
   * rather than its promises.
   */
  const coverage = (id: PriceSourceId, inheritsTo: PriceSourceId): string | null => {
    if (cards.length === 0) return null
    const effective = id === 'inherit' ? inheritsTo : id
    if (isRecorded(effective)) {
      const where = recordedKey(effective)
      const n = cards.filter(
        (c) => recordedPrice(collection[`${c.id}::${activeVariant.id}`], where) != null,
      ).length
      return `${n} of ${cards.length} recorded`
    }
    const n = cards.filter((c) => priceFor(c, activeVariant, { source: effective }).market != null).length
    return `${n} of ${cards.length}`
  }

  const step = (delta: number) => {
    if (!openCard) return
    const pool: ApiCard[] = visible.length ? visible : cards
    const idx = pool.findIndex((c) => c.id === openCard.id)
    const next = pool[(idx + delta + pool.length) % pool.length]
    if (next) setOpenCardId(next.id)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    setLoadFailed(false)
    try {
      await syncSet(setId, true)
    } catch {
      setLoadFailed(true)
    } finally {
      setRefreshing(false)
    }
  }

  const stamp = fetchedAt[setId]

  return (
    <div className="view">
      <header className="view-head set-head">
        <div>
          <a className="back-link" href={routeHref.dashboard}>‹ Collection</a>
          <h1>{set.name}</h1>
          <p className="muted">{set.series} series · {set.year} · {cards.length || set.total} cards</p>
        </div>
        <div className="set-head-actions">
          <button className="btn ghost" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh prices'}
          </button>
          <OverflowMenu
            id="set-options"
            label="Pricing options"
            // A source that can't price the set is worth noticing without
            // opening the menu to find out.
            flagged={cards.length > 0 && stats.unpriced > 0}
          >
            {(close) => (
              <div className="price-source-row">
                <PriceSourceSelect
                  level="variant"
                  id="variant-price-source"
                  label={`Prices for ${activeVariant.label}`}
                  inheritLabel={`Use the ${set.name} setting`}
                  value={variantRule}
                  onChange={(id) => setVariantSource(setId, activeVariant.id, id)}
                  annotate={(id) => coverage(id, setFallback)}
                />
                <PriceSourceSelect
                  level="set"
                  id="set-price-source"
                  label={`Prices for the rest of ${set.name}`}
                  inheritLabel="Use the collection default"
                  value={rules.bySet[setId] ?? 'inherit'}
                  onChange={(id) => setSetSource(setId, id)}
                  annotate={(id) => coverage(id, rules.collection || AUTO)}
                />
                <p className="muted small">
                  {stats.unpriced > 0
                    ? `${stats.unpriced} of ${stats.total} ${activeVariant.label} cards have no price from this ` +
                      'source. Try another, or type the prices in yourself.'
                    : `Every ${activeVariant.label} card has a price from this source.`}
                </p>
                {cards.length > 0 && !entering && (
                  <button
                    className="btn small"
                    onClick={() => {
                      setEntering(enterKey)
                      close()
                    }}
                  >
                    Type in {RECORDED_SOURCES.find((r) => r.key === enterKey)?.label} prices
                  </button>
                )}
              </div>
            )}
          </OverflowMenu>
        </div>
      </header>

      <nav className="variant-tabs" aria-label="Print variation">
        {set.variants.map((variant) => {
          const s = statsForVariant(cards, variant, collection, price)
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
          <div>
            <dt>Owned value</dt>
            <dd>{formatMoney(stats.ownedValue)}</dd>
            {stats.unassessed > 0 && (
              <span className="copies-note">{stats.unassessed} not assessed yet</span>
            )}
            {stats.copies > stats.owned && (
              <span className="copies-note">
                {stats.copies} copies of {stats.owned} cards — value counts every copy
              </span>
            )}
          </div>
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
          {([
            ['all', 'All'],
            ['owned', 'Owned'],
            ['missing', 'Missing'],
            ['unassessed', 'Unrated'],
          ] as [Filter, string][]).map(([f, label]) => (
            <button key={f} className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="number">Set order</option>
          <option value="name">Name</option>
          <option value="price-desc">Price, high to low</option>
          <option value="price-asc">Price, low to high</option>
        </select>
        <select
          className="select select-compact"
          value={density}
          aria-label="Cards per row"
          onChange={(e) => {
            const next = e.target.value as Density
            setDensity(next)
            saveDensity(next)
          }}
        >
          {DENSITIES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      {cards.length === 0 && loadFailed ? (
        <div className="load-error">
          <h3>Couldn’t load {set.name}</h3>
          <p>{error ?? 'The card data request failed.'}</p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => void onRefresh()} disabled={refreshing}>
              {refreshing ? 'Trying again…' : 'Try again'}
            </button>
            <a className="btn ghost" href={routeHref.settings}>Open Settings</a>
          </div>
          <p className="muted small">
            Your collection is safe — this only affects card names, artwork and prices, which are fetched from
            the Pokémon TCG API. Settings has a connection test if you want the detail.
          </p>
        </div>
      ) : cards.length === 0 ? (
        <p className="muted pad">Loading cards from the Pokémon TCG API…</p>
      ) : entering ? (
        <PriceEntryList />
      ) : visible.length === 0 ? (
        <p className="muted pad">Nothing matches those filters.</p>
      ) : (
        <>
          <div className="card-grid" style={{ '--grid-template': gridTemplate(density) } as CSSProperties}>
            {visible.map((card) => (
              <CardTile key={card.id} card={card} variant={activeVariant} onOpen={(c) => setOpenCardId(c.id)} />
            ))}
          </div>
          <BackToTop />
        </>
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
