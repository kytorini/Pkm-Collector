import { useEffect, useRef, useState } from 'react'
import { parsePastedPrice, parseTypedPrice } from '../lib/parsePrice'

interface Props {
  value: number | null
  onChange: (value: number | undefined) => void
  label: string
  /** Draws attention after you've been off to look a price up. */
  highlight?: boolean
  /** When this figure was taken, shown under the box. */
  hint?: string
  /** Marks that hint as old enough to be worth checking again. */
  hintStale?: boolean
  className?: string
}

const canReadClipboard = () =>
  typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'

/**
 * A price box that takes what you actually copied.
 *
 * Deliberately type="text" rather than type="number": a number input silently
 * rejects "$1,234.56", so pasting a price straight off a site left the box
 * empty. This one strips the decoration instead, and the Paste button reads
 * the clipboard so coming back from a price site is one tap rather than
 * retyping the digits.
 */
export function PriceInput({ value, onChange, label, highlight, hint, hintStale, className }: Props) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const [note, setNote] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // Follow the value when something else changes it — a paste, a sync, a
  // reload — without overwriting a half-typed "12." with "12".
  useEffect(() => {
    setText((current) => {
      const mine = parseTypedPrice(current)
      if (value == null) return current === '' ? current : ''
      if (mine != null && Math.abs(mine - value) < 1e-9) return current
      return String(value)
    })
  }, [value])

  const commit = (next: string) => {
    setText(next)
    setNote(null)
    const parsed = parseTypedPrice(next)
    onChange(next.trim() === '' || parsed == null ? undefined : parsed)
  }

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText()
      const parsed = parsePastedPrice(clip)
      if (parsed == null) {
        setNote(clip.trim() ? 'No price in what you copied.' : 'Nothing copied yet.')
        return
      }
      setText(String(parsed))
      setNote(null)
      onChange(parsed)
      input.current?.focus()
    } catch {
      // Safari and Firefox can refuse outright, and there is a real fallback.
      setNote('Your browser wouldn’t hand over the clipboard — long-press the box and choose Paste.')
    }
  }

  return (
    <span className={`price-input ${highlight ? 'is-highlight' : ''} ${className ?? ''}`}>
      <span className="price-input-row">
        <input
          ref={input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="—"
          aria-label={label}
          value={text}
          onChange={(e) => commit(e.target.value)}
          onPaste={(e) => {
            // Long-press → Paste has to behave like the button: the decoration
            // around a copied price ("Ungraded $1,234.56") is not something
            // the typing parser accepts, so it would land as text with no
            // value recorded behind it.
            const parsed = parsePastedPrice(e.clipboardData.getData('text'))
            if (parsed == null) {
              setNote('No price in what you pasted.')
              return
            }
            e.preventDefault()
            setText(String(parsed))
            setNote(null)
            onChange(parsed)
          }}
        />
        {canReadClipboard() && (
          <button
            type="button"
            className="btn ghost paste-btn"
            onClick={() => void pasteFromClipboard()}
            title={`Paste the copied price — ${label}`}
            aria-label={`Paste the copied price — ${label}`}
          >
            Paste
          </button>
        )}
      </span>
      {note ? (
        <span className="price-input-note">{note}</span>
      ) : (
        hint && <span className={`price-input-note ${hintStale ? 'is-stale' : ''}`}>{hint}</span>
      )}
    </span>
  )
}
