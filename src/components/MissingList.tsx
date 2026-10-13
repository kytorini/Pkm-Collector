import { useMemo, useState } from 'react'
import { BackToTop } from './BackToTop'
import { formatMoney } from '../lib/pricing'
import { shortSetName } from '../lib/shortName'
import { MISSING_SORTS, loadMissingSort, saveMissingSort, type MissingSort } from '../lib/sortOrder'
import type { TrackedSet } from '../lib/sets'
import { missingSlots } from '../lib/wantList'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'
import { usePrices } from '../store/prices'

const ALL = ''

/**
 * Every slot you don't own yet, as one list you can sort.
 *
 * The remaining-cost tile says what finishing costs; this says what it is
 * made of. Sorted dearest first, it answers "which cards are the bill"; by
 * set, it is a shopping list in binder order. Only the sets you're chasing
 * count, the same ones that figure covers.
 *
 * Ticking "Got it" takes the row away, so the list shrinks as you buy.
 */
export function MissingList({
  sets,
  onOpen,
}: {
  sets: readonly TrackedSet[]
  onOpen: (cardId: string, walk: string[]) => void
}) {
  const { cardsBySet } = useLibrary()
  const { collection, toggleOwned } = useCollection()
  const price = usePrices()
  const [sort, setSort] = useState<MissingSort>(loadMissingSort)
  const [setId, setSetId] = useState(ALL)
  const [runLabel, setRunLabel] = useState(ALL)

  const all = useMemo(
    () => missingSlots(cardsBySet, collection, sets.map((s) => s.id), price),
    [cardsBySet, collection, sets, price],
  )

  // Only sets with something left to buy are worth picking.
  const setCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const slot of all) counts.set(slot.set.id, (counts.get(slot.set.id) ?? 0) + 1)
    return counts
  }, [all])
  // A set you've just finished drops out of the picker; don't leave it chosen.
  const activeSet = setId !== ALL && setCounts.has(setId) ? setId : ALL

  const inSet = useMemo(() => (activeSet === ALL ? all : all.filter((s) => s.set.id === activeSet)), [all, activeSet])
  // Runs by label, so "Normal" across several sets is one choice.
  const runs = useMemo(() => [...new Set(inSet.map((s) => s.variant.label))], [inSet])
  const activeRun = runLabel !== ALL && runs.includes(runLabel) ? runLabel : ALL

  const slots = useMemo(() => {
    const list = activeRun === ALL ? inSet : inSet.filter((s) => s.variant.label === activeRun)
    if (sort === 'set') return list
    if (sort === 'name') return [...list].sort((a, b) => a.card.name.localeCompare(b.card.name))
    const dir = sort === 'price-desc' ? -1 : 1
    // Unpriced last either way: they are not cheap, just unknown.
    return [...list].sort((a, b) => {
      if (a.market == null || b.market == null) return (a.market == null ? 1 : 0) - (b.market == null ? 1 : 0)
      return dir * (a.market - b.market)
    })
  }, [inSet, activeRun, sort])

  const cost = slots.reduce((sum, s) => sum + (s.market ?? 0), 0)
  const unpriced = slots.filter((s) => s.market == null).length

  if (sets.length === 0) {
    return (
      <section className="series-block">
        <h2 className="series-title">Missing</h2>
        <p className="muted pad">
          Missing cards are counted in the sets you're chasing, and right now you're only keeping singles.
        </p>
      </section>
    )
  }

  if (all.length === 0) {
    return (
      <section className="series-block">
        <h2 className="series-title">Nothing missing</h2>
        <p className="muted pad">Every card in every set you're chasing is in the binder.</p>
      </section>
    )
  }

  const walk = slots.map((s) => s.card.id)

  return (
    <section className="series-block">
      <div className="section-head">
        <h2 className="series-title">
          {slots.length} missing · {formatMoney(cost)}
        </h2>
      </div>
      <div className="missing-controls">
        {setCounts.size > 1 && (
          <select className="select" value={activeSet} aria-label="Set" onChange={(e) => setSetId(e.target.value)}>
            <option value={ALL}>All sets · {all.length}</option>
            {sets
              .filter((s) => setCounts.has(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {shortSetName(s.name)} · {setCounts.get(s.id)}
                </option>
              ))}
          </select>
        )}
        {runs.length > 1 && (
          <select className="select" value={activeRun} aria-label="Print run" onChange={(e) => setRunLabel(e.target.value)}>
            <option value={ALL}>Every run</option>
            {runs.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        )}
        <select
          className="select"
          value={sort}
          aria-label="Sort"
          onChange={(e) => {
            const next = e.target.value as MissingSort
            setSort(next)
            saveMissingSort(next)
          }}
        >
          {MISSING_SORTS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
      {unpriced > 0 && (
        <p className="muted small pad">
          {unpriced === 1 ? "One has no price and isn't" : `${unpriced} have no price and aren't`} in that total.
        </p>
      )}
      <ul className="single-list">
        {slots.map((slot) => (
          <li key={`${slot.card.id}::${slot.variant.id}`} className="single-row">
            <button
              type="button"
              className="result-art"
              onClick={() => onOpen(slot.card.id, walk)}
              aria-label={`Open ${slot.card.name}`}
            >
              <img src={slot.card.images.small} alt="" loading="lazy" width={38} height={53} />
            </button>
            <button type="button" className="result-open single-main" onClick={() => onOpen(slot.card.id, walk)}>
              <span className="result-title">
                <strong>{slot.card.name}</strong>
                <span className="muted">#{slot.card.number}</span>
              </span>
              <span className="muted small" title={slot.set.name}>
                {shortSetName(slot.set.name)}
                {slot.set.variants.length > 1 ? ` · ${slot.variant.label}` : ''}
                {slot.card.rarity ? ` · ${slot.card.rarity}` : ''}
              </span>
            </button>
            <span className="single-worth">
              {slot.market == null ? <span className="muted small">no price</span> : formatMoney(slot.market)}
              <button
                type="button"
                className="single-tag-btn"
                onClick={() => toggleOwned(slot.card.id, slot.variant.id)}
                title={`Mark ${slot.card.name} ${slot.variant.label} as owned`}
              >
                + Got it
              </button>
            </span>
          </li>
        ))}
      </ul>
      {slots.length > 6 && <BackToTop />}
    </section>
  )
}
