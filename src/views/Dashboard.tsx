import { useMemo, useState } from 'react'
import { BackToTop } from '../components/BackToTop'
import { CardDetail } from '../components/CardDetail'
import { CardResult } from '../components/CardResult'
import { ChevronDownIcon, InfoIcon } from '../components/icons'
import { OverflowMenu } from '../components/OverflowMenu'
import { ProgressBar } from '../components/ProgressBar'
import { VINTAGE_SETS, getSet } from '../data/vintageSets'
import { showAllSets, toggleHiddenSet, useHiddenSets } from '../lib/hiddenSets'
import { loadOpenSets, saveOpenSets } from '../lib/openSets'
import { loadTotalsOpen, saveTotalsOpen } from '../lib/totalsOpen'
import { formatMoney } from '../lib/pricing'
import { routeHref } from '../lib/router'
import { countMatches, searchCards } from '../lib/searchCards'
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
  const { cardsBySet, hydrated, empty, progress, syncAll, error, failedSets } = useLibrary()
  const { collection } = useCollection()
  const price = usePrices()
  const hidden = useHiddenSets()
  const [choosing, setChoosing] = useState(false)
  // Sets opened in place. More than one at a time, so two runs can be compared
  // without collapsing the first, and remembered so stepping into a set and
  // back doesn't fold everything up again.
  const [open, setOpen] = useState<string[]>(loadOpenSets)
  // Deliberately not focused on arrival: this page is opened to read as often
  // as to add, and a keyboard over the totals would be in the way.
  const [query, setQuery] = useState('')
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [totalsOpen, setTotalsOpen] = useState(loadTotalsOpen)
  // Reached from the "i" panel, which is where the count that prompts the
  // question is stated. Not a stored preference — it's an errand, not a view.
  const [showUnpriced, setShowUnpriced] = useState(false)

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

  const shown = useMemo(() => VINTAGE_SETS.filter((s) => !hidden.includes(s.id)), [hidden])
  // Totals answer "how am I doing on what I collect", so they follow the same
  // selection as the list rather than counting sets that were put aside.
  const total = statsForCollection(cardsBySet, collection, shown.map((s) => s.id), price)
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
  const openCard = openCardId ? listed.find((c) => c.id === openCardId) : undefined
  const openSet = openCard ? getSet(openCard.set.id) : undefined
  /** Left and right walk the results, so a page of them is one panel. */
  const step = (delta: number) => {
    const at = listed.findIndex((c) => c.id === openCardId)
    const next = listed[at + delta]
    if (next) setOpenCardId(next.id)
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
                condition — two copies count twice, a played one counts for less.
              </p>
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
          <span className="stat-label">Remaining cost</span>
          <span className="stat-value">{formatMoney(total.missingValue)}</span>
          {/* What the figure is, always — the caveat used to replace it, so a
              collection with unpriced slots never saw the definition at all. */}
          <span className="stat-sub muted">{remainingCostNote(total)}</span>
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
          onOpen={setOpenCardId}
          onDone={() => setShowUnpriced(false)}
        />
      ) : searching ? (
        <SearchResults results={results} behindHidden={behindHidden} onOpen={setOpenCardId} />
      ) : (
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
          {!choosing && shown.length === 0 && (
            <p className="muted pad" style={{ padding: '16px' }}>
              Every set is hidden. <button className="link-btn" onClick={showAllSets}>Show all</button>
            </p>
          )}
        </div>
      </section>
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
