import { useMemo, useState } from 'react'
import { ProgressBar } from '../components/ProgressBar'
import { VINTAGE_SETS } from '../data/vintageSets'
import { showAllSets, toggleHiddenSet, useHiddenSets } from '../lib/hiddenSets'
import { loadOpenSets, saveOpenSets } from '../lib/openSets'
import { formatMoney } from '../lib/pricing'
import { routeHref } from '../lib/router'
import { statsForCollection, statsForSet, statsForVariant, type VariantStats } from '../lib/stats'
import { useCollection } from '../store/collection'
import { usePrices } from '../store/prices'
import { useLibrary } from '../store/library'

/**
 * What the rest of a print run would cost. A run with nothing left to buy is
 * "complete"; one whose missing cards have no price feed says so rather than
 * quoting a misleading $0.
 */
function remainderNote(s: VariantStats): string {
  if (s.total > 0 && s.owned >= s.total) return 'complete'
  if (s.missingValue > 0) return `${formatMoney(s.missingValue)} to finish`
  return 'no price feed for the rest'
}

export function Dashboard() {
  const { cardsBySet, hydrated, empty, progress, syncAll, error, failedSets } = useLibrary()
  const { collection } = useCollection()
  const price = usePrices()
  const hidden = useHiddenSets()
  const [choosing, setChoosing] = useState(false)
  // Sets opened in place. More than one at a time, so two runs can be compared
  // without collapsing the first, and remembered so stepping into a set and
  // back doesn't fold everything up again.
  const [open, setOpen] = useState<string[]>(loadOpenSets)

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]
      saveOpenSets(next)
      return next
    })

  const shown = useMemo(() => VINTAGE_SETS.filter((s) => !hidden.includes(s.id)), [hidden])
  // Totals answer "how am I doing on what I collect", so they follow the same
  // selection as the list rather than counting sets that were put aside.
  const total = statsForCollection(cardsBySet, collection, shown.map((s) => s.id), price)

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
              <ProgressBar value={progress.done} total={progress.total} />
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
              <button className="link-btn" onClick={showAllSets}>show all</button>
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
          <ProgressBar value={total.owned} total={total.total} />
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
            Untick a set to keep it off this page and out of your totals. Nothing is deleted — tick it
            again whenever you start chasing it.
          </p>
        )}

        <div className="progress-table">
          {(choosing ? VINTAGE_SETS : shown).map((set) => {
            const cards = cardsBySet[set.id] ?? []
            const s = statsForSet(cards, set, collection, price)
            const denom = s.total || set.total * set.variants.length
            const isHidden = hidden.includes(set.id)

            if (choosing) {
              return (
                <label key={set.id} className={`progress-row is-choosing ${isHidden ? 'is-hidden' : ''}`}>
                  <span className="progress-row-name">
                    <input type="checkbox" checked={!isHidden} onChange={() => toggleHiddenSet(set.id)} />
                    {set.name}
                  </span>
                  <ProgressBar value={s.owned} total={denom} />
                  <span className="progress-row-count muted">{s.owned}/{denom}</span>
                  <span className="progress-row-value">{s.ownedValue ? formatMoney(s.ownedValue) : ''}</span>
                </label>
              )
            }

            const isOpen = open.includes(set.id)

            return (
              <div key={set.id} className={`set-row ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="progress-row"
                  onClick={() => toggleOpen(set.id)}
                  aria-expanded={isOpen}
                  aria-controls={`set-panel-${set.id}`}
                >
                  <span className="progress-row-name">
                    <span className="row-caret" aria-hidden>›</span>
                    {set.name}
                  </span>
                  <ProgressBar value={s.owned} total={denom} />
                  <span className="progress-row-count muted">{s.owned}/{denom}</span>
                  <span className="progress-row-value">{s.ownedValue ? formatMoney(s.ownedValue) : ''}</span>
                </button>

                {isOpen && (
                  <div className="set-panel" id={`set-panel-${set.id}`}>
                    <div className="set-panel-head">
                      <span className="muted">
                        {set.series} series · {set.year} · {cards.length || set.total} cards
                      </span>
                      {cards.length > 0 && (
                        <span className="set-panel-money">
                          {s.ownedValue > 0 ? (
                            <span className="money-held">{formatMoney(s.ownedValue)} held</span>
                          ) : (
                            <span className="muted">nothing held</span>
                          )}
                          <span className="muted"> · {remainderNote(s)}</span>
                        </span>
                      )}
                    </div>
                    <div className="set-variants">
                      {set.variants.map((variant) => {
                        const vs = statsForVariant(cards, variant, collection, price)
                        const vDenom = vs.total || set.total
                        return (
                          <a
                            key={variant.id}
                            className="set-variant-link"
                            href={routeHref.set(set.id, variant.id)}
                          >
                            <span className="set-variant-line">
                              <span>{variant.label}</span>
                              <span className="muted">{vs.owned}/{vDenom}</span>
                            </span>
                            <ProgressBar value={vs.owned} total={vDenom} />
                            {cards.length > 0 && (
                              <span className="set-variant-money">
                                {vs.ownedValue > 0 ? (
                                  <span className="money-held">{formatMoney(vs.ownedValue)}</span>
                                ) : (
                                  <span className="muted">nothing held</span>
                                )}
                                <span className="muted">{remainderNote(vs)}</span>
                              </span>
                            )}
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {!choosing && shown.length === 0 && (
            <p className="muted pad" style={{ padding: '16px' }}>
              Every set is hidden. <button className="link-btn" onClick={showAllSets}>Show all</button>
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
