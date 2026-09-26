/**
 * How the two lists are ordered: the binder grid of a set, and the lot.
 *
 * Remembered per device, alongside grid density and hidden sets. An order you
 * chose is a decision, and having to make it again on every visit — or every
 * time you step into a set and back — is the app forgetting something you
 * told it. Not synced: a phone held in one hand and an iPad on a table are
 * looked at differently, and this is looking, not owning.
 */

export type SetSort = 'number' | 'name' | 'price-desc' | 'price-asc'
export type LotSort = 'added' | 'value-desc' | 'value-asc' | 'name'

/** Every option reads as an order, so a bare select can't be read as a filter. */
export const SET_SORTS: Array<{ id: SetSort; label: string }> = [
  { id: 'number', label: 'Set order' },
  { id: 'name', label: 'Name, A to Z' },
  { id: 'price-desc', label: 'Price, high to low' },
  { id: 'price-asc', label: 'Price, low to high' },
]

export const LOT_SORTS: Array<{ id: LotSort; label: string }> = [
  { id: 'added', label: 'Order added' },
  { id: 'value-desc', label: 'Value, high to low' },
  { id: 'value-asc', label: 'Value, low to high' },
  { id: 'name', label: 'Name, A to Z' },
]

const SET_KEY = 'pkm-collector:setSort'
const LOT_KEY = 'pkm-collector:lotSort'

/**
 * Checked against the same list the picker renders, so an order dropped in a
 * later version falls back rather than leaving the list in a state with no
 * matching option — a select showing blank, sorted by nothing.
 */
function read<T extends string>(key: string, options: Array<{ id: T }>, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return options.some((o) => o.id === stored) ? (stored as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* a preference isn't worth failing over */
  }
}

export const loadSetSort = (): SetSort => read(SET_KEY, SET_SORTS, 'number')
export const saveSetSort = (sort: SetSort): void => write(SET_KEY, sort)

export const loadLotSort = (): LotSort => read(LOT_KEY, LOT_SORTS, 'added')
export const saveLotSort = (sort: LotSort): void => write(LOT_KEY, sort)
