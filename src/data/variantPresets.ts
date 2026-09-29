import { FIRST_EDITION, REVERSE_HOLO, SHADOWLESS, UNLIMITED } from './vintageSets'
import type { RegionId } from '../lib/regions'
import type { SetVariant } from '../types'

/**
 * Which print runs a set is tracked in.
 *
 * The sixteen vintage sets had their runs written out by hand, which stops
 * working the moment any set can be added. A preset is picked instead — one
 * is suggested from the set's age and region, and it can be changed on the
 * way in or afterwards, because only the collector knows whether they care
 * about reverse holos.
 */
export interface VariantPreset {
  id: string
  label: string
  /** What the runs are, in the order the tabs show them. */
  variants: SetVariant[]
  hint: string
}

/** A set tracked as one run: no distinction worth keeping, so none is made. */
const SINGLE: SetVariant = {
  ...UNLIMITED,
  label: 'Base',
  short: 'Base',
  note: undefined,
}

export const VARIANT_PRESETS: VariantPreset[] = [
  {
    id: 'single',
    label: 'One print run',
    variants: [SINGLE],
    hint: 'One slot per card. Right for most sets.',
  },
  {
    id: 'reverse',
    label: 'Normal + Reverse Holo',
    variants: [{ ...UNLIMITED, label: 'Normal', short: 'Normal' }, REVERSE_HOLO],
    hint: 'Modern sets, where most cards exist in both.',
  },
  {
    id: 'first-unlimited',
    label: '1st Edition + Unlimited',
    variants: [FIRST_EDITION, UNLIMITED],
    hint: 'Vintage runs carrying an "Edition 1" stamp.',
  },
  {
    id: 'base-set',
    label: '1st Edition + Shadowless + Unlimited',
    variants: [FIRST_EDITION, SHADOWLESS, UNLIMITED],
    hint: 'Base Set only — the three printings collectors separate.',
  },
]

const BY_ID = new Map(VARIANT_PRESETS.map((p) => [p.id, p]))

export function getPreset(id: string): VariantPreset {
  return BY_ID.get(id) ?? VARIANT_PRESETS[0]
}

/**
 * A first guess at how a set should be split, from what the source says about
 * it. Wrong sometimes — a preset is a starting point, not a ruling — so it is
 * offered rather than applied silently.
 *
 * The "Edition 1" stamp is a Western vintage thing: Japanese sets carried it
 * only in the earliest years and Chinese sets never did, so a 1st Edition
 * split is never suggested outside English.
 */
export function suggestPreset(region: RegionId, year: number | undefined): string {
  if (region !== 'en') return 'single'
  if (year != null && year <= 2000) return 'first-unlimited'
  // Reverse holos start with Legendary Collection in 2002 and never stop.
  if (year != null && year >= 2002) return 'reverse'
  return 'single'
}
