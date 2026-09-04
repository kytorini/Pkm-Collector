import { ProgressBar } from '../components/ProgressBar'
import { VINTAGE_SETS } from '../data/vintageSets'
import { routeHref } from '../lib/router'
import { statsForVariant } from '../lib/stats'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'

export function SetList() {
  const { cardsBySet } = useLibrary()
  const { collection } = useCollection()

  const series = [...new Set(VINTAGE_SETS.map((s) => s.series))]

  return (
    <div className="view">
      <header className="view-head">
        <h1>Sets</h1>
        <p className="muted">Every vintage run, split by print variation.</p>
      </header>

      {series.map((seriesName) => (
        <section key={seriesName} className="series-block">
          <h2 className="series-title">{seriesName}</h2>
          <div className="set-grid">
            {VINTAGE_SETS.filter((s) => s.series === seriesName).map((set) => {
              const cards = cardsBySet[set.id] ?? []
              return (
                <a key={set.id} className="set-card" href={routeHref.set(set.id)}>
                  <div className="set-card-head">
                    <h3>{set.name}</h3>
                    <span className="muted">{set.year}</span>
                  </div>
                  <div className="set-variants">
                    {set.variants.map((variant) => {
                      const s = statsForVariant(cards, variant, collection)
                      return (
                        <div key={variant.id} className="set-variant">
                          <div className="set-variant-line">
                            <span>{variant.short}</span>
                            <span className="muted">
                              {cards.length ? `${s.owned}/${s.total}` : `0/${set.total}`}
                            </span>
                          </div>
                          <ProgressBar value={s.owned} total={s.total || set.total} />
                        </div>
                      )
                    })}
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
