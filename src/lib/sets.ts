import { loadTrackedSets, useTrackedSets, type TrackedSet } from './trackedSets'
import type { SetVariant } from '../types'

/**
 * The sets the app knows about right now — which is whatever you have chosen
 * to track, rather than a list written into the source.
 *
 * Everything that used to reach for the built-in sixteen reads through here,
 * so adding a Japanese set or dropping an English one moves the whole app at
 * once: its totals, its search, its import, its exports.
 */
export type { TrackedSet } from './trackedSets'

export function allSets(): TrackedSet[] {
  return loadTrackedSets()
}

export function getSet(setId: string): TrackedSet | undefined {
  return loadTrackedSets().find((s) => s.id === setId)
}

export function getVariant(setId: string, variantId: string): SetVariant | undefined {
  return getSet(setId)?.variants.find((v) => v.id === variantId)
}

/** Every (set, variant) pair, for collection-wide totals. */
export function allSlots(): Array<{ set: TrackedSet; variant: SetVariant }> {
  return loadTrackedSets().flatMap((set) => set.variants.map((variant) => ({ set, variant })))
}

/** The reactive read, for views that must redraw when the list changes. */
export function useSets(): TrackedSet[] {
  return useTrackedSets()
}
