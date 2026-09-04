import { ProgressBar } from '../components/ProgressBar'
import { VINTAGE_SETS } from '../data/vintageSets'
import { formatMoney } from '../lib/pricing'
import { routeHref } from '../lib/router'
import { statsForCollection, statsForSet } from '../lib/stats'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'

export function Dashboard() {
  const { cardsBySet, hydrated, empty, progress, syncAll, error } = useLibrary()
  const { collection } = useCollection()
  const total = statsForCollection(cardsBySet, collection)

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
          {error && <p className="error-banner">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Collection</h1>
        <p className="muted">
          {total.owned} of {total.total} tracked slots across {total.setsStarted} set{total.setsStarted === 1 ? '' : 's'}.
        </p>
      </header>

      {error && <p className="error-banner">{error}</p>}

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Completion</span>
          <span className="stat-value">{total.pct}%</span>
          <ProgressBar value={total.owned} total={total.total} tone="gold" />
        </div>
        <div className="stat">
          <span className="stat-label">Market value</span>
          <span className="stat-value">{formatMoney(total.ownedValue)}</span>
          <span className="stat-sub muted">what you hold</span>
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
          <button className="btn ghost small" onClick={() => void syncAll(true)} disabled={progress.running}>
            {progress.running ? `Refreshing ${progress.current}…` : 'Refresh all prices'}
          </button>
        </div>
        <div className="progress-table">
          {VINTAGE_SETS.map((set) => {
            const cards = cardsBySet[set.id] ?? []
            const s = statsForSet(cards, set, collection)
            const denom = s.total || set.total * set.variants.length
            return (
              <a key={set.id} className="progress-row" href={routeHref.set(set.id)}>
                <span className="progress-row-name">{set.name}</span>
                <ProgressBar value={s.owned} total={denom} />
                <span className="progress-row-count muted">{s.owned}/{denom}</span>
                <span className="progress-row-value">{s.ownedValue ? formatMoney(s.ownedValue) : ''}</span>
              </a>
            )
          })}
        </div>
      </section>
    </div>
  )
}
