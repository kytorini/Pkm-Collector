import { sourceOptions, type PriceSourceId } from '../lib/priceSources'

interface Props {
  level: 'collection' | 'set' | 'card'
  /** The stored choice. 'inherit' when this level has made none. */
  value: PriceSourceId
  onChange: (id: PriceSourceId) => void
  /**
   * Says what each option would actually give you — a price for this card, or
   * how many cards in the set it covers. Showing this on the option itself is
   * the point of the control: a source is picked from what the feed holds
   * rather than guessed at.
   */
  annotate?: (id: PriceSourceId) => string | null
  label: string
  id: string
}

export function PriceSourceSelect({ level, value, onChange, annotate, label, id }: Props) {
  const options = sourceOptions(level)
  const groups = [...new Set(options.map((o) => o.group))]

  return (
    <label className="price-source" htmlFor={id}>
      <span className="price-source-label">{label}</span>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {options
              .filter((o) => o.group === group)
              .map((o) => {
                const note = annotate?.(o.id)
                return (
                  <option key={o.id} value={o.id}>
                    {note ? `${o.label} — ${note}` : o.label}
                  </option>
                )
              })}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
