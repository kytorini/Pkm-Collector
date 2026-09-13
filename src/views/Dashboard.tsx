import { useMemo, useState } from 'react'
import { ProgressBar } from '../components/ProgressBar'
import { VINTAGE_SETS } from '../data/vintageSets'
import { loadHiddenSets, saveHiddenSets } from '../lib/hiddenSets'
import { formatMoney } from '../lib/pricing'
import { routeHref } from '../lib/router'
import { statsForCollection, statsForSet } from '../lib/stats'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'

export function Dashboard() {
  const { cardsBySet, hydrated, empty, progress, syncAll, error, failedSets } = useLibrary()
  const { collection } = useCollection()
  const [hidden, setHidden] = useState<string[]>(loadHiddenSets)
  const [choosing, setChoosing] = useState(false)

  const shown = useMemo(() => VINTAGE_SETS.filter((s) => !hidden.includes(s.id)), [hidden])
  // Totals answer "how am I doing on what I collect", so they follow the same
  // selection as the list rather than counting sets that were put aside.
  const total = statsForCollection(cardsBySet, collection, shown.map((s) => s.id))

  const toggleSet = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]
    setHidden(next)
    saveHiddenSets(next)
  }

  const showEvery = () => {
    setHidden([])
    saveHiddenSets([])
  }

  if (!hydrated) return <div className="view"><p className="muted pad">Opening your binder…</p></div>

  if (empty) {
    return (
      <div className="view">
        <div className="welcome">
          <h1>Let’s fill the binder</h1>
          <p>
            First run needs one download: card names, artwork and current market prices for all{' '}
            {VINTAGE_SETS.length} vintage sets, pulled from the Pokémon TCG API. It’s cached on this device
            afterwards, so the app opens instantly and works offline.
          </p>
          {progress.running ? (
            <div className="sync-progress">
              <ProgressBar value={progress.done} total={progress.total} tone="gold" />
              <p className="muted">Loading {progress.current}… ({progress.done}/{progress.total})</p>
            </div>
          ) : (
            <button className="btn primary" onClick={() => void syncAll()}>Download card data</button>
          )}
          {error && (
            <div className="error-banner">
              <p>{error}</p>
              {failedSets.length > 0 && !progress.running && (
                <button className="btn small" onClick={() => void syncAll(true, failedSets)}>
                  Retry {failedSets.length} failed {failedSets.length === 1 ? 'set' : 'sets'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Collection</h1>
        <p className="muted">
          {total.owned} of {total.total} tracked slots across {total.setsStarted} set{total.setsStarted === 1 ? '' : 's'}
          {hidden.length > 0 && (
            <>
              {' · '}
              {hidden.length} set{hidden.length === 1 ? '' : 's'} hidden, left out of these totals{' '}
              <button className="link-btn" onClick={showEvery}>show all</button>
            </>
          )}
          .
        </p>
      </header>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          {failedSets.length > 0 && !progress.running && (
            <button className="btn small" onClick={() => void syncAll(true, failedSets)}>
              Retry {failedSets.length} failed {failedSets.length === 1 ? 'set' : 'sets'}
            </button>
          )}
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Completion</span>
          <span className="stat-value">{total.pct}%</span>
          <ProgressBar value={total.owned} total={total.total} tone="gold" />
        </div>
        <div className="stat">
          <span className="stat-label">Market value</span>
          <span className="stat-value">{formatMoney(total.ownedValue)}</span>
          <span className="stat-sub muted">
            {total.copies > total.owned ? `${total.copies} copies of ${total.owned} cards` : 'what you hold'}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Cost to finish</span>
          <span className="stat-value">{formatMoney(total.missingValue)}</span>
          <span className="stat-sub muted">
            {total.unpriced > 0
              ? `excludes ${total.unpriced} slot${total.unpriced === 1 ? '' : 's'} with no price feed`
              : 'every missing card at market'}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Spent</span>
          <span className="stat-value">{total.spend ? formatMoney(total.spend) : '—'}</span>
          <span className="stat-sub muted">
            {total.spend ? `${formatMoney(total.ownedValue - total.spend)} unrealised` : 'add prices paid to track this'}
          </span>
        </div>
      </div>

      <section className="series-block">
        <div className="section-head">
          <h2 className="series-title">Progress by set</h2>
          <div className="btn-row">
            <button className="btn ghost small" onClick={() => setChoosing((c) => !c)}>
              {choosing ? 'Done' : 'Choose sets'}
            </button>
            <button className="btn ghost small" onClick={() => void syncAll(true)} disabled={progress.running}>
              {progress.running ? `Refreshing ${progress.current}…` : 'Refresh all prices'}
            </button>
          </div>
        </div>

        {choosing && (
          <p className="muted small choose-hint">
            Untick a set to keep it off this page and out of the totals. The Sets tab still lists them all.
          </p>
        )}

        <div className="progress-table">
          {(choosing ? VINTAGE_SETS : shown).map((set) => {
            const cards = cardsBySet[set.id] ?? []
            const s = statsForSet(cards, set, collection)
            const denom = s.total || set.total * set.variants.length
            const isHidden = hidden.includes(set.id)

            if (choosing) {
              return (
                <label key={set.id} className={`progress-row is-choosing ${isHidden ? 'is-hidden' : ''}`}>
                  <span className="progress-row-name">
                    <input type="checkbox" checked={!isHidden} onChange={() => toggleSet(set.id)} />
                    {set.name}
                  </span>
                  <ProgressBar value={s.owned} total={denom} />
                  <span className="progress-row-count muted">{s.owned}/{denom}</span>
                  <span className="progress-row-value">{s.ownedValue ? formatMoney(s.ownedValue) : ''}</span>
                </label>
              )
            }

            return (
              <a key={set.id} className="progress-row" href={routeHref.set(set.id)}>
                <span className="progress-row-name">{set.name}</span>
                <ProgressBar value={s.owned} total={denom} />
                <span className="progress-row-count muted">{s.owned}/{denom}</span>
                <span className="progress-row-value">{s.ownedValue ? formatMoney(s.ownedValue) : ''}</span>
              </a>
            )
          })}
          {!choosing && shown.length === 0 && (
            <p className="muted pad" style={{ padding: '16px' }}>
              Every set is hidden. <button className="link-btn" onClick={showEvery}>Show all</button>
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
