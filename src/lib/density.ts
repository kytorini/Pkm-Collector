/**
 * How many cards sit in a row of the binder grid.
 *
 * Kept per device rather than synced: an iPad and an iPhone want different
 * answers, and this is a viewing preference rather than collection data.
 */
const STORAGE_KEY = 'pkm-collector:density'

export type Density = 'auto' | '3' | '4' | '5' | '6'

export const DENSITIES: { value: Density; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '3', label: '3 per row' },
  { value: '4', label: '4 per row' },
  { value: '5', label: '5 per row' },
  { value: '6', label: '6 per row' },
]

const isDensity = (value: string | null): value is Density =>
  value != null && DENSITIES.some((d) => d.value === value)

export function loadDensity(): Density {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isDensity(stored) ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveDensity(density: Density): void {
  try {
    localStorage.setItem(STORAGE_KEY, density)
  } catch {
    /* a preference isn't worth failing over */
  }
}

/**
 * The grid template for a chosen density, or undefined to let the responsive
 * default stand. `minmax(0, 1fr)` rather than `1fr` so a long card name can't
 * push a column wider than its share.
 */
export function gridTemplate(density: Density): string | undefined {
  return density === 'auto' ? undefined : `repeat(${density}, minmax(0, 1fr))`
}
