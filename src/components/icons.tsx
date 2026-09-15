/**
 * One icon family, drawn rather than borrowed from a font.
 *
 * All three are monoline on a 24 grid at the same stroke weight, sized in `em`
 * and stroked in `currentColor`, so they inherit whatever the nav or the top
 * bar is already saying about state — dim when idle, red when active — without
 * a second colour to keep in step.
 */

interface Props {
  /** Defaults to 1em, so font-size still controls the size. */
  size?: string | number
  className?: string
}

const base = (size: Props['size']) => ({
  width: size ?? '1em',
  height: size ?? '1em',
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
})

/** The collection: a poké ball. The band breaks around the button. */
export function PokeballIcon({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h5.2M15.8 12H21" />
      <circle cx="12" cy="12" r="3.1" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** The lot: a couple of cards held together, one behind the other. */
export function CardsIcon({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.2" y="6.6" width="11.2" height="14.2" rx="2" />
      <path d="M8 4.4h10.8a2 2 0 0 1 2 2v11" />
      <circle cx="8.8" cy="13.7" r="2.4" />
    </svg>
  )
}

/** Settings: the sliders down the face of a Pokédex. */
export function SlidersIcon({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3.5 7.5h17M3.5 12h17M3.5 16.5h17" />
      <circle cx="9" cy="7.5" r="2" fill="currentColor" />
      <circle cx="15.5" cy="12" r="2" fill="currentColor" />
      <circle cx="7.5" cy="16.5" r="2" fill="currentColor" />
    </svg>
  )
}

/** The detail behind a heading, when it doesn't earn a line of its own. */
export function InfoIcon({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.2" />
      <circle cx="12" cy="7.9" r="0.95" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Back, in the same weight as the rest. */
export function ChevronLeftIcon({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}
