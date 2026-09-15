import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** Accessible name for the button, e.g. "Set options". */
  label: string
  /** Marks the button when there is something inside worth looking at. */
  flagged?: boolean
  /** What the button shows. Defaults to the "…" this was built for. */
  icon?: ReactNode
  /** Put on the wrapper, for callers that need a different size or place. */
  className?: string
  id: string
  children: (close: () => void) => ReactNode
}

/**
 * A "…" button with a panel behind it, for controls that matter occasionally
 * and shouldn't spend screen height the rest of the time.
 *
 * Deliberately not role="menu": the panel holds a select and a paragraph, not
 * a list of commands, and claiming otherwise would make a screen reader
 * promise arrow-key navigation that doesn't exist.
 */
export function OverflowMenu({ label, flagged, icon, className, id, children }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Stops the card panel behind this from closing on the same Escape.
      e.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className={`overflow ${className ?? ''}`} ref={wrap}>
      <button
        ref={button}
        type="button"
        className={`btn ghost overflow-btn ${flagged ? 'is-flagged' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        {icon ?? <span aria-hidden>⋯</span>}
      </button>
      {open && (
        <div className="overflow-panel" id={id}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
