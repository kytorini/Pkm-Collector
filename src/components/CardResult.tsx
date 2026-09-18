import type { ReactNode } from 'react'
import { routeHref } from '../lib/router'
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

  return (
    <li className="result">
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
        <a className="result-set muted" href={routeHref.set(set.id)}>{set.name} · {set.year}</a>
        <div className="chip-row">{children}</div>
      </div>
    </li>
  )
}
