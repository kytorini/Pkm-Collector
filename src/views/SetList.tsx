import { useMemo } from 'react'
import { ProgressBar } from '../components/ProgressBar'
import { VINTAGE_SETS } from '../data/vintageSets'
import { showAllSets, useHiddenSets } from '../lib/hiddenSets'
import { routeHref } from '../lib/router'
import { statsForVariant } from '../lib/stats'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'

export function SetList() {
  const { cardsBySet } = useLibrary()
  const { collection } = useCollection()
  const hidden = useHiddenSets()

  // The same choice made on the Collection page: a set put aside is out of
  // sight here too, rather than hidden in one place and listed in the other.
  const shown = useMemo(() => VINTAGE_SETS.filter((s) => !hidden.includes(s.id)), [hidden])
  const series = [...new Set(shown.map((s) => s.series))]

  return (
    <div className="view">
      <header className="view-head">
        <h1>Sets</h1>
        <p className="muted">
          {hidden.length > 0 ? (
            <>
              {shown.length} of {VINTAGE_SETS.length} runs · {hidden.length} hidden
              {/* With nothing left to list, the empty state below carries the way back. */}
              {shown.length > 0 && (
                <> <button className="link-btn" onClick={showAllSets}>show all</button></>
              )}
            </>
          ) : (
            'Every vintage run, split by print variation.'
          )}
        </p>
      </header>

      {shown.length === 0 && (
        <p className="muted pad">
          Every set is hidden. <button className="link-btn" onClick={showAllSets}>Show all</button>
        </p>
      )}

      {series.map((seriesName) => (
        <section key={seriesName} className="series-block">
          <h2 className="series-title">{seriesName}</h2>
          <div className="set-grid">
            {shown.filter((s) => s.series === seriesName).map((set) => {
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
