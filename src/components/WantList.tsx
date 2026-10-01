import { useMemo, useState } from 'react'
import { download } from '../lib/exporters'
import { shortSetName } from '../lib/shortName'
import { isChasing, useTrackedSets } from '../lib/trackedSets'
import {
  missingBySet,
  missingSlots,
  wantListFilename,
  wantListText,
  type WantFormat,
} from '../lib/wantList'
import { useCollection } from '../store/collection'
import { useLibrary } from '../store/library'
import { usePrices } from '../store/prices'

const FORMATS: Array<{ id: WantFormat; label: string; what: string }> = [
  { id: 'message', label: 'Message', what: 'Named cards grouped by set — for an email or a DM.' },
  { id: 'numbers', label: 'Numbers', what: 'Card numbers only, consecutive ones as ranges — for a chat window.' },
  { id: 'csv', label: 'Spreadsheet', what: 'One row per card, with prices — for a seller who works from a sheet.' },
]

/**
 * What you still need, in a form you can send someone.
 *
 * The app already knows this — it is what the remaining-cost figure counts —
 * but as a number on a tile, which is no use when a dealer asks what you're
 * after. Picking the sets first is the point rather than a convenience: a want
 * list for every set you chase is hundreds of cards and no seller reads it.
 */
export function WantList({ onDone }: { onDone: () => void }) {
  const tracked = useTrackedSets()
  const { cardsBySet } = useLibrary()
  const { collection } = useCollection()
  const price = usePrices()

  // Only a set you mean to finish can be missing anything: one kept for
  // singles has no complete state to fall short of.
  const sets = useMemo(() => tracked.filter(isChasing), [tracked])
  const counts = useMemo(
    () => missingBySet(cardsBySet, collection, sets, price),
    [cardsBySet, collection, sets, price],
  )
  /** Sets with nothing missing, or nothing downloaded, can't contribute. */
  const usable = useMemo(() => sets.filter((s) => (counts.get(s.id) ?? 0) > 0), [sets, counts])

  const [picked, setPicked] = useState<string[] | null>(null)
  const chosen = picked ?? usable.map((s) => s.id)
  const [format, setFormat] = useState<WantFormat>('message')
  const [prices, setPrices] = useState(false)
  const [copied, setCopied] = useState(false)

  const toggle = (id: string) => {
    setCopied(false)
    setPicked(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id])
  }

  const slots = useMemo(
    () => missingSlots(cardsBySet, collection, chosen, price),
    [cardsBySet, collection, chosen, price],
  )
  const text = useMemo(() => wantListText(slots, format, { prices }), [slots, format, prices])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // Clipboard access can simply be refused; the text is on screen and
      // selectable, so say what happened rather than failing silently.
      setCopied(false)
      alert('This browser would not let the page copy. Select the list and copy it by hand.')
    }
  }

  return (
    <section className="series-block">
      <div className="section-head is-single">
        <h2 className="series-title">Want list</h2>
        <div className="btn-row">
          <button className="btn ghost small" onClick={onDone}>Done</button>
        </div>
      </div>

      {usable.length === 0 ? (
        <p className="muted pad small">
          {sets.length === 0
            ? "No sets to be missing anything from — the sets you track are all kept for singles rather than chased."
            : 'Nothing missing in any set you chase. Either you have finished them, or their cards have not been downloaded yet.'}
        </p>
      ) : (
        <>
          <div className="want-picker">
            <div className="want-picker-head">
              <span className="muted small">Sets to include</span>
              <span className="btn-row">
                <button className="link-btn" onClick={() => { setCopied(false); setPicked(usable.map((s) => s.id)) }}>
                  All
                </button>
                <button className="link-btn" onClick={() => { setCopied(false); setPicked([]) }}>None</button>
              </span>
            </div>
            <ul className="want-set-list">
              {usable.map((set) => (
                <li key={set.id}>
                  <label className="want-set">
                    <input type="checkbox" checked={chosen.includes(set.id)} onChange={() => toggle(set.id)} />
                    <span className="want-set-name" title={set.name}>{shortSetName(set.name)}</span>
                    <span className="muted small">{counts.get(set.id)} missing</span>
                  </label>
                </li>
              ))}
            </ul>
            {/* Named rather than silently dropped: a set you expected to see
                is otherwise a bug, and the reason is worth a line. */}
            {sets.length > usable.length && (
              <p className="muted small">
                {sets.length - usable.length} set{sets.length - usable.length === 1 ? '' : 's'} left out —
                nothing missing, or no cards downloaded.
              </p>
            )}
          </div>

          <div className="want-shape">
            <div className="segmented">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  className={format === f.id ? 'is-active' : ''}
                  onClick={() => { setFormat(f.id); setCopied(false) }}
                  aria-pressed={format === f.id}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="muted small">{FORMATS.find((f) => f.id === format)?.what}</p>
            {format !== 'csv' && (
              <label className="check-inline">
                <input type="checkbox" checked={prices} onChange={(e) => { setPrices(e.target.checked); setCopied(false) }} />
                Include market prices
              </label>
            )}
          </div>

          <div className="want-out">
            <div className="want-out-head">
              <span className="muted small">
                {slots.length} card{slots.length === 1 ? '' : 's'} from {chosen.length} set
                {chosen.length === 1 ? '' : 's'}
              </span>
              <div className="btn-row">
                <button className="btn ghost small" onClick={() => void copy()} disabled={slots.length === 0}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  className="btn ghost small"
                  disabled={slots.length === 0}
                  onClick={() =>
                    download(
                      wantListFilename(format),
                      format === 'csv' ? text : text,
                      format === 'csv' ? 'text/csv' : 'text/plain',
                    )
                  }
                >
                  Download
                </button>
              </div>
            </div>
            {/* Read-only rather than disabled: you can still select it, which
                is the fallback when the clipboard is refused. */}
            <textarea className="want-preview" readOnly value={text} rows={14} spellCheck={false} />
          </div>
        </>
      )}
    </section>
  )
}
