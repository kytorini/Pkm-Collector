import { useEffect, useMemo, useRef, useState } from 'react'
import { loadCatalogue, type CatalogueSet } from '../api/catalogue'
import { getPreset, suggestPreset, VARIANT_PRESETS } from '../data/variantPresets'
import { describeVariants, detectVariants } from '../lib/detectVariants'
import { blankChecklist, manualSetId, parseChecklist } from '../lib/manualSet'
import { DEFAULT_REGION, getRegion, REGIONS, type RegionId } from '../lib/regions'
import { scopedId } from '../lib/regions'
import { addSet, isChasing, removeSet, setChasing, setDetectedVariants, setPreset, useTrackedSets } from '../lib/trackedSets'
import { useLibrary } from '../store/library'

/**
 * Choosing what you collect.
 *
 * Two halves: the sets you track, and everything you could. The catalogue is
 * only a list of names and counts — a set's cards are not fetched until you
 * add it, and are thrown away when you drop it, so the app holds the sets you
 * chase rather than every set ever printed.
 */
export function SetManager({ onDone }: { onDone: () => void }) {
  const tracked = useTrackedSets()
  const { syncSet, forgetSet, cardsBySet } = useLibrary()
  const [region, setRegion] = useState<RegionId>(DEFAULT_REGION)
  const [query, setQuery] = useState('')
  const [catalogue, setCatalogue] = useState<CatalogueSet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set ids currently being fetched, so each row can say so on its own. */
  const [busy, setBusy] = useState<string[]>([])
  /*
   * What adding a set means. Chasing one says "I intend to finish this";
   * keeping singles says "I have some of these". The difference decides
   * whether its missing cards are counted as a bill still to pay.
   */
  const [chasing, setChasingNew] = useState(true)
  const [byHand, setByHand] = useState(false)
  const [handName, setHandName] = useState('')
  const [handList, setHandList] = useState('')
  const [handCount, setHandCount] = useState('')

  useEffect(() => {
    let dead = false
    setLoading(true)
    setError(null)
    void loadCatalogue(region)
      .then((sets) => {
        if (!dead) setCatalogue(sets)
      })
      .catch((err: unknown) => {
        if (!dead) setError(err instanceof Error ? err.message : 'Could not load the set list.')
      })
      .finally(() => {
        if (!dead) setLoading(false)
      })
    return () => {
      dead = true
    }
  }, [region])

  const trackedIds = useMemo(() => new Set(tracked.map((s) => s.id)), [tracked])
  // Read at call time: a set added and fetched in one go is not in this
  // render's copy of the library yet.
  const latestCards = useRef(cardsBySet)
  latestCards.current = cardsBySet

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? catalogue.filter((s) => s.name.toLowerCase().includes(q) || s.sourceId.toLowerCase().includes(q) || s.series.toLowerCase().includes(q))
      : catalogue
    return list.slice(0, 200)
  }, [catalogue, query])

  const add = async (set: CatalogueSet) => {
    const id = scopedId(region, set.sourceId)
    setBusy((b) => [...b, id])
    addSet({
      sourceId: set.sourceId,
      region,
      name: set.name,
      series: set.series,
      year: set.year,
      total: set.total,
      preset: suggestPreset(region, set.year),
      chasing,
    })
    try {
      // The cards are the authority on which runs exist; the preset guessed
      // before they arrived is only a placeholder. Read from what the fetch
      // returned, not from the library — its state has not re-rendered yet.
      const { cards } = await syncSet(id)
      if (cards.length > 0) setDetectedVariants(id, detectVariants(cards).variants)
    } catch {
      /* the row shows the library's own error; the set stays added to retry */
    } finally {
      setBusy((b) => b.filter((x) => x !== id))
    }
  }

  /** Re-reads a set's runs off its cards. Silent on add, spoken when asked. */
  const match = (id: string, announce = false): void => {
    const cards = latestCards.current[id] ?? []
    if (cards.length === 0) {
      if (announce) alert('Download this set first — its runs are read from its cards.')
      return
    }
    const found = detectVariants(cards)
    setDetectedVariants(id, found.variants)
    if (!announce) return
    alert(
      found.confident
        ? `${describeVariants(found.variants)} — read from the ${cards.length} cards in this set.`
        : `No feed quotes this set yet, so its printings can't be read. Left as one run, which counts every card once. Set it by hand if you know better.`,
    )
  }

  /*
   * A set nothing lists yet.
   *
   * New releases reach a binder weeks before they reach an API, and a promo
   * set printed this month is catalogued by collectors long before anything
   * this app can call. Typing one in beats not tracking it.
   */
  const addByHand = () => {
    const name = handName.trim()
    if (!name) return
    const checklist = handList.trim() ? parseChecklist(handList) : blankChecklist(Number(handCount))
    if (checklist.length === 0) return
    addSet({
      sourceId: manualSetId(name),
      region,
      name,
      series: 'Added by hand',
      year: new Date().getFullYear(),
      total: checklist.length,
      // One run: nothing quotes this set, so there are no printings to read.
      preset: 'single',
      manualCards: checklist,
      chasing,
    })
    setHandName('')
    setHandList('')
    setHandCount('')
    setByHand(false)
  }

  const handPreview = handList.trim() ? parseChecklist(handList) : blankChecklist(Number(handCount))

  const drop = async (id: string) => {
    removeSet(id)
    await forgetSet(id)
  }

  return (
    <section className="series-block">
      <div className="section-head is-single">
        <h2 className="series-title">Your sets</h2>
        <div className="btn-row">
          <button className="btn ghost small" onClick={onDone}>Done</button>
        </div>
      </div>

      {tracked.length === 0 ? (
        <p className="muted pad small">
          Nothing tracked yet. Pick a region below and add the sets you collect — only those are
          downloaded.
        </p>
      ) : (
        <ul className="set-manage-list">
          {tracked.map((set) => {
            const loaded = cardsBySet[set.id]?.length ?? 0
            return (
              <li key={set.id} className="set-manage-row">
                <div className="set-manage-main">
                  <span className="set-manage-name">
                    <strong>{set.name}</strong>
                    <span className="region-tag">{getRegion(set.region).short}</span>
                  </span>
                  <span className="muted small">
                    {set.year || '—'} · {loaded > 0 ? `${loaded} cards` : 'not downloaded'} ·{' '}
                    {set.variants.length === 1 ? 'one run' : `${set.variants.length} runs`}
                  </span>
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={isChasing(set)}
                      onChange={(e) => setChasing(set.id, e.target.checked)}
                    />
                    Chasing this set
                  </label>
                  <label className="labelled-select">
                    <span>Print runs</span>
                    <select
                      className="select select-compact"
                      value={VARIANT_PRESETS.some((p) => p.id === set.preset) ? set.preset : 'custom'}
                      onChange={(e) => setPreset(set.id, e.target.value)}
                    >
                      {/* A migrated set keeps runs written by hand; naming that
                          is honest, and picking anything else replaces them. */}
                      {!VARIANT_PRESETS.some((p) => p.id === set.preset) && (
                        <option value="custom">
                          {set.preset === 'detected' ? 'From its cards' : 'As set up'} (
                          {set.variants.map((v) => v.short).join(' · ')})
                        </option>
                      )}
                      {VARIANT_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="btn-row set-manage-actions">
                  <button
                    className="btn ghost small"
                    disabled={loaded === 0}
                    onClick={() => match(set.id, true)}
                    title="Read this set's print runs from its cards"
                  >
                    Match
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => void drop(set.id)}
                    title={`Stop tracking ${set.name} and delete its cards`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="section-head is-single add-head">
        <h2 className="series-title">Add a set</h2>
      </div>

      <div className="toolbar dash-search">
        <input
          className="search-input"
          type="search"
          placeholder="Search sets…"
          aria-label="Search the set list"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <label className="check-inline chasing-choice">
        <input type="checkbox" checked={chasing} onChange={(e) => setChasingNew(e.target.checked)} />
        I mean to finish the sets I add
      </label>
      <p className="muted small chasing-hint">
        {chasing
          ? 'Their missing cards count towards completion and remaining cost.'
          : "Added for singles: what you own counts towards what your collection is worth, but the rest isn't a bill you mean to pay."}
      </p>

      <div className="segmented region-picker">
        {REGIONS.map((r) => (
          <button
            key={r.id}
            className={region === r.id ? 'is-active' : ''}
            onClick={() => setRegion(r.id)}
            aria-pressed={region === r.id}
          >
            {r.label}
          </button>
        ))}
      </div>

      {!getRegion(region).priced && (
        <p className="muted pad small">
          No feed quotes {getRegion(region).label} prices, so these cards arrive without one. They
          show up under “not priced yet”, where you can type a figure in — it then travels with your
          collection like any other.
        </p>
      )}

      <div className="hand-set">
        {byHand ? (
          <>
            <p className="muted small">
              For a set no feed lists yet — a promo run printed this month, say. Its cards get no
              artwork and no price, and land under “not priced yet” to be given a figure by hand. The
              checklist travels with your collection, so your other device rebuilds it without
              needing anywhere to download it from.
            </p>
            <label className="labelled-select">
              <span>Set name</span>
              <input
                className="search-input"
                value={handName}
                placeholder="Mega Evolution Black Star Promos"
                onChange={(e) => setHandName(e.target.value)}
              />
            </label>
            <label className="labelled-select">
              <span>Paste the checklist — one card per line, "96 Moltres" or just a name</span>
              <textarea
                className="search-input hand-list"
                rows={5}
                value={handList}
                placeholder={'96 Moltres\n97 Articuno\n98 Zapdos'}
                onChange={(e) => setHandList(e.target.value)}
              />
            </label>
            {!handList.trim() && (
              <label className="labelled-select">
                <span>…or just how many cards, for numbered blanks</span>
                <input
                  className="search-input"
                  type="number"
                  min={1}
                  max={2000}
                  value={handCount}
                  placeholder="101"
                  onChange={(e) => setHandCount(e.target.value)}
                />
              </label>
            )}
            <p className="muted small hand-preview">
              {handPreview.length === 0
                ? 'Nothing to add yet.'
                : `${handPreview.length} card${handPreview.length === 1 ? '' : 's'}, in ${getRegion(region).label}${
                    handPreview.length > 0 ? ` — first is #${handPreview[0].number} ${handPreview[0].name}` : ''
                  }`}
            </p>
            <div className="btn-row">
              <button
                className="btn primary small"
                disabled={!handName.trim() || handPreview.length === 0}
                onClick={addByHand}
              >
                Add this set
              </button>
              <button className="btn ghost small" onClick={() => setByHand(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <button className="link-btn" onClick={() => setByHand(true)}>
            Can’t find it? Add a set by hand
          </button>
        )}
      </div>

      {loading && <p className="muted pad">Loading the {getRegion(region).label} set list…</p>}
      {error && <div className="error-banner"><p>{error}</p></div>}
      {!loading && !error && results.length === 0 && <p className="muted pad">No sets match.</p>}

      <ul className="set-manage-list">
        {results.map((set) => {
          const id = scopedId(region, set.sourceId)
          const already = trackedIds.has(id)
          const working = busy.includes(id)
          return (
            <li key={id} className="set-manage-row">
              <div className="set-manage-main">
                <span className="set-manage-name">
                  <strong>{set.name}</strong>
                  {already && <span className="region-tag is-on">Tracked</span>}
                </span>
                <span className="muted small">
                  {[set.series, set.year || null, set.total ? `${set.total} cards` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {!already && (
                  <span className="muted small">
                    Suggested: {getPreset(suggestPreset(region, set.year)).label}
                  </span>
                )}
              </div>
              <button
                className={`btn small ${already ? 'ghost' : 'primary'}`}
                disabled={working}
                onClick={() => (already ? void drop(id) : void add(set))}
              >
                {working ? 'Adding…' : already ? 'Remove' : 'Add'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
