import type { MouseEvent, ReactNode } from 'react'
import { routeHref } from '../lib/router'
import { shortSetName } from '../lib/shortName'
import type { ApiCard, VintageSet } from '../types'

interface Props {
  card: ApiCard
  set: VintageSet
  /** Opens the full card panel. Omitted where a search only prices, never edits. */
  onOpen?: () => void
  /** The print-run buttons, which differ by what the search is for. */
  children: ReactNode
}

/**
 * One card in a list of search results: art, name, where it's from, and a
 * button per print run.
 *
 * The same row serves the lot and the collection because the question is the
 * same in both — is this the card I mean? — and only what you do about it
 * differs.
 */
export function CardResult({ card, set, onOpen, children }: Props) {
  const title = (
    <span className="result-title">
      <strong>{card.name}</strong>
      <span className="muted">#{card.number}</span>
    </span>
  )

  /*
   * The whole row opens the card. The set line used to be a link to the set,
   * and as a full-width block it took most of the row's taps — so tapping a
   * card's name area landed you in its set's list instead of on the card.
   * Taps on the run chips are their own and pass through.
   */
  const openFromRow = onOpen
    ? (e: MouseEvent<HTMLLIElement>) => {
        if ((e.target as HTMLElement).closest('button, a, input, select')) return
        onOpen()
      }
    : undefined
  const where = `${shortSetName(set.name)} · ${set.year}`

  return (
    <li className={`result ${onOpen ? 'is-openable' : ''}`} onClick={openFromRow}>
      {onOpen ? (
        <button type="button" className="result-art" onClick={onOpen} aria-label={`Open ${card.name}`}>
          <img src={card.images.small} alt="" loading="lazy" width={60} height={84} />
        </button>
      ) : (
        <img src={card.images.small} alt="" loading="lazy" width={60} height={84} />
      )}
      <div className="result-main">
        {onOpen ? (
          <button type="button" className="result-open" onClick={onOpen}>{title}</button>
        ) : (
          title
        )}
        {onOpen ? (
          <span className="result-set muted" title={set.name}>{where}</span>
        ) : (
          <a className="result-set muted" href={routeHref.set(set.id)} title={set.name}>{where}</a>
        )}
        <div className="chip-row">{children}</div>
      </div>
    </li>
  )
}
