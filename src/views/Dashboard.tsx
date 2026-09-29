import { useMemo, useState } from 'react'
import { BackToTop } from '../components/BackToTop'
import { CardDetail } from '../components/CardDetail'
import { CardResult } from '../components/CardResult'
import { ChevronDownIcon, InfoIcon } from '../components/icons'
import { OverflowMenu } from '../components/OverflowMenu'
import { ProgressBar } from '../components/ProgressBar'
import { SetManager } from '../components/SetManager'
import { SingleFinder } from '../components/SingleFinder'
import { TagField } from '../components/TagField'
import { getSet, useSets } from '../lib/sets'
import { showAllSets, useHiddenSets } from '../lib/hiddenSets'
import { loadOpenSets, saveOpenSets } from '../lib/openSets'
import { loadTotalsOpen, saveTotalsOpen } from '../lib/totalsOpen'
import { formatMoney } from '../lib/pricing'
import { routeHref } from '../lib/router'
import { countMatches, searchCards } from '../lib/searchCards'
import { shortSetName } from '../lib/shortName'
import { collectSingles, groupSingles, UNGROUPED } from '../lib/singles'
import { isChasing } from '../lib/trackedSets'
import { unpricedCards, unpricedSlots } from '../lib/unpriced'
import { remainingCostNote, statsForCollection, statsForSet, statsForVariant, type VariantStats } from '../lib/stats'
import { useCollection } from '../store/collection'
import { usePrices } from '../store/prices'
import { useLibrary } from '../store/library'
import type { ApiCard, SetVariant, VintageSet } from '../types'

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
  const { cardsBySet, allCards, hydrated, empty, progress, syncAll, error, failedSets } = useLibrary()
  const { collection } = useCollection()
  const price = usePrices()
  const hidden = useHiddenSets()
  const [managing, setManaging] = useState(false)
  const trackedSets = useSets()
  // Sets opened in place. More than one at a time, so two runs can be compared
  // without collapsing the first, and remembered so stepping into a set and
  // back doesn't fold everything up again.
  const [open, setOpen] = useState<string[]>(loadOpenSets)
  // Deliberately not focused on arrival: this page is opened to read as often
  // as to add, and a keyboard over the totals would be in the way.
  const [query, setQuery] = useState('')
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  /*
   * The list as it stood when the panel was opened.
   *
   * The lists here are live: type a price into a card reached from "not
   * priced yet" and it stops being unpriced, so it leaves the list mid-edit.
   * The panel used to be looked up in that list and vanished with it — one
   * digit and the card shut. It resolves against every card now, and the
   * arrows walk this snapshot, so finishing one card still steps to the next
   * one you meant rather than to whatever survived the filter.
   */
  const [walk, setWalk] = useState<string[]>([])
  const [totalsOpen, setTotalsOpen] = useState(loadTotalsOpen)
  // Reached from the "i" panel, which is where the count that prompts the
  // question is stated. Not a stored preference — it's an errand, not a view.
  const [showUnpriced, setShowUnpriced] = useState(false)
  const [tab, setTab] = useState<'sets' | 'singles'>('sets')
  const [addingSingle, setAddingSingle] = useState(false)

  const toggleTotals = () => {
    setTotalsOpen((was) => {
      saveTotalsOpen(!was)
      return !was
    })
  }

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]
      saveOpenSets(next)
      return next
    })

  const shown = useMemo(() => trackedSets.filter((s) => !hidden.includes(s.id)), [trackedSets, hidden])
  // Totals answer "how am I doing on what I collect", so they follow the same
  // selection as the list rather than counting sets that were put aside.
  /*
   * Two questions, two scopes.
   *
   * Completion and remaining cost are about finishing something, so only the
   * sets you are chasing count: a Van Gogh Pikachu is not 1/183 of a promo
   * set you never meant to finish, and counting it that way made the
   * remaining cost the price of sets nobody is buying.
   *
   * What it is worth and what you spent are about what you hold, so those
   * count everything, singles included.
   */
  const chasing = useMemo(() => shown.filter(isChasing), [shown])
  const held = statsForCollection(cardsBySet, collection, shown.map((s) => s.id), price)
  const toFinish = statsForCollection(cardsBySet, collection, chasing.map((s) => s.id), price)
  const total = {
    ...held,
    total: toFinish.total,
    owned: toFinish.owned,
    pct: toFinish.pct,
    missingValue: toFinish.missingValue,
    unpricedMissing: toFinish.unpricedMissing,
  }

  const singles = useMemo(
    () => (shown.length > chasing.length ? collectSingles(cardsBySet, collection, price) : []),
    [shown, chasing, cardsBySet, collection, price],
  )
  const singleGroups = useMemo(() => groupSingles(singles), [singles])
  const singlesWorth = singles.reduce((sum, s) => sum + (s.worth ?? 0), 0)
  const missing = total.total - total.owned
  /*
   * "Cost to finish" read as ambiguous next to a market value of the same
   * size — total or remaining? — so the label says remaining outright and the
   * caption is a sentence about the figure rather than a label for the count
   * beside it. Unpriced slots you already own were in that caption too, though
   * they cost nothing to finish; only the missing ones hold this figure down,
   * and naming how many of the missing are counted says that without a
   * footnote.
   */
  const shortBy = total.unpricedMissing

  /*
   * Search covers the sets you actually collect, the same ones this page and
   * its totals are about. A card in a set you've put aside would otherwise
   * turn up here as a slot that counts towards nothing, so the hidden ones are
   * counted separately and offered rather than silently dropped.
   */
  const searching = query.trim() !== ''
  const searchable = useMemo(() => shown.flatMap((s) => cardsBySet[s.id] ?? []), [shown, cardsBySet])
  const results = useMemo(() => searchCards(searchable, query), [searchable, query])
  const behindHidden = useMemo(
    () => (searching ? countMatches(hidden.flatMap((id) => cardsBySet[id] ?? []), query) : 0),
    [searching, hidden, cardsBySet, query],
  )

  /*
   * Which slots no feed will price. Owned ones too, not just missing: an
   * unpriced card you hold drags market value down exactly as quietly.
   */
  const gaps = useMemo(
    () => (showUnpriced ? unpricedSlots(cardsBySet, collection, shown.map((s) => s.id), price) : []),
    [showUnpriced, cardsBySet, collection, shown, price],
  )
  const gapCards = useMemo(() => unpricedCards(gaps), [gaps])

  const listed = showUnpriced ? gapCards.map((g) => g.card) : results
  const byId = useMemo(() => new Map(allCards.map((c) => [c.id, c])), [allCards])
  const openCard = openCardId ? byId.get(openCardId) : undefined
  const openSet = openCard ? getSet(openCard.set.id) : undefined

  const openPanel = (cardId: string) => {
    setWalk(listed.map((c) => c.id))
    setOpenCardId(cardId)
  }
  /** Left and right walk the list you opened, so a page of them is one panel. */
  const step = (delta: number) => {
    const at = walk.indexOf(openCardId ?? '')
    if (at < 0) return
    const next = walk[at + delta]
    if (next) setOpenCardId(next)
  }

  if (!hydrated) return <div className="view"><p className="muted pad">Opening your binder…</p></div>

  /*
   * The picker has to come before the empty state, or a collection with no
   * sets yet can never get any: the welcome screen's own button opens it.
   */
  if (managing) {
    return (
      <div className="view">
        <SetManager onDone={() => setManaging(false)} />
      </div>
    )
  }

  if (addingSingle) {
    return (
      <div className="view">
        <SingleFinder
          onDone={() => {
            setAddingSingle(false)
            setTab('singles')
          }}
        />
      </div>
    )
  }

  if (empty) {
    return (
      <div className="view">
        <div className="welcome">
          <h1>Let’s fill the binder</h1>
          <p>
            Add the sets you collect — English, Japanese or Chinese — and only those are downloaded:
            card names, artwork, and market prices where a feed quotes them. They’re cached on this
            device afterwards, so the app opens instantly and works offline.
          </p>
          {progress.running ? (
            <div className="sync-progress">
              <ProgressBar value={progress.done} total={progress.total} />
              <p className="muted">Loading {progress.current}… ({progress.done}/{progress.total})</p>
            </div>
          ) : trackedSets.length > 0 ? (
            <button className="btn primary" onClick={() => void syncAll()}>Download card data</button>
          ) : (
            <div className="btn-row welcome-actions">
              <button className="btn primary" onClick={() => setManaging(true)}>Choose your sets</button>
              <button className="btn" onClick={() => setAddingSingle(true)}>Add a single</button>
            </div>
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
      {/*
        The slot count and the hidden-set note wrapped to two lines on a phone
        to say something you read once, so they sit behind the heading instead.
        The button is marked when sets are hidden, because that is the part you
        would otherwise want telling about without asking.
      */}
      <header className="view-head head-with-info">
        <h1>Collection</h1>
        <OverflowMenu
          id="collection-summary"
          label="What these totals cover"
          className="info"
          icon={<InfoIcon />}
          flagged={hidden.length > 0}
        >
          {(close) => (
            <div className="info-panel">
              <p>
                {total.owned} of {total.total} tracked slots across {total.setsStarted}{' '}
                set{total.setsStarted === 1 ? '' : 's'}.
              </p>
              {hidden.length > 0 && (
                <p>
                  {hidden.length} set{hidden.length === 1 ? '' : 's'} hidden, left out of these totals.{' '}
                  <button className="link-btn" onClick={showAllSets}>Show all</button>
                </p>
              )}
              <p>
                <strong>Market value</strong> is every copy you own at market, less a discount for
                condition — two copies count twice, a played one counts for less. It covers
                everything you hold, singles included.
              </p>
              {shown.length > chasing.length && (
                <p>
                  <strong>Completion</strong> and <strong>remaining cost</strong> cover only the{' '}
                  {chasing.length} set{chasing.length === 1 ? '' : 's'} you're chasing. The other{' '}
                  {shown.length - chasing.length} {shown.length - chasing.length === 1 ? 'is' : 'are'}{' '}
                  kept for singles: you own the cards, but the rest of those sets isn't a bill you
                  mean to pay.
                </p>
              )}
              <p>
                <strong>Remaining cost</strong> is what the {missing} slot{missing === 1 ? '' : 's'} you
                don't have would cost at market, one of each. It isn't market value taken off a larger
                number — duplicates and condition move that figure and not this one, so the two don't
                add up to the price of a full set.
              </p>
              {shortBy > 0 && (
                <p>
                  {shortBy} of those slots {shortBy === 1 ? 'has' : 'have'} no price from any
                  source, so {shortBy === 1 ? "it's" : "they're"} left out and the figure is lower
                  than the real bill.
                </p>
              )}
              {total.unpriced > 0 && (
                <p>
                  {total.unpriced} slot{total.unpriced === 1 ? '' : 's'} in all {total.unpriced === 1 ? 'has' : 'have'}{' '}
                  no price, counting the ones you own.{' '}
                  <button
                    className="link-btn"
                    onClick={() => {
                      close()
                      setShowUnpriced(true)
                      setQuery('')
                    }}
                  >
                    Show them
                  </button>
                </p>
              )}
            </div>
          )}
        </OverflowMenu>
        <button
          type="button"
          className="disclose"
          onClick={toggleTotals}
          aria-expanded={totalsOpen}
          aria-controls="collection-totals"
          aria-label={totalsOpen ? 'Fold the totals away' : 'Show the totals'}
          title={totalsOpen ? 'Fold the totals away' : 'Show the totals'}
        >
          <ChevronDownIcon />
        </button>
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

      {/*
        Folded away, the completion bar stays behind: it's the figure you
        actually watch, and a page that opens on a wall of money before the
        first set is a page you scroll past. The region keeps its place in the
        markup either way, so the chevron always has something to point at.
      */}
      <div id="collection-totals" hidden={!totalsOpen}>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Completion</span>
          {/* The count rides on the headline rather than under the bar: a
              caption line here would grow the whole row, and the figure it
              qualifies is the percentage right beside it. Written the way the
              per-set rows write it, since it is the same fraction. */}
          <span className="stat-headline">
            <span className="stat-value">{total.pct}%</span>
            <span className="stat-count">{total.owned}/{total.total}</span>
          </span>
          <ProgressBar value={total.owned} total={total.total} />
        </div>
        <div className="stat">
          <span className="stat-label">Market value</span>
          <span className="stat-value">{formatMoney(total.ownedValue)}</span>
          <span className="stat-sub muted">
            {/* Both figures from the same scope as the money above them.
                Reading `owned` off the chasing-only totals said "1 copies of
                0 cards" for a collection that was nothing but singles. */}
            {held.copies > held.owned
              ? `${held.copies} copies of ${held.owned} card${held.owned === 1 ? '' : 's'}`
              : 'what you hold'}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Remaining cost</span>
          <span className="stat-value">{formatMoney(total.missingValue)}</span>
          {/* What the figure is, always — the caveat used to replace it, so a
              collection with unpriced slots never saw the definition at all. */}
          <span className="stat-sub muted">{remainingCostNote(total)}</span>
          {/* The way in sits on the card that raises the question. Behind the
              "i" it went unfound, which is fair: nobody opens a definition
              panel to go and do something. */}
          {total.unpriced > 0 && (
            <button
              className="stat-gap"
              onClick={() => {
                setShowUnpriced(true)
                setQuery('')
              }}
            >
              See what's not priced
            </button>
          )}
        </div>
        <div className="stat">
          <span className="stat-label">Spent</span>
          <span className="stat-value">{total.spend ? formatMoney(total.spend) : '—'}</span>
          <span className="stat-sub muted">
            {total.spend ? `${formatMoney(total.ownedValue - total.spend)} unrealised` : 'add prices paid to track this'}
          </span>
        </div>
      </div>
      </div>

      {!totalsOpen && (
        <button
          type="button"
          className="totals-peek"
          onClick={toggleTotals}
          aria-expanded={false}
          aria-controls="collection-totals"
          aria-label={`Show the totals — ${total.pct}% complete`}
        >
          <span className="totals-peek-pct">{total.pct}%</span>
          <ProgressBar value={total.owned} total={total.total} />
        </button>
      )}

      <div className="toolbar dash-search">
        <input
          className="search-input"
          type="search"
          placeholder="Find a card to add…"
          aria-label="Search your sets for a card"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            // Typing is a different errand; don't leave the old filter on
            // under it and call the result a search.
            if (e.target.value) setShowUnpriced(false)
          }}
        />
        {searching && (
          <button className="btn ghost small" onClick={() => setQuery('')}>Clear</button>
        )}
      </div>

      {showUnpriced ? (
        <UnpricedList
          cards={gapCards}
          slots={gaps.length}
          onOpen={openPanel}
          onDone={() => setShowUnpriced(false)}
        />
      ) : searching ? (
        <SearchResults results={results} behindHidden={behindHidden} onOpen={openPanel} />
      ) : (
      <>
      {/* Never conditional. Hiding it until a single existed hid the only way
          to add one: the welcome screen's button is gone the moment there is
          a set, so a collection with sets and no singles had no door at all. */}
      <div className="segmented collection-tabs">
          <button className={tab === 'sets' ? 'is-active' : ''} onClick={() => setTab('sets')} aria-pressed={tab === 'sets'}>
            Sets
          </button>
          <button className={tab === 'singles' ? 'is-active' : ''} onClick={() => setTab('singles')} aria-pressed={tab === 'singles'}>
            Singles{singles.length > 0 ? ` · ${new Set(singles.map((s) => `${s.card.id}::${s.variant.id}`)).size}` : ''}
          </button>
        </div>

      {tab === 'singles' ? (
        <SinglesList
          groups={singleGroups}
          worth={singlesWorth}
          onOpen={openPanel}
          onAdd={() => setAddingSingle(true)}
        />
      ) : (
      <section className="series-block">
        <div className="section-head">
          <h2 className="series-title">Progress by set</h2>
          <div className="btn-row">
            <button className="btn ghost small" onClick={() => setManaging(true)}>Manage sets</button>
            <button className="btn ghost small" onClick={() => void syncAll(true)} disabled={progress.running}>
              {progress.running ? `Refreshing ${progress.current}…` : 'Refresh all prices'}
            </button>
          </div>
        </div>

        <div className="progress-table">
          {chasing.map((set) => {
            const cards = cardsBySet[set.id] ?? []
            const s = statsForSet(cards, set, collection, price)
            const denom = s.total || set.total * set.variants.length
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
                  <span className="progress-row-name" title={set.name}>
                    <span className="row-caret" aria-hidden>›</span>
                    {shortSetName(set.name)}
                  </span>
                  <ProgressBar value={s.owned} total={denom} />
                  <span className="progress-row-count muted">{s.owned}/{denom}</span>
                  <span className="progress-row-value">{s.ownedValue ? formatMoney(s.ownedValue) : ''}</span>
                </button>

                {isOpen && (
                  <div className="set-panel" id={`set-panel-${set.id}`}>
                    <div className="set-panel-head">
                      {/* The card count is on every run line below as the
                          denominator, so it isn't spent here. */}
                      <span className="set-panel-what muted">
                        {set.series} series · {set.year}
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
          {chasing.length === 0 && (
            <p className="muted pad" style={{ padding: '16px' }}>
              {trackedSets.length === 0 ? (
                <>
                  No sets yet.{' '}
                  <button className="link-btn" onClick={() => setManaging(true)}>Add one</button>
                </>
              ) : shown.length === 0 ? (
                <>
                  Every set is hidden. <button className="link-btn" onClick={showAllSets}>Show all</button>
                </>
              ) : (
                <>
                  Nothing here is a set you're chasing — they're all kept for singles.{' '}
                  <button className="link-btn" onClick={() => setManaging(true)}>Manage sets</button>
                </>
              )}
            </p>
          )}
        </div>
      </section>
      )}
      </>
      )}

      {openCard && openSet && (
        <CardDetail
          card={openCard}
          set={openSet}
          activeVariantId={openSet.variants[0].id}
          onClose={() => setOpenCardId(null)}
          onStep={step}
        />
      )}
    </div>
  )
}

/**
 * What the search turned up, with a button per print run.
 *
 * The run matters as much as the card: a 1st Edition Charizard and an
 * Unlimited one are separate slots, and ticking the wrong one is a quiet way
 * to get your totals wrong.
 */
function SearchResults({
  results,
  behindHidden,
  onOpen,
}: {
  results: ApiCard[]
  behindHidden: number
  onOpen: (cardId: string) => void
}) {
  const hiddenNote =
    behindHidden > 0 ? (
      <p className="muted pad small">
        {behindHidden} more {behindHidden === 1 ? 'card' : 'cards'} in sets you've hidden.{' '}
        <button className="link-btn" onClick={showAllSets}>Show all sets</button>
      </p>
    ) : null

  if (results.length === 0) {
    return (
      <>
        <p className="muted pad">No matches in the sets you collect.</p>
        {hiddenNote}
      </>
    )
  }

  return (
    <>
      <ul className="result-list">
        {results.map((card) => {
          const set = getSet(card.set.id)
          if (!set) return null
          return (
            <CardResult key={card.id} card={card} set={set} onOpen={() => onOpen(card.id)}>
              {set.variants.map((variant) => (
                <OwnChip key={variant.id} card={card} set={set} variant={variant} />
              ))}
            </CardResult>
          )
        })}
      </ul>
      {hiddenNote}
      {results.length > 4 && <BackToTop />}
    </>
  )
}

/**
 * The cards kept on the side, under whatever headings you gave them.
 *
 * A card with two tags appears under both, on purpose — a Van Gogh Pikachu is
 * in "Van Gogh" and in "Pikachu collection" at once. The groups therefore
 * overlap, so the figure at the top is the collection's own rather than the
 * sum of the headings below it, which would double-count.
 */
function SinglesList({
  groups,
  worth,
  onOpen,
  onAdd,
}: {
  groups: ReturnType<typeof groupSingles>
  worth: number
  onOpen: (cardId: string) => void
  onAdd: () => void
}) {
  /* Which card has its group editor open, so only one is ever in the way. */
  const [tagging, setTagging] = useState('')
  const kept = new Set(groups.flatMap((g) => g.singles.map((s) => `${s.card.id}::${s.variant.id}`))).size
  const named = groups.filter((g) => g.tag !== UNGROUPED).length
  /*
   * A tagged card shows up under each of its groups, so keying the open
   * editor by card alone would open it in two places at once. It belongs to
   * the first heading the card appears under — and only there, which also
   * means naming a group doesn't close the field: the row moves to its new
   * heading, and the editor follows it rather than vanishing mid-thought.
   */
  const firstHome = useMemo(() => {
    const home = new Map<string, string>()
    for (const group of groups) {
      for (const single of group.singles) {
        const slot = `${single.card.id}::${single.variant.id}`
        if (!home.has(slot)) home.set(slot, group.tag)
      }
    }
    return home
  }, [groups])
  return (
    <section className="series-block">
      <div className="section-head">
        <h2 className="series-title">
          {kept === 0 ? 'Singles' : `${kept} single${kept === 1 ? '' : 's'} · ${formatMoney(worth)}`}
        </h2>
        <div className="btn-row">
          <button className="btn ghost small" onClick={onAdd}>Add a single</button>
        </div>
      </div>
      {kept === 0 && (
        <p className="muted pad">
          Nothing here yet. Add a card you own without taking on its whole set — a promo, or one
          card out of a set you’re not chasing.
        </p>
      )}
      {/* A group is made by naming one, not by creating an empty container
          first — but that only works if the way to name one is in sight. Said
          once, while there are none, and gone as soon as there is one. */}
      {kept > 0 && named === 0 && (
        <p className="muted small pad">
          Groups are yours to name: tap <strong>Group</strong> on a card and type one — “Eevee
          collection”, “Van Gogh”, “slabs”. A card can sit in several at once.
        </p>
      )}
      {groups.map((group) => (
        <div key={group.tag || 'ungrouped'} className="single-group">
          <div className="single-group-head">
            <h3>{group.tag || 'Not in a group'}</h3>
            <span className="muted small">
              {group.copies} card{group.copies === 1 ? '' : 's'} · {formatMoney(group.worth)}
              {group.unpriced > 0 ? ` · ${group.unpriced} unpriced` : ''}
            </span>
          </div>
          <ul className="single-list">
            {group.singles.map((single) => {
              const slot = `${single.card.id}::${single.variant.id}`
              const open = tagging === slot && firstHome.get(slot) === group.tag
              return (
                <li key={`${group.tag}:${slot}`} className="single-row">
                  <button
                    type="button"
                    className="result-art"
                    onClick={() => onOpen(single.card.id)}
                    aria-label={`Open ${single.card.name}`}
                  >
                    <img src={single.card.images.small} alt="" loading="lazy" width={38} height={53} />
                  </button>
                  <button type="button" className="result-open single-main" onClick={() => onOpen(single.card.id)}>
                    <span className="result-title">
                      <strong>{single.card.name}</strong>
                      <span className="muted">#{single.card.number}</span>
                    </span>
                    <span className="muted small" title={single.set.name}>
                      {shortSetName(single.set.name)} · {single.variant.label}
                      {(single.entry.quantity ?? 1) > 1 ? ` · ×${single.entry.quantity}` : ''}
                    </span>
                  </button>
                  <span className="single-worth">
                    {single.worth == null ? <span className="muted small">no price</span> : formatMoney(single.worth)}
                    <button
                      type="button"
                      className="single-tag-btn"
                      onClick={() => setTagging(open ? '' : slot)}
                      aria-expanded={open}
                    >
                      {single.tags.length > 0 ? `Groups · ${single.tags.length}` : '+ Group'}
                    </button>
                  </span>
                  {/* The card panel's own field, not a copy of it: one place
                      decides what a tag is and which ones already exist. */}
                  {open && (
                    <div className="single-tagger">
                      <TagField cardId={single.card.id} variantId={single.variant.id} tags={single.tags} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

/**
 * Every card the feed won't price, so they can be given one by hand.
 *
 * The rows are the search's, because the question is the same — which card is
 * this? — and the run that's missing a price already shows a dash where its
 * figure would be. Tapping the card opens the panel, which is where a price
 * gets typed.
 */
function UnpricedList({
  cards,
  slots,
  onOpen,
  onDone,
}: {
  cards: Array<{ card: ApiCard; set: VintageSet }>
  slots: number
  onOpen: (cardId: string) => void
  onDone: () => void
}) {
  return (
    <>
      <div className="section-head is-single">
        <h2 className="series-title">
          {slots === 0
            ? 'Every slot has a price'
            : `${slots} slot${slots === 1 ? '' : 's'} with no price`}
        </h2>
        <div className="btn-row">
          <button className="btn ghost small" onClick={onDone}>Done</button>
        </div>
      </div>
      {slots === 0 ? (
        <p className="muted pad">
          Every print run of every card you collect has a price from your chosen source. Nothing to
          fill in.
        </p>
      ) : (
        <>
          <p className="muted pad small">
            No feed quotes {slots === 1 ? 'this one' : 'these'}, so {slots === 1 ? 'it counts' : 'they count'} as
            nothing in your totals. Open a card to type a price in.
          </p>
          <ul className="result-list">
            {cards.map(({ card, set }) => (
              <CardResult key={card.id} card={card} set={set} onOpen={() => onOpen(card.id)}>
                {set.variants.map((variant) => (
                  <OwnChip key={variant.id} card={card} set={set} variant={variant} />
                ))}
              </CardResult>
            ))}
          </ul>
          {cards.length > 4 && <BackToTop />}
        </>
      )}
    </>
  )
}

/**
 * One print run of one card: tap to own it, tap again to give it up.
 *
 * The price rides along because it's how you tell the runs apart at a glance,
 * and a count appears once you have more than one copy — a second Charizard
 * is worth being told about before you tick a third.
 */
function OwnChip({ card, set, variant }: { card: ApiCard; set: VintageSet; variant: SetVariant }) {
  const { get, toggleOwned } = useCollection()
  const price = usePrices()
  const entry = get(card.id, variant.id)
  const owned = Boolean(entry?.owned)
  const copies = owned ? Math.max(1, entry?.quantity ?? 1) : 0
  const p = price(card, variant)

  return (
    <button
      className={`chip ${owned ? 'is-owned' : ''}`}
      aria-pressed={owned}
      onClick={() => toggleOwned(card.id, variant.id)}
      title={owned ? `Remove ${variant.label} from your collection` : `Add ${set.name} ${variant.label} to your collection`}
    >
      <span className="chip-mark" aria-hidden>{owned ? '✓' : '+'}</span>
      {variant.short}
      {copies > 1 && <span className="chip-count">×{copies}</span>}
      {/* A dash where a figure should be is the whole signal in the
          no-price list, so it is drawn as a gap rather than as a price. */}
      <span className={`chip-price ${p.market == null ? 'is-missing' : ''}`}>
        {p.market == null ? 'no price' : `${p.approximate ? '~' : ''}${formatMoney(p.market)}`}
      </span>
    </button>
  )
}
