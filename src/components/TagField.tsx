import { useMemo, useState } from 'react'
import { allTags, cleanTags } from '../lib/singles'
import { useCollection } from '../store/collection'

/**
 * The groupings a card belongs to.
 *
 * Free text, because the ways a collection divides are the collector's own —
 * every Eevee, every Van Gogh, everything slabbed — and no printer's
 * arrangement will produce them. Tags already in use are offered rather than
 * retyped, since "Eevee collection" and "eevee collection" would otherwise
 * quietly become two piles.
 */
export function TagField({ cardId, variantId, tags }: { cardId: string; variantId: string; tags: string[] }) {
  const { collection, update } = useCollection()
  const [draft, setDraft] = useState('')
  const known = useMemo(() => allTags(collection), [collection])
  const offered = useMemo(() => {
    const q = draft.trim().toLowerCase()
    return known.filter((tag) => !tags.includes(tag) && (!q || tag.toLowerCase().includes(q))).slice(0, 6)
  }, [known, tags, draft])

  const write = (next: string[]) => update(cardId, variantId, { tags: cleanTags(next).slice(0, 12) })

  const add = (tag: string) => {
    const clean = cleanTags([tag])
    if (clean.length === 0) return
    // Match an existing group whatever the casing, so one pile stays one pile.
    const existing = known.find((k) => k.toLowerCase() === clean[0].toLowerCase())
    write([...tags, existing ?? clean[0]])
    setDraft('')
  }

  return (
    <label className="full tag-field">
      <span>Groups</span>
      {tags.length > 0 && (
        <div className="tag-row">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="tag"
              onClick={() => write(tags.filter((t) => t !== tag))}
              title={`Take this card out of ${tag}`}
            >
              {tag}
              <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        placeholder="Eevee collection, Van Gogh, slabs…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          add(draft)
        }}
        onBlur={() => add(draft)}
      />
      {offered.length > 0 && (
        <div className="tag-row">
          {offered.map((tag) => (
            <button key={tag} type="button" className="tag is-offer" onClick={() => add(tag)}>
              + {tag}
            </button>
          ))}
        </div>
      )}
    </label>
  )
}
